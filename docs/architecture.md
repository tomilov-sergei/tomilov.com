# tomilov.com Architecture

This file is the project map for future Codex chats.

## Current Product

`tomilov.com` is a personal static site with three public sections:

- `/` - home page with a Miro live embed.
- `/about/` - talks, videos, and personal profile material.
- `/screenshots/` - archive of the Telegram channel "Screenshot of the Day".

## Runtime Stack

- Static HTML, CSS, and vanilla JavaScript.
- Served by nginx on Ubuntu.
- No React, Next.js, Astro, CMS, or build step in the current production runtime.
- Framer output exists only as an archived reference in `framer-snapshot/`.

## Key Files

- `index.html` - home page.
- `about/index.html` - about page.
- `screenshots/index.html` - Telegram archive page.
- `styles.css` - shared styles.
- `script.js` - YouTube activation and Telegram feed rendering.
- `assets/telegram/posts.json` - imported Telegram post database.
- `tools/import-telegram-export.mjs` - one-off/repeatable Telegram Desktop export importer.
- `tools/telegram_live_importer.py` - Telegram Bot API webhook importer for new posts.
- `tools/deploy-site.sh` - production deployment script.
- `ops/` - nginx/systemd/env examples for live Telegram import.

## Content Flow

Telegram content currently flows into the site in two ways:

1. Historical export:
   Telegram Desktop export -> `tools/import-telegram-export.mjs` -> `assets/telegram/posts.json` and local media.

2. Live import:
   Telegram Bot API webhook -> nginx `/telegram/webhook` -> Python service on `127.0.0.1:8787` -> `posts.json` and media upload.

Production serves live Telegram media through nginx `/assets/telegram/live/...` proxying to Timeweb S3.
The live importer's `POSTS_JSON_PATH` must point to the same shared `assets/telegram/posts.json` that nginx exposes through `/var/www/tomilov.com/current/assets/telegram`.

## Telegram Storage Policy

Production shared storage is the source of truth for live Telegram content:

- `shared/assets/telegram/posts.json` is pulled from production before SEO page generation during deploy.
- Local `assets/telegram/` is a working mirror, not the default authority.
- Media deploys are additive by default and do not use `--delete`, so server-side live media is not removed by an older local copy.
- Use `SYNC_MEDIA_FROM_REMOTE=1` when the local media mirror should catch up with production.
- Use `PULL_REMOTE_POSTS=0 PUSH_LOCAL_TELEGRAM=1` only after an intentional local Telegram import that should replace production `posts.json`.

## Deployment

The deploy script packages the static site, uploads it to the VPS, creates a timestamped release, and switches `/var/www/tomilov.com/current` to the new release.

Telegram media is synced separately into shared storage so large media files are not packed into every release.

## Project Memory Rule

Use this workspace as the canonical memory. Chats are for focused work; important conclusions should be written into `docs/`.
