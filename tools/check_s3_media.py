#!/usr/bin/env python3
"""Read-only public HEAD and bounded Range probes; never download full videos."""
import argparse
import json
import mimetypes
import sys
import urllib.request
import urllib.parse
import urllib.error


def probe(base, record, ranges=False):
    key = record['key']
    url = base.rstrip('/') + '/' + urllib.parse.quote(key, safe='/')
    with urllib.request.urlopen(urllib.request.Request(url, method='HEAD'), timeout=30) as response:
        if response.status != 200 or int(response.headers['Content-Length']) != record['size']:
            raise RuntimeError('HEAD status/size mismatch')
        etag = response.headers.get('ETag')
        expected = mimetypes.guess_type(key)[0] or 'application/octet-stream'
        if response.headers.get_content_type() != expected:
            raise RuntimeError('Content-Type mismatch')
    if etag and ranges:
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'If-None-Match': etag}), timeout=30):
                raise RuntimeError('Conditional GET did not return 304')
        except urllib.error.HTTPError as error:
            if error.code != 304:
                raise
    if not ranges or record['size'] == 0:
        return
    size = record['size']
    spans = [(0, min(31, size - 1)), (size // 2, min(size // 2 + 31, size - 1)), (max(0, size - 32), size - 1)]
    for start, end in spans:
        request = urllib.request.Request(url, headers={'Range': f'bytes={start}-{end}'})
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.status != 206 or response.headers.get('Content-Range') != f'bytes {start}-{end}/{size}':
                raise RuntimeError('Range response mismatch')
            if len(response.read(33)) != end - start + 1:
                raise RuntimeError('Range body size mismatch')
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={'Range': f'bytes={size}-'}), timeout=30):
            raise RuntimeError('Unsatisfiable Range accepted')
    except urllib.error.HTTPError as error:
        if error.code != 416:
            raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--base-url', required=True, help='https://tomilov.com or https://endpoint/bucket')
    parser.add_argument('--all-ranges', action='store_true')
    args = parser.parse_args()
    if not args.base_url.startswith('https://'):
        parser.error('HTTPS required')
    records = json.load(open(args.manifest))['objects']
    errors = []
    sampled = set()
    for record in records:
        category = record['key'].rsplit('.', 1)[-1].lower()
        ranges = args.all_ranges or category not in sampled
        try:
            probe(args.base_url, record, ranges)
            sampled.add(category)
        except Exception as error:
            # key is archive relative path, never a Telegram API filesystem path.
            errors.append({'key': record['key'], 'error': type(error).__name__})
    print(json.dumps({'checked': len(records), 'failures': errors}, ensure_ascii=False))
    return bool(errors)


if __name__ == '__main__':
    sys.exit(main())
