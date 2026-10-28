"""Exercise actual deploy control flow with transport/generator stubs.
No server or generated site files are changed by these tests.
"""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


class DeployStorageTests(unittest.TestCase):
    def run_deploy(self, **overrides):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            commands = root / 'bin'
            commands.mkdir()
            log = root / 'calls'
            for name in ['ssh', 'scp', 'rsync', 'git', 'python3']:
                script = commands / name
                script.write_text('#!/bin/bash\nprintf "%s\\n" "' + name + ' $*" >> "$TEST_CALLS"\n' +
                                  ('if [[ "$*" == *".media-storage"* ]]; then printf s3; fi\n' if name == 'ssh' else '') + 'exit 0\n')
                script.chmod(0o755)
            key = root / 'key'
            key.touch()
            config = root / 'deploy.env'
            config.write_text(f'SERVER=test-host\nDEPLOY_KEY={key}\nREMOTE_ROOT=/test/site\nREMOTE_STORAGE_ROOT=/test/data\n')
            env = {k: v for k, v in os.environ.items() if not k.startswith(('MEDIA_', 'PUSH_', 'PULL_', 'SYNC_', 'PHOTOS_ONLY'))}
            env.update(PATH=str(commands) + ':' + os.environ['PATH'], DEPLOY_ENV_FILE=str(config), TEST_CALLS=str(log))
            env.update(overrides)
            result = subprocess.run(['bash', str(Path(__file__).with_name('deploy-site.sh'))], env=env, capture_output=True, text=True)
            return result, log.read_text()

    def test_full_s3_deploy_never_rsyncs_telegram_or_photos(self):
        result, calls = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        transfers = [line for line in calls.splitlines() if line.startswith('rsync ')]
        self.assertFalse(any('/assets/telegram/' in x or '/assets/photos/' in x for x in transfers))
        self.assertIn("export MEDIA_STORAGE='s3'", calls)

    def test_photos_only_propagates_storage_without_copying_originals(self):
        result, calls = self.run_deploy(PHOTOS_ONLY='1')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn('rsync ', calls)
        self.assertIn("export MEDIA_STORAGE='s3'", calls)

    def test_local_override_cannot_restore_deleted_originals(self):
        result, calls = self.run_deploy(MEDIA_STORAGE='local')
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('scp ', calls)
        self.assertNotIn('rsync ', calls)

    def test_legacy_push_and_pull_flags_fail_before_any_writes(self):
        for flag in ['PUSH_LOCAL_PHOTOS', 'PUSH_LOCAL_TELEGRAM', 'SYNC_PHOTOS_FROM_REMOTE', 'SYNC_MEDIA_FROM_REMOTE']:
            with self.subTest(flag=flag):
                result, calls = self.run_deploy(**{flag: '1'})
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn('scp ', calls)
                self.assertNotIn('rsync ', calls)


if __name__ == '__main__':
    unittest.main()
