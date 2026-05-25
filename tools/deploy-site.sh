#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARCHIVE="/tmp/tomilov-site-deploy.tar.gz"
SERVER="root@217.25.95.14"
KEY="$ROOT_DIR/.deploy/timeweb_tomilov_site"
REMOTE_ROOT="/var/www/tomilov.com"

cd "$ROOT_DIR"

if [[ ! -f "$KEY" ]]; then
  echo "Missing SSH key: $KEY" >&2
  exit 1
fi

COPYFILE_DISABLE=1 tar -czf "$ARCHIVE" \
  index.html \
  styles.css \
  script.js \
  robots.txt \
  sitemap.xml \
  CNAME \
  assets \
  about

scp -i "$KEY" -o IdentitiesOnly=yes "$ARCHIVE" "$SERVER:/tmp/tomilov-site-deploy.tar.gz"

ssh -i "$KEY" -o IdentitiesOnly=yes "$SERVER" "set -euo pipefail
stamp=\$(date +%Y%m%d-%H%M%S)
mkdir -p $REMOTE_ROOT/releases/\$stamp $REMOTE_ROOT/backups
if [ -e $REMOTE_ROOT/current ]; then
  tar -C $REMOTE_ROOT/current -czf $REMOTE_ROOT/backups/current-\$stamp.tar.gz .
fi
tar -C $REMOTE_ROOT/releases/\$stamp -xzf /tmp/tomilov-site-deploy.tar.gz
ln -sfn $REMOTE_ROOT/releases/\$stamp $REMOTE_ROOT/current
chown -R www-data:www-data $REMOTE_ROOT
nginx -t
systemctl reload nginx
printf 'Deployed release %s\n' \"\$stamp\"
find $REMOTE_ROOT/current -maxdepth 3 -type f | sort"
