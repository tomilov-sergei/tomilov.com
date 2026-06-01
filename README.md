# tomilov.com

Чистая статическая версия сайта, перенесённая с Framer. Основной редактируемый код лежит в корне проекта:

- `/` — Miro live embed.
- `/about/` — страница с выступлениями и видео.
- `/screenshots/` — архив канала Screenshot of the Day.
- `/photos/` — фотолента для личных снимков.

Главные файлы:

- `index.html`, `about/index.html`, `photos/index.html` — структура страниц.
- `screenshots/index.html` — страница архива Telegram-канала.
- `styles.css` — общий дизайн, сетки, адаптив и темы.
- `script.js` — включение YouTube-видео по клику, лента Telegram-архива и фотолента.
- `assets/` — favicon, OG-картинка и превью видео.
- `assets/photos/photos.json` — манифест личных фото; оригиналы лежат в `assets/photos/originals/**`, игнорируются git и живут в shared storage.
- `assets/telegram/posts.json` и `assets/telegram/**` — импортированные посты и медиа из Telegram.
- `feed.xml`, `screenshots/feed.xml`, `photos/feed.xml` — RSS-фиды сайта, блога и фотоленты.
- `tools/photo_upload_server.py` — upload-endpoint для Apple Shortcut.
- `tools/import-telegram-export.mjs` — повторяемый импорт Telegram Desktop export.
- `tools/generate-seo-pages.mjs` — генерация статических страниц постов, индексов, RSS и `sitemap.xml`.
- `tools/generate_telegram_seo.py` — production refresh страниц блога, RSS и `sitemap.xml` после Telegram webhook.
- `tools/generate_photo_seo.py` — production refresh фото-страниц, RSS и `sitemap.xml` после upload.
- `tools/telegram_live_importer.py` — webhook-сервис для новых постов из Telegram.
- `tools/deploy-site.sh` — production deploy и data-only refresh для фото.
- `ops/` — примеры nginx/systemd/env для Telegram importer и photo upload.

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
Production-хранилище по умолчанию лежит на втором диске: `/mnt/tomilov-data/tomilov.com`.
Telegram-архив живёт отдельно в `/mnt/tomilov-data/tomilov.com/shared/assets/telegram/`, чтобы не упаковывать 10+ GB медиа в каждый release.
Фото живут в `/mnt/tomilov-data/tomilov.com/shared/assets/photos/`, по той же модели shared storage.
Публичные пути остаются прежними через symlink: `/var/www/tomilov.com/current/assets/telegram` и `/var/www/tomilov.com/current/assets/photos`.

По умолчанию production shared storage считается источником правды для `posts.json` и `photos.json`: перед SEO-генерацией деплой скачивает свежие JSON из `/mnt/tomilov-data/tomilov.com/shared/assets/**`, создаёт страницы, RSS и `sitemap.xml`, а затем выкладывает новый release. Это нужно, чтобы live-посты из Telegram и новые фото с телефона не терялись при обычном деплое.

Медиа синхронизируются в сторону сервера аддитивно, без `--delete`, и без перезаписи `posts.json`. Это защищает live-медиа, которые появились на сервере после Telegram webhook.

Если нужен другой storage root, передайте его явно:

```sh
REMOTE_STORAGE_ROOT=/path/to/tomilov.com ./tools/deploy-site.sh
```

Если нужно переключить только код сайта без повторной синхронизации медиа:

```sh
SKIP_MEDIA_SYNC=1 ./tools/deploy-site.sh
```

Если нужно только обновить production-фото из shared storage и нельзя трогать код, стили или страницы блога:

```sh
PHOTOS_ONLY=1 ./tools/deploy-site.sh
```

Этот режим не собирает новый release и не упаковывает локальные `screenshots/**`. Он запускает production `tools/generate_photo_seo.py` в текущем release и обновляет только `/photos/**`, `/photos/feed.xml`, `/feed.xml` и `sitemap.xml`. Если локальная копия фото должна стать источником правды, используйте `PULL_REMOTE_PHOTOS=0 PUSH_LOCAL_PHOTOS=1 PHOTOS_ONLY=1 ./tools/deploy-site.sh`.

Если нужно подтянуть серверные медиа обратно в локальную копию:

```sh
SYNC_MEDIA_FROM_REMOTE=1 ./tools/deploy-site.sh
```

Если после ручного локального импорта Telegram нужно сделать локальный `posts.json` источником правды и отправить его на сервер:

```sh
PULL_REMOTE_POSTS=0 PUSH_LOCAL_TELEGRAM=1 REMOTE_STORAGE_ROOT=/mnt/tomilov-data/tomilov.com ./tools/deploy-site.sh
```

Можно также загрузить корень репозитория на Cloudflare Pages, GitHub Pages, Netlify, Vercel static или любой Nginx.

Для `tomilov.com`:

После деплоя проверить `https://tomilov.com/`, `https://tomilov.com/about/`, `https://tomilov.com/screenshots/` и `https://tomilov.com/photos/`.

## Фото

Фотолента живёт на `/photos/` и читает `assets/photos/photos.json`. Оригиналы лежат рядом в `assets/photos/originals/**`; production release подключает `assets/photos` как symlink на shared storage, чтобы опубликованные снимки не терялись при деплое.

Публикация работает через Apple Shortcut, а не через публичную форму на сайте. Shortcut отправляет оригинальный файл на `POST /photos/upload`, а маленький Python-сервис сохраняет файл и обновляет `photos.json`.

1. Создать `/etc/tomilov-photo-upload.env` по примеру `ops/photo-upload.env.example`.
2. Подключить nginx location из `ops/nginx-photo-upload.conf.example`.
3. Установить systemd unit по примеру `ops/photo-upload.service.example`.
4. Создать Apple Shortcut:
   - принять `Images` и `Files` из Share Sheet;
   - не использовать `Convert Image`, `Resize Image`, `Make JPEG` и другие transform actions;
   - отправить `Get Contents of URL` на `https://tomilov.com/photos/upload`;
   - метод `POST`;
   - заголовок `Authorization: Bearer <PHOTO_UPLOAD_TOKEN>`;
   - request body `File`;
   - File — исходный Shortcut Input или Repeat Item;
   - опционально заголовок `X-Photo-Caption` — подпись.

HDR/Ultra HDR поддерживается сохранением исходного файла без canvas, ресайза и перекодирования. Shortcut должен отправлять оригинальный HEIC/JPEG как файл. Лента показывает тот же оригинал лениво, а режим просмотра крупного снимка использует CSS `dynamic-range-limit: no-limit` там, где браузер и дисплей это поддерживают.

После каждой успешной загрузки сервис запускает production SEO-генератор `tools/generate_photo_seo.py`. Новые фото получают страницы `/photos/<id>/`, попадают в `/photos/archive/`, `/photos/feed.xml`, `/feed.xml` и в `sitemap.xml`. Фотографии опубликованы по лицензии CC BY 4.0: использовать можно с указанием авторства и ссылки на страницу фото.

## SEO-генерация

Посты из Telegram-архива и фотографии должны быть доступны краулерам как обычный HTML. Перед деплоем скрипт `tools/deploy-site.sh` подтягивает свежие production `posts.json` и `photos.json`, затем запускает:

```sh
node tools/generate-seo-pages.mjs
```

Скрипт читает `assets/telegram/posts.json` и `assets/photos/photos.json`, создаёт страницы `/screenshots/<id>/`, `/photos/<id>/`, статические индексы `/screenshots/posts/` и `/photos/archive/`, добавляет `ImageObject`/`BlogPosting` JSON-LD и обновляет `sitemap.xml`.

RSS-фиды генерируются из тех же данных:

- `/feed.xml` — общий фид сайта.
- `/screenshots/feed.xml` — новые посты Screenshot of the Day.
- `/photos/feed.xml` — новые фотографии.

## Telegram live import

Для будущих постов используется Telegram Bot API webhook:

1. Создать бота через BotFather и добавить его админом в канал.
2. На VPS создать `/etc/tomilov-telegram-live.env` по примеру `ops/telegram-live-importer.env.example`.
3. Подключить nginx location из `ops/nginx-telegram-webhook.conf.example`.
4. Установить systemd unit `/etc/systemd/system/tomilov-telegram-live.service` по примеру `ops/telegram-live-importer.service.example`.
5. Привязать webhook:

```sh
TELEGRAM_BOT_TOKEN=... \
TELEGRAM_WEBHOOK_SECRET=... \
TELEGRAM_WEBHOOK_URL=https://tomilov.com/telegram/webhook \
  ./tools/set-telegram-webhook.sh
```

Сервис обновляет тот же `assets/telegram/posts.json`, новые медиа кладёт в S3 под `assets/telegram/live/...`, а затем запускает production SEO-генератор `tools/generate_telegram_seo.py`. Новые посты получают постоянные страницы `/screenshots/<id>/`, попадают в `/screenshots/posts/`, `/screenshots/feed.xml`, `/feed.xml` и `sitemap.xml` без ожидания следующего полного деплоя.
Путь `POSTS_JSON_PATH` в `/etc/tomilov-telegram-live.env` должен совпадать с shared storage, на который указывает публичный `/var/www/tomilov.com/current/assets/telegram`.
Для live-медиа nginx проксирует `/assets/telegram/live/...` в Timeweb S3; пример location лежит в `ops/nginx-telegram-webhook.conf.example`.

## Framer snapshot

`framer-snapshot/` — архивная копия опубликованного Framer-вывода по состоянию на момент миграции. Это не основной исходник для правок, а референс для сверки. Отдельные CSS-архивы лежат в `framer-snapshot/styles/`.

Повторить snapshot можно командой:

```sh
node tools/snapshot-framer.mjs
```
