# S3 media migration — production completion, 28 October 2026

Production media delivery and both publishers now use the existing Timeweb S3 bucket. The user authorized implementation, administrative completion and finishing the project. No new storage plan, disk enlargement or account was purchased.

## Result

- 2,339 historical Telegram files, 10,815,687,651 bytes: the existing S3 copies were compared by full streamed SHA-256; no blind re-upload.
- 443 personal-photo originals and derivatives, 309,836,889 bytes: uploaded and fully verified. All 55 published photo records have receipts; nine unreferenced originals were preserved too.
- All 2,782 migrated paths returned the expected size and MIME through the public site and directly from S3. All 189 pre-existing live objects also returned HTTP 200 and the expected size. Five `.MOV` live filenames retain their pre-existing Telegram-provided `video/mp4` content type; an extension-only MIME check flags those differences, not a new delivery failure.
- Seven nginx prefixes preserve existing URLs. TLS verification, HEAD, byte ranges, conditional 304 and unsatisfiable 416 were checked; absent keys now return 404 even though the private bucket itself returns 403 without listing permission.
- Final authenticated bucket inventory: 2,975 objects, 12,003,797,597 bytes; zero incomplete multipart uploads, untruncated listing. The paid plan remains 100 GB. The panel showed approximately 50 GB monthly outgoing traffic after full archive verification. No tariff or automatic-upgrade setting was changed; the exact auto-upgrade setting was not visible in the panel.
- The separate reviewed cleanup removed exactly 2,782 server files after checking SHA-256, size, device, inode, modification time, hard-link count and every path component. No metadata JSON or S3 objects were removed. Reclaimed allocated space: **11,131,285,504 bytes (10.37 GiB)**. Data-volume free space rose from 5,290,299,392 to 16,421,584,896 bytes immediately around cleanup; later deployments consume a small amount of that space.

## Runtime and acceptance

Existing authorized root SSH access was verified with the project's existing key. Deploy-user privileges were not broadened. Both systemd services use `MEDIA_STORAGE=s3` and private credentials/temp/state outside the web root. The shared backend marker prevents legacy deploys from restoring binary mirrors.

The full deploy and PHOTOS_ONLY paths passed on production. Photo generation reported zero newly generated archive previews and no missing/failed previews. Full deployment was repeated after cleanup with no local originals; the final code release is `20261028-183626`, built from `2a09e78e`. PHOTOS_ONLY and final checks are recorded in the private acceptance evidence. The normal production SEO generators and strict production checks pass.

An isolated HTTP photo service used the real ffmpeg and S3 pipeline: four objects were uploaded, downloaded for verification and removed after the test. Repeating the same upload produced one photo record and an empty temporary directory. Its metadata and SEO stub were isolated from publication; production SEO was tested through deployment. No synthetic post or photo was published on the live site.

For Telegram, an existing published photo was downloaded through the real local Bot API, compared with its S3 object, removed by the guarded cache function, downloaded again and compared again. Both verified cache removals succeeded; posts were unchanged. The queue was empty after service restarts. Tests cover durable retry, multipart resume, checksum conflicts, symlinks, source mutation, backend mismatch and refusal to rehydrate binaries: 29 tests passed.

`tomilov-media-health.timer` checks worker health, pending age, free space and aggregate cache/temp size every five minutes. It writes `/var/lib/tomilov-media/health.json` and fails the systemd service on threshold violations. This is local monitoring; no external alert recipient was configured. The Bot API log has an hourly 50 MiB rotation threshold with three compressed rotations. Cache cleanup excludes binlogs, working-root files and temp. At acceptance the download cache/state was about 47 KB and media temp was empty.

The initial 24–48-hour observation period was a proposed precaution, not evidence collected here. Completion used same-session functional, integrity, deployment and recovery checks plus continuous local monitoring. Long-duration operation and the next genuinely new user publication have not been observed. Four pre-existing missing-media entries remain in the site checker; they are outside this migration inventory.

## Recovery and evidence

The independent Telegram copy in the original Mac checkout was verified for all 2,339 files. The independent photo copy and private audit records are retained outside the disposable worktree at:

`/Users/tomilov/Documents/tomilov-media-backup-20261028/`

Telegram originals remain in:

`/Users/tomilov/Library/Mobile Documents/com~apple~CloudDocs/Projects/tomilov.com/assets/telegram/`

The server retains migration manifests, verification receipts, exact deleted paths, original nginx/service configurations and pre-cutover metadata under root-only `/var/lib/tomilov-media/migration-20261028/`. The rollback directory also identifies the original release. These backups may contain credentials and must never be committed or exposed through HTTP.

After deletion, rollback must keep S3 delivery and current metadata. Restoring an old local-only nginx configuration is insufficient; restoring binaries to disk requires a separate capacity-checked operation. Do not restore stale posts/photos JSON over new publications.

Downloader, Collector synchronization, Collector releases and appcast were excluded. The deploy script preserves their existing symlink and now confines recursive permission changes to website media. Unrelated changes and iCloud duplicates in the original checkout were preserved.
