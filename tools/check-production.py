#!/usr/bin/env python3

import argparse
import gzip
import json
import ssl
import sys
from dataclasses import dataclass
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen


DEFAULT_BASE_URL = "https://tomilov.com/"
SECURITY_HEADERS = (
    "Strict-Transport-Security",
    "Content-Security-Policy",
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Referrer-Policy",
    "Permissions-Policy",
)
CA_BUNDLE_CANDIDATES = (
    Path("/etc/ssl/cert.pem"),
    Path("/etc/ssl/certs/ca-certificates.crt"),
)
TLS_CONTEXT = next(
    (ssl.create_default_context(cafile=str(path)) for path in CA_BUNDLE_CANDIDATES if path.is_file()),
    ssl.create_default_context(),
)


@dataclass
class Response:
    path: str
    status: int
    headers: object
    raw_body: bytes
    body: bytes


def main():
    parser = argparse.ArgumentParser(
        description="Small production smoke test; it does not collect visitor analytics."
    )
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Treat missing compression and security headers as failures.",
    )
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/") + "/"
    failures = []
    hardening = []
    responses = {}
    expectations = {
        "/": "text/html",
        "/styles.css": "text/css",
        "/script.js": "javascript",
        "/assets/js/features.js": "javascript",
        "/photos/": "text/html",
        "/screenshots/": "text/html",
        "/about/": "text/html",
        "/sitemap.xml": "xml",
        "/feed.xml": "xml",
        "/assets/photos/photos.json": "json",
    }

    for path, expected_type in expectations.items():
        try:
            response = fetch(base_url, path)
        except (HTTPError, URLError, TimeoutError) as error:
            failures.append(f"{path}: request failed: {error}")
            continue

        responses[path] = response
        content_type = response.headers.get("Content-Type", "").lower()
        if response.status != 200:
            failures.append(f"{path}: expected 200, got {response.status}")
        if expected_type not in content_type:
            failures.append(f"{path}: expected {expected_type} content type, got {content_type or 'none'}")

        encoded = response.headers.get("Content-Encoding", "identity").lower()
        print(
            f"production_response path={path} status={response.status} "
            f"encoding={encoded} bytes={len(response.raw_body)}"
        )

    for path in ("/", "/styles.css"):
        response = responses.get(path)
        if not response:
            continue
        missing = [name for name in SECURITY_HEADERS if not response.headers.get(name)]
        if missing:
            hardening.append(f"{path}: missing security headers: " + ", ".join(missing))

    for path in (
        "/",
        "/styles.css",
        "/script.js",
        "/assets/js/features.js",
        "/sitemap.xml",
        "/feed.xml",
        "/assets/photos/photos.json",
    ):
        response = responses.get(path)
        if not response or len(response.body) < 1024:
            continue
        if response.headers.get("Content-Encoding", "").lower() != "gzip":
            hardening.append(f"{path}: gzip was not used")

    check_hdr_feed(responses, failures)

    for issue in hardening:
        label = "failure" if args.strict else "warning"
        print(f"production_hardening_{label} {issue}")
    if args.strict:
        failures.extend(hardening)

    if failures:
        print("production_check_failed")
        for failure in failures:
            print(failure)
        return 1

    print(
        "production_check_ok "
        f"responses={len(responses)} hardening_warnings={0 if args.strict else len(hardening)}"
    )
    return 0


def fetch(base_url, path):
    url = urljoin(base_url, path.lstrip("/"))
    request = Request(
        url,
        headers={
            "Accept-Encoding": "gzip",
            "User-Agent": "tomilov-production-check/1.0",
        },
    )
    with urlopen(request, timeout=20, context=TLS_CONTEXT) as response:
        raw_body = response.read()
        body = raw_body
        if response.headers.get("Content-Encoding", "").lower() == "gzip":
            body = gzip.decompress(raw_body)
        return Response(path, response.status, response.headers, raw_body, body)


def check_hdr_feed(responses, failures):
    manifest_response = responses.get("/assets/photos/photos.json")
    page_response = responses.get("/photos/")
    if not manifest_response or not page_response:
        return

    try:
        payload = json.loads(manifest_response.body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        failures.append(f"/assets/photos/photos.json: invalid JSON: {error}")
        return

    hdr_photos = [photo for photo in payload.get("photos", []) if photo.get("hdr") is True]
    if not hdr_photos:
        failures.append("/assets/photos/photos.json: no HDR photos are marked")
        return

    newest = hdr_photos[0]
    source = str(newest.get("src") or "")
    html = page_response.body.decode("utf-8", errors="replace")
    if not source or source not in html:
        failures.append(f"/photos/: HDR original is not present in feed HTML: {source or 'missing src'}")
    if '<span class="photo-hdr-badge">HDR</span>' not in html:
        failures.append("/photos/: HDR badge is missing")

    print(
        f"production_hdr_ok marked={len(hdr_photos)} "
        f"first_id={newest.get('id', 'unknown')} source={source}"
    )


if __name__ == "__main__":
    sys.exit(main())
