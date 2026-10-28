import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock
import urllib.error
import xml.etree.ElementTree as ET

import media_storage as storage
import migrate_media_to_s3 as migration
import photo_upload_server as photos
import telegram_live_importer as telegram
import generate_photo_previews as previews


class Response(io.BytesIO):
    def __init__(self, body=b'', headers=None):
        super().__init__(body)
        self.headers = headers or {}


class FakeS3:
    bucket = 'test'
    endpoint = 'https://example.invalid'
    def __init__(self):
        self.objects = {}
        self.parts = {}
        self.calls = []
        self.fail_part = None
        self.complete_error = False

    def request(self, method, key, query=None, body=b'', headers=None):
        query = query or {}
        self.calls.append((method, key, dict(query)))
        if method == 'HEAD':
            if key not in self.objects:
                raise urllib.error.HTTPError('hidden', 404, 'missing', {}, None)
            return Response(headers={'Content-Length': str(len(self.objects[key]))})
        if method == 'GET':
            return Response(self.objects[key])
        if method == 'POST' and 'uploads' in query:
            return Response(b'<InitiateMultipartUploadResult><UploadId>u1</UploadId></InitiateMultipartUploadResult>')
        if method == 'PUT' and 'partNumber' in query:
            number = query['partNumber']
            if number == self.fail_part:
                raise RuntimeError('simulated interruption')
            self.parts[number] = body
            return Response(headers={'ETag': 'part-' + str(number)})
        if method == 'POST':
            if self.complete_error:
                return Response(b'<Error><Code>InternalError</Code></Error>')
            self.objects[key] = b''.join(self.parts[n] for n in sorted(self.parts))
            return Response(b'<CompleteMultipartUploadResult/>')
        if method == 'PUT':
            self.objects[key] = body
            return Response()
        raise AssertionError(method)


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.file = self.root / 'input.mp4'
        self.file.write_bytes(b'abcdefghij')
        self.fake = FakeS3()
        self.store = storage.Store(self.fake)

    def test_same_size_different_content_is_never_overwritten(self):
        self.fake.objects['key'] = b'0123456789'
        with self.assertRaisesRegex(RuntimeError, 'mismatch'):
            self.store.put_verified('key', self.file)
        self.assertEqual(self.fake.objects['key'], b'0123456789')
        self.assertFalse(any(c[0] == 'PUT' for c in self.fake.calls))

    def test_existing_identical_object_only_reads(self):
        self.fake.objects['key'] = self.file.read_bytes()
        self.store.put_verified('key', self.file)
        self.assertEqual([c[0] for c in self.fake.calls], ['HEAD', 'GET'])

    def test_multipart_restart_does_not_repeat_recorded_part(self):
        journal = self.root / 'journal.json'
        self.fake.fail_part = 2
        with mock.patch.object(storage, 'PART', 4):
            with self.assertRaises(RuntimeError):
                self.store.put_verified('key', self.file, journal)
            self.assertEqual(len(json.loads(journal.read_text())['parts']), 1)
            self.fake.fail_part = None
            self.store.put_verified('key', self.file, journal)
        self.assertEqual(self.fake.objects['key'], b'abcdefghij')
        self.assertEqual(sum(c[2].get('partNumber') == 1 for c in self.fake.calls), 1)
        self.assertFalse(journal.exists())

    def test_http_200_multipart_error_is_not_success(self):
        self.fake.complete_error = True
        with mock.patch.object(storage, 'PART', 4):
            with self.assertRaisesRegex(RuntimeError, 'completion'):
                self.store.put_verified('key', self.file, self.root / 'journal.json')
        self.assertNotIn('key', self.fake.objects)

    def test_source_changed_after_inventory_rejected(self):
        path = self.root / 'assets/telegram/files/a.bin'
        path.parent.mkdir(parents=True)
        path.write_bytes(b'original')
        manifest = migration.inventory(self.root)
        path.write_bytes(b'changed!')
        with self.assertRaises(RuntimeError):
            migration.check_source(self.root, manifest['objects'][0])

    def test_symlink_and_traversal_refused(self):
        directory = self.root / 'assets/telegram/files'
        directory.mkdir(parents=True)
        (directory / 'link').symlink_to(self.file)
        for key in ['assets/telegram/files/link', 'assets/telegram/files/../../../input.mp4', 'assets/collector/file']:
            with self.assertRaises(RuntimeError):
                migration.source_path(self.root, key)

    def test_inventory_excludes_manifests_and_other_products(self):
        for key in ['assets/telegram/files/a', 'assets/telegram/posts.json', 'assets/photos/photos.json', 'collector/a']:
            path = self.root / key
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b'hello')
        self.assertEqual([r['key'] for r in migration.inventory(self.root)['objects']], ['assets/telegram/files/a'])

    def test_atomic_manifest_is_group_readable_only_when_requested(self):
        storage.atomic_json(self.root / 'private.json', {}, mode=0o600)
        storage.atomic_json(self.root / 'public.json', {}, mode=0o664)
        self.assertEqual((self.root / 'private.json').stat().st_mode & 0o777, 0o600)
        self.assertEqual((self.root / 'public.json').stat().st_mode & 0o777, 0o664)


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def test_telegram_acknowledged_event_recovered_and_deduplicated(self):
        update = {'update_id': 123, 'channel_post': {'message_id': 1}}
        with mock.patch.object(telegram.CONFIG, 'data_dir', self.root):
            telegram.persist_update(update)
            with mock.patch.object(telegram, 'process_update', side_effect=RuntimeError):
                with self.assertRaises(RuntimeError):
                    telegram.process_pending_once()
            self.assertTrue((self.root / 'pending/123.json').exists())
            with mock.patch.object(telegram, 'process_update') as process:
                telegram.process_pending_once()
                telegram.persist_update(update)
                telegram.process_pending_once()
                process.assert_called_once_with(update)
            self.assertFalse((self.root / 'pending/123.json').exists())

    def test_telegram_failed_media_does_not_publish_partial_post(self):
        update = {'update_id': 1, 'channel_post': {'message_id': 1, 'chat': {'username': 'screenshot_of_the_day'}}}
        def failed(message, db):
            db['missing'].append({'error': 'failure'})
            return []
        with mock.patch.object(telegram, 'read_posts_json', return_value={'posts': [], 'missing': []}), \
             mock.patch.object(telegram, 'get_message_rich_content', return_value=None), \
             mock.patch.object(telegram, 'get_message_media', side_effect=failed), \
             mock.patch.object(telegram, 'write_posts_json') as write:
            with self.assertRaises(RuntimeError):
                telegram.process_update(update)
            write.assert_not_called()

    def upload(self, fail=False):
        body = b'\xff\xd8\xffHDRGainMap original'
        fixture = {'body': body, 'filename': 'test.jpg', 'content_type': 'image/jpeg'}
        def put(key, path, **kwargs):
            if fail:
                raise RuntimeError('S3 offline')
            return storage.sha256_file(path)
        def preview(ffmpeg, source, output, *args):
            output.write_bytes(b'preview')
        with mock.patch.dict(os.environ, {'MEDIA_STORAGE': 's3', 'MEDIA_TMP_DIR': str(self.root / 'tmp'), 'MEDIA_STATE_DIR': str(self.root / 'state')}), \
             mock.patch.object(photos.CONFIG, 'photos_json_path', self.root / 'assets/photos/photos.json'), \
             mock.patch.object(photos, 'extract_photo_metadata', return_value={}), \
             mock.patch.object(photos, 'regenerate_seo_pages'), \
             mock.patch.object(photos.shutil, 'which', return_value='ffmpeg'), \
             mock.patch.object(previews, 'generate_preview', side_effect=preview), \
             mock.patch.object(storage, 'Store') as store:
            store.return_value.put_verified.side_effect = put
            first = photos.save_photo(fixture, {'caption': 'one'})
            second = photos.save_photo(fixture, {'caption': 'one'})
            self.assertEqual(first['id'], second['id'])
            self.assertEqual(store.return_value.put_verified.call_count, 2)  # original + HDR canvas
            previews.validate_receipt(first)
            self.assertEqual(len(photos.read_photos_json()['photos']), 1)
        self.assertFalse((self.root / 'assets/photos/originals').exists())
        self.assertEqual(list((self.root / 'tmp').iterdir()), [])

    def test_photo_publication_and_retry_without_local_original(self):
        self.upload()

    def test_photo_failure_does_not_publish_or_leave_temp(self):
        with self.assertRaises(RuntimeError):
            self.upload(fail=True)
        self.assertFalse((self.root / 'assets/photos/photos.json').exists())
        self.assertEqual(list((self.root / 'tmp').iterdir()), [])

    def test_s3_generators_refuse_missing_receipt(self):
        with mock.patch.dict(os.environ, {'MEDIA_STORAGE': 's3'}):
            with self.assertRaises(RuntimeError):
                previews.generate([{'id': 'old', 'src': '/assets/photos/originals/old.jpg'}])

    def test_only_verified_download_cache_file_can_be_removed(self):
        cache = self.root / "cache"
        media = cache / "bot" / "videos" / "sample.mp4"
        media.parent.mkdir(parents=True)
        media.write_bytes(b"verified")
        state = cache / "bot" / "state.binlog"
        state.write_bytes(b"verified")
        digest = hashlib.sha256(b"verified").hexdigest()
        with mock.patch.dict(os.environ, {"TELEGRAM_CACHE_ROOT": str(cache)}):
            self.assertFalse(telegram.cleanup_verified_local_file(state, digest, 8))
            self.assertFalse(telegram.cleanup_verified_local_file(media, "0" * 64, 8))
            self.assertTrue(media.exists())
            self.assertTrue(telegram.cleanup_verified_local_file(media, digest, 8))
        self.assertTrue(state.exists())
        self.assertFalse(media.exists())

    def test_unknown_backend_fails_closed(self):
        with mock.patch.dict(os.environ, {'MEDIA_STORAGE': 'typo'}):
            with self.assertRaises(RuntimeError):
                storage.backend()


if __name__ == '__main__':
    unittest.main()
