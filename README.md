# tomilov.com

Чистая статическая версия сайта, перенесённая с Framer. Основной редактируемый код лежит в корне проекта:

- `/` — Miro live embed.
- `/about/` — страница с выступлениями и видео.

Главные файлы:

- `index.html`, `about/index.html` — структура страниц.
- `styles.css` — общий дизайн, сетки, адаптив и темы.
- `script.js` — включение YouTube-видео по клику.
- `assets/` — favicon, OG-картинка и превью видео.

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

Можно также загрузить корень репозитория на Cloudflare Pages, GitHub Pages, Netlify, Vercel static или любой Nginx.

Для `tomilov.com`:

После деплоя проверить `https://tomilov.com/` и `https://tomilov.com/about/`.

## Framer snapshot

`framer-snapshot/` — архивная копия опубликованного Framer-вывода по состоянию на момент миграции. Это не основной исходник для правок, а референс для сверки. Отдельные CSS-архивы лежат в `framer-snapshot/styles/`.

Повторить snapshot можно командой:

```sh
node tools/snapshot-framer.mjs
```
