# 0001: Generate Static Pages for Telegram Posts

## Status

Accepted

## Context

At the time of this decision, the `/screenshots/` archive loaded all Telegram posts from `assets/telegram/posts.json` with client-side JavaScript.

This is pleasant enough for a feed UI, but weak for search engines and LLM crawlers:

- Individual posts have no canonical URLs.
- The production sitemap listed only top-level pages.
- Crawlers may not execute all JavaScript.
- Crawlers do not click the "load more" button.

## Decision

Create a static generation step that turns each Telegram post into a standalone HTML page under `/screenshots/<post-id>/`.

The generator should also update sitemap entries and preserve the current static-site deployment model.

## Consequences

Benefits:

- Posts become indexable web pages.
- Links can be shared directly.
- Search engines and LLM crawlers get plain HTML.
- The site remains simple and static.

Costs:

- The deploy/import workflow needs one more generation step.
- Live Telegram import should eventually trigger regeneration or mark regeneration as a required deploy step.
- The archive needs a link graph so all generated pages are discoverable.

## Implementation

Implemented with `tools/generate-seo-pages.mjs`.

The generator reads `assets/telegram/posts.json`, writes one page per post under `/screenshots/<post-id>/`, writes a complete static index at `/screenshots/posts/`, regenerates `sitemap.xml` with post URLs and `lastmod` values, and writes `/screenshots/feed.xml`.

`tools/deploy-site.sh` runs the generator before packaging the static site.

Live Telegram import also runs `tools/generate_telegram_seo.py` as a best-effort production refresh after `posts.json` changes, so new posts get static pages, RSS entries, and sitemap entries without waiting for the next full deploy.
