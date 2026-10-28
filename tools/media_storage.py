"""Bounded S3 transfers using the site's existing SigV4 transport.

No credentials or upstream exception strings are emitted by this module.
"""
import contextlib
import hashlib
import fcntl
import importlib.util
import json
import mimetypes
import os
from pathlib import Path
import tempfile
import threading
import time
import urllib.error
import xml.etree.ElementTree as ET

CHUNK = 1024 * 1024
PART = 32 * CHUNK
IMMUTABLE = 'public, max-age=2592000, immutable'


def backend():
    value = os.environ.get('MEDIA_STORAGE', 'local')
    if value not in ('local', 's3'):
        raise RuntimeError('Unknown MEDIA_STORAGE')
    return value


def atomic_json(path, value, mode=0o600):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix='.' + path.name, dir=path.parent)
    try:
        os.fchmod(fd, mode)
        with os.fdopen(fd, 'w') as stream:
            json.dump(value, stream, ensure_ascii=False, sort_keys=True)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        Path(name).unlink(missing_ok=True)


def sha256_file(path):
    with Path(path).open('rb') as stream:
        return digest_stream(stream)[0]


def digest_stream(stream, limiter=None):
    digest = hashlib.sha256()
    total = 0
    while chunk := stream.read(CHUNK):
        if limiter:
            limiter.consume(len(chunk))
        digest.update(chunk)
        total += len(chunk)
    return digest.hexdigest(), total


class RateLimit:
    def __init__(self, bytes_per_second=5 * CHUNK):
        self.rate = bytes_per_second
        self.lock = threading.Lock()
        self.next = time.monotonic()

    def consume(self, size):
        with self.lock:
            now = time.monotonic()
            start = max(now, self.next)
            self.next = start + size / self.rate
        time.sleep(max(0, start - now))


class Store:
    def __init__(self, client=None, limiter=None):
        if client is None:
            if os.environ.get('S3_INSECURE', '0') != '0':
                raise RuntimeError('TLS verification is required')
            required = ['S3_BUCKET', 'S3_ENDPOINT', 'S3_REGION', 'S3_ACCESS_KEY', 'S3_SECRET_ACCESS_KEY']
            if any(not os.environ.get(key) for key in required):
                raise RuntimeError('Missing S3 configuration (see operations guide)')
            if not os.environ['S3_ENDPOINT'].startswith('https://'):
                raise RuntimeError('HTTPS endpoint is required')
            spec = importlib.util.spec_from_file_location('site_s3_transport', Path(__file__).with_name('s3-upload-static-assets.py'))
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            client = module.S3Client(os.environ['S3_ACCESS_KEY'], os.environ['S3_SECRET_ACCESS_KEY'],
                                     os.environ['S3_ENDPOINT'], os.environ['S3_REGION'], os.environ['S3_BUCKET'])
        self.client = client
        self.limiter = limiter

    def request(self, method, key, **kwargs):
        # Retry only idempotent operations. Create/Complete multipart recovery is
        # handled by the journal and a subsequent HEAD/GET on restart.
        attempts = 4 if method in ('GET', 'HEAD', 'PUT', 'DELETE') else 1
        for attempt in range(attempts):
            try:
                return self.client.request(method, key, **kwargs)
            except urllib.error.HTTPError as error:
                if error.code in (404, 403):
                    raise
                if error.code not in (408, 429, 500, 502, 503, 504) or attempt + 1 == attempts:
                    raise RuntimeError(f'S3 HTTP {error.code}') from None
            except (OSError, TimeoutError):
                if attempt + 1 == attempts:
                    raise RuntimeError('S3 transport failed') from None
            time.sleep(2 ** attempt)

    def head(self, key):
        try:
            with self.request('HEAD', key) as response:
                return dict(response.headers)
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return None
            raise RuntimeError(f'S3 HEAD HTTP {error.code}') from None

    def verify(self, key, digest, size):
        with self.request('GET', key) as response:
            actual, count = digest_stream(response, self.limiter)
        if actual != digest or count != size:
            raise RuntimeError('S3 content checksum/size mismatch')

    def put_verified(self, key, path, journal=None, content_type=None, cache=IMMUTABLE, replace=False):
        path = Path(path)
        if journal is None and os.environ.get('MEDIA_STATE_DIR'):
            journal = Path(os.environ['MEDIA_STATE_DIR']) / (hashlib.sha256(key.encode()).hexdigest() + '.multipart.json')
        if path.stat().st_size > PART and journal is None:
            raise RuntimeError('Durable MEDIA_STATE_DIR or explicit multipart journal required')
        before = path.stat()
        digest = sha256_file(path)
        size = before.st_size
        headers = {'content-type': content_type or mimetypes.guess_type(key)[0] or 'application/octet-stream',
                   'cache-control': cache, 'x-amz-meta-sha256': digest}
        acl = os.environ.get('S3_MEDIA_ACL', os.environ.get('S3_ACL', ''))
        if acl:
            headers['x-amz-acl'] = acl
        existing = self.head(key)
        if existing and not replace:
            self.verify(key, digest, size)  # conflict must never overwrite originals
            if journal:
                journal.unlink(missing_ok=True)
            return digest
        state = json.loads(journal.read_text()) if journal and journal.exists() else {}
        identity = {'key': key, 'sha256': digest, 'size': size,
                    'bucket': self.client.bucket, 'endpoint': self.client.endpoint}
        if state and state.get('identity') != identity:
            raise RuntimeError('Multipart journal/source mismatch')
        if size <= PART:
            body = path.read_bytes()
            if self.limiter:
                self.limiter.consume(len(body))
            with self.request('PUT', key, body=body, headers=headers):
                pass
        else:
            if not state:
                with self.request('POST', key, query={'uploads': ''}, headers=headers) as response:
                    upload_id = ET.fromstring(response.read()).findtext('{*}UploadId')
                if not upload_id:
                    raise RuntimeError('Missing multipart upload ID')
                state = {'identity': identity, 'upload_id': upload_id, 'parts': []}
                if journal:
                    atomic_json(journal, state)
            # Re-send parts not recorded durably; uploading a part number is idempotent.
            with path.open('rb') as stream:
                for number in range(1, (size + PART - 1) // PART + 1):
                    body = stream.read(PART)
                    if number <= len(state['parts']):
                        continue
                    if self.limiter:
                        self.limiter.consume(len(body))
                    with self.request('PUT', key, query={'partNumber': number, 'uploadId': state['upload_id']}, body=body) as response:
                        state['parts'].append({'PartNumber': number, 'ETag': response.headers['ETag']})
                    if journal:
                        atomic_json(journal, state)
            xml = ET.Element('CompleteMultipartUpload')
            for part in state['parts']:
                element = ET.SubElement(xml, 'Part')
                for field, value in part.items():
                    ET.SubElement(element, field).text = str(value)
            with self.request('POST', key, query={'uploadId': state['upload_id']},
                              body=ET.tostring(xml), headers={'content-type': 'application/xml'}) as response:
                result = ET.fromstring(response.read())
                if result.tag.split('}')[-1] != 'CompleteMultipartUploadResult':
                    raise RuntimeError('Multipart completion failed')
        after = path.stat()
        if (before.st_size, before.st_mtime_ns, before.st_ino) != (after.st_size, after.st_mtime_ns, after.st_ino):
            raise RuntimeError('Source changed during upload')
        self.verify(key, digest, size)
        if journal:
            journal.unlink(missing_ok=True)
        return digest

    def list_objects(self):
        token = None
        while True:
            query = {'list-type': '2', 'max-keys': 1000}
            if token:
                query['continuation-token'] = token
            with self.request('GET', '', query=query) as response:
                root = ET.fromstring(response.read())
            for entry in root.findall('{*}Contents'):
                yield entry.findtext('{*}Key'), int(entry.findtext('{*}Size'))
            if root.findtext('{*}IsTruncated') != 'true':
                return
            token = root.findtext('{*}NextContinuationToken')
            if not token:
                raise RuntimeError('Incomplete bucket listing')


@contextlib.contextmanager
def private_temp():
    root = os.environ.get('MEDIA_TMP_DIR')
    if not root:
        raise RuntimeError('MEDIA_TMP_DIR must be configured outside the media archive')
    Path(root).mkdir(parents=True, exist_ok=True)
    stat = os.statvfs(root)
    if stat.f_bavail * stat.f_frsize < 512 * CHUNK:
        raise RuntimeError('Insufficient temporary storage reserve')
    with tempfile.TemporaryDirectory(prefix='media-', dir=root) as directory:
        yield Path(directory)


@contextlib.contextmanager
def generation_lock():
    """Serialize the two live writers' generators (both update the home/feed)."""
    path = Path(os.environ.get('MEDIA_GENERATION_LOCK', '/tmp/tomilov-site-generation.lock'))
    with path.open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        yield
