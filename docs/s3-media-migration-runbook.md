# S3 media migration: implementation and cutover runbook

Status: implemented on `codex/s3-media-migration`; production cutover and local-original deletion have NOT run. See [accepted plan](s3-media-migration-plan-2026-10-28.md). Scope excludes Downloader, Collector, appcast, Collector synchronization and unrelated storage.

## Evidence from 28 October 2026

The authenticated Timeweb panel shows the existing private, standard bucket `00df5bd5-137f-492a-8d95-c7ee2cc2d851`, 100 GB plan, 10.9 GB displayed usage. Endpoint is `https://s3.twcstorage.ru`; signing region is `ru-1` (confirmed by successful signed operations). GetBucketLocation returns `ru`; do not substitute this location label for the tested signing region.

Authenticated paginated listing found 2,532 objects / 11,693,960,708 bytes:

- 984 historical videos / 10,286,515,813 bytes;
- 21 historical attachments / 387,658,750 bytes;
- 1,334 historical photos / 141,513,088 bytes;
- 189 live media objects / 874,355,300 bytes;
- posts.json and three small pre-existing test objects.

Thus **all historical Telegram binaries already exist with matching sizes**. Full streamed GET verification subsequently confirmed SHA-256 equality for all **2,339 files / 10,815,687,651 bytes** against production originals. One SSH interruption was resumed from saved receipts after rechecking source fingerprints. No object was rewritten. Private verification evidence SHA-256: `0f62dd864a15e06d1f84ab3db937f407e471698ad66818c4e69d67b1939b714f`. Existing objects must be read and compared, never blindly uploaded again. Personal-photo originals/previews are absent. Versioning is disabled, lifecycle is absent, multipart listing is empty and untruncated. No bucket policy, permissions, tariff, lifecycle or versioning were changed.

A private test prefix was used for real 1,031-byte and 33-MiB uploads, including multipart; complete GET SHA-256 checks passed. Only those two newly created test objects were removed afterwards. nginx parsed the proposed media locations successfully in an isolated temporary configuration; nginx was not reloaded. An isolated nginx listener also passed public HEAD, start/middle/end Range, conditional 304 and unsatisfiable 416 probes for video, photo and attachment samples. A real ffmpeg SDR fixture generated and published its four objects into an isolated in-memory store, then generated successfully with no local originals. The initial nginx attempt to open its default log reported a permission warning; explicit temporary-config syntax and test succeeded with exit 0.

The original private credentials were saved, at the user's request, to ignored `.deploy/s3-media.env` in the original checkout with mode 0600. They are not included here or in Git. These are existing account credentials, not newly created least-privilege credentials. Review scope before installing credentials into any additional service.

## Tools and safety boundaries

- `media_storage.py`: existing SigV4 transport, TLS verification, bounded 32-MiB parts, resumable journal, full GET verification, checksum collision refusal, backoff for idempotent HTTP operations. No new Python packages required.
- `migrate_media_to_s3.py`: inventory, preflight, copy, verify, report, prune-report. **No delete-originals command**. Copy is dry-run unless `--apply`; every run is bound to one S3 destination. Root allowlist excludes manifests and all unrelated products. Run lock prevents concurrent operators using the same journal.
- `prepare_s3_photo_manifest.py`: creates a staged photo manifest with validated original/preview receipts and HDR flags; never overwrites live metadata. Existing originals must still exist for this step.
- `check_s3_media.py`: public HEAD for every record and bounded Range probes, including unsatisfiable Range, sampled by extension (or `--all-ranges`). Run against S3 and the site's own domain. It verifies delivery, not full-body integrity; migration verifier does the latter.
- Legacy `s3-upload-static-assets.py` CLI now requires `--apply` and a durable `--state-dir`; matching size alone is no longer sufficient. Its `--force`/`--insecure` routes are refused.

The implementation retains the project's working SigV4 code instead of adding boto3. This is a deliberate dependency choice validated against the real endpoint, including multipart. The migration plan's SDK option was a preference, not a requirement.

## Preparation, without changing the running site

1. Work from the migration branch, not the dirty original checkout. Commit and push production code before deployment per project rules. Do not overwrite live JSON with the branch's older snapshots.
2. Record exact current storage/traffic limits and monthly egress from the account. The panel's rounded 10.9 GB is not a full billing record; authenticated listing excludes uncommitted parts, but none were present at audit time. Recheck before copy. Reserve at least 15 GiB of capacity and budget a complete GET of each migrated byte. Do not enable autoscaling, buy anything or enlarge the disk. Current account traffic/auto-upgrade settings still require explicit verification before bulk migration writes.
3. On VPS use a service/operator account able to read source media and the restricted credential file. Keep state outside web-root, e.g. `/var/lib/tomilov-media/migration/<run-id>` on the root filesystem. Create runtime `tmp` and `state` directories there, owned by the actual service identity, mode 0700. Do not create a second copy of originals on `/mnt/tomilov-data`.
4. Install the implementation into an isolated tools checkout for migration commands. Load credentials via a private environment file; do not pass secrets as CLI arguments, print `env`, or enable shell tracing. Variables are documented in `ops/media-storage.env.example`. Verify TLS with the host trust store; do not bypass it. On this Mac the default standalone Python CA setup failed; the VPS successfully verified TLS.
5. While old originals still exist, run existing HDR backfill and strict preview generation in `MEDIA_STORAGE=local` under a publication pause, **before taking inventory**. Missing derivatives are an error. Take a final source/manifest snapshot after generation.

Example command interface (paths below must be owned/prepared by the operator; no commands in this document have been run as a cutover):

```sh
python3 tools/migrate_media_to_s3.py inventory \
  --root /mnt/tomilov-data/tomilov.com/shared \
  --run /var/lib/tomilov-media/migration/RUN_ID
python3 tools/migrate_media_to_s3.py preflight \
  --run /var/lib/tomilov-media/migration/RUN_ID \
  --capacity-bytes CONFIRMED_PAID_CAPACITY --usage-bytes CONFIRMED_TOTAL_USAGE
python3 tools/migrate_media_to_s3.py copy \
  --run /var/lib/tomilov-media/migration/RUN_ID
# Review dry-run, then:
python3 tools/migrate_media_to_s3.py copy --apply \
  --run /var/lib/tomilov-media/migration/RUN_ID --workers 2 --mib-per-second 5
python3 tools/migrate_media_to_s3.py report --run /var/lib/tomilov-media/migration/RUN_ID
```

`copy` fully verifies existing objects and uploads only absent keys. Different bytes under the same key stop the run. The explicit `verify` command repeats full GET verification without uploading; do not automatically run it immediately after a successful copy and pay twice for the same evidence. Re-run after changed evidence or when needed for final acceptance. Restart with the same run directory to resume parts. If a provider aborts a pending upload, preserve the journal and investigate; do not automatically discard evidence or abort unrelated uploads. An ambiguous create-multipart response can leave an unrecorded orphan: inspect the bucket's multipart list before acceptance. No broad lifecycle rule is installed automatically.

## Runtime and deployment changes

S3 is opt-in. Both service environments need `MEDIA_STORAGE=s3`, `MEDIA_TMP_DIR`, `MEDIA_STATE_DIR`, explicit S3 bucket/endpoint/signing region and credentials. `S3_MEDIA_ACL=public-read` only applies to newly written site objects. The bucket remains private; no public listing is enabled. Existing objects' ACLs are not changed by checksum verification: run anonymous delivery probes before switching nginx.

Photo upload validates the original bytes, preserves HDR metadata, creates derivatives in bounded temporary storage, uploads/verifies all objects, then atomically writes metadata. Stable content+publication-field identity prevents retry duplicates; an intentional second publication of identical bytes with identical fields is consequently deduplicated. This is a documented product tradeoff; a future explicit idempotency-key API could distinguish those requests. Failed publication leaves no local archive original. At most two HTTP requests enter the upload handler, and one S3 photo pipeline runs at once. The original and derivatives are temporary, not permanent disk mirrors.

A durable photo SEO-pending marker is created before metadata publication. On SEO failure, the request fails, and a worker retries after restart; the existing request ID makes user retry safe. Generator refreshes from both services share a lock to avoid concurrent homepage/feed regeneration. Do not run a manual deploy concurrently with live writers during cutover.

Telegram writes each acknowledged update to `pending/<update_id>.json` with fsync. A worker replays pending updates in ID order, retries failure and records completion only after publication and SEO refresh. Failed media cannot publish an incomplete post. Legacy `inbox` files are deliberately not blindly replayed: old edits could overwrite newer posts. Audit historical missing events separately. A permanently failing update blocks later updates to preserve edit order; alert on oldest pending age, then repair/retry rather than silently discard.

Cloud Bot API download staging is bounded by `TELEGRAM_MAX_STAGING_BYTES` (128 MiB default). Local Bot API uploads read its cached file directly, avoiding a second copy. **This change does not delete or bound the Bot API's own cache**: before claiming that disk growth is solved, configure and verify its separate cache-retention procedure. Never recursively delete token-named directories or Telegram state. Completed-update markers and application logs also need bounded retention/rotation; preserve replay protection for the desired recovery window.

S3 photo generators require publication receipts with all derivatives; they do not infer availability from a missing local file and do not restore the full archive. Receipts record successful publication, not perpetual availability; delivery monitoring is still necessary. Regeneration of an already published derivative is an explicit maintenance operation: fetch one source to bounded temp, produce a new derivative version/key, verify it, then update the receipt. This release does not implement a bulk automatic regeneration command.

`deploy-site.sh` reads production `shared/.media-storage` before doing any work; absent means legacy local. In S3 mode it disables binary rsync and propagates the mode to both full and PHOTOS_ONLY generation. All old PUSH_LOCAL_* and SYNC_* media paths fail before writing: use explicit verified object import and paused manifest promotion instead. This restriction intentionally prevents the old local-import promotion workflow from bypassing S3 checks. Normal production JSON pulls and deployment continue.

## Cutover: administrator required

The deploy SSH account cannot change nginx/systemd or read the existing service env files. Do not widen its permissions automatically. Prepare the exact diff from the current server configuration (not a wholesale replacement from an old example), with an administrator executing the final operations.

1. Pause manual deploys and writers briefly. Ensure webhook retries/durable pending storage protect in-flight events; photo endpoint must explicitly reject/retry during pause. Save current configs and manifests outside web-root; inspect and drain pending work.
2. Complete final inventory/delta and verification; run public delivery probes against the bucket for **all** media slated for switch. Preserve existing URLs and separately verify legacy live URLs.
3. Run `prepare_s3_photo_manifest.py --run ... --photos /mnt/tomilov-data/tomilov.com/shared/assets/photos/photos.json`. Review `photos-staged.json` and `photos-source.json`. While writers remain stopped, compare current source SHA-256 to the recorded hash and atomically promote the staged manifest with www-data group read/write permissions. Never restore an old posts.json.
4. Deploy the committed compatible code and service environment. Before enabling writers, install `ops/nginx-s3-media.conf.example` inside the existing HTTPS server, removing only the old overlapping live/originals locations. Preserve all Collector directives and other configuration. `nginx -t` must pass before reload. These prefix locations preserve relative paths, Range/HEAD and same-origin URLs; manifests remain local. Nginx response buffering/temp files are disabled for these routes.
5. Install `shared/.media-storage` containing `s3` atomically. Configure both services identically and restart them. The generation lock defaults to `/tmp/tomilov-site-generation.lock`; if overriding it, use the same file and writable group for both services. Environment changes are separate from deploy and must be backed up.
6. Verify homepage/overlays, RU/EN pages, SDR/HDR, feeds, MP4 seek, arbitrary attachments, 404/416. Submit a real authorized publication through each normal input, test retry/restart, run full and PHOTOS_ONLY deploy, and prove original directories do not refill. Do not post synthetic Telegram channel messages without authorization.
7. Observe 24–48 hours if disk headroom permits. Disk alerts at 512 MiB available, stop staging at its reserve threshold; no delete-on-pressure shortcut. Record nginx upstream errors, pending age, upload errors, free bytes/inodes, tmp/cache growth, S3 usage/egress. Existing Bot API cache policy must be closed before declaring durable disk safety.

## Deletion is a separate accepted operation

First prove an independent recovery copy matches the manifest; the old local checkout is not automatically that proof. Run `prune-report`, review its exact keys/counts/bytes and current source fingerprints, and attach public-delivery and runtime acceptance evidence. The report does not unlink anything. No original deletion is implemented or authorized by successfully running copy alone. An operator may remove only the accepted verified paths after approval, preserving metadata, journals and all unrelated assets. Record `df`/allocated-byte deltas and check open descriptors.

Before removal, rollback historical routes to local while retaining routes for newly published S3-only objects. Roll back only to S3-compatible application code and preserve current manifests. After removal, app rollback can keep S3 delivery; returning to disk requires a separately planned restore and capacity. A simple nginx rollback is no longer sufficient.

## Validation

Local tests cover checksum collisions despite equal sizes, resumable interrupted multipart, HTTP-200 multipart errors, source mutation, symlink/traversal refusal, allowlist boundaries, durable update retry, photo failure/retry, missing publication receipts, backend mismatch, full deploy and PHOTOS_ONLY with zero archive rsync. Existing site checks pass on the clean base checkout (their four pre-existing missing-media entries remain reported). The test suite is discovered by the existing CI workflow; no remote secrets are needed for CI.
