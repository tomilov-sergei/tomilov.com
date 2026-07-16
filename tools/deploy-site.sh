#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARCHIVE="/tmp/tomilov-site-deploy.tar.gz"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$ROOT_DIR/.deploy/deploy.env}"
if [[ -f "$DEPLOY_ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$DEPLOY_ENV_FILE"
  set +a
fi

SERVER="${SERVER:-}"
KEY="${DEPLOY_KEY:-${KEY:-}}"
REMOTE_ROOT="${REMOTE_ROOT:-}"
REMOTE_STORAGE_ROOT="${REMOTE_STORAGE_ROOT:-}"
REMOTE_ARCHIVE="$REMOTE_STORAGE_ROOT/tmp/tomilov-site-deploy.tar.gz"
LOCAL_TELEGRAM_DIR="$ROOT_DIR/assets/telegram"
REMOTE_TELEGRAM_DIR="$REMOTE_STORAGE_ROOT/shared/assets/telegram"
LOCAL_PHOTOS_DIR="$ROOT_DIR/assets/photos"
REMOTE_PHOTOS_DIR="$REMOTE_STORAGE_ROOT/shared/assets/photos"
LOCAL_BARCELONA_DIR="$ROOT_DIR/assets/barcelona-guide"
REMOTE_BARCELONA_DIR="$REMOTE_STORAGE_ROOT/shared/assets/barcelona-guide"
PHOTOS_ONLY="${PHOTOS_ONLY:-0}"
REMOTE_WRITE_RSYNC_OPTIONS=(--no-perms --no-owner --no-group --omit-dir-times)

cd "$ROOT_DIR"

missing_config=()
[[ -n "$SERVER" ]] || missing_config+=("SERVER")
[[ -n "$KEY" ]] || missing_config+=("DEPLOY_KEY")
[[ -n "$REMOTE_ROOT" ]] || missing_config+=("REMOTE_ROOT")
[[ -n "$REMOTE_STORAGE_ROOT" ]] || missing_config+=("REMOTE_STORAGE_ROOT")
if (( ${#missing_config[@]} > 0 )); then
  printf 'Missing deploy config: %s\n' "${missing_config[*]}" >&2
  printf 'Set them in %s or the environment. See ops/deploy.env.example.\n' "$DEPLOY_ENV_FILE" >&2
  exit 1
fi

if [[ "$KEY" != /* ]]; then
  KEY="$ROOT_DIR/$KEY"
fi

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
  ssh -i "$KEY" -o IdentitiesOnly=yes "$SERVER" "mkdir -p '$REMOTE_ROOT' '$REMOTE_TELEGRAM_DIR' '$REMOTE_PHOTOS_DIR' '$REMOTE_BARCELONA_DIR'
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
      "${REMOTE_WRITE_RSYNC_OPTIONS[@]}" \
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
if [ \"\$(id -u)\" -eq 0 ]; then
  chown -R www-data:www-data index.html photos en feed.xml sitemap.xml '$REMOTE_STORAGE_ROOT/shared/assets/photos'
else
  chmod -R g+rwX index.html photos en feed.xml sitemap.xml
  find '$REMOTE_STORAGE_ROOT/shared/assets/photos' -user \"\$(id -un)\" -exec chmod g+rwX {} +
fi
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
    "${REMOTE_WRITE_RSYNC_OPTIONS[@]}" \
    --exclude ".DS_Store" \
    --exclude "._*" \
    -e "ssh -i \"$KEY\" -o IdentitiesOnly=yes" \
    "$LOCAL_PHOTOS_DIR/" \
    "$SERVER:$REMOTE_PHOTOS_DIR/"
fi

if [[ -d "$LOCAL_BARCELONA_DIR" && "${SKIP_BARCELONA_SYNC:-0}" != "1" ]]; then
  rsync -a --partial --progress --stats \
    "${REMOTE_WRITE_RSYNC_OPTIONS[@]}" \
    --exclude ".DS_Store" \
    --exclude "._*" \
    -e "ssh -i \"$KEY\" -o IdentitiesOnly=yes" \
    "$LOCAL_BARCELONA_DIR/" \
    "$SERVER:$REMOTE_BARCELONA_DIR/"
else
  echo "Skipping Barcelona guide image sync"
fi

if [[ "${SKIP_MEDIA_SYNC:-0}" != "1" ]]; then
  rsync -a --partial --progress --stats \
    "${REMOTE_WRITE_RSYNC_OPTIONS[@]}" \
    --exclude "posts.json" \
    --exclude ".DS_Store" \
    --exclude "._*" \
    -e "ssh -i \"$KEY\" -o IdentitiesOnly=yes" \
    "$LOCAL_TELEGRAM_DIR/" \
    "$SERVER:$REMOTE_TELEGRAM_DIR/"
else
  echo "Skipping Telegram media sync because SKIP_MEDIA_SYNC=1"
fi

COPYFILE_DISABLE=1 tar --no-xattrs --exclude "assets/telegram" --exclude "assets/photos" --exclude "assets/barcelona-guide" --exclude "tools/__pycache__" -czf "$ARCHIVE" \
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
  barcelona-guide \
  places \
  en \
  photos \
  ops \
  screenshots \
  tools

ssh -i "$KEY" -o IdentitiesOnly=yes "$SERVER" "mkdir -p '$(dirname "$REMOTE_ARCHIVE")'"
scp -i "$KEY" -o IdentitiesOnly=yes "$ARCHIVE" "$SERVER:$REMOTE_ARCHIVE"

ssh -i "$KEY" -o IdentitiesOnly=yes "$SERVER" "set -euo pipefail
if [ \"\$(id -u)\" -eq 0 ]; then
  SUDO=''
else
  SUDO='sudo -n'
fi
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
ln -sfn '$REMOTE_STORAGE_ROOT/shared/assets/barcelona-guide' '$REMOTE_STORAGE_ROOT/releases/'\$stamp'/assets/barcelona-guide'
if [ -r /etc/tomilov-telegram-live.env ]; then
  release_telegram_dir=\$(readlink -f '$REMOTE_STORAGE_ROOT/releases/'\$stamp'/assets/telegram')
  live_posts_path=\$(awk -F= '\$1 == \"POSTS_JSON_PATH\" { print \$2 }' /etc/tomilov-telegram-live.env | tail -n 1)

  if [ -n \"\$live_posts_path\" ]; then
    live_posts_dir=\$(readlink -f \"\$(dirname \"\$live_posts_path\")\")

    if [ \"\$release_telegram_dir\" != \"\$live_posts_dir\" ]; then
      printf 'Live importer POSTS_JSON_PATH points to %s, but release assets/telegram points to %s\n' \"\$live_posts_dir\" \"\$release_telegram_dir\" >&2
      exit 1
    fi
  fi
elif [ -f /etc/tomilov-telegram-live.env ]; then
  printf 'Skipping live importer path check because /etc/tomilov-telegram-live.env is not readable by deploy user\n' >&2
fi
ln -sfn '$REMOTE_STORAGE_ROOT/releases/'\$stamp '$REMOTE_ROOT/current'
if [ \"\$(id -u)\" -eq 0 ]; then
  chown -R www-data:www-data '$REMOTE_STORAGE_ROOT/releases/'\$stamp '$REMOTE_STORAGE_ROOT/shared'
  chown -h www-data:www-data '$REMOTE_ROOT/current'
else
  chmod -R g+rwX '$REMOTE_STORAGE_ROOT/releases/'\$stamp
  find '$REMOTE_STORAGE_ROOT/shared' -user \"\$(id -un)\" -exec chmod g+rwX {} +
fi
\$SUDO nginx -t
\$SUDO systemctl reload nginx
if systemctl list-unit-files tomilov-photo-upload.service --no-legend 2>/dev/null | grep -q tomilov-photo-upload.service; then
  \$SUDO systemctl restart tomilov-photo-upload.service
fi
for service in tomilov-telegram-live.service tomilov-telegram-live-importer.service; do
  if systemctl list-unit-files "\$service" --no-legend 2>/dev/null | grep -q "\$service"; then
    \$SUDO systemctl restart "\$service"
  fi
done
printf 'Deployed release %s\n' \"\$stamp\"
find $REMOTE_ROOT/current -maxdepth 3 -type f | sort"
