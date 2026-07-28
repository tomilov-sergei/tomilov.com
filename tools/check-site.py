#!/usr/bin/env python3

import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parent.parent
SITE_HOSTS = {"tomilov.com", "www.tomilov.com"}
SHARED_ASSET_PREFIXES = (
    "/assets/barcelona-guide/",
    "/assets/photos/",
    "/assets/telegram/",
)
RUNTIME_ENDPOINTS = {
    "/photos/upload",
    "/telegram/webhook",
}
CANVAS_CHUNK_PATTERN = re.compile(r"^(?:ru|en)-[a-z0-9-]+-\d+\.json$")


class ReferenceParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.references = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        for attribute in ("href", "src", "poster"):
            value = values.get(attribute)
            if value:
                self.references.append(value)

        srcset = values.get("srcset")
        if srcset:
            for candidate in srcset.split(","):
                value = candidate.strip().split(" ", 1)[0]
                if value:
                    self.references.append(value)


def public_html_files():
    files = [ROOT / "index.html"]
    for directory in ("about", "barcelona-guide", "en", "photos", "screenshots"):
        files.extend(sorted((ROOT / directory).rglob("*.html")))
    return files


def local_target(reference, source):
    parsed = urlsplit(reference)
    if parsed.scheme in {"data", "mailto", "tel", "javascript", "blob"}:
        return None
    if parsed.netloc and parsed.hostname not in SITE_HOSTS:
        return None

    path = unquote(parsed.path)
    if not path:
        return None
    if any(path.startswith(prefix) for prefix in SHARED_ASSET_PREFIXES):
        return None
    if path in RUNTIME_ENDPOINTS:
        return None

    if path.startswith("/"):
        target = ROOT / path.lstrip("/")
    else:
        target = source.parent / path

    if path.endswith("/"):
        target = target / "index.html"
    elif target.is_dir():
        target = target / "index.html"

    return target


def check_html(errors):
    files = public_html_files()
    checked_references = 0

    for path in files:
        if not path.is_file():
            errors.append(f"Missing HTML file: {path.relative_to(ROOT)}")
            continue

        parser = ReferenceParser()
        parser.feed(path.read_text(encoding="utf-8"))

        for reference in parser.references:
            target = local_target(reference, path)
            if target is None:
                continue
            checked_references += 1
            if not target.exists():
                errors.append(
                    f"Broken reference in {path.relative_to(ROOT)}: "
                    f"{reference} -> {target.relative_to(ROOT)}"
                )

    return len(files), checked_references


def read_manifest(path, collection):
    payload = json.loads(path.read_text(encoding="utf-8"))
    items = payload.get(collection)
    if not isinstance(items, list):
        raise ValueError(f"{path.relative_to(ROOT)} must contain a {collection} list")
    return payload, items


def check_manifests(errors):
    posts_payload, posts = read_manifest(ROOT / "assets/telegram/posts.json", "posts")
    _, photos = read_manifest(ROOT / "assets/photos/photos.json", "photos")

    check_unique_ids(posts, "Telegram post", errors)
    check_unique_ids(photos, "Photo", errors)

    for post in posts:
        post_id = str(post.get("id", ""))
        for prefix in ("screenshots", "en/screenshots"):
            path = ROOT / prefix / post_id / "index.html"
            if not path.is_file():
                errors.append(f"Missing generated post page: {path.relative_to(ROOT)}")

    for photo in photos:
        photo_id = str(photo.get("id", ""))
        for prefix in ("photos", "en/photos"):
            path = ROOT / prefix / photo_id / "index.html"
            if not path.is_file():
                errors.append(f"Missing generated photo page: {path.relative_to(ROOT)}")

    text_posts = [post for post in posts if str(post.get("text", "")).strip()]
    translated_posts = [
        post for post in text_posts
        if str(((post.get("translations") or {}).get("en") or {}).get("text", "")).strip()
    ]
    translated_photos = [
        photo for photo in photos
        if (photo.get("translations") or {}).get("en")
    ]

    return {
        "posts": len(posts),
        "photos": len(photos),
        "hdr_photos": sum(bool(photo.get("hdr")) for photo in photos),
        "sdr_photos": sum(not photo.get("hdr") for photo in photos),
        "missing_media": len(posts_payload.get("missing") or []),
        "translated_posts": len(translated_posts),
        "text_posts": len(text_posts),
        "translated_photos": len(translated_photos),
    }


def check_home_canvas(errors, expected_cards, expected_photos):
    counts = []
    feature_runtime = (ROOT / "assets/js/features.js").read_text(encoding="utf-8")
    bootstrap = (ROOT / "script.js").read_text(encoding="utf-8")
    asset_version_match = re.search(r'const assetVersion = "([^"]+)";', bootstrap)
    asset_version = asset_version_match.group(1) if asset_version_match else ""
    if 'const homeCanvasCardSelector = "[data-canvas-card]";' not in feature_runtime:
        errors.append("Home canvas runtime is not bound to generated data-canvas-card elements")
    if "data-home-node" in feature_runtime:
        errors.append("Home canvas runtime still references the retired data-home-node attribute")
    if not asset_version:
        errors.append("JavaScript bootstrap has no assetVersion")

    for lang, path in (("ru", ROOT / "index.html"), ("en", ROOT / "en/index.html")):
        source = path.read_text(encoding="utf-8")
        count = source.count('class="home-canvas-node ')
        interactive_count = source.count(" data-canvas-card=")
        script_version_match = re.search(r'/script\.js\?v=([^"]+)', source)
        script_version = script_version_match.group(1) if script_version_match else ""
        chunk_paths = sorted(
            path
            for path in (ROOT / "assets/canvas").glob(f"{lang}-*.json")
            if CANVAS_CHUNK_PATTERN.fullmatch(path.name)
        )
        chunk_source = "\n".join(chunk.read_text(encoding="utf-8") for chunk in chunk_paths)
        preview_count = chunk_source.count('/assets/photos/canvas/')
        fallback_count = chunk_source.count('data-fallback-src=\\"https://tomilov.com/assets/photos/')
        counts.append(count)
        if count != expected_cards:
            errors.append(
                f"Home canvas card count mismatch in {path.relative_to(ROOT)}: "
                f"expected {expected_cards}, found {count}"
            )
        if interactive_count != expected_cards:
            errors.append(
                f"Home canvas interactive card count mismatch in {path.relative_to(ROOT)}: "
                f"expected {expected_cards}, found {interactive_count}"
            )
        if script_version != asset_version:
            errors.append(
                f"Home canvas asset version mismatch in {path.relative_to(ROOT)}: "
                f"bootstrap={asset_version or 'missing'}, page={script_version or 'missing'}"
            )
        if "<!-- home-canvas-generated:start -->" not in source or "<!-- home-canvas-generated:end -->" not in source:
            errors.append(f"Missing home canvas generation markers in {path.relative_to(ROOT)}")
        if len(chunk_paths) < 7:
            errors.append(
                f"Home canvas chunk count mismatch for {lang}: expected at least 7, found {len(chunk_paths)}"
            )
        if preview_count != expected_photos or fallback_count != expected_photos:
            errors.append(
                f"Home canvas photo preview mismatch in {path.relative_to(ROOT)}: "
                f"expected {expected_photos}, previews={preview_count}, fallbacks={fallback_count}"
            )

    if len(set(counts)) > 1:
        errors.append(f"Localized home canvas counts differ: {counts}")
    return counts[0] if counts else 0


def check_unique_ids(items, label, errors):
    seen = set()
    for item in items:
        value = str(item.get("id", ""))
        if not value:
            errors.append(f"{label} has no id")
        elif value in seen:
            errors.append(f"Duplicate {label.lower()} id: {value}")
        seen.add(value)


def check_xml(errors):
    paths = [
        ROOT / "sitemap.xml",
        ROOT / "feed.xml",
        ROOT / "screenshots/feed.xml",
        ROOT / "photos/feed.xml",
        ROOT / "en/feed.xml",
        ROOT / "en/screenshots/feed.xml",
        ROOT / "en/photos/feed.xml",
    ]
    roots = {}

    for path in paths:
        try:
            roots[path] = ET.parse(path).getroot()
        except (ET.ParseError, OSError) as error:
            errors.append(f"Invalid XML {path.relative_to(ROOT)}: {error}")

    sitemap = roots.get(ROOT / "sitemap.xml")
    if sitemap is None:
        return 0

    namespace = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    locations = [
        node.text.strip()
        for node in sitemap.findall("s:url/s:loc", namespace)
        if node.text
    ]
    if len(locations) != len(set(locations)):
        errors.append("sitemap.xml contains duplicate URLs")

    required_photo_indexes = {
        "https://tomilov.com/photos/film/",
        "https://tomilov.com/photos/iphone/",
        "https://tomilov.com/en/photos/film/",
        "https://tomilov.com/en/photos/iphone/",
    }
    for location in sorted(required_photo_indexes - set(locations)):
        errors.append(f"Sitemap is missing photo index: {location}")

    for location in locations:
        target = local_target(location, ROOT / "sitemap.xml")
        if target is not None and not target.exists():
            errors.append(f"Sitemap URL has no local page: {location}")

    return len(locations)


def check_page_contracts(errors, manifest_summary):
    for path in (ROOT / "about/index.html", ROOT / "en/about/index.html"):
        source = path.read_text(encoding="utf-8")
        if source.count("<h1") != 1:
            errors.append(f"About page must contain exactly one h1: {path.relative_to(ROOT)}")
        if "about-socials" not in source or "work-kicker" not in source:
            errors.append(f"About page structure is incomplete: {path.relative_to(ROOT)}")

    for path in (ROOT / "screenshots/index.html", ROOT / "en/screenshots/index.html"):
        source = path.read_text(encoding="utf-8")
        if "data-static-post-feed" not in source or "data-post-search" not in source:
            errors.append(f"Blog collection controls are missing: {path.relative_to(ROOT)}")
        if source.count('class="screenshot-post"') != 12:
            errors.append(f"Blog page must contain 12 static fallback posts: {path.relative_to(ROOT)}")

    for path in (ROOT / "photos/index.html", ROOT / "en/photos/index.html"):
        source = path.read_text(encoding="utf-8")
        if source.count('loading="eager"') != 1:
            errors.append(f"Photo feed must eagerly load exactly one image: {path.relative_to(ROOT)}")
        if source.count('type="image/webp"') != manifest_summary["sdr_photos"]:
            errors.append(f"Every SDR feed image must have a WebP source: {path.relative_to(ROOT)}")
        if source.count('data-fallback-src=') != manifest_summary["sdr_photos"]:
            errors.append(f"Every optimized SDR image must preserve its original fallback: {path.relative_to(ROOT)}")
        if source.count('class="photo-hdr-badge"') != manifest_summary["hdr_photos"]:
            errors.append(f"HDR feed badge count does not match the manifest: {path.relative_to(ROOT)}")


def main():
    errors = []

    try:
        html_count, reference_count = check_html(errors)
        manifest_summary = check_manifests(errors)
        canvas_count = check_home_canvas(
            errors,
            manifest_summary["posts"] + manifest_summary["photos"],
            manifest_summary["photos"],
        )
        sitemap_count = check_xml(errors)
        check_page_contracts(errors, manifest_summary)
    except (json.JSONDecodeError, OSError, ValueError) as error:
        errors.append(str(error))
        html_count = reference_count = sitemap_count = canvas_count = 0
        manifest_summary = {}

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        print(f"site_check_failed errors={len(errors)}", file=sys.stderr)
        return 1

    print(
        "site_check_ok "
        f"html={html_count} references={reference_count} sitemap_urls={sitemap_count} "
        f"posts={manifest_summary['posts']} photos={manifest_summary['photos']} "
        f"canvas_cards={canvas_count} "
        f"post_translations={manifest_summary['translated_posts']}/{manifest_summary['text_posts']} "
        f"photo_translations={manifest_summary['translated_photos']}/{manifest_summary['photos']} "
        f"missing_media={manifest_summary['missing_media']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
