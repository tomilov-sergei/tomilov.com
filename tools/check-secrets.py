#!/usr/bin/env python3

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent.parent
MAX_FILE_BYTES = 3 * 1024 * 1024
HISTORY_PREFIXES = (
    ".github/",
    ".gitignore",
    "README.md",
    "docs/",
    "ops/",
    "tools/",
)
PLACEHOLDER_WORDS = (
    "...",
    "<",
    "change-me",
    "example",
    "placeholder",
    "replace-with",
    "your-",
)

SENSITIVE_PATHS = [
    re.compile(r"(^|/)\.deploy/"),
    re.compile(r"(^|/)\.env($|[./])"),
    re.compile(r"(^|/)id_(rsa|ed25519|ecdsa)$"),
    re.compile(r"\.(pem|p12|pfx|key)$", re.IGNORECASE),
    re.compile(r"^assets/photos/originals/"),
    re.compile(r"^assets/barcelona-guide/"),
    re.compile(r"^assets/telegram/(?!posts\.json$)"),
]

TOKEN_PATTERNS = [
    ("private key", re.compile(r"-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----")),
    ("github token", re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{30,}\b")),
    ("github fine-grained token", re.compile(r"\bgithub_pat_[A-Za-z0-9_]{30,}\b")),
    ("openai api key", re.compile(r"\bsk-[A-Za-z0-9_-]{32,}\b")),
    ("telegram bot token", re.compile(r"\b\d{6,12}:[A-Za-z0-9_-]{30,}\b")),
    ("aws access key", re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b")),
]

SECRET_ASSIGNMENT = re.compile(
    r"^\s*(?:export\s+)?([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PRIVATE_KEY|ACCESS_KEY)[A-Z0-9_]*)\s*=\s*['\"]?([^'\"\s#]+)",
    re.IGNORECASE,
)


def main():
    parser = argparse.ArgumentParser(description="Check tracked files for committed secrets.")
    parser.add_argument("--history", action="store_true", help="also scan every blob reachable from git history")
    args = parser.parse_args()

    findings = []
    tracked = git_lines(["ls-files"])
    findings.extend(check_sensitive_paths(tracked))
    findings.extend(scan_worktree_files(tracked))

    if args.history:
        findings.extend(scan_history())

    if findings:
        print("secret_check_failed")
        for finding in findings:
            print(finding)
        return 1

    print(f"secret_check_ok files={len(tracked)} history={'yes' if args.history else 'no'}")
    return 0


def check_sensitive_paths(paths):
    findings = []
    for path in paths:
        for pattern in SENSITIVE_PATHS:
            if pattern.search(path):
                findings.append(f"{path}: tracked sensitive path")
                break
    return findings


def scan_worktree_files(paths):
    findings = []
    for relative in paths:
        path = ROOT_DIR / relative
        if not path.is_file() or path.stat().st_size > MAX_FILE_BYTES:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        findings.extend(scan_text(relative, text))
    return findings


def scan_history():
    findings = []
    object_ids = set(git_lines(["rev-list", "--objects", "--all"]))
    for entry in object_ids:
        parts = entry.split(" ", 1)
        object_id = parts[0]
        name = parts[1] if len(parts) > 1 else object_id
        if not name.startswith(HISTORY_PREFIXES):
            continue
        if any(pattern.search(name) for pattern in SENSITIVE_PATHS):
            findings.append(f"{name}: historical sensitive path")
            continue
        try:
            object_type = subprocess.check_output(
                ["git", "cat-file", "-t", object_id],
                cwd=ROOT_DIR,
                text=True,
                stderr=subprocess.DEVNULL,
                timeout=5,
            ).strip()
            object_size = int(
                subprocess.check_output(
                    ["git", "cat-file", "-s", object_id],
                    cwd=ROOT_DIR,
                    text=True,
                    stderr=subprocess.DEVNULL,
                    timeout=5,
                ).strip()
            )
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, ValueError):
            continue
        if object_type != "blob" or object_size > MAX_FILE_BYTES:
            continue
        try:
            data = subprocess.check_output(
                ["git", "cat-file", "-p", object_id],
                cwd=ROOT_DIR,
                stderr=subprocess.DEVNULL,
                timeout=5,
            )
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            continue
        if len(data) > MAX_FILE_BYTES or b"\0" in data[:4096]:
            continue
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            continue
        findings.extend(scan_text(f"history:{name}", text))
    return findings


def scan_text(label, text):
    findings = []
    should_scan_assignments = is_config_like(label)
    for line_number, line in enumerate(text.splitlines(), start=1):
        for name, pattern in TOKEN_PATTERNS:
            if pattern.search(line) and not is_placeholder(line):
                findings.append(f"{label}:{line_number}: {name}")
        assignment = SECRET_ASSIGNMENT.search(line) if should_scan_assignments else None
        if assignment and not is_placeholder(assignment.group(2)):
            findings.append(f"{label}:{line_number}: secret-like assignment to {assignment.group(1)}")
    return findings


def is_config_like(label):
    path = label.removeprefix("history:")
    suffixes = (
        ".env",
        ".example",
        ".ini",
        ".properties",
        ".toml",
        ".yaml",
        ".yml",
    )
    names = {
        "Dockerfile",
        "docker-compose.yml",
        "docker-compose.yaml",
    }
    filename = os.path.basename(path)
    return filename in names or path.endswith(suffixes) or "/ops/" in path


def is_placeholder(value):
    normalized = value.strip().lower()
    if not normalized:
        return True
    return any(word in normalized for word in PLACEHOLDER_WORDS)


def git_lines(args):
    output = subprocess.check_output(["git", *args], cwd=ROOT_DIR, text=True)
    return [line for line in output.splitlines() if line]


if __name__ == "__main__":
    sys.exit(main())
