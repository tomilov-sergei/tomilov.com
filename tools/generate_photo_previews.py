#!/usr/bin/env python3

import argparse
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
PREVIEW_MAX_EDGE = 960
PREVIEW_JPEG_QUALITY = 5


def main():
    parser = argparse.ArgumentParser(description="Generate lightweight JPEG previews for the home canvas.")
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

    for photo in photos:
        source = source_path(photo)
        output = preview_path(photo)
        if not source or not source.exists():
            missing.append(str(photo.get("id") or photo.get("src") or "unknown"))
            continue
        entries.append((photo, source, output))

    ffmpeg = shutil.which("ffmpeg")
    failures = []
    generated = 0
    cached = 0

    if entries and not ffmpeg:
        failures.extend(str(photo.get("id") or source) for photo, source, _ in entries)
    else:
        for photo, source, output in entries:
            if preview_is_current(source, output):
                cached += 1
                continue

            try:
                generate_preview(ffmpeg, source, output)
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


def generate_preview(ffmpeg, source, output):
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(f".{output.stem}.{os.getpid()}.tmp.jpg")
    temporary.unlink(missing_ok=True)

    scale = f"scale={PREVIEW_MAX_EDGE}:{PREVIEW_MAX_EDGE}:force_original_aspect_ratio=decrease"
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
        "-q:v",
        str(PREVIEW_JPEG_QUALITY),
        "-map_metadata",
        "-1",
        str(temporary),
    ]

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
