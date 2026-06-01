# 0002: Use Production Telegram Storage as the Default Source of Truth

## Status

Accepted

## Context

Telegram live import can add new posts and media directly on the production server between manual deploys.

If deploy uses an older local `assets/telegram/posts.json`, generated SEO pages can lag behind the live JSON. If deploy also runs `rsync --delete` from the older local media directory to production, it can remove server-side live media.

## Decision

Production shared storage is the default authority for Telegram archive data.

The current production shared storage root is `/mnt/tomilov-data/tomilov.com`, mounted separately from `/var/www/tomilov.com/current`.

The deploy flow should:

1. Pull production `shared/assets/telegram/posts.json` into the local workspace.
2. Generate static post pages and `sitemap.xml` from that fresh JSON.
3. Publish a new immutable release.
4. Sync local media to production additively, without `--delete` and without overwriting `posts.json`.

Local Telegram imports can still be promoted intentionally with:

```sh
PULL_REMOTE_POSTS=0 PUSH_LOCAL_TELEGRAM=1 ./tools/deploy-site.sh
```

## Consequences

Benefits:

- Normal deploys do not overwrite live-imported Telegram posts.
- Static SEO pages catch up to live Telegram posts on the next deploy.
- Server-side live media is protected from accidental deletion.
- The release model stays simple and rollback-friendly.

Tradeoffs:

- A new Telegram post can still wait until the next deploy before it gets a static SEO page.
- Local media can drift unless `SYNC_MEDIA_FROM_REMOTE=1` is run intentionally.
- Fully automatic SEO freshness would need a scheduled deploy or a separate controlled regeneration job.
