# tomilov.com Architecture

This file is the project map for future Codex chats.

## Current Product

`tomilov.com` is a personal static site with several public sections:

- `/` - home canvas with thematic rays, post/photo cards, pan/zoom, draggable cards, and in-place post overlay.
- `/about/` - talks, videos, and personal profile material.
- `/screenshots/` - archive of the Telegram channel "Screenshot of the Day".
- `/photos/` - personal photo feed.
- `/photos/film/` and `/photos/iphone/` - thematic photo feed slices.
- `/places/` - places index for personal routes and photo contexts.
- `/barcelona-guide/` - curated Barcelona places and routes.
- `/research/` - editorial index of public research reports and evidence-led essays.
- `/en/**` - English mirrors of the public pages, posts, photo pages, feeds, and indexes.

Product direction for `/screenshots/`: a public collection of observations about digital products, design, interfaces, technology, and beautiful things. Telegram is the publishing source; the site should be the durable, searchable, indexable, and navigable version of that thinking. See `docs/product.md`.

## Runtime Stack

- Static HTML, CSS, and vanilla JavaScript.
- Served by nginx on Ubuntu.
- No React, Next.js, Astro, CMS, or build step in the current production runtime.
- Node.js 24 LTS is the pinned development and CI toolchain for generation, PostCSS, Stylelint, Browserslist, and size budgets; production remains static and does not require Node.js.
- Framer output exists only as an archived reference in `framer-snapshot/`.

## Key Files

- `index.html` - home page.
- `about/index.html` - about page.
- `screenshots/index.html` - Telegram archive page.
- `photos/index.html` - public photo feed.
- `photos/film/index.html`, `photos/iphone/index.html` - curated photo subsets.
- `places/index.html` - places index.
- `barcelona-guide/index.html` - curated Barcelona guide.
- `research/index.html`, `en/research/index.html` - localized research indexes.
- `research/*/index.html` - manually art-directed public research reports.
- `assets/css/research.css` - namespaced editorial styles shared by research indexes and reports.
- `assets/research/**` - social-preview assets for the research collection.
- `assets/barcelona-guide/**` - local working mirror of guide images; ignored by Git and stored in production shared storage.
- `styles.css` - shared styles.
- `script.js` - small route-aware bootstrap; it loads `assets/js/features.js` only on pages that need the full interactive runtime.
- `assets/canvas/{ru,en}-*.json` - generated, thematic home-canvas content chunks loaded only when a nearby card needs hydration.
- `assets/telegram/posts.json` - imported Telegram post database.
- `assets/photos/photos.json` - uploaded photo manifest.
- `feed.xml`, `screenshots/feed.xml`, `photos/feed.xml` - RSS feeds generated from the same manifests as SEO pages.
- `en/feed.xml`, `en/screenshots/feed.xml`, `en/photos/feed.xml` - English RSS feeds generated from the same manifests.
- `tools/import-telegram-export.mjs` - one-off/repeatable Telegram Desktop export importer.
- `tools/telegram_live_importer.py` - Telegram Bot API webhook importer for new posts.
- `tools/photo_upload_server.py` - token-protected Apple Shortcut upload endpoint.
- `tools/generate_telegram_seo.py` - production refresh for blog pages, RSS, and sitemap after Telegram webhook updates.
- `tools/generate_home_canvas.py` - deterministic static generation of every home-canvas card into `index.html` and `en/index.html`.
- `tools/generate_photo_previews.py` - lightweight canvas previews plus 480/960/1440 WebP and JPEG feed derivatives for SDR photos; HDR photos keep the untouched original as the feed source.
- `tools/translate-content.mjs` - OpenAI-backed translation backfill for `translations.en`.
- `tools/deploy-site.sh` - production deployment script.
- `tools/check-site.py` - static integrity check for links, manifests, generated pages, feeds, and sitemap.
- `tools/check-secrets.py` - committed-secret guard for tracked files and optional history scanning.
- `ops/` - nginx/systemd/env examples for live Telegram import and photo upload.
- `.github/workflows/validate.yml` - GitHub Actions validation for syntax, integrity, and deterministic generation.

## Content Flow

Telegram content currently flows into the site in two ways:

1. Historical export:
   Telegram Desktop export -> `tools/import-telegram-export.mjs` -> `assets/telegram/posts.json` and local media.

2. Live import:
   Telegram Bot API webhook -> nginx `/telegram/webhook` -> Python service on `127.0.0.1:8787` -> `posts.json`, media upload, and `tools/generate_telegram_seo.py`.

Production serves live Telegram media through nginx `/assets/telegram/live/...` proxying to Timeweb S3.
The live importer's `POSTS_JSON_PATH` must point to the same shared `assets/telegram/posts.json` that nginx exposes through `$REMOTE_ROOT/current/assets/telegram`.

Photo content flows through a token-protected Apple Shortcut endpoint:

Apple Photos share sheet -> Apple Shortcut -> `/photos/upload` -> Python service on `127.0.0.1:8788` -> `assets/photos/photos.json` and `assets/photos/originals/**`.

Photo originals are intentionally stored without canvas processing, resizing, or transcoding so HDR/Ultra HDR metadata and gain maps can survive. The Shortcut must not use image transform actions. The upload service validates the token and file signature, detects embedded Apple/ISO 21496 HDR gain maps, then stores the original bytes. Deploys backfill missing HDR flags from shared originals before generating previews and pages. The browser is responsible for actual HDR display support.

Static SEO pages, sitemap, and RSS are generated from `assets/telegram/posts.json` and `assets/photos/photos.json`. The full deploy path uses `tools/generate-seo-pages.mjs`. The production Telegram webhook path uses `tools/generate_telegram_seo.py` so new posts update `/screenshots/<id>/`, `/screenshots/feed.xml`, `/feed.xml`, and `sitemap.xml` immediately. The production photo upload path uses `tools/generate_photo_seo.py` so new photos update `/photos/**`, `/photos/feed.xml`, `/feed.xml`, and `sitemap.xml` immediately. Both production refresh generators are Python-only, so they do not require Node.js on the VPS.

Research reports are curated static pages rather than manifest-generated content. Both sitemap generators must list the research indexes and each published report explicitly so live Telegram or photo refreshes cannot remove them. Internal or third-party-confidential research must not enter the public tree; `noindex` is not an access-control mechanism.

Both production refresh generators also call `tools/generate_home_canvas.py`. The home page therefore contains static lightweight links for every post and photo and does not download either full manifest at runtime. Card bodies live in thematic JSON chunks and are hydrated only near the visible canvas viewport.

Personal photo cards use generated files under `assets/photos/canvas/`. The photo generator creates missing previews with ffmpeg before refreshing the home canvas, while permanent photo pages continue to use the original HDR-capable files.

English content lives beside source records in `translations.en`. Generators write `/en/**` pages from those translations and fall back to the source Russian text while a translation is missing. The header language switcher links to real static counterpart URLs and `script.js` swaps pages through `fetch` and `history.pushState` when JavaScript is available.

## Telegram Storage Policy

Production shared storage is the source of truth for live Telegram content:

- Production shared storage root is set by `REMOTE_STORAGE_ROOT` in ignored deploy config.
- Public site paths stay under `$REMOTE_ROOT/current` through release and asset symlinks.
- `shared/assets/telegram/posts.json` is pulled from production before SEO page generation during deploy.
- Local `assets/telegram/` is a working mirror, not the default authority.
- Media deploys are additive by default and do not use `--delete`, so server-side live media is not removed by an older local copy.
- Use `SYNC_MEDIA_FROM_REMOTE=1` when the local media mirror should catch up with production.
- Use `PULL_REMOTE_POSTS=0 PUSH_LOCAL_TELEGRAM=1` only after an intentional local Telegram import that should replace production `posts.json`.
- After each live import, `tools/generate_telegram_seo.py` mutates the current release to keep static post pages, RSS, and sitemap fresh.

## Photo Storage Policy

Production shared storage is also the source of truth for photos:

- `shared/assets/photos/photos.json` is the photo manifest used by the public feed and generators.
- `shared/assets/photos/originals/**` stores original uploaded files.
- Git tracks `assets/photos/photos.json` as a small reproducible manifest snapshot.
- Git ignores `assets/photos/originals/**` so original photo binaries stay in shared storage, not in the repository.
- Use `PULL_REMOTE_PHOTOS=0 PUSH_LOCAL_PHOTOS=1` only when the local photo copy should intentionally replace production photo storage.

## Deployment

Normal deploy packages the static site, uploads it to the VPS, creates a timestamped release, and switches `$REMOTE_ROOT/current` to the new release.

Telegram media is synced separately into shared storage so large media files are not packed into every release.

Photo media also lives in shared storage. Releases symlink `assets/photos` to `shared/assets/photos`, and the deploy script pulls production `photos.json` by default before packaging.

Barcelona Guide images live in `shared/assets/barcelona-guide`. They are not committed because their third-party licensing is not established. Releases expose them through an `assets/barcelona-guide` symlink, while the guide HTML remains versioned in Git.

`PHOTOS_ONLY=1 ./tools/deploy-site.sh` is not a full deploy. It runs production `tools/generate_photo_seo.py` inside the current release and refreshes only photo pages, photo RSS, the combined RSS feed, and `sitemap.xml`.

Production code must be committed and pushed before deployment. Shared Telegram and photo data remain production-owned, but HTML, CSS, JavaScript, generators, operations examples, and curated static sections must be recoverable from GitHub.

## Project Memory Rule

Use this workspace as the canonical memory. Chats are for focused work; important conclusions should be written into `docs/`.
