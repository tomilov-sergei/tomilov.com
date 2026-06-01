# 0004. Photo SEO pages and CC BY license

Date: 2026-05-31

## Status

Accepted

## Context

The `/photos/` section is a showcase of best personal photographs: a small public exhibition rather than a generic image dump.

The feed was already published from Apple Shortcut through `tools/photo_upload_server.py`, which stores original files and updates `assets/photos/photos.json`. That made new photos visible to people, but not as standalone indexable documents.

## Decision

Generate static pages for every photo:

- `/photos/<photo-id>/`
- `/photos/archive/`
- static `/photos/` content for crawlers before JavaScript runs
- sitemap entries for every photo page with image sitemap metadata
- `ImageObject` JSON-LD on photo pages

Photos are published under CC BY 4.0. Reuse is allowed with attribution to Серёжа Томилов and a link to the photo page.

After every successful upload, `tools/photo_upload_server.py` runs the configured SEO generator as a best-effort step. Production defaults to `tools/generate_photo_seo.py`, which refreshes photo pages, `/photos/feed.xml`, `/feed.xml`, and `sitemap.xml` inside the current release. Full deploys use `tools/generate-seo-pages.mjs` to regenerate Telegram and photo pages together. If generation fails, the photo upload still succeeds and the error is logged.

## Consequences

- New photos become indexable without a manual deploy.
- Search engines get stable photo URLs, captions, metadata, and license information.
- Immediate photo SEO refresh does not require Node.js on the VPS. Full site regeneration still uses Node.js during normal deploys.
