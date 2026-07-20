# tomilov.com

Чистая статическая версия сайта, перенесённая с Framer. Основной редактируемый код лежит в корне проекта:

- `/` — home canvas: интерактивная карта постов, фото и тематических лучей.
- `/about/` — страница с выступлениями и видео.
- `/screenshots/` — архив канала Screenshot of the Day.
- `/photos/` — фотолента для личных снимков.
- `/photos/film/` и `/photos/iphone/` — тематические срезы фотоленты.
- `/places/` — карта/индекс мест из личных маршрутов и фотографий.
- `/barcelona-guide/` — личный гайд по местам в Барселоне.
- `/en/` — английская версия сайта с теми же разделами и URL под префиксом `/en`.

Главные файлы:

- `index.html`, `about/index.html`, `photos/index.html`, `photos/film/index.html`, `photos/iphone/index.html`, `places/index.html`, `barcelona-guide/index.html` — структура страниц.
- `screenshots/index.html` — коллекция наблюдений с поиском и тематическими фильтрами.
- `styles.css` — общий дизайн, сетки, адаптив и темы.
- `script.js` — маленький загрузчик; полный native-web runtime находится в `assets/js/features.js` и подключается только на интерактивных страницах.
- `assets/canvas/{ru,en}-*.json` — тематические чанки карточек главного холста.
- `assets/` — favicon, OG-картинка и превью видео.
- `assets/barcelona-guide/**` — локальная рабочая копия изображений гида; игнорируется git и живёт в production shared storage.
- `assets/photos/photos.json` — манифест личных фото; оригиналы лежат в `assets/photos/originals/**`, игнорируются git и живут в shared storage.
- `assets/telegram/posts.json` и `assets/telegram/**` — импортированные посты и медиа из Telegram.
- `feed.xml`, `screenshots/feed.xml`, `photos/feed.xml` — RSS-фиды сайта, блога и фотоленты.
- `docs/ops-runbook.md` — production-проверки, логи, сервисы и ручной refresh.
- `tools/photo_upload_server.py` — upload-endpoint для Apple Shortcut.
- `tools/import-telegram-export.mjs` — повторяемый импорт Telegram Desktop export.
- `tools/generate-seo-pages.mjs` — генерация статических страниц постов, индексов, RSS и `sitemap.xml`.
- `tools/generate_telegram_seo.py` — production refresh страниц блога, RSS и `sitemap.xml` после Telegram webhook.
- `tools/generate_photo_seo.py` — production refresh фото-страниц, RSS и `sitemap.xml` после upload.
- `tools/translate-content.mjs` — LLM-перевод постов и фото в `translations.en`.
- `tools/telegram_live_importer.py` — webhook-сервис для новых постов из Telegram.
- `tools/deploy-site.sh` — production deploy и data-only refresh для фото.
- `ops/` — примеры nginx/systemd/env для Telegram importer и photo upload.

## Локальный запуск

```sh
python3 -m http.server 4173
```

После запуска сайт доступен на `http://127.0.0.1:4173/`.

## Проверка

Перед коммитом и деплоем:

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm run generate
git diff --exit-code
```

`tools/check-secrets.py` проверяет, что в Git не попали приватные ключи, env-файлы, медиа-хранилища или токены известных форматов. Для ручной проверки истории используйте `python3 tools/check-secrets.py --history`.

`tools/check-site.py` проверяет внутренние ссылки, JSON-манифесты, XML, sitemap и наличие русских и английских страниц для каждого поста и фото. GitHub Actions повторяет эти проверки, проверяет синтаксис Python, JavaScript и shell-скриптов и подтверждает, что генерация не оставляет diff.

## Деплой

Это обычный статический сайт без сборки. На Timeweb он публикуется одной командой:

```sh
./tools/deploy-site.sh
```

Скрипт читает настройки из ignored-файла `.deploy/deploy.env`; пример лежит в `ops/deploy.env.example`. В репозитории не должны храниться реальные `SERVER`, `DEPLOY_KEY`, `REMOTE_ROOT` и `REMOTE_STORAGE_ROOT`.

Скрипт упаковывает только чистый сайт из корня проекта, отправляет архив на сервер и переключает `$REMOTE_ROOT/current` на новый release.
Production-хранилище лежит отдельно в `$REMOTE_STORAGE_ROOT`.
Telegram-архив живёт отдельно в `$REMOTE_STORAGE_ROOT/shared/assets/telegram/`, чтобы не упаковывать 10+ GB медиа в каждый release.
Фото живут в `$REMOTE_STORAGE_ROOT/shared/assets/photos/`, по той же модели shared storage.
Изображения Barcelona Guide живут в `$REMOTE_STORAGE_ROOT/shared/assets/barcelona-guide/` и подключаются в release через symlink.
Публичные пути остаются прежними через symlink: `$REMOTE_ROOT/current/assets/telegram`, `$REMOTE_ROOT/current/assets/photos` и `$REMOTE_ROOT/current/assets/barcelona-guide`.

По умолчанию production shared storage считается источником правды для `posts.json` и `photos.json`: перед SEO-генерацией деплой скачивает свежие JSON из `$REMOTE_STORAGE_ROOT/shared/assets/**`, создаёт страницы, RSS и `sitemap.xml`, а затем выкладывает новый release. Это нужно, чтобы live-посты из Telegram и новые фото с телефона не терялись при обычном деплое.

Медиа синхронизируются в сторону сервера аддитивно, без `--delete`, и без перезаписи `posts.json`. Это защищает live-медиа, которые появились на сервере после Telegram webhook.
Изображения Barcelona Guide также синхронизируются аддитивно и не входят в Git или release-архив.

Если нужен другой storage root, передайте его явно или положите в `.deploy/deploy.env`:

```sh
REMOTE_STORAGE_ROOT=/srv/example-data ./tools/deploy-site.sh
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
PULL_REMOTE_POSTS=0 PUSH_LOCAL_TELEGRAM=1 ./tools/deploy-site.sh
```

Можно также загрузить корень репозитория на Cloudflare Pages, GitHub Pages, Netlify, Vercel static или любой Nginx.

Для `tomilov.com`:

После деплоя проверить `https://tomilov.com/`, `https://tomilov.com/about/`, `https://tomilov.com/screenshots/`, `https://tomilov.com/photos/`, `https://tomilov.com/places/` и `https://tomilov.com/barcelona-guide/`.

## Фото

Фотолента живёт на `/photos/` и читает `assets/photos/photos.json`. Оригиналы лежат рядом в `assets/photos/originals/**`; production release подключает `assets/photos` как symlink на shared storage, чтобы опубликованные снимки не терялись при деплое.

Публикация работает через Apple Shortcut, а не через публичную форму на сайте. Shortcut отправляет оригинальный файл на `POST /photos/upload`, а маленький Python-сервис сохраняет файл и обновляет `photos.json`.

1. Создать production env-файл по примеру `ops/photo-upload.env.example`.
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

HDR/Ultra HDR поддерживается сохранением исходного файла без canvas, ресайза и перекодирования. Shortcut должен отправлять оригинальный HEIC/JPEG как файл. HDR-снимок показывается прямо в ленте из оригинала с `dynamic-range-limit: no-limit`; для SDR-снимков генератор создаёт варианты 480/960/1440 px в WebP с JPEG fallback. Полноэкранный просмотр всегда использует оригинал.

После каждой успешной загрузки сервис запускает production SEO-генератор `tools/generate_photo_seo.py`. Новые фото получают страницы `/photos/<id>/`, попадают в `/photos/archive/`, тематические срезы `/photos/film/` и `/photos/iphone/`, `/photos/feed.xml`, `/feed.xml` и в `sitemap.xml`. Фотографии опубликованы по лицензии CC BY 4.0: использовать можно с указанием авторства и ссылки на страницу фото.

## SEO-генерация

Посты из Telegram-архива и фотографии должны быть доступны краулерам как обычный HTML. Перед деплоем скрипт `tools/deploy-site.sh` подтягивает свежие production `posts.json` и `photos.json`, затем запускает:

```sh
node tools/generate-seo-pages.mjs
```

Скрипт читает `assets/telegram/posts.json` и `assets/photos/photos.json`, создаёт страницы `/screenshots/<id>/`, `/photos/<id>/`, английские пары `/en/screenshots/<id>/`, `/en/photos/<id>/`, статические индексы, JSON-LD, RSS и `sitemap.xml`.

RSS-фиды генерируются из тех же данных:

- `/feed.xml` — общий фид сайта.
- `/screenshots/feed.xml` — новые посты Screenshot of the Day.
- `/photos/feed.xml` — новые фотографии.
- `/en/feed.xml`, `/en/screenshots/feed.xml`, `/en/photos/feed.xml` — английские RSS-фиды.

## Английская версия

Английские страницы берут переводы из поля `translations.en` в `assets/telegram/posts.json` и `assets/photos/photos.json`. Если перевода ещё нет, генераторы оставляют исходный текст как fallback, но интерфейс, URL, даты, фиды и SEO-разметка уже английские.

В шапке справа есть текстовый переключатель `рус/eng`. Ссылки ведут на реальные статические URL, а `script.js` перехватывает клик и подменяет страницу через `fetch` + `history.pushState`, без полной перезагрузки. Если JavaScript выключен, ссылки работают как обычная навигация.

Разовый или регулярный перевод:

```sh
OPENAI_API_KEY=... node tools/translate-content.mjs --limit 20 --status draft
node tools/generate-seo-pages.mjs
```

Скрипт переводит только записи без `translations.en`, сохраняет результат в JSON и помечает модель, дату и статус. Для проверки очереди без API:

```sh
node tools/translate-content.mjs --dry-run --limit 20
```

## Telegram live import

Для будущих постов используется Telegram Bot API webhook:

1. Создать бота через BotFather и добавить его админом в канал.
2. На VPS создать production env-файл по примеру `ops/telegram-live-importer.env.example`.
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
Путь `POSTS_JSON_PATH` в production env должен совпадать с shared storage, на который указывает публичный `$REMOTE_ROOT/current/assets/telegram`.
Для live-медиа nginx проксирует `/assets/telegram/live/...` в Timeweb S3; пример location лежит в `ops/nginx-telegram-webhook.conf.example`.

## Framer snapshot

`framer-snapshot/` — архивная копия опубликованного Framer-вывода по состоянию на момент миграции. Это не основной исходник для правок, а референс для сверки. Отдельные CSS-архивы лежат в `framer-snapshot/styles/`.

Повторить snapshot можно командой:

```sh
node tools/snapshot-framer.mjs
```
