import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest import mock

import media_storage as storage
import telegram_live_importer as telegram
from test_media_storage import FakeS3, Response


class VersionedS3(FakeS3):
    def request(self, method, key, **kwargs):
        response = super().request(method, key, **kwargs)
        if method in ('HEAD', 'GET'):
            body = self.objects[key]
            response.headers = {'ETag': hashlib.sha256(body).hexdigest(),
                                'Content-Length': str(len(body)),
                                'x-amz-meta-sha256': hashlib.sha256(body).hexdigest()}
        return response


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        for field, value in [('data_dir', self.root), ('posts_json_path', self.root/'posts.json')]:
            patch = mock.patch.object(telegram.CONFIG, field, value)
            patch.start()
            self.addCleanup(patch.stop)
        patch = mock.patch.dict(telegram.WORKER_STATE, {'lastError': None, 'retrySeconds': 0}, clear=True)
        patch.start()
        self.addCleanup(patch.stop)
        self.update = {'update_id': 55, 'channel_post': {'message_id': 10, 'date': 1700000000,
                       'chat': {'username': 'screenshot_of_the_day'}, 'text': 'Example'}}

    def test_seo_failure_restart_only_retries_seo_and_preserves_payload(self):
        telegram.persist_update(self.update)
        with mock.patch.object(telegram, 'get_message_media', return_value=[]) as media, \
             mock.patch.object(telegram, 'upload_posts_json_to_s3') as publish, \
             mock.patch.object(telegram, 'regenerate_seo_pages', side_effect=PermissionError):
            with self.assertRaises(PermissionError):
                telegram.process_pending_once()
            media.assert_called_once()
            publish.assert_called_once()
        self.assertFalse((self.root/'completed/55.json').exists())
        before = telegram.CONFIG.posts_json_path.read_bytes()
        # New invocation loads only durable state, no in-memory cache.
        with mock.patch.object(telegram, 'get_message_media') as media, \
             mock.patch.object(telegram, 'upload_posts_json_to_s3') as publish, \
             mock.patch.object(telegram, 'regenerate_seo_pages') as seo:
            telegram.process_pending_once()
            media.assert_not_called()
            publish.assert_not_called()
            seo.assert_called_once()
        self.assertEqual(before, telegram.CONFIG.posts_json_path.read_bytes())
        self.assertEqual(json.loads((self.root/'inbox/55.json').read_text()), self.update)
        self.assertTrue((self.root/'completed/55.json').exists())
        self.assertFalse((self.root/'pending/55.json').exists())

    def test_manifest_upload_failure_does_not_repeat_media_or_rewrite_json(self):
        with mock.patch.object(telegram, 'get_message_media', return_value=[]), \
             mock.patch.object(telegram, 'upload_posts_json_to_s3', side_effect=RuntimeError):
            with self.assertRaises(RuntimeError):
                telegram.process_update(self.update)
        before = telegram.CONFIG.posts_json_path.read_bytes()
        with mock.patch.object(telegram, 'get_message_media') as media, \
             mock.patch.object(telegram, 'upload_posts_json_to_s3') as publish, \
             mock.patch.object(telegram, 'regenerate_seo_pages'):
            telegram.process_update(self.update)
            media.assert_not_called()
            publish.assert_called_once()
        self.assertEqual(before, telegram.CONFIG.posts_json_path.read_bytes())

    def test_completion_before_unlink_never_replays_old_update(self):
        telegram.persist_update(self.update)
        storage.atomic_json(self.root/'completed/55.json', {'update_id': 55})
        with mock.patch.object(telegram, 'process_update') as process:
            telegram.process_pending_once()
            process.assert_not_called()
        self.assertFalse((self.root/'pending/55.json').exists())

    def test_conflicting_payload_or_manifest_fails_closed(self):
        with mock.patch.object(telegram, 'upload_posts_json_to_s3'), \
             mock.patch.object(telegram, 'regenerate_seo_pages', side_effect=RuntimeError):
            with self.assertRaises(RuntimeError):
                telegram.process_update(self.update)
        changed = json.loads(json.dumps(self.update))
        changed['channel_post']['text'] = 'different'
        with self.assertRaisesRegex(RuntimeError, 'payload mismatch'):
            telegram.process_update(changed)
        telegram.CONFIG.posts_json_path.write_text('{}')
        with self.assertRaisesRegex(RuntimeError, 'Manifest changed'):
            telegram.process_update(self.update)

    def test_animation_document_identity_deduplicates_but_distinct_files_remain(self):
        animation = {'file_id': 'animation', 'file_unique_id': 'same', 'mime_type': 'video/mp4'}
        document = {**animation, 'file_id': 'document'}
        with mock.patch.object(telegram, 'download_message_media', return_value=[]) as download:
            telegram.get_message_media({'animation': animation, 'document': document}, {})
            self.assertEqual([e['type'] for e in download.call_args.args[1]], ['animation'])
            document['file_unique_id'] = 'distinct'
            telegram.get_message_media({'animation': animation, 'document': document}, {})
            self.assertEqual([e['type'] for e in download.call_args.args[1]], ['animation', 'video'])

    def test_pending_failure_blocks_later_update_without_losing_either(self):
        telegram.persist_update(self.update)
        telegram.persist_update({'update_id': 56})
        with mock.patch.object(telegram, 'process_update', side_effect=RuntimeError) as process:
            with self.assertRaises(RuntimeError):
                telegram.process_pending_once()
            self.assertEqual(process.call_count, 1)
        self.assertEqual(len(list((self.root/'pending').glob('*.json'))), 2)

    def test_health_exposes_stall_and_failure(self):
        telegram.persist_update(self.update)
        self.assertTrue(telegram.health_status()['ok'])
        path = self.root/'pending/55.json'
        old = time.time()-901
        os.utime(path, (old, old))
        self.assertFalse(telegram.health_status()['ok'])
        os.utime(path, None)
        telegram.WORKER_STATE['lastError'] = 'PermissionError'
        self.assertFalse(telegram.health_status()['ok'])

    def test_retry_backoff_caps_and_does_not_spin(self):
        class StopWorker(BaseException):
            pass
        with mock.patch.object(telegram, 'process_pending_once', side_effect=RuntimeError), \
             mock.patch.object(telegram.time, 'sleep', side_effect=[None]*6+[StopWorker]) as sleep:
            with self.assertRaises(StopWorker):
                telegram.worker_loop()
        self.assertEqual([c.args[0] for c in sleep.call_args_list], [30, 60, 120, 240, 480, 900, 900])

    def test_durable_receipt_skips_body_transfers_but_detects_replacement(self):
        source = self.root/'source'; source.write_bytes(b'original')
        journal = self.root/'journal'
        fake = VersionedS3()
        storage.Store(fake).put_verified('key', source, journal, replace=True)
        fake.calls.clear()
        storage.Store(fake).put_verified('key', source, journal, replace=True)
        self.assertEqual([c[0] for c in fake.calls], ['HEAD'])
        fake.objects['key'] = b'changed!'
        with self.assertRaisesRegex(RuntimeError, 'mismatch'):
            storage.Store(fake).put_verified('key', source, journal)
        self.assertEqual(fake.objects['key'], b'changed!')

    def test_metadata_alone_never_skips_full_checksum(self):
        source = self.root/'source'; source.write_bytes(b'original')
        fake = VersionedS3(); fake.objects['key'] = b'original'
        storage.Store(fake).put_verified('key', source, self.root/'journal', replace=True)
        self.assertEqual([c[0] for c in fake.calls], ['HEAD', 'GET'])

    def test_failed_checksum_does_not_issue_receipt(self):
        class CorruptS3(VersionedS3):
            def request(self, method, key, **kwargs):
                result = super().request(method, key, **kwargs)
                if method == 'GET':
                    return Response(b'corrupt!', result.headers)
                return result
        source = self.root/'source'; source.write_bytes(b'original')
        with self.assertRaisesRegex(RuntimeError, 'mismatch'):
            storage.Store(CorruptS3()).put_verified('key', source, self.root/'journal')
        self.assertFalse((self.root/'journal.verified.json').exists())

    def test_readonly_lock_serializes_processes_and_rejects_symlink(self):
        lock = self.root/'generation.lock'; lock.touch(mode=0o444)
        code = ('import media_storage; '
                'exec("with media_storage.generation_lock():\\n print(\\\"acquired\\\", flush=True)")')
        env = dict(os.environ, MEDIA_GENERATION_LOCK=str(lock), PYTHONPATH=str(Path(storage.__file__).parent))
        with mock.patch.dict(os.environ, {'MEDIA_GENERATION_LOCK': str(lock)}):
            with storage.generation_lock():
                child = subprocess.Popen([sys.executable, '-c', code], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                time.sleep(.15)
                self.assertIsNone(child.poll())
            out, err = child.communicate(timeout=5)
            self.assertEqual(child.returncode, 0, err)
            self.assertIn(b'acquired', out)
            link = self.root/'link'; link.symlink_to(lock)
            with mock.patch.dict(os.environ, {'MEDIA_GENERATION_LOCK': str(link)}):
                with self.assertRaises(OSError):
                    with storage.generation_lock():
                        pass


if __name__ == '__main__':
    unittest.main()
