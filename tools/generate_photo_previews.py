#!/usr/bin/env python3

import argparse
import media_storage
import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT_DIR = Path(__file__).resolve().parent.parent
PHOTOS_JSON_PATH = ROOT_DIR / "assets/photos/photos.json"
PHOTOS_ROOT = ROOT_DIR / "assets/photos"
PREVIEW_DIR = PHOTOS_ROOT / "canvas"
FEED_PREVIEW_DIR = PHOTOS_ROOT / "feed"
PREVIEW_MAX_EDGE = 960
FEED_PREVIEW_WIDTHS = (480, 960, 1440)
PREVIEW_JPEG_QUALITY = 5


def main():
    parser = argparse.ArgumentParser(description="Generate lightweight responsive JPEG/WebP previews for the canvas and photo feed.")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Fail when an original is missing or a preview cannot be generated.",
    )
    args = parser.parse_args()

    payload = read_json(PHOTOS_JSON_PATH, {"photos": []})
    summary = generate(payload.get("photos") or [], strict=args.strict)
    print(
        "photo_previews "
        f"generated={summary['generated']} cached={summary['cached']} "
        f"missing={summary['missing']} failed={summary['failed']}"
    )


def generate(photos, strict=False):
    entries = []
    missing = []

    receipt_cached = 0
    for photo in photos:
        if media_storage.backend() == "s3":
            validate_receipt(photo)
            receipt_cached += len(photo["mediaReceipt"]["objects"]) - 1
            continue
        source = source_path(photo)
        if not source or not source.exists():
            missing.append(str(photo.get("id") or photo.get("src") or "unknown"))
            continue
        outputs = [(preview_path(photo), PREVIEW_MAX_EDGE, "edge")]
        if not photo.get("hdr"):
            for width in feed_preview_widths(photo):
                outputs.append((feed_preview_path(photo, width), width, "width"))
                outputs.append((feed_preview_path(photo, width, "webp"), width, "width"))
        entries.append((photo, source, outputs))

    ffmpeg = shutil.which("ffmpeg")
    failures = []
    generated = 0
    cached = receipt_cached

    for photo, source, outputs in entries:
        for output, size, mode in outputs:
            if preview_is_current(source, output):
                cached += 1
                continue

            if not ffmpeg:
                failures.append(f"{photo.get('id') or source}: ffmpeg is unavailable for {output.name}")
                continue

            try:
                generate_preview(ffmpeg, source, output, size, mode)
                generated += 1
            except (OSError, subprocess.CalledProcessError) as error:
                failures.append(f"{photo.get('id') or source}: {error}")

    summary = {
        "generated": generated,
        "cached": cached,
        "missing": len(missing),
        "failed": len(failures),
    }

    if strict and (missing or failures):
        details = [*(f"missing original: {value}" for value in missing), *failures]
        raise RuntimeError("Photo preview generation failed:\n" + "\n".join(details))

    return summary


def validate_receipt(photo):
    """Generators consume accepted receipts, never hydrate the original archive.

    Network health is checked separately by the production verifier; a receipt is
    a publication record, not a claim that an object can never disappear.
    """
    receipt = photo.get("mediaReceipt") or {}
    if (receipt.get("schema") != 1 or receipt.get("backend") != "s3"
            or receipt.get("previewVersion") != 1 or receipt.get("hdrChecked") is not True):
        raise RuntimeError("Photo requires verified S3 publication receipt")
    expected = {unquote(photo["src"]).lstrip("/"), preview_public_url(photo).lstrip("/")}
    if not photo.get("hdr"):
        for width in feed_preview_widths(photo):
            for ext in ("jpg", "webp"):
                expected.add(feed_preview_public_url(photo, width, ext).lstrip("/"))
    objects = {item["key"]: item for item in receipt.get("objects", [])}
    if not expected.issubset(objects):
        raise RuntimeError("Incomplete S3 photo publication receipt")
    for key in expected:
        item = objects[key]
        if item.get("size", 0) <= 0 or not re.fullmatch(r"[0-9a-f]{64}", item.get("sha256", "")):
            raise RuntimeError("Invalid S3 publication checksum/size")


def generate_preview(ffmpeg, source, output, size=PREVIEW_MAX_EDGE, mode="edge"):
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(f".{output.stem}.{os.getpid()}.tmp{output.suffix}")
    temporary.unlink(missing_ok=True)

    if mode == "width":
        scale = f"scale={size}:-2"
    else:
        scale = f"scale={size}:{size}:force_original_aspect_ratio=decrease"
    command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-y",
        "-i",
        str(source),
        "-vf",
        scale,
        "-frames:v",
        "1",
        "-map_metadata",
        "-1",
    ]
    if output.suffix.lower() == ".webp":
        command.extend(["-c:v", "libwebp", "-quality", "82", "-compression_level", "4"])
    else:
        command.extend(["-q:v", str(PREVIEW_JPEG_QUALITY)])
    command.append(str(temporary))

    try:
        subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        if not temporary.exists() or temporary.stat().st_size == 0:
            raise OSError(f"ffmpeg did not create {temporary}")
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)


def source_path(photo):
    value = str(photo.get("src") or "")
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc:
        return None

    public_path = unquote(parsed.path)
    prefix = "/assets/photos/"
    if not public_path.startswith(prefix):
        return None

    relative = Path(public_path.removeprefix(prefix))
    if ".." in relative.parts:
        return None
    return PHOTOS_ROOT / relative


def preview_path(photo):
    return PREVIEW_DIR / f"{safe_photo_id(photo)}.jpg"


def preview_public_url(photo):
    return f"/assets/photos/canvas/{safe_photo_id(photo)}.jpg"


def feed_preview_path(photo, width=960, extension="jpg"):
    return FEED_PREVIEW_DIR / f"{safe_photo_id(photo)}-{int(width)}.{extension}"


def feed_preview_public_url(photo, width=960, extension="jpg"):
    return f"/assets/photos/feed/{safe_photo_id(photo)}-{int(width)}.{extension}"


def feed_preview_widths(photo):
    try:
        source_width = int(photo.get("width") or 0)
    except (TypeError, ValueError):
        source_width = 0
    return tuple(width for width in FEED_PREVIEW_WIDTHS if not source_width or width <= source_width)


def feed_preview_srcset(photo, extension="jpg"):
    if photo.get("hdr"):
        return ""
    return ", ".join(
        f"{feed_preview_public_url(photo, width, extension)} {width}w"
        for width in feed_preview_widths(photo)
    )


def safe_photo_id(photo):
    value = re.sub(r"[^a-zA-Z0-9._-]+", "-", str(photo.get("id") or "")).strip(".-")
    return value or "photo"


def preview_is_current(source, output):
    return output.exists() and output.stat().st_size > 0 and output.stat().st_mtime >= source.stat().st_mtime


def read_json(path, fallback):
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
