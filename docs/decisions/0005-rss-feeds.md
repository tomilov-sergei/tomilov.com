# 0005. RSS feeds for site updates

## Context

The site already has canonical static HTML pages, `sitemap.xml`, and machine-readable JSON manifests for Telegram posts and photos.

## Decision

Generate RSS from the same data sources:

- `/feed.xml` for combined site updates
- `/screenshots/feed.xml` for Screenshot of the Day posts
- `/photos/feed.xml` for photo updates

Pages expose the relevant feed with `<link rel="alternate" type="application/rss+xml">`.

The full deploy generator writes all three feeds. The production photo upload generator writes `/photos/feed.xml`, refreshes `/feed.xml`, and updates photo sitemap entries after every successful photo upload.

## Consequences

- People can subscribe to updates without Telegram or JavaScript.
- Crawlers and external automations get a simple freshness signal.
- RSS is not treated as a direct ranking boost; it supports discovery and re-crawl rather than replacing sitemap or structured data.
