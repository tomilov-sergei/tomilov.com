#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  printf 'Run this installer as root: sudo %s\n' "$0" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE_SOURCE="$ROOT_DIR/ops/nginx-site-production.conf.example"
HEADERS_SOURCE="$ROOT_DIR/ops/nginx-security-headers.conf.example"
SITE_TARGET="/etc/nginx/sites-available/tomilov.com"
HEADERS_TARGET="/etc/nginx/snippets/tomilov-security-headers.conf"
BACKUP_DIR="/etc/nginx/backups/tomilov-$(date +%Y%m%d-%H%M%S)"

[[ -f "$SITE_SOURCE" ]] || { printf 'Missing %s\n' "$SITE_SOURCE" >&2; exit 1; }
[[ -f "$HEADERS_SOURCE" ]] || { printf 'Missing %s\n' "$HEADERS_SOURCE" >&2; exit 1; }

install -d -m 0755 "$BACKUP_DIR" /etc/nginx/snippets
cp -a "$SITE_TARGET" "$BACKUP_DIR/site.conf"
if [[ -f "$HEADERS_TARGET" ]]; then
  cp -a "$HEADERS_TARGET" "$BACKUP_DIR/security-headers.conf"
fi

install -m 0644 "$SITE_SOURCE" "$SITE_TARGET"
install -m 0644 "$HEADERS_SOURCE" "$HEADERS_TARGET"

if ! nginx -t; then
  printf 'nginx validation failed; restoring %s\n' "$BACKUP_DIR" >&2
  install -m 0644 "$BACKUP_DIR/site.conf" "$SITE_TARGET"
  if [[ -f "$BACKUP_DIR/security-headers.conf" ]]; then
    install -m 0644 "$BACKUP_DIR/security-headers.conf" "$HEADERS_TARGET"
  else
    rm -f "$HEADERS_TARGET"
  fi
  nginx -t
  exit 1
fi

systemctl reload nginx
printf 'nginx hardening installed; backup: %s\n' "$BACKUP_DIR"

# A graceful reload briefly keeps the previous worker generation alive. Retry
# the public check so it cannot observe a mix of old and new responses.
for attempt in {1..10}; do
  if python3 "$ROOT_DIR/tools/check-production.py" --strict; then
    exit 0
  fi

  if [[ "$attempt" -eq 10 ]]; then
    printf 'production check still failing after %s attempts\n' "$attempt" >&2
    exit 1
  fi

  printf 'production check not ready (attempt %s/10); retrying...\n' "$attempt"
  sleep 2
done
