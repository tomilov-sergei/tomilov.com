# Project TODO

## SEO / Indexing

- [x] Generate static pages for all Telegram posts.
- [x] Add all post pages to `sitemap.xml`.
- [x] Add per-post metadata and JSON-LD.
- [x] Add static archive pagination or a complete static link graph.
- [x] Decide AI crawler policy in `robots.txt`.
- [x] Submit sitemap to Google Search Console.
- [x] Submit sitemap to Yandex Webmaster.

## Site Design

- [ ] Define desired information architecture beyond home/about/screenshots.
- [ ] Decide whether `/screenshots/` is a blog, archive, or feed product.
- [ ] Design a single post page template.
- [ ] Review mobile rendering for long posts and media-heavy posts.

## Telegram Import

- [ ] Verify live importer status on production.
- [ ] Document how to rotate Telegram bot secrets and S3 credentials.
- [ ] Decide whether generated static pages should be built after each live import.

## Infra / Deploy

- [ ] Document production nginx config beyond the examples in `ops/`.
- [ ] Add a deploy verification checklist.
- [ ] Consider cache headers for generated HTML, JSON, CSS, JS, and media.

## Project Memory

- [ ] Keep important decisions in `docs/decisions/`.
- [ ] Keep architecture notes in `docs/architecture.md`.
- [ ] Keep indexing notes in `docs/seo-plan.md`.
