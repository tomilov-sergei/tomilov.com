#!/usr/bin/env python3

import argparse
import datetime as dt
import hashlib
import hmac
import mimetypes
import os
import posixpath
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path


EMPTY_SHA256 = hashlib.sha256(b"").hexdigest()


def main():
    parser = argparse.ArgumentParser(description="Upload static assets to an S3-compatible bucket.")
    parser.add_argument("source", type=Path)
    parser.add_argument("--bucket", required=True)
    parser.add_argument("--endpoint", default="https://s3.twcstorage.ru")
    parser.add_argument("--region", default="ru-1")
    parser.add_argument("--prefix", default="")
    parser.add_argument("--part-size", type=int, default=64 * 1024 * 1024)
    parser.add_argument("--acl", default="")
    parser.add_argument("--insecure", action="store_true", help="Disable TLS certificate verification.")
    parser.add_argument("--force", action="store_true", help="Upload files even when remote size matches.")
    args = parser.parse_args()

    access_key = os.environ.get("S3_ACCESS_KEY")
    secret_key = os.environ.get("S3_SECRET_ACCESS_KEY")

    if not access_key or not secret_key:
        raise SystemExit("S3_ACCESS_KEY and S3_SECRET_ACCESS_KEY are required")

    client = S3Client(
        access_key=access_key,
        secret_key=secret_key,
        endpoint=args.endpoint,
        region=args.region,
        bucket=args.bucket,
        acl=args.acl,
        insecure=args.insecure,
    )

    source = args.source.resolve()
    files = [path for path in source.rglob("*") if path.is_file()]
    total_bytes = sum(path.stat().st_size for path in files)
    uploaded_bytes = 0
    skipped = 0
    uploaded = 0

    print(f"Syncing {len(files)} files, {format_bytes(total_bytes)}")

    for index, path in enumerate(files, 1):
        relative = path.relative_to(source).as_posix()
        key = posixpath.join(args.prefix.strip("/"), relative) if args.prefix else relative
        size = path.stat().st_size

        if not args.force and client.exists_with_size(key, size):
            skipped += 1
            uploaded_bytes += size
            print(f"[{index}/{len(files)}] skip {key} ({format_bytes(size)})")
            continue

        print(f"[{index}/{len(files)}] upload {key} ({format_bytes(size)})")

        if size > args.part_size:
            client.upload_multipart(key, path, args.part_size)
        else:
            client.put_object(key, path)

        uploaded += 1
        uploaded_bytes += size
        print(f"  done: {format_bytes(uploaded_bytes)} / {format_bytes(total_bytes)}")

    print(f"Uploaded {uploaded}, skipped {skipped}")


class S3Client:
    def __init__(self, access_key, secret_key, endpoint, region, bucket, acl="", insecure=False):
        self.access_key = access_key
        self.secret_key = secret_key
        self.endpoint = endpoint.rstrip("/")
        self.region = region
        self.bucket = bucket
        self.acl = acl
        self.context = ssl._create_unverified_context() if insecure else None
        parsed = urllib.parse.urlparse(self.endpoint)
        self.host = parsed.netloc

    def exists_with_size(self, key, size):
        try:
            response = self.request("HEAD", key)
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return False
            raise

        return int(response.headers.get("Content-Length", "-1")) == size

    def put_object(self, key, path):
        data = path.read_bytes()
        content_type = guess_content_type(path)
        headers = {"content-type": content_type}

        if self.acl:
            headers["x-amz-acl"] = self.acl

        self.request("PUT", key, body=data, headers=headers)

    def upload_multipart(self, key, path, part_size):
        content_type = guess_content_type(path)
        headers = {"content-type": content_type}

        if self.acl:
            headers["x-amz-acl"] = self.acl

        create = self.request("POST", key, query={"uploads": ""}, headers=headers)
        upload_id = ET.fromstring(create.read()).findtext("{*}UploadId")

        if not upload_id:
            raise RuntimeError(f"Could not create multipart upload for {key}")

        parts = []

        try:
            with path.open("rb") as file:
                part_number = 1

                while True:
                    chunk = file.read(part_size)

                    if not chunk:
                        break

                    response = self.request(
                        "PUT",
                        key,
                        query={"partNumber": str(part_number), "uploadId": upload_id},
                        body=chunk,
                    )
                    etag = response.headers["ETag"]
                    parts.append((part_number, etag))
                    print(f"  part {part_number} {format_bytes(len(chunk))}")
                    part_number += 1

            xml = complete_multipart_xml(parts)
            self.request(
                "POST",
                key,
                query={"uploadId": upload_id},
                body=xml,
                headers={"content-type": "application/xml"},
            )
        except Exception:
            self.request("DELETE", key, query={"uploadId": upload_id})
            raise

    def request(self, method, key, query=None, body=b"", headers=None):
        query = query or {}
        headers = {normalize_header_key(k): v for k, v in (headers or {}).items()}

        if isinstance(body, str):
            body = body.encode("utf-8")

        now = dt.datetime.now(dt.timezone.utc)
        amz_date = now.strftime("%Y%m%dT%H%M%SZ")
        date_stamp = now.strftime("%Y%m%d")
        payload_hash = hashlib.sha256(body).hexdigest() if body else EMPTY_SHA256
        encoded_key = "/".join(urllib.parse.quote(part, safe="") for part in key.split("/"))
        canonical_uri = f"/{self.bucket}/{encoded_key}"
        canonical_query = canonical_query_string(query)
        url = f"{self.endpoint}{canonical_uri}"

        if canonical_query:
            url = f"{url}?{canonical_query}"

        signed_headers = {
            "host": self.host,
            "x-amz-content-sha256": payload_hash,
            "x-amz-date": amz_date,
            **headers,
        }
        authorization = self.authorization(
            method=method,
            canonical_uri=canonical_uri,
            canonical_query=canonical_query,
            headers=signed_headers,
            payload_hash=payload_hash,
            amz_date=amz_date,
            date_stamp=date_stamp,
        )
        request_headers = {
            "Authorization": authorization,
            **signed_headers,
        }
        request = urllib.request.Request(url, data=body if method not in {"GET", "HEAD"} else None, headers=request_headers, method=method)
        return urllib.request.urlopen(request, timeout=120, context=self.context)

    def authorization(self, method, canonical_uri, canonical_query, headers, payload_hash, amz_date, date_stamp):
        canonical_headers = "".join(f"{name}:{headers[name]}\n" for name in sorted(headers))
        signed_headers = ";".join(sorted(headers))
        canonical_request = "\n".join(
            [
                method,
                canonical_uri,
                canonical_query,
                canonical_headers,
                signed_headers,
                payload_hash,
            ]
        )
        credential_scope = f"{date_stamp}/{self.region}/s3/aws4_request"
        string_to_sign = "\n".join(
            [
                "AWS4-HMAC-SHA256",
                amz_date,
                credential_scope,
                hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
            ]
        )
        signing_key = self.signing_key(date_stamp)
        signature = hmac.new(signing_key, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

        return (
            "AWS4-HMAC-SHA256 "
            f"Credential={self.access_key}/{credential_scope}, "
            f"SignedHeaders={signed_headers}, "
            f"Signature={signature}"
        )

    def signing_key(self, date_stamp):
        key = f"AWS4{self.secret_key}".encode("utf-8")
        date_key = hmac.new(key, date_stamp.encode("utf-8"), hashlib.sha256).digest()
        region_key = hmac.new(date_key, self.region.encode("utf-8"), hashlib.sha256).digest()
        service_key = hmac.new(region_key, b"s3", hashlib.sha256).digest()
        return hmac.new(service_key, b"aws4_request", hashlib.sha256).digest()


def canonical_query_string(query):
    pairs = []

    for key, value in query.items():
        pairs.append(
            (
                urllib.parse.quote(str(key), safe="-_.~"),
                urllib.parse.quote(str(value), safe="-_.~"),
            )
        )

    return "&".join(f"{key}={value}" for key, value in sorted(pairs))


def normalize_header_key(key):
    return key.lower()


def complete_multipart_xml(parts):
    body = ["<CompleteMultipartUpload>"]

    for part_number, etag in parts:
        body.append("<Part>")
        body.append(f"<PartNumber>{part_number}</PartNumber>")
        body.append(f"<ETag>{escape_xml(etag)}</ETag>")
        body.append("</Part>")

    body.append("</CompleteMultipartUpload>")
    return "".join(body).encode("utf-8")


def escape_xml(value):
    return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def guess_content_type(path):
    content_type, _ = mimetypes.guess_type(path)
    return content_type or "application/octet-stream"


def format_bytes(value):
    units = ["B", "KB", "MB", "GB", "TB"]
    size = float(value)

    for unit in units:
        if size < 1024 or unit == units[-1]:
            return f"{size:.1f} {unit}"
        size /= 1024


if __name__ == "__main__":
    main()
