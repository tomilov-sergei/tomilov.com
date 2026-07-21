#!/usr/bin/env python3

import argparse
import json
from pathlib import Path
from urllib.parse import unquote, urlsplit

import photo_upload_server


ROOT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_MANIFEST = ROOT_DIR / "assets/photos/photos.json"


def main():
    parser = argparse.ArgumentParser(description="Detect embedded HDR gain maps and repair photo manifest flags.")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--strict", action="store_true", help="Fail when an original referenced by the manifest is missing.")
    args = parser.parse_args()

    manifest = args.manifest.resolve()
    payload = json.loads(manifest.read_text(encoding="utf-8"))
    photos = payload.get("photos") or []
    detected = []
    missing = []

    for photo in photos:
        if photo.get("hdr") is True:
            continue

        source = source_path(manifest.parent, photo)
        if not source or not source.is_file():
            missing.append(str(photo.get("id") or photo.get("src") or "unknown"))
            continue

        body = source.read_bytes()
        content_type = photo.get("mimeType") or photo_upload_server.detect_image_type(body)[0]
        if photo_upload_server.detect_hdr_image(body, content_type):
            photo["hdr"] = True
            detected.append(str(photo.get("id") or source.name))

    if detected and not args.dry_run:
        temporary = manifest.with_suffix(f"{manifest.suffix}.tmp")
        temporary.write_text(f"{json.dumps(payload, ensure_ascii=False, indent=2)}\n", encoding="utf-8")
        temporary.replace(manifest)

    print(
        "photo_hdr_backfill "
        f"detected={len(detected)} missing={len(missing)} dry_run={str(args.dry_run).lower()}"
    )
    if detected:
        print("hdr_photo_ids=" + ",".join(detected))

    if args.strict and missing:
        raise RuntimeError("Missing photo originals: " + ", ".join(missing))


def source_path(photos_root, photo):
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
    return photos_root / relative


if __name__ == "__main__":
    main()
