#!/usr/bin/env python3

import importlib.util
import json
import mimetypes
import os
import queue
import re
import sys
import tempfile
import threading
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent.parent


class Config:
    port = int(os.environ.get("PORT", "8787"))
    webhook_path = os.environ.get("TELEGRAM_WEBHOOK_PATH", "/telegram/webhook")
    webhook_secret = os.environ.get("TELEGRAM_WEBHOOK_SECRET", "")
    bot_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    bot_api_base_url = os.environ.get("TELEGRAM_BOT_API_BASE_URL", "https://api.telegram.org").rstrip("/")
    bot_file_base_url = os.environ.get("TELEGRAM_BOT_FILE_BASE_URL", "https://api.telegram.org/file").rstrip("/")
    bot_api_local_mode = os.environ.get("TELEGRAM_BOT_API_LOCAL_MODE", "0") == "1"
    channel_username = os.environ.get("TELEGRAM_CHANNEL_USERNAME", "screenshot_of_the_day")
    channel_id = os.environ.get("TELEGRAM_CHANNEL_ID", "")
    posts_json_path = Path(os.environ.get("POSTS_JSON_PATH", ROOT_DIR / "assets/telegram/posts.json")).resolve()
    data_dir = Path(os.environ.get("TELEGRAM_LIVE_DATA_DIR", ROOT_DIR / ".telegram-live")).resolve()
    s3_bucket = os.environ.get("S3_BUCKET", "")
    s3_endpoint = os.environ.get("S3_ENDPOINT", "https://s3.twcstorage.ru")
    s3_region = os.environ.get("S3_REGION", "ru-1")
    s3_prefix = os.environ.get("S3_PREFIX", "assets/telegram").strip("/")
    s3_acl = os.environ.get("S3_ACL", "public-read")
    s3_access_key = os.environ.get("S3_ACCESS_KEY", "")
    s3_secret_access_key = os.environ.get("S3_SECRET_ACCESS_KEY", "")
    upload_posts_json_to_s3 = os.environ.get("UPLOAD_POSTS_JSON_TO_S3", "1") != "0"


CONFIG = Config()
UPDATE_QUEUE = queue.Queue()


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--process-update":
        process_update(json.loads(Path(sys.argv[2]).read_text(encoding="utf-8")))
        return

    (CONFIG.data_dir / "inbox").mkdir(parents=True, exist_ok=True)
    worker = threading.Thread(target=worker_loop, daemon=True)
    worker.start()

    server = ThreadingHTTPServer(("127.0.0.1", CONFIG.port), WebhookHandler)
    print(f"Telegram live importer listening on 127.0.0.1:{CONFIG.port}{CONFIG.webhook_path}", flush=True)
    server.serve_forever()


class WebhookHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            self.send_json(200, {"ok": True})
            return

        self.send_json(404, {"ok": False, "error": "not_found"})

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path != CONFIG.webhook_path:
            self.send_json(404, {"ok": False, "error": "not_found"})
            return

        if CONFIG.webhook_secret and self.headers.get("X-Telegram-Bot-Api-Secret-Token") != CONFIG.webhook_secret:
            self.send_json(401, {"ok": False, "error": "bad_secret"})
            return

        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size > 5 * 1024 * 1024:
                raise ValueError("request body is too large")

            update = json.loads(self.rfile.read(size).decode("utf-8"))
            persist_update(update)
            UPDATE_QUEUE.put(update)
            self.send_json(200, {"ok": True})
        except Exception as error:
            print(error, file=sys.stderr, flush=True)
            self.send_json(400, {"ok": False, "error": "bad_request"})

    def log_message(self, format, *args):
        return

    def send_json(self, status, payload):
        body = f"{json.dumps(payload)}\n".encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def worker_loop():
    while True:
        update = UPDATE_QUEUE.get()

        try:
            process_update(update)
        except Exception as error:
            print(error, file=sys.stderr, flush=True)
        finally:
            UPDATE_QUEUE.task_done()


def process_update(update):
    message = update.get("channel_post") or update.get("edited_channel_post")

    if not message or not is_target_channel(message.get("chat", {})):
        return

    db = read_posts_json()
    missing_before = len(db.setdefault("missing", []))
    media = get_message_media(message, db)
    text = get_message_text(message)

    if not text.strip() and not media:
        if len(db["missing"]) != missing_before:
            write_posts_json(db)

            if CONFIG.upload_posts_json_to_s3:
                upload_posts_json_to_s3()

        return

    upsert_post(db, message, text, media, bool(update.get("edited_channel_post")))
    write_posts_json(db)

    if CONFIG.upload_posts_json_to_s3:
        upload_posts_json_to_s3()


def upsert_post(db, message, text, media, is_edit):
    message_id = message["message_id"]
    media_group_id = message.get("media_group_id")
    post = find_post(db["posts"], message_id, media_group_id)

    if not post:
        post = {
            "id": str(message_id),
            "messageIds": [],
            "mediaGroupId": media_group_id,
            "telegramUrl": f"https://t.me/{CONFIG.channel_username}/{message_id}",
            "date": iso_from_unix(message["date"]),
            "dateUnixtime": message["date"],
            "edited": None,
            "text": "",
            "entities": [],
            "media": [],
            "reactions": [],
        }
        db["posts"].append(post)

    if message_id not in post["messageIds"]:
        post["messageIds"].append(message_id)
        post["messageIds"].sort()

    if media_group_id and not post.get("mediaGroupId"):
        post["mediaGroupId"] = media_group_id

    first_message_id = post["messageIds"][0]
    post["id"] = str(first_message_id)
    post["telegramUrl"] = f"https://t.me/{CONFIG.channel_username}/{first_message_id}"

    if text.strip() or is_edit:
        post["text"] = text
        post["entities"] = normalize_entities(text, message.get("caption_entities") or message.get("entities") or [])

    if media:
        post["media"] = [item for item in post["media"] if item.get("sourceMessageId") != message_id]
        post["media"].extend(media)
        post["media"].sort(key=lambda item: item.get("sourceMessageId", 0))

    if is_edit:
        post["edited"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    db["posts"].sort(key=lambda item: item.get("dateUnixtime", 0), reverse=True)
    db["importedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def find_post(posts, message_id, media_group_id):
    if media_group_id:
        for post in posts:
            if post.get("mediaGroupId") == media_group_id:
                return post

    for post in posts:
        if message_id in post.get("messageIds", []):
            return post

    return None


def get_message_media(message, db):
    entries = []

    if message.get("photo"):
        photo = sorted(message["photo"], key=lambda item: item.get("file_size", 0), reverse=True)[0]
        entries.append(media_entry(photo, "photo"))

    if message.get("video"):
        entries.append(media_entry(message["video"], "video"))

    if message.get("animation"):
        entries.append(media_entry(message["animation"], "animation"))

    if message.get("sticker"):
        sticker_type = "video" if message["sticker"].get("is_video") else "sticker"
        entries.append(media_entry(message["sticker"], sticker_type))

    if message.get("document"):
        document = message["document"]
        media_type = media_type_from_mime(document.get("mime_type", ""))
        entries.append(media_entry(document, media_type))

    media = []

    for entry in entries:
        if entry["type"] == "file":
            continue

        try:
            telegram_file = get_telegram_file(entry["telegram_file"]["file_id"])
            file_path = telegram_file["file_path"]
            key = build_s3_key(message, entry, file_path)
            content_type = entry["telegram_file"].get("mime_type") or content_type_from_path(file_path)
            local_path = Path(file_path) if CONFIG.bot_api_local_mode else None

            if local_path and local_path.is_absolute() and local_path.exists():
                upload_file_to_s3(key, local_path, content_type=content_type)
                uploaded_size = local_path.stat().st_size
            else:
                body = download_telegram_file(file_path)
                upload_bytes_to_s3(key, body, content_type)
                uploaded_size = len(body)
        except Exception as error:
            db.setdefault("missing", []).append({
                "messageId": message["message_id"],
                "fileId": entry["telegram_file"].get("file_id"),
                "type": entry["type"],
                "size": entry["size"],
                "error": str(error),
                "recordedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            })
            print(error, file=sys.stderr, flush=True)
            continue

        media.append({
            "type": entry["type"],
            "src": f"/{encode_path(key)}",
            "width": entry["width"],
            "height": entry["height"],
            "size": entry["size"] or uploaded_size,
            "mimeType": content_type,
            "duration": entry["duration"],
            "name": entry["name"] or Path(telegram_file["file_path"]).name,
            "sourceMessageId": message["message_id"],
        })

    return media


def media_entry(value, media_type):
    return {
        "telegram_file": value,
        "type": media_type,
        "width": value.get("width"),
        "height": value.get("height"),
        "size": value.get("file_size"),
        "duration": value.get("duration"),
        "name": value.get("file_name"),
    }


def get_telegram_file(file_id):
    if not CONFIG.bot_token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is required to download media")

    payload = telegram_json("getFile", {"file_id": file_id})

    if not payload.get("ok"):
        raise RuntimeError(f"Telegram getFile failed: {payload}")

    return payload["result"]


def telegram_json(method, params):
    query = urllib.parse.urlencode(params)
    url = f"{CONFIG.bot_api_base_url}/bot{CONFIG.bot_token}/{method}?{query}"

    with urllib.request.urlopen(url, timeout=120) as response:
        return json.loads(response.read().decode("utf-8"))


def download_telegram_file(file_path):
    url = f"{CONFIG.bot_file_base_url}/bot{CONFIG.bot_token}/{file_path}"

    with urllib.request.urlopen(url, timeout=120) as response:
        return response.read()


def read_posts_json():
    if CONFIG.posts_json_path.exists():
        db = json.loads(CONFIG.posts_json_path.read_text(encoding="utf-8"))
        db.setdefault("posts", [])
        db.setdefault("channelUsername", CONFIG.channel_username)
        return db

    return {
        "source": "Telegram Bot API",
        "channelUsername": CONFIG.channel_username,
        "importedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "posts": [],
        "missing": [],
    }


def write_posts_json(db):
    CONFIG.posts_json_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = CONFIG.posts_json_path.with_suffix(f"{CONFIG.posts_json_path.suffix}.tmp")
    temporary.write_text(f"{json.dumps(db, ensure_ascii=False, indent=2)}\n", encoding="utf-8")
    temporary.replace(CONFIG.posts_json_path)


def upload_posts_json_to_s3():
    upload_file_to_s3(f"{CONFIG.s3_prefix}/posts.json", CONFIG.posts_json_path)


def upload_bytes_to_s3(key, body, content_type):
    suffix = Path(key).suffix or ".bin"
    CONFIG.data_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.NamedTemporaryFile(dir=CONFIG.data_dir, suffix=suffix, delete=False) as file:
        temporary = Path(file.name)
        file.write(body)

    try:
        upload_file_to_s3(key, temporary, content_type=content_type)
    finally:
        temporary.unlink(missing_ok=True)


def upload_file_to_s3(key, file_path, content_type=None):
    if not CONFIG.s3_bucket or not CONFIG.s3_access_key or not CONFIG.s3_secret_access_key:
        raise RuntimeError("S3_BUCKET, S3_ACCESS_KEY and S3_SECRET_ACCESS_KEY are required")

    client = get_s3_client()

    if content_type:
        original_guess = s3_module().guess_content_type
        s3_module().guess_content_type = lambda _: content_type

        try:
            put_or_multipart(client, key, file_path)
        finally:
            s3_module().guess_content_type = original_guess
    else:
        put_or_multipart(client, key, file_path)


def put_or_multipart(client, key, file_path):
    part_size = 64 * 1024 * 1024

    if file_path.stat().st_size > part_size:
        client.upload_multipart(key, file_path, part_size)
    else:
        client.put_object(key, file_path)


def get_s3_client():
    module = s3_module()
    return module.S3Client(
        access_key=CONFIG.s3_access_key,
        secret_key=CONFIG.s3_secret_access_key,
        endpoint=CONFIG.s3_endpoint,
        region=CONFIG.s3_region,
        bucket=CONFIG.s3_bucket,
        acl=CONFIG.s3_acl,
        insecure=os.environ.get("S3_INSECURE", "0") == "1",
    )


_S3_MODULE = None


def s3_module():
    global _S3_MODULE

    if _S3_MODULE:
        return _S3_MODULE

    path = Path(__file__).with_name("s3-upload-static-assets.py")
    spec = importlib.util.spec_from_file_location("s3_upload_static_assets", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    _S3_MODULE = module
    return module


def is_target_channel(chat):
    if CONFIG.channel_id and str(chat.get("id")) != CONFIG.channel_id:
        return False

    if chat.get("username") and chat["username"] != CONFIG.channel_username:
        return False

    return True


def get_message_text(message):
    return message.get("caption") or message.get("text") or ""


def normalize_entities(text, entities):
    if not entities:
        return []

    chunks = []
    offset = 0

    for entity in sorted(entities, key=lambda item: item["offset"]):
        if entity["offset"] > offset:
            chunks.append({"type": "plain", "text": utf16_slice(text, offset, entity["offset"] - offset), "href": None})

        entity_text = utf16_slice(text, entity["offset"], entity["length"])
        entity_type = "text_link" if entity["type"] == "url" else entity["type"]
        chunks.append({
            "type": entity_type,
            "text": entity_text,
            "href": entity.get("url") or (entity_text if entity["type"] == "url" else None),
        })
        offset = entity["offset"] + entity["length"]

    total_units = len(text.encode("utf-16-le")) // 2

    if offset < total_units:
        chunks.append({"type": "plain", "text": utf16_slice(text, offset, total_units - offset), "href": None})

    return [chunk for chunk in chunks if chunk["text"]]


def utf16_slice(text, offset, length):
    raw = text.encode("utf-16-le")
    return raw[offset * 2:(offset + length) * 2].decode("utf-16-le")


def build_s3_key(message, entry, file_path):
    date = datetime.fromtimestamp(message["date"], timezone.utc)
    basename = safe_filename(entry["name"] or Path(file_path).name)
    return f"{CONFIG.s3_prefix}/live/{date:%Y/%m/%d}/{message['message_id']}-{entry['type']}-{basename}"


def media_type_from_mime(mime_type):
    if mime_type.startswith("image/"):
        return "photo"
    if mime_type.startswith("video/"):
        return "video"
    return "file"


def content_type_from_path(file_path):
    content_type, _ = mimetypes.guess_type(file_path)
    return content_type or "application/octet-stream"


def persist_update(update):
    update_id = update.get("update_id", int(time.time()))
    filename = f"{int(time.time() * 1000)}-{update_id}.json"
    (CONFIG.data_dir / "inbox").mkdir(parents=True, exist_ok=True)
    (CONFIG.data_dir / "inbox" / filename).write_text(f"{json.dumps(update, ensure_ascii=False, indent=2)}\n", encoding="utf-8")


def iso_from_unix(value):
    return datetime.fromtimestamp(value, timezone.utc).isoformat().replace("+00:00", "Z")


def encode_path(value):
    return "/".join(urllib.parse.quote(part) for part in value.split("/"))


def safe_filename(value):
    value = re.sub(r"[^\w. -]+", "-", value, flags=re.UNICODE)
    value = re.sub(r"\s+", " ", value).strip()
    return value[:120] or "file"


def trim_slashes(value):
    return value.strip("/")


if __name__ == "__main__":
    main()
