#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARCHIVE="/tmp/tomilov-site-deploy.tar.gz"
SERVER="${SERVER:-root@216.57.109.15}"
KEY="$ROOT_DIR/.deploy/timeweb_tomilov_site"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/tomilov.com}"
REMOTE_STORAGE_ROOT="${REMOTE_STORAGE_ROOT:-$REMOTE_ROOT}"
LOCAL_TELEGRAM_DIR="$ROOT_DIR/assets/telegram"
REMOTE_TELEGRAM_DIR="$REMOTE_STORAGE_ROOT/shared/assets/telegram"

cd "$ROOT_DIR"

if [[ ! -f "$KEY" ]]; then
  echo "Missing SSH key: $KEY" >&2
  exit 1
fi

mkdir -p "$LOCAL_TELEGRAM_DIR"
ssh -i "$KEY" -o IdentitiesOnly=yes "$SERVER" "mkdir -p '$REMOTE_ROOT' '$REMOTE_TELEGRAM_DIR'"

if [[ "${PULL_REMOTE_POSTS:-1}" != "0" ]]; then
  if ssh -i "$KEY" -o IdentitiesOnly=yes "$SERVER" "test -f '$REMOTE_TELEGRAM_DIR/posts.json'"; then
    scp -i "$KEY" -o IdentitiesOnly=yes \
      "$SERVER:$REMOTE_TELEGRAM_DIR/posts.json" \
      "$LOCAL_TELEGRAM_DIR/posts.json"
  else
    echo "Remote posts.json was not found; using local assets/telegram/posts.json"
  fi
fi

if [[ "${SYNC_MEDIA_FROM_REMOTE:-0}" == "1" ]]; then
  rsync -a --partial --progress --stats \
    --exclude ".DS_Store" \
    --exclude "._*" \
    -e "ssh -i \"$KEY\" -o IdentitiesOnly=yes" \
    "$SERVER:$REMOTE_TELEGRAM_DIR/" \
    "$LOCAL_TELEGRAM_DIR/"
fi

node "$ROOT_DIR/tools/generate-seo-pages.mjs"

if [[ "${PUSH_LOCAL_TELEGRAM:-0}" == "1" && -f "$LOCAL_TELEGRAM_DIR/posts.json" ]]; then
  scp -i "$KEY" -o IdentitiesOnly=yes \
    "$LOCAL_TELEGRAM_DIR/posts.json" \
    "$SERVER:$REMOTE_TELEGRAM_DIR/posts.json"
fi

if [[ "${SKIP_MEDIA_SYNC:-0}" != "1" ]]; then
  rsync -a --partial --progress --stats \
    --exclude "posts.json" \
    --exclude ".DS_Store" \
    --exclude "._*" \
    -e "ssh -i \"$KEY\" -o IdentitiesOnly=yes" \
    "$LOCAL_TELEGRAM_DIR/" \
    "$SERVER:$REMOTE_TELEGRAM_DIR/"
else
  echo "Skipping Telegram media sync because SKIP_MEDIA_SYNC=1"
fi

COPYFILE_DISABLE=1 tar --no-xattrs --exclude "assets/telegram" --exclude "tools/__pycache__" -czf "$ARCHIVE" \
  index.html \
  styles.css \
  script.js \
  robots.txt \
  sitemap.xml \
  CNAME \
  yandex_251bf4498768ab1a.html \
  assets \
  about \
  ops \
  screenshots \
  tools

scp -i "$KEY" -o IdentitiesOnly=yes "$ARCHIVE" "$SERVER:/tmp/tomilov-site-deploy.tar.gz"

ssh -i "$KEY" -o IdentitiesOnly=yes "$SERVER" "set -euo pipefail
stamp=\$(date +%Y%m%d-%H%M%S)
mkdir -p '$REMOTE_STORAGE_ROOT/releases/'\$stamp '$REMOTE_STORAGE_ROOT/backups' '$REMOTE_ROOT'
if [ -e $REMOTE_ROOT/current ]; then
  tar -C $REMOTE_ROOT/current -czf '$REMOTE_STORAGE_ROOT/backups/current-'\$stamp'.tar.gz' .
fi
tar -C '$REMOTE_STORAGE_ROOT/releases/'\$stamp -xzf /tmp/tomilov-site-deploy.tar.gz
mkdir -p '$REMOTE_STORAGE_ROOT/releases/'\$stamp'/assets'
ln -sfn '$REMOTE_STORAGE_ROOT/shared/assets/telegram' '$REMOTE_STORAGE_ROOT/releases/'\$stamp'/assets/telegram'
if [ -f /etc/tomilov-telegram-live.env ]; then
  release_telegram_dir=\$(readlink -f '$REMOTE_STORAGE_ROOT/releases/'\$stamp'/assets/telegram')
  live_posts_path=\$(awk -F= '\$1 == \"POSTS_JSON_PATH\" { print \$2 }' /etc/tomilov-telegram-live.env | tail -n 1)

  if [ -n \"\$live_posts_path\" ]; then
    live_posts_dir=\$(readlink -f \"\$(dirname \"\$live_posts_path\")\")

    if [ \"\$release_telegram_dir\" != \"\$live_posts_dir\" ]; then
      printf 'Live importer POSTS_JSON_PATH points to %s, but release assets/telegram points to %s\n' \"\$live_posts_dir\" \"\$release_telegram_dir\" >&2
      exit 1
    fi
  fi
fi
ln -sfn '$REMOTE_STORAGE_ROOT/releases/'\$stamp '$REMOTE_ROOT/current'
chown -R www-data:www-data '$REMOTE_STORAGE_ROOT/releases/'\$stamp '$REMOTE_STORAGE_ROOT/shared'
chown -h www-data:www-data '$REMOTE_ROOT/current'
nginx -t
systemctl reload nginx
printf 'Deployed release %s\n' \"\$stamp\"
find $REMOTE_ROOT/current -maxdepth 3 -type f | sort"
