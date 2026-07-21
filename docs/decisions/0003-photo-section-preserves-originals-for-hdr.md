# 0003. Photo section preserves originals for HDR

Date: 2026-05-29

## Status

Accepted

## Context

The site needs a `/photos/` section for personal photography, simple publishing from iPhone, a public feed, and a way to inspect each image separately. Some photos may be HDR/Ultra HDR.

The production runtime is still a static site with small Python services only where writes are needed.

## Decision

Photos are stored as original uploaded files under `assets/photos/originals/**`. Publishing happens through Apple Shortcut rather than a public upload form on the site. The upload service validates the token and file signature, automatically detects embedded Apple/ISO 21496 HDR gain maps, updates `assets/photos/photos.json`, and does not resize, draw to canvas, strip metadata, or transcode images. A deploy-time backfill repairs missing HDR flags in older manifest records from the untouched originals.

The public page has static photo cards for crawlers and a JavaScript-enhanced lazy-loaded photo feed for people. HDR photos use the untouched original directly in the feed and set `dynamic-range-limit: no-limit`, so HDR is visible without opening the viewer when the browser and display support it. SDR photos use generated 480/960/1440 WebP derivatives with JPEG fallbacks in the feed. The detail viewer always opens the original file.

Production deploys symlink `assets/photos` to shared storage, matching the Telegram media policy, so phone uploads survive code releases.

## Consequences

- HDR gain maps and wide-dynamic-range data have the best chance to survive because the file bytes are preserved.
- Responsive SDR derivatives keep the feed light without replacing or transcoding HDR originals.
- Browser and display support still determines whether a visitor actually sees HDR.
- If the photo library grows, add a derivative pipeline that keeps originals and creates separate previews without replacing them.
