# tomilov.com

Чистая статическая версия сайта, перенесённая с Framer. Основной редактируемый код лежит в корне проекта:

- `/` — Miro live embed.
- `/about/` — страница с выступлениями и видео.
- `/screenshots/` — архив канала Screenshot of the Day.

Главные файлы:

- `index.html`, `about/index.html` — структура страниц.
- `screenshots/index.html` — страница архива Telegram-канала.
- `styles.css` — общий дизайн, сетки, адаптив и темы.
- `script.js` — включение YouTube-видео по клику и лента Telegram-архива.
- `assets/` — favicon, OG-картинка и превью видео.
- `assets/telegram/posts.json` и `assets/telegram/**` — импортированные посты и медиа из Telegram.
- `tools/import-telegram-export.mjs` — повторяемый импорт Telegram Desktop export.
- `tools/generate-seo-pages.mjs` — генерация статических страниц постов, индекса и `sitemap.xml`.
- `tools/telegram_live_importer.py` — webhook-сервис для новых постов из Telegram.

## Локальный запуск

```sh
python3 -m http.server 4173
```

После запуска сайт доступен на `http://127.0.0.1:4173/`.

## Деплой

Это обычный статический сайт без сборки. На Timeweb он публикуется одной командой:

```sh
./tools/deploy-site.sh
```

Скрипт упаковывает только чистый сайт из корня проекта, отправляет архив на сервер и переключает `/var/www/tomilov.com/current` на новый release.
Telegram-архив живёт отдельно в `/var/www/tomilov.com/shared/assets/telegram/`, чтобы не упаковывать 10+ GB медиа в каждый release.

По умолчанию production shared storage считается источником правды для `posts.json`: перед SEO-генерацией деплой скачивает свежий `/var/www/tomilov.com/shared/assets/telegram/posts.json`, создаёт страницы постов и `sitemap.xml`, а затем выкладывает новый release. Это нужно, чтобы live-посты из Telegram не терялись при обычном деплое.

Медиа синхронизируются в сторону сервера аддитивно, без `--delete`, и без перезаписи `posts.json`. Это защищает live-медиа, которые появились на сервере после Telegram webhook.

Если медиа нужно хранить на отдельном диске, передайте путь второго диска через `REMOTE_STORAGE_ROOT`, оставив публичный symlink на прежнем месте:

```sh
REMOTE_STORAGE_ROOT=/mnt/tomilov-data/tomilov.com ./tools/deploy-site.sh
```

Если нужно переключить только код сайта без повторной синхронизации медиа:

```sh
SKIP_MEDIA_SYNC=1 REMOTE_STORAGE_ROOT=/mnt/tomilov-data/tomilov.com ./tools/deploy-site.sh
```

Если нужно подтянуть серверные медиа обратно в локальную копию:

```sh
SYNC_MEDIA_FROM_REMOTE=1 REMOTE_STORAGE_ROOT=/mnt/tomilov-data/tomilov.com ./tools/deploy-site.sh
```

Если после ручного локального импорта Telegram нужно сделать локальный `posts.json` источником правды и отправить его на сервер:

```sh
PULL_REMOTE_POSTS=0 PUSH_LOCAL_TELEGRAM=1 REMOTE_STORAGE_ROOT=/mnt/tomilov-data/tomilov.com ./tools/deploy-site.sh
```

Можно также загрузить корень репозитория на Cloudflare Pages, GitHub Pages, Netlify, Vercel static или любой Nginx.

Для `tomilov.com`:

После деплоя проверить `https://tomilov.com/`, `https://tomilov.com/about/` и `https://tomilov.com/screenshots/`.

## SEO-генерация

Посты из Telegram-архива должны быть доступны краулерам как обычный HTML. Перед деплоем скрипт `tools/deploy-site.sh` подтягивает свежий production `posts.json` и запускает:

```sh
node tools/generate-seo-pages.mjs
```

Скрипт читает `assets/telegram/posts.json`, создаёт страницы `/screenshots/<id>/`, статический индекс `/screenshots/posts/` и обновляет `sitemap.xml`.

## Telegram live import

Для будущих постов используется Telegram Bot API webhook:

1. Создать бота через BotFather и добавить его админом в канал.
2. На VPS создать `/etc/tomilov-telegram-live.env` по примеру `ops/telegram-live-importer.env.example`.
3. Подключить nginx location из `ops/nginx-telegram-webhook.conf.example`.
4. Установить systemd unit по примеру `ops/telegram-live-importer.service.example`.
5. Привязать webhook:

```sh
TELEGRAM_BOT_TOKEN=... \
TELEGRAM_WEBHOOK_SECRET=... \
TELEGRAM_WEBHOOK_URL=https://tomilov.com/telegram/webhook \
  ./tools/set-telegram-webhook.sh
```

Сервис обновляет тот же `assets/telegram/posts.json`, а новые медиа кладёт в S3 под `assets/telegram/live/...`.
Путь `POSTS_JSON_PATH` в `/etc/tomilov-telegram-live.env` должен совпадать с shared storage, на который указывает публичный `/var/www/tomilov.com/current/assets/telegram`.
Для live-медиа nginx проксирует `/assets/telegram/live/...` в Timeweb S3; пример location лежит в `ops/nginx-telegram-webhook.conf.example`.

## Framer snapshot

`framer-snapshot/` — архивная копия опубликованного Framer-вывода по состоянию на момент миграции. Это не основной исходник для правок, а референс для сверки. Отдельные CSS-архивы лежат в `framer-snapshot/styles/`.

Повторить snapshot можно командой:

```sh
node tools/snapshot-framer.mjs
```
