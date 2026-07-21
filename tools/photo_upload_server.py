#!/usr/bin/env python3

import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import threading
import urllib.parse
import urllib.request
import struct
from datetime import datetime, timezone
from email.parser import BytesParser
from email.policy import default
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent.parent
JSON_LOCK = threading.Lock()
IMAGE_TYPE_EXTENSIONS = {
    "image/jpeg": {".jpg", ".jpeg"},
    "image/png": {".png"},
    "image/webp": {".webp"},
    "image/avif": {".avif"},
    "image/heic": {".heic", ".heif"},
}
ALLOWED_EXTENSIONS = set().union(*IMAGE_TYPE_EXTENSIONS.values())
HDR_GAIN_MAP_SIGNATURES = (
    b"urn:iso:std:iso:ts:21496",
    b"hdrgainmap",
    b"hdrgm",
)


class Config:
    port = int(os.environ.get("PORT", "8788"))
    upload_path = os.environ.get("PHOTO_UPLOAD_PATH", "/photos/upload")
    upload_token = os.environ.get("PHOTO_UPLOAD_TOKEN", "")
    photos_json_path = Path(os.environ.get("PHOTOS_JSON_PATH", ROOT_DIR / "assets/photos/photos.json")).resolve()
    photos_public_prefix = os.environ.get("PHOTOS_PUBLIC_PREFIX", "/assets/photos").rstrip("/")
    seo_generator_path = Path(os.environ.get("PHOTO_SEO_GENERATOR_PATH", ROOT_DIR / "tools/generate_photo_seo.py")).resolve()
    site_url = os.environ.get("SITE_URL", "https://tomilov.com").rstrip("/")
    max_upload_bytes = int(os.environ.get("PHOTO_MAX_UPLOAD_BYTES", str(80 * 1024 * 1024)))


CONFIG = Config()


def main():
    if not CONFIG.upload_token:
        print("PHOTO_UPLOAD_TOKEN is required", file=sys.stderr)
        sys.exit(1)

    CONFIG.photos_json_path.parent.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", CONFIG.port), PhotoUploadHandler)
    print(f"Photo upload server listening on 127.0.0.1:{CONFIG.port}{CONFIG.upload_path}", flush=True)
    server.serve_forever()


class PhotoUploadHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            self.send_json(200, {"ok": True})
            return

        self.send_json(404, {"ok": False, "error": "not_found"})

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path != CONFIG.upload_path:
            self.send_json(404, {"ok": False, "error": "not_found"})
            return

        try:
            if self.is_multipart():
                fields, files = self.parse_multipart()
                file_part = files.get("photo")
            else:
                fields = get_header_fields(self.headers)
                file_part = self.parse_raw_file()

            token = get_request_token(self.headers, fields)

            if not secrets.compare_digest(token, CONFIG.upload_token):
                self.send_json(401, {"ok": False, "error": "bad_token"})
                return

            if not file_part or not file_part["body"]:
                self.send_json(400, {"ok": False, "error": "photo_required"})
                return

            photo = save_photo(file_part, fields)
            self.send_json(200, {"ok": True, "photo": photo, "url": photo_page_url(photo)})
        except ValueError as error:
            self.send_json(400, {"ok": False, "error": str(error)})
        except Exception as error:
            print(error, file=sys.stderr, flush=True)
            self.send_json(500, {"ok": False, "error": "server_error"})

    def parse_multipart(self):
        content_type = self.headers.get("Content-Type", "")

        if "multipart/form-data" not in content_type:
            raise ValueError("multipart_required")

        size = int(self.headers.get("Content-Length", "0"))

        if size <= 0:
            raise ValueError("empty_body")

        if size > CONFIG.max_upload_bytes:
            raise ValueError("request_too_large")

        body = self.rfile.read(size)
        raw = (
            f"Content-Type: {content_type}\r\n"
            "MIME-Version: 1.0\r\n\r\n"
        ).encode("utf-8") + body
        message = BytesParser(policy=default).parsebytes(raw)
        fields = {}
        files = {}

        for part in message.iter_parts():
            name = part.get_param("name", header="content-disposition")

            if not name:
                continue

            filename = part.get_filename()
            payload = part.get_payload(decode=True) or b""

            if filename:
                files[name] = {
                    "filename": filename,
                    "content_type": part.get_content_type(),
                    "body": payload,
                }
            else:
                fields[name] = payload.decode(part.get_content_charset() or "utf-8", errors="replace")

        return fields, files

    def parse_raw_file(self):
        size = int(self.headers.get("Content-Length", "0"))

        if size <= 0:
            raise ValueError("empty_body")

        if size > CONFIG.max_upload_bytes:
            raise ValueError("request_too_large")

        body = self.rfile.read(size)
        detected_type, detected_extension = detect_image_type(body)
        header_type = self.headers.get("Content-Type", "")
        content_type = header_type if header_type.startswith("image/") else detected_type
        filename = self.headers.get("X-Photo-Filename") or f"shortcut-upload{detected_extension}"

        return {
            "filename": filename,
            "content_type": content_type,
            "body": body,
        }

    def is_multipart(self):
        return "multipart/form-data" in self.headers.get("Content-Type", "")

    def log_message(self, format, *args):
        return

    def send_json(self, status, payload):
        body = f"{json.dumps(payload, ensure_ascii=False)}\n".encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def save_photo(file_part, fields):
    filename, content_type = normalize_uploaded_file(file_part)

    now = datetime.now(timezone.utc)
    photo_id = f"{now:%Y%m%d-%H%M%S}-{secrets.token_hex(4)}"
    relative_path = Path("originals") / f"{now:%Y}" / f"{now:%m}" / f"{photo_id}-{filename}"
    output_path = CONFIG.photos_json_path.parent / relative_path
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(file_part["body"])
    metadata = extract_photo_metadata(file_part["body"], content_type, len(file_part["body"]), fields)
    hdr = parse_boolean(fields.get("hdr")) or detect_hdr_image(file_part["body"], content_type)

    photo = {
        "id": photo_id,
        "date": normalize_date(fields.get("takenAt") or metadata.get("takenAt") or now.isoformat().replace("+00:00", "Z")),
        "src": f"{CONFIG.photos_public_prefix}/{encode_path(relative_path.as_posix())}",
        "width": parse_int(fields.get("width")) or metadata.get("width"),
        "height": parse_int(fields.get("height")) or metadata.get("height"),
        "caption": fields.get("caption", "").strip(),
        "alt": fields.get("caption", "").strip(),
        "hdr": hdr,
        "mimeType": content_type,
        "size": len(file_part["body"]),
        "location": metadata.get("location"),
        "technical": metadata.get("technical"),
        "uploadedAt": now.isoformat().replace("+00:00", "Z"),
    }

    with JSON_LOCK:
        db = read_photos_json()
        db.setdefault("photos", [])
        db["photos"].insert(0, photo)
        db["photos"].sort(key=photo_feed_sort_key, reverse=True)
        db["updatedAt"] = now.isoformat().replace("+00:00", "Z")
        write_photos_json(db)

    regenerate_seo_pages()

    return photo


def photo_page_url(photo):
    return f"{CONFIG.site_url}/photos/{photo['id']}/"


def photo_feed_sort_key(photo):
    return photo.get("uploadedAt") or photo.get("id") or photo.get("date") or ""


def get_request_token(headers, fields):
    authorization = headers.get("Authorization", "")

    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip()

    return headers.get("X-Photo-Upload-Token") or fields.get("token", "")


def get_header_fields(headers):
    return {
        "caption": headers.get("X-Photo-Caption", ""),
        "hdr": headers.get("X-Photo-HDR", ""),
        "takenAt": headers.get("X-Photo-Taken-At", ""),
        "width": headers.get("X-Photo-Width", ""),
        "height": headers.get("X-Photo-Height", ""),
        "location": headers.get("X-Photo-Location", ""),
    }


def detect_image_type(body):
    if body.startswith(b"\xff\xd8\xff"):
        return "image/jpeg", ".jpg"

    if body.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png", ".png"

    if body.startswith(b"RIFF") and body[8:12] == b"WEBP":
        return "image/webp", ".webp"

    if body[4:8] == b"ftyp":
        brand_box = body[8:40].lower()
        if any(brand in brand_box for brand in (b"heic", b"heix", b"hevc", b"hevx", b"heif", b"mif1", b"msf1")):
            return "image/heic", ".heic"
        if b"avif" in brand_box:
            return "image/avif", ".avif"

    return "application/octet-stream", ".bin"


def normalize_uploaded_file(file_part):
    detected_type, detected_extension = detect_image_type(file_part["body"])
    expected_extensions = IMAGE_TYPE_EXTENSIONS.get(detected_type)

    if not expected_extensions:
        raise ValueError("unsupported_file_type")

    filename = safe_filename(file_part["filename"])
    suffix = Path(filename).suffix.lower()

    if not suffix:
        filename = f"{filename}{detected_extension}"
        suffix = detected_extension

    if suffix not in ALLOWED_EXTENSIONS:
        raise ValueError("unsupported_file_type")

    if suffix not in expected_extensions:
        raise ValueError("file_type_mismatch")

    header_type = normalize_content_type(file_part.get("content_type", ""))

    if header_type and not is_compatible_content_type(header_type, detected_type):
        raise ValueError("file_type_mismatch")

    return filename, detected_type


def normalize_content_type(value):
    return str(value or "").split(";", 1)[0].strip().lower()


def is_compatible_content_type(header_type, detected_type):
    if header_type in {"", "application/octet-stream"}:
        return True

    if not header_type.startswith("image/"):
        return False

    return image_type_family(header_type) == image_type_family(detected_type)


def image_type_family(content_type):
    if content_type in {"image/jpeg", "image/jpg"}:
        return "jpeg"

    if content_type in {"image/heic", "image/heif"}:
        return "heic"

    return content_type


def parse_boolean(value):
    return str(value or "").strip().casefold() in {"on", "1", "true", "yes"}


def detect_hdr_image(body, content_type=""):
    if not body:
        return False

    normalized_type = normalize_content_type(content_type) or detect_image_type(body)[0]
    if image_type_family(normalized_type) not in {"jpeg", "heic", "image/avif"}:
        return False

    lowered = body.lower()
    return any(signature in lowered for signature in HDR_GAIN_MAP_SIGNATURES)


def read_photos_json():
    if CONFIG.photos_json_path.exists():
        db = json.loads(CONFIG.photos_json_path.read_text(encoding="utf-8"))
        db.setdefault("photos", [])
        db.setdefault("source", "Photo upload service")
        return db

    return {
        "source": "Photo upload service",
        "updatedAt": None,
        "photos": [],
    }


def write_photos_json(db):
    temporary = CONFIG.photos_json_path.with_suffix(f"{CONFIG.photos_json_path.suffix}.tmp")
    temporary.write_text(f"{json.dumps(db, ensure_ascii=False, indent=2)}\n", encoding="utf-8")
    temporary.replace(CONFIG.photos_json_path)


def regenerate_seo_pages():
    if not CONFIG.seo_generator_path.exists():
        print(f"Photo SEO generation skipped: {CONFIG.seo_generator_path} was not found", file=sys.stderr, flush=True)
        return

    command = get_seo_generator_command()

    if not command:
        print(f"Photo SEO generation skipped: unsupported generator {CONFIG.seo_generator_path}", file=sys.stderr, flush=True)
        return

    try:
        subprocess.run(
            command,
            cwd=ROOT_DIR,
            check=True,
            timeout=60,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
    except subprocess.TimeoutExpired:
        print("Photo SEO generation failed: timeout", file=sys.stderr, flush=True)
    except subprocess.CalledProcessError as error:
        print("Photo SEO generation failed", file=sys.stderr, flush=True)
        if error.stdout:
            print(error.stdout, file=sys.stderr, flush=True)
        if error.stderr:
            print(error.stderr, file=sys.stderr, flush=True)


def get_seo_generator_command():
    suffix = CONFIG.seo_generator_path.suffix.lower()

    if suffix == ".py":
        return [sys.executable, str(CONFIG.seo_generator_path)]

    if suffix == ".mjs":
        node = shutil.which("node")

        if not node:
            print("Photo SEO generation skipped: node was not found", file=sys.stderr, flush=True)
            return None

        return [node, str(CONFIG.seo_generator_path)]

    return None


def normalize_date(value):
    value = str(value).strip()

    if not value:
        return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    if value.endswith("Z"):
        return value

    try:
        return datetime.fromisoformat(value).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except ValueError:
        return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def safe_filename(value):
    stem = Path(value or "photo").stem
    suffix = Path(value or "photo").suffix.lower()
    stem = re.sub(r"[^\w. -]+", "-", stem, flags=re.UNICODE)
    stem = re.sub(r"\s+", " ", stem).strip()[:80] or "photo"
    return f"{stem}{suffix}"


def extract_photo_metadata(body, content_type, size, fields):
    exif = read_jpeg_exif(body) if content_type in {"image/jpeg", "image/jpg"} else {}
    location_name = fields.get("location", "").strip()
    gps = exif.get("gps")
    location_label = location_name or reverse_geocode(gps)

    return {
        "width": parse_int(exif.get("width")),
        "height": parse_int(exif.get("height")),
        "takenAt": parse_exif_datetime(exif.get("takenAt")),
        "location": {
            "name": location_name or None,
            "latitude": gps.get("latitude") if gps else None,
            "longitude": gps.get("longitude") if gps else None,
            "label": location_label,
        },
        "technical": build_technical_metadata(exif, content_type, size),
    }


def reverse_geocode(gps):
    if not gps:
        return None

    params = urllib.parse.urlencode({
        "format": "jsonv2",
        "lat": gps["latitude"],
        "lon": gps["longitude"],
        "zoom": 14,
        "addressdetails": 1,
        "accept-language": "ru,en",
    })
    request = urllib.request.Request(
        f"https://nominatim.openstreetmap.org/reverse?{params}",
        headers={"User-Agent": "tomilov.com photo uploader (https://tomilov.com)"},
    )

    try:
        timeout = float(os.environ.get("PHOTO_GEOCODE_TIMEOUT", "8"))
        with urllib.request.urlopen(request, timeout=timeout) as response:
            if response.status >= 400:
                return None
            payload = json.loads(response.read(65536).decode("utf-8"))
    except Exception as error:
        print(f"reverse_geocode_failed: {error}", file=sys.stderr, flush=True)
        return None

    return location_label_from_geocode(payload)


def location_label_from_geocode(payload):
    address = payload.get("address") or {}
    primary = first_address_value(address, (
        "attraction",
        "tourism",
        "amenity",
        "historic",
        "building",
        "road",
        "pedestrian",
        "neighbourhood",
        "suburb",
        "quarter",
        "city_district",
        "borough",
        "district",
    ))
    settlement = first_address_value(address, (
        "city",
        "town",
        "village",
        "municipality",
        "county",
    ))
    region = first_address_value(address, ("state", "region", "country"))
    label = compact_unique([primary, settlement, region])

    if label:
        return label

    display_name = clean_text(payload.get("display_name"))
    return compact_unique(display_name.split(",")[:3]) if display_name else None


def first_address_value(address, keys):
    for key in keys:
        value = clean_text(address.get(key))
        if value:
            return value
    return None


def compact_unique(values):
    result = []
    seen = set()

    for value in values:
        value = clean_text(value)
        if not value:
            continue

        key = value.casefold()
        if key not in seen:
            result.append(value)
            seen.add(key)

    return ", ".join(result) if result else None


def build_technical_metadata(exif, content_type, size):
    has_exif = bool(exif)
    width = parse_int(exif.get("width"))
    height = parse_int(exif.get("height"))
    megapixels = round(width * height / 1_000_000) if width and height else None

    if not has_exif or is_scanner_exif(exif):
        return {
            "hasExif": False,
            "camera": "Leica M6",
            "cameraLine": "Leica M6 — плёнка",
            "lensLine": "Плёночная фотография",
            "format": format_from_mime(content_type),
            "megapixels": megapixels,
            "dimensions": format_dimensions(width, height),
            "size": format_file_size(size),
            "summary": compact_join([format_megapixels(megapixels), format_dimensions(width, height), format_file_size(size)]),
            "settings": [],
        }

    make = clean_text(exif.get("make"))
    model = clean_text(exif.get("model"))
    camera = compact_join([make, model], " ") or "Камера"
    lens = clean_text(exif.get("lensModel"))
    lens_label = normalize_lens_label(lens)
    focal = format_mm(exif.get("focalLength35mm") or exif.get("focalLength"))
    aperture = format_aperture(exif.get("fNumber"))
    lens_line = compact_join([lens_label or "Камера", compact_join([focal, aperture], " ")], " — ")

    return {
        "hasExif": True,
        "camera": camera,
        "cameraLine": camera,
        "lensLine": lens_line,
        "format": format_from_mime(content_type),
        "megapixels": megapixels,
        "dimensions": format_dimensions(width, height),
        "size": format_file_size(size),
        "summary": compact_join([format_megapixels(megapixels), format_dimensions(width, height), format_file_size(size)]),
        "settings": [
            {"label": "ISO", "value": format_plain_number(exif.get("iso"))},
            {"label": "ФР", "value": focal},
            {"label": "EV", "value": format_ev(exif.get("exposureBias"))},
            {"label": "ƒ", "value": aperture},
            {"label": "S", "value": format_shutter(exif.get("exposureTime"))},
        ],
    }


def is_scanner_exif(exif):
    text = " ".join(clean_text(exif.get(key)) or "" for key in ("make", "model", "software")).lower()
    scanner_markers = ("noritsu", "ez controller", "frontier", "sp-3000", "scanner", "scan")
    return any(marker in text for marker in scanner_markers)


def normalize_lens_label(value):
    if not value:
        return None

    lowered = value.lower()

    if "back" in lowered and "camera" in lowered:
        return "Main Camera"

    return value


def read_jpeg_exif(body):
    if not body.startswith(b"\xff\xd8"):
        return {}

    offset = 2
    while offset + 4 <= len(body):
        if body[offset] != 0xFF:
            break

        marker = body[offset + 1]
        offset += 2

        if marker in {0xD8, 0xD9}:
            continue

        if offset + 2 > len(body):
            break

        segment_length = int.from_bytes(body[offset:offset + 2], "big")
        segment = body[offset + 2:offset + segment_length]

        if marker == 0xE1 and segment.startswith(b"Exif\x00\x00"):
            return parse_tiff_exif(segment[6:])

        offset += segment_length

    return {}


def parse_tiff_exif(data):
    if len(data) < 8:
        return {}

    byte_order = data[:2]
    endian = "<" if byte_order == b"II" else ">" if byte_order == b"MM" else None

    if not endian or read_u16(data, 2, endian) != 42:
        return {}

    ifd0_offset = read_u32(data, 4, endian)
    ifd0 = read_ifd(data, ifd0_offset, endian)
    exif_ifd = read_ifd(data, as_int(ifd0.get(0x8769)), endian)
    gps_ifd = read_ifd(data, as_int(ifd0.get(0x8825)), endian)
    width = as_int(exif_ifd.get(0xA002)) or as_int(ifd0.get(0x0100))
    height = as_int(exif_ifd.get(0xA003)) or as_int(ifd0.get(0x0101))

    return {
        "make": as_text(ifd0.get(0x010F)),
        "model": as_text(ifd0.get(0x0110)),
        "software": as_text(ifd0.get(0x0131)),
        "lensModel": as_text(exif_ifd.get(0xA434)),
        "focalLength": as_float(exif_ifd.get(0x920A)),
        "focalLength35mm": as_float(exif_ifd.get(0xA405)),
        "fNumber": as_float(exif_ifd.get(0x829D)),
        "exposureTime": as_float(exif_ifd.get(0x829A)),
        "iso": as_int(exif_ifd.get(0x8827)) or as_int(exif_ifd.get(0x8833)),
        "exposureBias": as_float(exif_ifd.get(0x9204)),
        "width": width,
        "height": height,
        "takenAt": as_text(exif_ifd.get(0x9003)) or as_text(ifd0.get(0x0132)),
        "gps": parse_gps(gps_ifd),
    }


def read_ifd(data, offset, endian):
    if not offset or offset + 2 > len(data):
        return {}

    count = read_u16(data, offset, endian)
    values = {}

    for index in range(count):
        entry = offset + 2 + index * 12

        if entry + 12 > len(data):
            break

        tag = read_u16(data, entry, endian)
        field_type = read_u16(data, entry + 2, endian)
        field_count = read_u32(data, entry + 4, endian)
        raw_value = data[entry + 8:entry + 12]
        values[tag] = read_tiff_value(data, field_type, field_count, raw_value, endian)

    return values


def read_tiff_value(data, field_type, count, raw_value, endian):
    sizes = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8}
    size = sizes.get(field_type, 1) * count
    value_data = raw_value if size <= 4 else data[read_u32(raw_value, 0, endian):read_u32(raw_value, 0, endian) + size]

    if field_type == 2:
        return value_data.split(b"\x00", 1)[0].decode("utf-8", errors="replace")
    if field_type == 3:
        return unpack_values(value_data, endian, "H", count)
    if field_type == 4:
        return unpack_values(value_data, endian, "I", count)
    if field_type == 5:
        values = []
        for index in range(count):
            base = index * 8
            denominator = read_u32(value_data, base + 4, endian)
            values.append(read_u32(value_data, base, endian) / denominator if denominator else None)
        return values[0] if count == 1 else values
    if field_type == 9:
        return unpack_values(value_data, endian, "i", count)
    if field_type == 10:
        values = []
        for index in range(count):
            base = index * 8
            denominator = read_i32(value_data, base + 4, endian)
            values.append(read_i32(value_data, base, endian) / denominator if denominator else None)
        return values[0] if count == 1 else values

    return value_data


def parse_gps(gps_ifd):
    if not gps_ifd:
        return None

    latitude = coordinate_from_exif(gps_ifd.get(0x0002), as_text(gps_ifd.get(0x0001)))
    longitude = coordinate_from_exif(gps_ifd.get(0x0004), as_text(gps_ifd.get(0x0003)))

    if latitude is None or longitude is None:
        return None

    return {"latitude": round(latitude, 6), "longitude": round(longitude, 6)}


def coordinate_from_exif(value, ref):
    if not isinstance(value, list) or len(value) < 3:
        return None

    degrees, minutes, seconds = value[:3]
    result = float(degrees) + float(minutes) / 60 + float(seconds) / 3600

    if ref in {"S", "W"}:
        result *= -1

    return result


def parse_exif_datetime(value):
    if not value:
        return None

    try:
        return datetime.strptime(value, "%Y:%m:%d %H:%M:%S").replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
    except ValueError:
        return None


def read_u16(data, offset, endian):
    return struct.unpack_from(f"{endian}H", data, offset)[0]


def read_u32(data, offset, endian):
    return struct.unpack_from(f"{endian}I", data, offset)[0]


def read_i32(data, offset, endian):
    return struct.unpack_from(f"{endian}i", data, offset)[0]


def unpack_values(data, endian, code, count):
    values = list(struct.unpack_from(f"{endian}{count}{code}", data[:struct.calcsize(f'{count}{code}')]))
    return values[0] if count == 1 else values


def as_text(value):
    return value.strip() if isinstance(value, str) else None


def as_int(value):
    if isinstance(value, list):
        value = value[0] if value else None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def as_float(value):
    if isinstance(value, list):
        value = value[0] if value else None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def clean_text(value):
    return re.sub(r"\s+", " ", value).strip() if value else None


def compact_join(values, separator=" • "):
    return separator.join(str(value) for value in values if value not in (None, ""))


def format_file_size(value):
    if value >= 1024 * 1024:
        return f"{value / (1024 * 1024):.1f} MB".replace(".", ",")
    if value >= 1024:
        return f"{round(value / 1024)} KB"
    return f"{value} B"


def format_dimensions(width, height):
    return f"{width} × {height}" if width and height else None


def format_megapixels(value):
    return f"{value} MP" if value else None


def format_from_mime(value):
    mapping = {
        "image/jpeg": "JPEG",
        "image/jpg": "JPEG",
        "image/heic": "HEIC",
        "image/heif": "HEIF",
        "image/png": "PNG",
        "image/webp": "WEBP",
        "image/avif": "AVIF",
    }
    return mapping.get(value, "IMAGE")


def format_mm(value):
    if value is None:
        return None
    return f"{round(value)} mm"


def format_aperture(value):
    if value is None:
        return None
    return f"ƒ{value:.1f}".replace(".", ",")


def format_ev(value):
    if value is None:
        return "0 ev"
    formatted = f"{value:+.1f}".replace(".", ",")
    return f"{formatted} ev"


def format_plain_number(value):
    return str(value) if value is not None else None


def format_shutter(value):
    if value is None:
        return None
    if value >= 1:
        return f"{value:.1f} s".replace(".", ",")
    denominator = round(1 / value)
    return f"1/{denominator} s"


def format_coordinates(gps):
    if not gps:
        return None
    return f"{gps['latitude']:.5f}, {gps['longitude']:.5f}"


def encode_path(value):
    return "/".join(urllib.parse.quote(part) for part in value.split("/"))


def parse_int(value):
    try:
        number = int(value)
        return number if number > 0 else None
    except (TypeError, ValueError):
        return None


if __name__ == "__main__":
    main()
