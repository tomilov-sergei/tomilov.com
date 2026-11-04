import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock
import urllib.error

import media_alerts as alerts
import check_media_runtime as health
import telegram_live_importer as telegram


class AlertTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.state = self.root/'alerts.json'
        patch = mock.patch.dict(os.environ, {'MEDIA_ALERTS_ENABLED': '1'})
        patch.start(); self.addCleanup(patch.stop)
        self.send = mock.Mock(return_value=123)
        self.bad = {'errors': ['telegram_unhealthy_or_pending_over_15_minutes'],
                    'telegram': {'pending': 6, 'oldestPendingSeconds': 1000}}
        self.good = {'errors': [], 'telegram': {'pending': 0}}

    def notify(self, result, now=10000):
        return alerts.notify(result, self.state, self.send, now=now)

    def test_incident_dedup_restart_hourly_reminder_and_confirmed_recovery(self):
        self.assertEqual(self.notify(self.bad)['kind'], 'incident')
        for now in [10060, 10120, 11000]:
            self.assertEqual(self.notify(self.bad, now)['status'], 'suppressed')
        self.assertEqual(self.send.call_count, 1)
        # Every call reloads the durable state, including across new instances.
        self.assertEqual(self.notify(self.bad, 13600)['kind'], 'reminder')
        self.assertEqual(self.notify(self.good, 13661)['status'], 'suppressed')
        self.assertEqual(self.notify(self.good, 13721)['kind'], 'recovery')
        self.notify(self.good, 13781)
        self.assertEqual(self.send.call_count, 3)
        self.assertFalse(json.loads(self.state.read_text())['active_errors'])

    def test_flapping_requires_two_consecutive_healthy_checks(self):
        self.notify(self.bad)
        self.notify(self.good, 10060)
        self.notify(self.bad, 10120)
        self.notify(self.good, 10180)
        self.assertEqual(self.send.call_count, 1)
        self.assertEqual(self.notify(self.good, 10240)['kind'], 'recovery')

    def test_failed_delivery_is_not_acknowledged_and_rate_limit_is_honored(self):
        self.send.side_effect = alerts.DeliveryError(120)
        with self.assertRaises(alerts.DeliveryError):
            self.notify(self.bad)
        self.assertNotIn('active_errors', json.loads(self.state.read_text()))
        self.assertEqual(self.notify(self.bad, 10060)['status'], 'suppressed')
        self.send.side_effect = None
        self.assertEqual(self.notify(self.bad, 10120)['kind'], 'incident')

    def test_short_lived_failure_survives_recovery_and_is_not_repeated(self):
        result = {'errors': [], 'telegram': {'pending': 0, 'lastFailure': {'id': 'failure-1'}}}
        self.assertEqual(self.notify(result)['kind'], 'transient')
        self.notify(result, 10060)
        result['telegram']['lastFailure']['id'] = 'failure-2'
        self.notify(result, 10120)
        self.assertEqual(self.send.call_count, 1)
        self.assertEqual(self.notify(result, 13600)['kind'], 'transient')

    def test_new_active_problem_is_not_hidden_by_transient_cooldown(self):
        self.notify({'errors': [], 'telegram': {'lastFailure': {'id': 'brief'}}})
        self.assertEqual(self.notify(self.bad, 10060)['kind'], 'incident')

    def test_sensitive_unknown_error_values_are_not_in_message(self):
        self.notify({'errors': ['token-secret'], 'telegram': {'stage': 'secret-path'}})
        text = self.send.call_args.args[0]
        self.assertNotIn('token-secret', text)
        self.assertNotIn('secret-path', text)
        self.assertEqual(self.state.stat().st_mode & 0o777, 0o600)

    def test_http_transport_failure_does_not_expose_token(self):
        with mock.patch.dict(os.environ, {'MEDIA_ALERT_BOT_TOKEN': 'secret-token', 'MEDIA_ALERT_CHAT_ID': '1'}), \
             mock.patch.object(alerts.urllib.request, 'urlopen', side_effect=OSError('secret-token')):
            with self.assertRaises(alerts.DeliveryError) as caught:
                alerts.send_message('test')
        self.assertNotIn('secret-token', str(caught.exception))

    def test_telegram_429_retry_after(self):
        error = urllib.error.HTTPError('secret-url', 429, 'rate', {},
                                      io.BytesIO(b'{"parameters":{"retry_after":120}}'))
        with mock.patch.dict(os.environ, {'MEDIA_ALERT_BOT_TOKEN': 'secret-token', 'MEDIA_ALERT_CHAT_ID': '1'}), \
             mock.patch.object(alerts.urllib.request, 'urlopen', side_effect=error):
            with self.assertRaises(alerts.DeliveryError) as caught:
                alerts.send_message('test')
        self.assertEqual(caught.exception.retry_after, 120)

    def test_monitor_exception_still_attempts_an_alert(self):
        with mock.patch.object(health, 'collect_health', side_effect=OSError), \
             mock.patch.object(health.media_alerts, 'notify', return_value={'status': 'sent'}) as send, \
             mock.patch.object(health, 'atomic_json'), mock.patch('sys.argv', ['check']):
            self.assertTrue(health.main())
        self.assertIn('monitor_check_failed', send.call_args.args[0]['errors'])

    def test_last_importer_error_persists_after_health_recovers(self):
        class Stop(BaseException):
            pass
        with mock.patch.object(telegram.CONFIG, 'data_dir', self.root), \
             mock.patch.dict(telegram.WORKER_STATE, {'lastError': None, 'retrySeconds': 0}, clear=True), \
             mock.patch.object(telegram, 'process_pending_once', side_effect=PermissionError), \
             mock.patch.object(telegram.time, 'sleep', side_effect=Stop):
            with self.assertRaises(Stop):
                telegram.worker_loop()
            recorded = json.loads((self.root/'last-error.json').read_text())
            # Simulate successful processing/restart: only the durable event remains.
            telegram.WORKER_STATE.update(lastError=None, retrySeconds=0)
            status = telegram.health_status()
            self.assertTrue(status['ok'])
            self.assertEqual(status['lastFailure']['id'], recorded['id'])
            self.assertEqual(status['lastFailure']['errorType'], 'PermissionError')


if __name__ == '__main__':
    unittest.main()
