# Project TODO

## SEO / Indexing

- [x] Generate static pages for all Telegram posts.
- [x] Add all post pages to `sitemap.xml`.
- [x] Add per-post metadata and JSON-LD.
- [x] Add static archive pagination or a complete static link graph.
- [x] Add RSS feeds for the site, screenshots, and photos.
- [x] Decide AI crawler policy in `robots.txt`.
- [x] Submit sitemap to Google Search Console.
- [x] Submit sitemap to Yandex Webmaster.

## Site Design

- [x] Decide whether `/screenshots/` is a blog, archive, or feed product.
- [ ] Define desired information architecture beyond home/about/screenshots.
- [ ] Rewrite `/screenshots/` intro around the product frame: public collection of observations about digital products, design, interfaces, technology, and beautiful things.
- [ ] Explore discovery mechanics: themes, series, related posts, search, best-of, or tags.
- [ ] Design a single post page template.
- [ ] Review mobile rendering for long posts and media-heavy posts.

## Product Ideas

- [ ] Add English versions of the site and post pages.
- [ ] Add a "Обсудить" link to each blog card, pointing to the original Telegram post.
- [x] Create a "Фотолента" section for sharing photography.
- [ ] Design a "related posts" mechanic.
- [ ] Replace the Miro embed on the home page with a custom canvas containing scattered blog post previews.

## Photos

- [x] Add `/photos/` photo feed.
- [x] Add token-protected upload endpoint for Apple Shortcut publishing.
- [x] Preserve originals for HDR/Ultra HDR display.
- [x] Add static per-photo URLs and SEO metadata.
- [x] Make `PHOTOS_ONLY=1` a data-only production photo refresh that does not redeploy blog pages.
- [ ] Verify HDR rendering on a real HDR phone/display after production deploy.

## Telegram Import

- [x] Verify live importer status on production.
- [ ] Document how to rotate Telegram bot secrets and S3 credentials.
- [x] Build generated static pages after each live import.
- [x] Document logs review for Telegram SEO regeneration failures.
- [ ] Add automated monitoring for Telegram SEO regeneration failures.

## Infra / Deploy

- [ ] Document production nginx config beyond the examples in `ops/`.
- [ ] Add a deploy verification checklist.
- [ ] Add a lightweight production smoke test for photo upload rejection/acceptance paths.
- [ ] Consider cache headers for generated HTML, JSON, CSS, JS, and media.

## Project Memory

- [ ] Keep important decisions in `docs/decisions/`.
- [ ] Keep architecture notes in `docs/architecture.md`.
- [ ] Keep indexing notes in `docs/seo-plan.md`.
