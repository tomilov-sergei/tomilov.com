#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  printf 'Run this installer as root: sudo %s\n' "$0" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="/etc/nginx/backups/tomilov-$(date +%Y%m%d-%H%M%S)"
sources=(
  nginx-site-production.conf.example
  nginx-security-headers.conf.example
  nginx-llm-http.conf
  nginx-llm-quality.conf
  nginx-llm-server.conf
)
targets=(
  /etc/nginx/sites-available/tomilov.com
  /etc/nginx/snippets/tomilov-security-headers.conf
  /etc/nginx/snippets/tomilov-llm-http.conf
  /etc/nginx/snippets/tomilov-llm-quality.conf
  /etc/nginx/snippets/tomilov-llm-server.conf
)

for source in "${sources[@]}"; do
  [[ -f "$ROOT_DIR/ops/$source" ]] || { printf 'Missing %s\n' "$source" >&2; exit 1; }
done
[[ -s "$ROOT_DIR/index.md" && -s "$ROOT_DIR/llms.txt" ]] || { printf 'Deploy the Markdown pages first\n' >&2; exit 1; }

install -d -m 0755 "$BACKUP_DIR" /etc/nginx/snippets
for target in "${targets[@]}"; do
  if [[ -f "$target" ]]; then
    cp -a "$target" "$BACKUP_DIR/"
  fi
done

restore() {
  printf 'Restoring Nginx configuration from %s\n' "$BACKUP_DIR" >&2
  local target backup
  for target in "${targets[@]}"; do
    backup="$BACKUP_DIR/${target##*/}"
    if [[ -f "$backup" ]]; then
      install -m 0644 "$backup" "$target"
    else
      rm -f "$target"
    fi
  done
  nginx -t
  systemctl reload nginx
}

for index in "${!sources[@]}"; do
  if ! install -m 0644 "$ROOT_DIR/ops/${sources[index]}" "${targets[index]}"; then
    restore
    exit 1
  fi
done

if ! nginx -t || ! systemctl reload nginx; then
  restore
  exit 1
fi

# A graceful reload can briefly keep the previous worker generation alive.
for attempt in {1..5}; do
  if python3 "$ROOT_DIR/tools/check-production.py" --strict --llm; then
    printf 'Nginx configuration installed; backup: %s\n' "$BACKUP_DIR"
    exit 0
  fi
  sleep 2
done

restore
exit 1
