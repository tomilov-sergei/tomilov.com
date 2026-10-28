#!/usr/bin/env python3
"""Read-only VPS media health check. Emits aggregate counts, never cache paths."""
import json
import os
from pathlib import Path
import shutil
import sys
import time
import urllib.request


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


def main():
    result = {'checked_at': int(time.time()), 'errors': []}
    for name, port in [('telegram', 8787), ('photos', 8788)]:
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=10) as response:
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
    state = Path('/var/lib/tomilov-media/health.json')
    temporary = state.with_suffix('.tmp')
    temporary.write_text(json.dumps(result) + '\n')
    temporary.chmod(0o600)
    temporary.replace(state)
    print(json.dumps(result))
    return bool(result['errors'])


if __name__ == '__main__':
    sys.exit(main())
