#!/usr/bin/env python3
"""VPS media health check and private Telegram fault/recovery notifications."""
import json
import os
from pathlib import Path
import shutil
import sys
import time
import urllib.request
import urllib.error

import media_alerts
from media_storage import atomic_json


def tree_bytes(root):
    total = 0
    for directory, _, names in os.walk(root, followlinks=False):
        for name in names:
            path = Path(directory) / name
            try:
                if not path.is_symlink():
                    total += path.stat().st_size
            except FileNotFoundError:
                pass  # A successful upload can remove its temporary file.
    return total


def collect_health():
    result = {'checked_at': int(time.time()), 'errors': []}
    for name, port in [('telegram', 8787), ('photos', 8788)]:
        try:
            try:
                response = urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=10)
            except urllib.error.HTTPError as error:
                if error.code != 503:
                    raise
                response = error
            with response:
                value = json.load(response)
            result[name] = value
            if not value.get('ok') or value.get('oldestPendingSeconds', 0) > 900:
                result['errors'].append(name + '_unhealthy_or_pending_over_15_minutes')
        except Exception:
            result['errors'].append(name + '_unreachable')
    for name, path in [('data', '/mnt/tomilov-data'), ('root', '/var/lib/tomilov-media')]:
        free = shutil.disk_usage(path).free
        result[name + '_free_bytes'] = free
        if free < 512 * 1024**2:
            result['errors'].append(name + '_free_below_512_MiB')
    result['temporary_bytes'] = tree_bytes('/var/lib/tomilov-media/tmp')
    result['bot_cache_and_state_bytes'] = tree_bytes('/mnt/tomilov-data/telegram-bot-api/data')
    if result['temporary_bytes'] > 512 * 1024**2:
        result['errors'].append('temporary_over_512_MiB')
    if result['bot_cache_and_state_bytes'] > 2 * 1024**3:
        result['errors'].append('bot_cache_and_state_over_2_GiB')
    return result


def main():
    if sys.argv[1:] == ['--test-alert']:
        # Separate state and explicit labels: never pretend production failed.
        now = time.time()
        path = Path('/var/lib/tomilov-media/telegram-alert-test.json')
        failure = {'errors': ['telegram_unhealthy_or_pending_over_15_minutes'],
                   'telegram': {'pending': 1, 'oldestPendingSeconds': 960, 'stage': 'seo'}}
        good = {'errors': [], 'telegram': {'pending': 0, 'oldestPendingSeconds': 0}}
        for result, at in [(failure, now), (good, now+61), (good, now+62)]:
            print(json.dumps(media_alerts.notify(result, path, now=at, test=True)))
        return 0
    try:
        result = collect_health()
    except Exception as error:
        result = {'checked_at': int(time.time()), 'errors': ['monitor_check_failed'],
                  'errorType': type(error).__name__}
    try:
        result['alerts'] = media_alerts.notify(result)
    except Exception as error:
        result['alerts'] = {'status': 'failed', 'errorType': type(error).__name__}
        result['errors'].append('telegram_alert_delivery_failed')
    atomic_json('/var/lib/tomilov-media/health.json', result)
    print(json.dumps(result))
    return bool(result['errors'])


if __name__ == '__main__':
    sys.exit(main())
