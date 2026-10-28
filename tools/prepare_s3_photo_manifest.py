#!/usr/bin/env python3
"""Stage (never publish) photo receipts from a fully verified migration run.
Run HDR backfill and strict preview generation in local mode before inventory.
"""
import argparse
import copy
import json
from pathlib import Path
from urllib.parse import unquote
import generate_photo_previews as previews
from migrate_media_to_s3 import manifest_digest, check_source
from media_storage import atomic_json, Store
import photo_upload_server
import hashlib


def prepare(manifest, photos, run, store):
    digest = manifest_digest(manifest)
    records = {r['key']: r for r in manifest['objects']}
    output = copy.deepcopy(photos)
    for photo in output.get('photos', []):
        key = unquote(photo['src']).lstrip('/')
        original = records[key]
        path = check_source(Path(manifest['root']), original)
        detected = photo_upload_server.detect_hdr_image(path.read_bytes(), photo.get('mimeType', ''))
        if detected and not photo.get('hdr'):
            raise RuntimeError('HDR backfill required before inventory')
        keys = [key, previews.preview_public_url(photo).lstrip('/')]
        if not photo.get('hdr'):
            for width in previews.feed_preview_widths(photo):
                keys.extend(previews.feed_preview_public_url(photo, width, ext).lstrip('/') for ext in ('jpg', 'webp'))
        receipts = []
        for key in keys:
            record = records[key]
            state = json.loads((run / 'objects' / (hashlib.sha256(key.encode()).hexdigest() + '.json')).read_text())
            if (state.get('manifest_sha256') != digest or not state.get('verified')
                    or state.get('bucket') != store.client.bucket or state.get('endpoint') != store.client.endpoint):
                raise RuntimeError('Matching verified receipt required')
            check_source(Path(manifest['root']), record)
            # Refresh accessibility/integrity before preparing publication metadata.
            store.verify(key, record['sha256'], record['size'])
            receipts.append({k: record[k] for k in ('key', 'sha256', 'size')})
        photo['mediaReceipt'] = {'schema': 1, 'backend': 's3', 'hdrChecked': True,
                                 'previewVersion': 1, 'objects': receipts}
        previews.validate_receipt(photo)
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', type=Path, required=True)
    parser.add_argument('--photos', type=Path, required=True)
    args = parser.parse_args()
    before = args.photos.read_bytes()
    result = prepare(json.loads((args.run / 'manifest.json').read_text()), json.loads(before), args.run, Store())
    if args.photos.read_bytes() != before:
        raise RuntimeError('Photo manifest changed; repeat while writers are paused')
    atomic_json(args.run / 'photos-staged.json', result)
    atomic_json(args.run / 'photos-source.json', {'sha256': hashlib.sha256(before).hexdigest()})
    print('Staged only; source manifest unchanged. Promote under writer pause after source hash check.')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        raise SystemExit(f'Photo receipt preparation stopped ({type(error).__name__})') from None
