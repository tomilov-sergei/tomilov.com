# Operations Runbook

Last updated: 2026-06-12.

This runbook covers production checks for `tomilov.com` on the Timeweb VPS.

## Production Paths

- Site symlink: `/var/www/tomilov.com/current`
- Release storage: `/mnt/tomilov-data/tomilov.com/releases`
- Shared Telegram data: `/mnt/tomilov-data/tomilov.com/shared/assets/telegram`
- Shared photo data: `/mnt/tomilov-data/tomilov.com/shared/assets/photos`
- Shared Barcelona Guide images: `/mnt/tomilov-data/tomilov.com/shared/assets/barcelona-guide`
- Telegram env: `/etc/tomilov-telegram-live.env`
- Photo upload env: `/etc/tomilov-photo-upload.env`
- Telegram service: `tomilov-telegram-live.service`
- Photo service: `tomilov-photo-upload.service`

## After Deploy

Before deploy, check static integrity and confirm that source changes are committed and pushed:

```sh
python3 tools/check-site.py
git status --short --branch
git ls-remote origin refs/heads/main
```

Do not deploy uncommitted source files. Production shared data may be newer than the Git snapshot, but the deployed application code and curated static content must exist on GitHub.

Check public crawl surfaces:

```sh
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' https://tomilov.com/sitemap.xml
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' https://tomilov.com/feed.xml
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' https://tomilov.com/screenshots/feed.xml
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' https://tomilov.com/photos/feed.xml
```

Expected result: `200 text/xml` for each feed and sitemap.

Check service state:

```sh
ssh -i .deploy/timeweb_tomilov_site -o IdentitiesOnly=yes root@216.57.109.15 \
  "systemctl is-active tomilov-telegram-live.service tomilov-photo-upload.service"
```

Expected result:

```text
active
active
```

## Telegram Live Import

The live path is:

Telegram channel update -> `/telegram/webhook` -> `tomilov-telegram-live.service` -> shared `posts.json` and S3 media -> `tools/generate_telegram_seo.py`.

Check the service:

```sh
ssh -i .deploy/timeweb_tomilov_site -o IdentitiesOnly=yes root@216.57.109.15 \
  "systemctl status tomilov-telegram-live.service --no-pager -l"
```

Check recent logs:

```sh
ssh -i .deploy/timeweb_tomilov_site -o IdentitiesOnly=yes root@216.57.109.15 \
  "journalctl -u tomilov-telegram-live.service -n 80 --no-pager"
```

Check that the production generator works with the server Python and `www-data` permissions:

```sh
ssh -i .deploy/timeweb_tomilov_site -o IdentitiesOnly=yes root@216.57.109.15 \
  "cd /var/www/tomilov.com/current && python3 -m py_compile tools/generate_telegram_seo.py tools/telegram_live_importer.py && runuser -u www-data -- python3 tools/generate_telegram_seo.py"
```

If a new Telegram post appears in `/screenshots/` but its permanent page is missing:

1. Check logs for `Telegram SEO generation failed`.
2. Run the generator command above.
3. Check `https://tomilov.com/screenshots/<id>/`.
4. Restart the service if the importer is stale:

```sh
ssh -i .deploy/timeweb_tomilov_site -o IdentitiesOnly=yes root@216.57.109.15 \
  "systemctl restart tomilov-telegram-live.service && systemctl is-active tomilov-telegram-live.service"
```

## Photo Upload

The photo path is:

Apple Shortcut -> `/photos/upload` -> `tomilov-photo-upload.service` -> shared `photos.json` and original file -> `tools/generate_photo_seo.py`.

Check the service:

```sh
ssh -i .deploy/timeweb_tomilov_site -o IdentitiesOnly=yes root@216.57.109.15 \
  "systemctl status tomilov-photo-upload.service --no-pager -l"
```

Check recent logs:

```sh
ssh -i .deploy/timeweb_tomilov_site -o IdentitiesOnly=yes root@216.57.109.15 \
  "journalctl -u tomilov-photo-upload.service -n 80 --no-pager"
```

Run a photo-only SEO refresh without deploying code:

```sh
PHOTOS_ONLY=1 ./tools/deploy-site.sh
```

## Full Deploy Variants

Normal deploy:

```sh
./tools/deploy-site.sh
```

Deploy code and generated pages without re-syncing Telegram media:

```sh
SKIP_MEDIA_SYNC=1 ./tools/deploy-site.sh
```

Pull server Telegram media into the local mirror:

```sh
SYNC_MEDIA_FROM_REMOTE=1 ./tools/deploy-site.sh
```

Push an intentional local Telegram import to production:

```sh
PULL_REMOTE_POSTS=0 PUSH_LOCAL_TELEGRAM=1 REMOTE_STORAGE_ROOT=/mnt/tomilov-data/tomilov.com ./tools/deploy-site.sh
```

## XML Validation

Validate generated XML locally:

```sh
python3 -c "from xml.etree import ElementTree as ET; [ET.parse(p) for p in ['sitemap.xml','feed.xml','screenshots/feed.xml','photos/feed.xml']]; print('xml_ok')"
```

Validate production XML by checking HTTP responses first; malformed XML should also show up in Search Console or RSS readers.
