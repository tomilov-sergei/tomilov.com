# 0003. Photo section preserves originals for HDR

Date: 2026-05-29

## Status

Accepted

## Context

The site needs a `/photos/` section for personal photography, simple publishing from iPhone, a public feed, and a way to inspect each image separately. Some photos may be HDR/Ultra HDR.

The production runtime is still a static site with small Python services only where writes are needed.

## Decision

Photos are stored as original uploaded files under `assets/photos/originals/**`. Publishing happens through Apple Shortcut rather than a public upload form on the site. The upload service updates `assets/photos/photos.json` and does not resize, draw to canvas, strip metadata, or transcode images.

The public page renders the manifest as a lazy-loaded photo feed. The detail viewer opens the same original file and uses `dynamic-range-limit: no-limit` as a progressive enhancement for browsers and displays that support HDR.

Production deploys symlink `assets/photos` to shared storage, matching the Telegram media policy, so phone uploads survive code releases.

## Consequences

- HDR gain maps and wide-dynamic-range data have the best chance to survive because the file bytes are preserved.
- The first version does not generate responsive SDR thumbnails, so very large originals can make the feed heavier.
- Browser and display support still determines whether a visitor actually sees HDR.
- If the photo library grows, add a derivative pipeline that keeps originals and creates separate previews without replacing them.
