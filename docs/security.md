# Security Notes

Last updated: 2026-07-06.

## Public Repository Boundary

The GitHub repository may contain:

- static HTML, CSS, JavaScript, generators, and documentation;
- reproducible JSON snapshots such as `assets/telegram/posts.json` and `assets/photos/photos.json`;
- example env files with placeholders only.

The repository must not contain:

- `.deploy/**`;
- `.env` or `.env.*`;
- SSH private keys, API keys, Telegram bot tokens, S3 credentials, OpenAI keys, or upload tokens;
- `assets/photos/originals/**`;
- `assets/barcelona-guide/**`;
- Telegram media under `assets/telegram/**` except `assets/telegram/posts.json`.

These rules are enforced by `.gitignore` and `tools/check-secrets.py`.

## Secret Checks

Run before commits:

```sh
python3 tools/check-secrets.py
```

Run occasionally, and before making repository-history changes public:

```sh
python3 tools/check-secrets.py --history
```

GitHub Actions runs the non-history check on every push and pull request. If a real secret ever reaches GitHub, deleting the line is not enough: rotate the credential first, then clean history only if needed.

## Deploy Access

Deploys should use a least-privilege SSH user, not `root`.

The local deploy settings live in `.deploy/deploy.env`, which is ignored by Git. `ops/deploy.env.example` documents the required variables:

- `SERVER`
- `DEPLOY_KEY`
- `REMOTE_ROOT`
- `REMOTE_STORAGE_ROOT`

The deploy user needs write access only to release/shared storage and `$REMOTE_ROOT`, plus passwordless sudo for:

- `nginx -t`;
- `systemctl reload nginx`;
- restarting the site services.

## Public Metadata Tradeoff

Even without secrets, a public repository exposes architecture, routes, tooling, and content structure. Keep operational details generic in docs and examples. Real hostnames, IP addresses, storage paths, and credentials belong in ignored local config or production env files.
