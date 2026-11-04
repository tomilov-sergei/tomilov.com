"""Private Telegram alerts; never log credentials or upstream exception text."""
import fcntl
import json
import os
from pathlib import Path
import time
import urllib.error
import urllib.request

from media_storage import atomic_json

REMINDER_SECONDS = 3600
RECOVERY_CHECKS = 2
LABELS = {
    'telegram_unhealthy_or_pending_over_15_minutes': 'Ошибка импортёра Telegram или очередь старше 15 минут',
    'telegram_unreachable': 'Импортёр Telegram недоступен',
    'photos_unhealthy_or_pending_over_15_minutes': 'Ошибка публикации фотографий',
    'photos_unreachable': 'Сервис публикации фотографий недоступен',
    'data_free_below_512_MiB': 'На диске данных осталось меньше 512 МиБ',
    'root_free_below_512_MiB': 'На системном диске осталось меньше 512 МиБ',
    'temporary_over_512_MiB': 'Временные файлы превысили 512 МиБ',
    'bot_cache_and_state_over_2_GiB': 'Кеш Telegram превысил 2 ГиБ',
    'monitor_check_failed': 'Не удалось выполнить проверку мониторинга',
}


class DeliveryError(RuntimeError):
    def __init__(self, retry_after=60):
        super().__init__('Telegram alert delivery failed')
        self.retry_after = max(60, min(int(retry_after), 86400))


def send_message(text):
    token = os.environ.get('MEDIA_ALERT_BOT_TOKEN', '')
    chat_id = os.environ.get('MEDIA_ALERT_CHAT_ID', '')
    if not token or not chat_id:
        raise DeliveryError()
    payload = json.dumps({'chat_id': chat_id, 'text': text,
                          'link_preview_options': {'is_disabled': True}}).encode()
    request = urllib.request.Request('https://api.telegram.org/bot' + token + '/sendMessage',
                                     data=payload, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            value = json.load(response)
        if not value.get('ok') or not value.get('result', {}).get('message_id'):
            raise DeliveryError()
        return value['result']['message_id']
    except urllib.error.HTTPError as error:
        retry_after = 60
        if error.code == 429:
            try:
                retry_after = json.load(error).get('parameters', {}).get('retry_after', 60)
            except (ValueError, TypeError):
                pass
        raise DeliveryError(retry_after) from None
    except Exception:
        raise DeliveryError() from None


def describe(result):
    lines = [LABELS.get(e, 'Неизвестная ошибка мониторинга') for e in result.get('errors', [])]
    telegram = result.get('telegram', {})
    if telegram:
        lines.append(f"В очереди: {int(telegram.get('pending', 0))}; "
                     f"возраст старейшего: {int(telegram.get('oldestPendingSeconds', 0)) // 60} мин.")
        update = telegram.get('updateId')
        if isinstance(update, int):
            lines.append(f'Обновление: {update}.')
        stage = telegram.get('stage')
        if stage in {'media', 'manifest', 'publish', 'seo', 'idle'}:
            lines.append('Этап: ' + stage + '.')
    lines.append('Проверка: раз в минуту. Напоминание о продолжающемся сбое: раз в час.')
    return '\n'.join(lines)


def notify(result, state_path=None, sender=None, now=None, test=False):
    if os.environ.get('MEDIA_ALERTS_ENABLED') != '1':
        return {'status': 'disabled'}
    path = Path(state_path or '/var/lib/tomilov-media/telegram-alert-state.json')
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.with_suffix('.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {'status': 'busy'}
        state = json.loads(path.read_text()) if path.exists() else {}
        return _notify(result, path, state, sender or send_message,
                       time.time() if now is None else now, test)


def _notify(result, path, state, sender, now, test):
    errors = sorted(set(result.get('errors', [])))
    failure_id = result.get('telegram', {}).get('lastFailure', {}).get('id')
    unseen_failure = bool(failure_id and failure_id != state.get('last_failure_id'))
    active = state.get('active_errors', [])
    kind = None
    if errors:
        state['healthy_checks'] = 0
        if not active or errors != active or now - state.get('last_sent_at', 0) >= REMINDER_SECONDS:
            kind = 'incident' if errors != active else 'reminder'
    elif active:
        state['healthy_checks'] = state.get('healthy_checks', 0) + 1
        if state['healthy_checks'] >= RECOVERY_CHECKS:
            kind = 'recovery'
    elif unseen_failure and now - state.get('last_sent_at', 0) >= REMINDER_SECONDS:
        kind = 'transient'
    if not kind or now < state.get('next_attempt_at', 0):
        atomic_json(path, state)
        return {'status': 'suppressed', 'active': bool(active)}
    titles = {'incident': '🔴 Сбой', 'reminder': '🔴 Сбой продолжается',
              'recovery': '🟢 Работа восстановлена',
              'transient': '⚠️ Зафиксирована кратковременная ошибка; сейчас импортёр работает'}
    prefix = 'ТЕСТ ОПОВЕЩЕНИЙ — сбой смоделирован, данные не изменялись\n' if test else ''
    text = prefix + titles[kind] + ' — tomilov.com\n' + describe(result)
    # Persist an attempt boundary before sending: a timeout is ambiguous, and
    # must not cause immediate repeated messages. Success alone advances state.
    state['next_attempt_at'] = now + 60
    atomic_json(path, state)
    try:
        message_id = sender(text)
    except DeliveryError as error:
        state['next_attempt_at'] = now + error.retry_after
        atomic_json(path, state)
        raise
    state.update(active_errors=errors, last_sent_at=now, last_message_id=message_id,
                 last_failure_id=failure_id, healthy_checks=0)
    atomic_json(path, state)
    return {'status': 'sent', 'kind': kind, 'message_id': message_id}
