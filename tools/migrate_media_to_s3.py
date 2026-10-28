#!/usr/bin/env python3
"""Inventory/copy/verify media. No production configuration changes.

All writes to S3 require --apply. Local deletion is deliberately a separate
operator operation after acceptance; this tool only emits a prune candidate list.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import fcntl
import hashlib
import json
import os
from pathlib import Path
import stat
import sys
import time
from media_storage import Store, RateLimit, atomic_json, sha256_file

PREFIXES = ('assets/telegram/video_files', 'assets/telegram/files', 'assets/telegram/photos',
            'assets/photos/originals', 'assets/photos/canvas', 'assets/photos/feed')


def source_path(root, key):
    if not any(key.startswith(prefix + '/') for prefix in PREFIXES):
        raise RuntimeError('Path outside migration allowlist')
    parts = Path(key).parts
    if '..' in parts or Path(key).is_absolute():
        raise RuntimeError('Unsafe path')
    path = root
    for part in parts:
        path = path / part
        if path.is_symlink():
            raise RuntimeError('Symlinks are not migration sources')
    if not stat.S_ISREG(path.stat().st_mode):
        raise RuntimeError('Source is not a regular file')
    return path


def fingerprint(path):
    s = path.stat()
    return {'size': s.st_size, 'mtime_ns': s.st_mtime_ns, 'inode': s.st_ino, 'device': s.st_dev}


def inventory(root):
    records = []
    for prefix in PREFIXES:
        directory = root / prefix
        if directory.is_symlink():
            raise RuntimeError('Symlink prefix refused')
        if not directory.exists():
            continue
        for candidate in sorted(directory.rglob('*')):
            if candidate.is_dir() and not candidate.is_symlink():
                continue
            key = candidate.relative_to(root).as_posix()
            path = source_path(root, key)
            before = fingerprint(path)
            digest = sha256_file(path)
            if fingerprint(path) != before:
                raise RuntimeError('Source changed during inventory')
            records.append({'key': key, 'sha256': digest, **before})
    if not records:
        raise RuntimeError('No sources in allowlist')
    return {'schema': 1, 'root': str(root), 'created': time.time(), 'objects': records}


def manifest_digest(manifest):
    return hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest()


def check_source(root, record):
    path = source_path(root, record['key'])
    if fingerprint(path) != {key: record[key] for key in fingerprint(path)}:
        raise RuntimeError('Source changed since inventory')
    if sha256_file(path) != record['sha256']:
        raise RuntimeError('Source checksum changed')
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['inventory', 'preflight', 'copy', 'verify', 'report', 'prune-report'])
    parser.add_argument('--root', type=Path, help='shared directory containing assets/')
    parser.add_argument('--run', type=Path, required=True, help='private journal directory outside web root')
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--workers', type=int, choices=range(1, 5), default=2)
    parser.add_argument('--mib-per-second', type=float, default=5)
    parser.add_argument('--capacity-bytes', type=int, help='confirmed paid capacity from provider')
    parser.add_argument('--usage-bytes', type=int, help='confirmed total billed usage, including multipart/versions')
    args = parser.parse_args()
    if args.mib_per_second <= 0:
        parser.error('Positive transfer limit required')
    args.run = args.run.resolve()
    args.run.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(args.run, 0o700)
    with (args.run / 'lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        manifest_path = args.run / 'manifest.json'
        if args.command == 'inventory':
            if manifest_path.exists() or not args.root:
                raise RuntimeError('Use a new run and specify --root')
            root = args.root.resolve()
            if args.run.is_relative_to(root):
                raise RuntimeError('Journal must be outside shared/web root')
            result = inventory(root)
            atomic_json(manifest_path, result)
            print(json.dumps({'files': len(result['objects']), 'bytes': sum(x['size'] for x in result['objects']),
                              'manifest_sha256': manifest_digest(result)}))
            return
        manifest = json.loads(manifest_path.read_text())
        digest = manifest_digest(manifest)
        root = Path(manifest['root'])
        records = manifest['objects']
        status_dir = args.run / 'objects'
        status_dir.mkdir(exist_ok=True)
        def status_path(record):
            return status_dir / (hashlib.sha256(record['key'].encode()).hexdigest() + '.json')
        if args.command in ('report', 'prune-report'):
            verified = []
            for record in records:
                p = status_path(record)
                state = json.loads(p.read_text()) if p.exists() else {}
                if state.get('manifest_sha256') == digest and state.get('verified'):
                    if args.command == 'prune-report':
                        check_source(root, record)
                    verified.append(record)
            print(json.dumps({'manifest_sha256': digest, 'total': len(records), 'verified': len(verified),
                              'verified_bytes': sum(x['size'] for x in verified), 'deletion_executed': False}))
            if args.command == 'prune-report':
                if len(verified) != len(records):
                    raise RuntimeError('Incomplete verification: no prune report')
                atomic_json(args.run / 'prune-candidates.json', {'manifest_sha256': digest, 'objects': verified,
                    'requires': ['independent backup', 'cutover acceptance', 'observation window', 'operator approval']})
            return
        store = Store(limiter=RateLimit(args.mib_per_second * 1024 * 1024))
        target = {'bucket': store.client.bucket, 'endpoint': store.client.endpoint}
        target_path = args.run / 'target.json'
        if target_path.exists() and json.loads(target_path.read_text()) != target:
            raise RuntimeError('Run is bound to a different S3 destination')
        atomic_json(target_path, target)
        if args.command == 'preflight':
            objects = dict(store.list_objects())
            missing_bytes = sum(x['size'] for x in records if x['key'] not in objects)
            if args.capacity_bytes is None or args.usage_bytes is None:
                raise RuntimeError('Provider capacity and total usage must be explicitly confirmed')
            reserve = max(15 * 1024**3, missing_bytes + 1024**3)
            if args.usage_bytes < sum(objects.values()) or args.capacity_bytes - args.usage_bytes < reserve:
                raise RuntimeError('Insufficient or inconsistent paid capacity/usage')
            result = {'manifest_sha256': digest, 'created': time.time(), 'bucket': store.client.bucket,
                      'endpoint': store.client.endpoint, 'capacity_bytes': args.capacity_bytes,
                      'usage_bytes': args.usage_bytes, 'listed_objects': len(objects),
                      'listed_bytes': sum(objects.values()), 'missing_bytes': missing_bytes}
            atomic_json(args.run / 'preflight.json', result)
            print(json.dumps(result))
            return
        if args.command == 'copy' and not args.apply:
            print(json.dumps({'dry_run': True, 'files': len(records), 'bytes': sum(x['size'] for x in records)}))
            return
        if args.command == 'copy':
            preflight = json.loads((args.run / 'preflight.json').read_text())
            if (preflight['manifest_sha256'] != digest or time.time() - preflight['created'] > 86400
                    or preflight['bucket'] != store.client.bucket or preflight['endpoint'] != store.client.endpoint):
                raise RuntimeError('Fresh matching preflight required')
        def transfer(record):
            path = check_source(root, record)
            state_path = status_path(record)
            atomic_json(state_path, {'manifest_sha256': digest, 'verified': False})
            journal = state_path.with_suffix('.multipart.json')
            # Re-read even previously verified objects: do not trust stale receipts.
            if args.command == 'copy':
                store.put_verified(record['key'], path, journal=journal)
            else:
                store.verify(record['key'], record['sha256'], record['size'])
            check_source(root, record)
            atomic_json(state_path, {'manifest_sha256': digest, 'verified': True, 'verified_at': time.time(),
                                    'bucket': store.client.bucket, 'endpoint': store.client.endpoint})
            return record['size']
        total = 0
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for number, size in enumerate(pool.map(transfer, records), 1):
                total += size
                print(json.dumps({'verified_files': number, 'verified_bytes': total}), flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Avoid URLs, signed requests and source names from exceptions.
        print(f'Migration stopped ({type(error).__name__}); originals retained. Check configuration and private run state.', file=sys.stderr)
        sys.exit(1)
