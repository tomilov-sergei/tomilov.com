# SEO and LLM Indexing Plan

Last updated: 2026-06-01.

## Current Production Shape

`tomilov.com` is now crawlable as a static site, not just as JavaScript-fed feeds.

- `robots.txt` is open and points to `https://tomilov.com/sitemap.xml`.
- `sitemap.xml` includes top-level pages, `/screenshots/posts/`, every `/screenshots/<id>/` page, `/photos/`, `/photos/archive/`, and every `/photos/<id>/` page.
- The current generated sitemap has 648 URLs and 9 image sitemap entries for photo pages.
- `/screenshots/` still has a JavaScript-enhanced feed UI, but every post also has standalone HTML.
- `/photos/` has static content for crawlers before JavaScript runs, plus a JavaScript photo viewer for people.
- RSS feeds exist at `/feed.xml`, `/screenshots/feed.xml`, and `/photos/feed.xml`.

## Indexing Model

The site exposes two indexable content collections:

1. Screenshot of the Day:
   - canonical post URLs: `/screenshots/<post-id>/`;
   - complete static link graph: `/screenshots/posts/`;
   - `BlogPosting` JSON-LD on post pages;
   - RSS freshness signal: `/screenshots/feed.xml`.

2. Photos:
   - canonical photo URLs: `/photos/<photo-id>/`;
   - complete static link graph: `/photos/archive/`;
   - `ImageObject` JSON-LD on photo pages;
   - image sitemap metadata with title, caption, and CC BY 4.0 license;
   - RSS freshness signal: `/photos/feed.xml`.

The combined `/feed.xml` mixes recent posts and photos.

## Generation Flow

Full deploy:

1. `tools/deploy-site.sh` pulls production `assets/telegram/posts.json` and `assets/photos/photos.json`.
2. `tools/generate-seo-pages.mjs` regenerates screenshots pages, photo pages, RSS feeds, and `sitemap.xml`.
3. The deploy script publishes a timestamped release and symlinks shared media directories.

Telegram live import:

1. Telegram sends a channel update to `POST /telegram/webhook`.
2. `tools/telegram_live_importer.py` updates shared `assets/telegram/posts.json` and uploads live media.
3. The service runs `tools/generate_telegram_seo.py`.
4. Production refreshes `/screenshots/<id>/`, `/screenshots/posts/`, `/screenshots/feed.xml`, `/feed.xml`, and `sitemap.xml` inside the current release.

Photo upload:

1. Apple Shortcut sends the original file to `POST /photos/upload`.
2. `tools/photo_upload_server.py` validates the token and file signature, stores the original, and updates shared `assets/photos/photos.json`.
3. The service runs the configured SEO generator.
4. Production defaults to `tools/generate_photo_seo.py`, which refreshes `/photos/**`, `/photos/feed.xml`, `/feed.xml`, and `sitemap.xml` inside the current release.

Photo-only refresh:

```sh
PHOTOS_ONLY=1 ./tools/deploy-site.sh
```

This is a data refresh, not a code deploy. It runs the production Python generator in the current release and does not package local `screenshots/**`.

## AI Crawler Policy

Implemented in `robots.txt`:

- Allow regular crawling for the whole site.
- Allow AI search and answer discovery crawlers: `OAI-SearchBot`, `ChatGPT-User`, `Claude-SearchBot`, `Claude-User`, and `PerplexityBot`.
- Allow model-training and bulk-dataset crawlers: `GPTBot`, `ClaudeBot`, `Google-Extended`, `CCBot`, and `Applebot-Extended`.

Rationale: the owner explicitly allows models to train on this expert content.

## Webmaster Status

- Google Search Console accepted `https://tomilov.com/sitemap.xml`.
- Yandex Webmaster ownership was verified with `yandex_251bf4498768ab1a.html`; the sitemap was submitted.

Recheck both dashboards after major content or sitemap changes.

## Open Improvements

- Add topic/tag pages or another discovery layer for `/screenshots/`.
- Add related-post links to post pages.
- Add image derivatives or thumbnails for `/photos/` if original files become too heavy for the feed.
- Add monitoring around the Telegram post-import regeneration hook.
- Add a recurring check that `sitemap.xml`, RSS feeds, and key canonical pages return HTTP 200.
