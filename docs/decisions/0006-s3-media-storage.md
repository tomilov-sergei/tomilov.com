# 0006: Verified S3 media with production-owned manifests

Date: 2026-10-28. Status: accepted design; production activation pending.

ADR 0002 continues to govern `posts.json`, and production shared storage continues to govern `photos.json`. The local working copy is never the default authority for either manifest. When production's `shared/.media-storage` marker is `s3`, verified S3 objects become the authority for media bytes in the approved Telegram/photo prefixes. Before that marker and cutover acceptance, local originals remain authoritative and must be retained.

Public URL paths remain on tomilov.com through prefix-specific nginx proxies. Media must be fully readable and checksum-verified before publishing a reference. Existing S3 keys with different content must not be overwritten automatically. HDR originals remain byte-for-byte unchanged per ADR 0003.

Photo generators consume verified publication receipts rather than assuming originals exist on disk. Deploy pulls current production manifests and cannot restore local binary mirrors in S3 mode. Legacy push/sync overrides fail closed and require explicit verified imports instead.

A successful copy does not authorize original deletion. Deletion requires complete integrity/delivery evidence, writer/deploy acceptance, an independent recovery copy and a separate reviewed operation. Rollback after deletion keeps S3 delivery or requires a capacity-checked restore.

Implementation and operational limits: [S3 runbook](../s3-media-migration-runbook.md).
