#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARCHIVE="/tmp/tomilov-site-deploy.tar.gz"
SERVER="${SERVER:-root@216.57.109.15}"
KEY="$ROOT_DIR/.deploy/timeweb_tomilov_site"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/tomilov.com}"
REMOTE_STORAGE_ROOT="${REMOTE_STORAGE_ROOT:-/mnt/tomilov-data/tomilov.com}"
REMOTE_ARCHIVE="$REMOTE_STORAGE_ROOT/tmp/tomilov-site-deploy.tar.gz"
LOCAL_TELEGRAM_DIR="$ROOT_DIR/assets/telegram"
REMOTE_TELEGRAM_DIR="$REMOTE_STORAGE_ROOT/shared/assets/telegram"
LOCAL_PHOTOS_DIR="$ROOT_DIR/assets/photos"
REMOTE_PHOTOS_DIR="$REMOTE_STORAGE_ROOT/shared/assets/photos"
PHOTOS_ONLY="${PHOTOS_ONLY:-0}"

cd "$ROOT_DIR"

if [[ ! -f "$KEY" ]]; then
  echo "Missing SSH key: $KEY" >&2
  exit 1
fi

if [[ "$PHOTOS_ONLY" == "1" ]]; then
  mkdir -p "$LOCAL_PHOTOS_DIR"
  ssh -i "$KEY" -o IdentitiesOnly=yes "$SERVER" "mkdir -p '$REMOTE_ROOT' '$REMOTE_PHOTOS_DIR'
if [ ! -f '$REMOTE_PHOTOS_DIR/photos.json' ]; then
  printf '{\n  \"source\": \"Photo upload service\",\n  \"updatedAt\": null,\n  \"photos\": []\n}\n' > '$REMOTE_PHOTOS_DIR/photos.json'
fi"
else
  mkdir -p "$LOCAL_TELEGRAM_DIR" "$LOCAL_PHOTOS_DIR"
  ssh -i "$KEY" -o IdentitiesOnly=yes "$SERVER" "mkdir -p '$REMOTE_ROOT' '$REMOTE_TELEGRAM_DIR' '$REMOTE_PHOTOS_DIR'
if [ ! -f '$REMOTE_PHOTOS_DIR/photos.json' ]; then
  printf '{\n  \"source\": \"Photo upload service\",\n  \"updatedAt\": null,\n  \"photos\": []\n}\n' > '$REMOTE_PHOTOS_DIR/photos.json'
fi"
fi

if [[ "$PHOTOS_ONLY" != "1" && "${PULL_REMOTE_POSTS:-1}" != "0" ]]; then
  if ssh -i "$KEY" -o IdentitiesOnly=yes "$SERVER" "test -f '$REMOTE_TELEGRAM_DIR/posts.json'"; then
    scp -i "$KEY" -o IdentitiesOnly=yes \
      "$SERVER:$REMOTE_TELEGRAM_DIR/posts.json" \
      "$LOCAL_TELEGRAM_DIR/posts.json"
  else
    echo "Remote posts.json was not found; using local assets/telegram/posts.json"
  fi
fi

if [[ "$PHOTOS_ONLY" != "1" && "${SYNC_MEDIA_FROM_REMOTE:-0}" == "1" ]]; then
  rsync -a --partial --progress --stats \
    --exclude ".DS_Store" \
    --exclude "._*" \
    -e "ssh -i \"$KEY\" -o IdentitiesOnly=yes" \
    "$SERVER:$REMOTE_TELEGRAM_DIR/" \
    "$LOCAL_TELEGRAM_DIR/"
fi

if [[ "${PULL_REMOTE_PHOTOS:-1}" != "0" ]]; then
  if ssh -i "$KEY" -o IdentitiesOnly=yes "$SERVER" "test -f '$REMOTE_PHOTOS_DIR/photos.json'"; then
    scp -i "$KEY" -o IdentitiesOnly=yes \
      "$SERVER:$REMOTE_PHOTOS_DIR/photos.json" \
      "$LOCAL_PHOTOS_DIR/photos.json"
  else
    echo "Remote photos.json was not found; using local assets/photos/photos.json"
  fi
fi

if [[ "${SYNC_PHOTOS_FROM_REMOTE:-0}" == "1" ]]; then
  rsync -a --partial --progress --stats \
    --exclude ".DS_Store" \
    --exclude "._*" \
    -e "ssh -i \"$KEY\" -o IdentitiesOnly=yes" \
    "$SERVER:$REMOTE_PHOTOS_DIR/" \
    "$LOCAL_PHOTOS_DIR/"
fi

if [[ "$PHOTOS_ONLY" == "1" ]]; then
  if [[ "${PUSH_LOCAL_PHOTOS:-0}" == "1" && -f "$LOCAL_PHOTOS_DIR/photos.json" ]]; then
    rsync -a --partial --progress --stats \
      --exclude ".DS_Store" \
      --exclude "._*" \
      -e "ssh -i \"$KEY\" -o IdentitiesOnly=yes" \
      "$LOCAL_PHOTOS_DIR/" \
      "$SERVER:$REMOTE_PHOTOS_DIR/"
  fi

  ssh -i "$KEY" -o IdentitiesOnly=yes "$SERVER" "set -euo pipefail
if [ ! -d '$REMOTE_ROOT/current' ]; then
  printf 'Current release was not found at %s/current; run a full deploy first\n' '$REMOTE_ROOT' >&2
  exit 1
fi
cd '$REMOTE_ROOT/current'
python3 tools/generate_photo_seo.py
chown -R www-data:www-data photos feed.xml sitemap.xml '$REMOTE_STORAGE_ROOT/shared/assets/photos'
printf 'Refreshed photo pages in current release\n'
find photos -maxdepth 2 -type f | sort"
  exit 0
fi

node "$ROOT_DIR/tools/generate-seo-pages.mjs"

if [[ "${PUSH_LOCAL_TELEGRAM:-0}" == "1" && -f "$LOCAL_TELEGRAM_DIR/posts.json" ]]; then
  scp -i "$KEY" -o IdentitiesOnly=yes \
    "$LOCAL_TELEGRAM_DIR/posts.json" \
    "$SERVER:$REMOTE_TELEGRAM_DIR/posts.json"
fi

if [[ "${PUSH_LOCAL_PHOTOS:-0}" == "1" && -f "$LOCAL_PHOTOS_DIR/photos.json" ]]; then
  rsync -a --partial --progress --stats \
    --exclude ".DS_Store" \
    --exclude "._*" \
    -e "ssh -i \"$KEY\" -o IdentitiesOnly=yes" \
    "$LOCAL_PHOTOS_DIR/" \
    "$SERVER:$REMOTE_PHOTOS_DIR/"
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

COPYFILE_DISABLE=1 tar --no-xattrs --exclude "assets/telegram" --exclude "assets/photos" --exclude "tools/__pycache__" -czf "$ARCHIVE" \
  index.html \
  styles.css \
  script.js \
  robots.txt \
  sitemap.xml \
  feed.xml \
  CNAME \
  yandex_251bf4498768ab1a.html \
  assets \
  about \
  photos \
  ops \
  screenshots \
  tools

ssh -i "$KEY" -o IdentitiesOnly=yes "$SERVER" "mkdir -p '$(dirname "$REMOTE_ARCHIVE")'"
scp -i "$KEY" -o IdentitiesOnly=yes "$ARCHIVE" "$SERVER:$REMOTE_ARCHIVE"

ssh -i "$KEY" -o IdentitiesOnly=yes "$SERVER" "set -euo pipefail
stamp=\$(date +%Y%m%d-%H%M%S)
mkdir -p '$REMOTE_STORAGE_ROOT/releases/'\$stamp '$REMOTE_STORAGE_ROOT/backups' '$REMOTE_ROOT'
if [ -e $REMOTE_ROOT/current ]; then
  tar -C $REMOTE_ROOT/current -czf '$REMOTE_STORAGE_ROOT/backups/current-'\$stamp'.tar.gz' .
fi
tar -C '$REMOTE_STORAGE_ROOT/releases/'\$stamp -xzf '$REMOTE_ARCHIVE'
mkdir -p '$REMOTE_STORAGE_ROOT/releases/'\$stamp'/assets'
telegram_shared='$REMOTE_STORAGE_ROOT/shared/assets/telegram'
ln -sfn \"\$telegram_shared\" '$REMOTE_STORAGE_ROOT/releases/'\$stamp'/assets/telegram'
ln -sfn '$REMOTE_STORAGE_ROOT/shared/assets/photos' '$REMOTE_STORAGE_ROOT/releases/'\$stamp'/assets/photos'
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
if systemctl list-unit-files tomilov-photo-upload.service --no-legend 2>/dev/null | grep -q tomilov-photo-upload.service; then
  systemctl restart tomilov-photo-upload.service
fi
if systemctl list-unit-files tomilov-telegram-live-importer.service --no-legend 2>/dev/null | grep -q tomilov-telegram-live-importer.service; then
  systemctl restart tomilov-telegram-live-importer.service
fi
printf 'Deployed release %s\n' \"\$stamp\"
find $REMOTE_ROOT/current -maxdepth 3 -type f | sort"
