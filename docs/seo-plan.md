# SEO and LLM Indexing Plan

## Current Production State

Checked on production `https://tomilov.com` on 2026-05-26:

- `robots.txt` is open and points to `https://tomilov.com/sitemap.xml`.
- `sitemap.xml` lists only `/`, `/about`, and `/screenshots/`.
- `/screenshots/` returns a small HTML shell with `Загружаю посты...`.
- Blog posts are loaded client-side from `/assets/telegram/posts.json`.
- The production JSON contains 629 posts.
- The feed renders the first 18 posts automatically; older posts require clicking `Показать ещё`.
- Individual post URLs such as `/screenshots/1993/` return 404.

## Indexing Problem

The blog is visible to people, but not reliably visible to crawlers:

- Search engines receive a mostly empty archive page before JavaScript runs.
- Crawlers do not click "load more" buttons to discover hidden content.
- LLM crawlers and answer engines usually prefer plain HTML documents with stable URLs.
- The sitemap does not expose individual posts.
- Fragments such as `/screenshots/#post-1993` are not separate canonical URLs.

## Target State

Each Telegram post should become a normal indexable web document:

- Stable URL, for example `/screenshots/1993/`.
- Full post text in server-served/static HTML.
- Canonical URL.
- Useful `<title>` and `<meta name="description">`.
- Open Graph and Twitter metadata.
- JSON-LD using `BlogPosting` or `Article`.
- Linked from archive pages.
- Included in `sitemap.xml` with `lastmod`.

## Recommended Actions

1. Add a static generation script that reads `assets/telegram/posts.json`.
2. Generate one HTML page per post under `screenshots/<id>/index.html`.
3. Generate paginated archive pages or static archive sections that link to all post pages.
4. Update `sitemap.xml` during generation.
5. Preserve the existing visual design for the feed and post pages.
6. Add redirects or canonical handling for slash/non-slash URL variants where needed.
7. Submit the updated sitemap in Google Search Console and Yandex Webmaster.
8. Decide which AI crawlers are allowed in `robots.txt`.

## AI Crawler Policy To Decide

Separate these two goals:

- Discovery in AI search/answers: generally allow search crawlers such as OpenAI's search crawler.
- Model training: decide intentionally whether to allow training crawlers such as GPTBot, ClaudeBot, or Google-Extended.

Default recommendation: allow discovery crawlers, make a deliberate separate decision on training crawlers.

## AI Crawler Policy

Implemented on 2026-05-26 in `robots.txt` and updated after product decision:

- Allow regular crawling for the whole site.
- Allow AI search and answer discovery crawlers: `OAI-SearchBot`, `ChatGPT-User`, `Claude-SearchBot`, `Claude-User`, and `PerplexityBot`.
- Allow model-training and bulk-dataset crawlers: `GPTBot`, `ClaudeBot`, `Google-Extended`, `CCBot`, and `Applebot-Extended`.

Rationale: the owner explicitly allows models to train on this expert content.

## Implementation Status

Implemented on 2026-05-26:

Sitemap submission on 2026-05-26:

- Google Search Console accepted `https://tomilov.com/sitemap.xml`; the first table status was `Couldn't fetch`, while direct Googlebot-style fetch returned HTTP 200 and 633 URLs. Recheck processing status later.
- Yandex Webmaster ownership was verified with `yandex_251bf4498768ab1a.html`; `https://tomilov.com/sitemap.xml` was added to the processing queue.


- `tools/generate-seo-pages.mjs` reads `assets/telegram/posts.json`.
- The generator writes `/screenshots/<id>/index.html` for every Telegram post.
- Each post page includes canonical URL, description, Open Graph/Twitter metadata, and `BlogPosting` JSON-LD.
- `/screenshots/posts/` is a complete static link graph for all generated post pages.
- `sitemap.xml` is regenerated with `/screenshots/posts/` and every post URL.
- `tools/deploy-site.sh` runs the generator before packaging the site.
