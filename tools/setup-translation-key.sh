#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.local"

if [[ -f "$ENV_FILE" ]] && grep -q '^OPENAI_API_KEY=' "$ENV_FILE"; then
  printf 'OPENAI_API_KEY is already configured in %s\n' "$ENV_FILE"
  exit 0
fi

printf 'Paste a project-scoped OpenAI API key (input is hidden): '
IFS= read -r -s TRANSLATION_API_KEY
printf '\n'

if [[ -z "$TRANSLATION_API_KEY" ]]; then
  printf 'The key was empty; nothing was saved.\n' >&2
  exit 1
fi

umask 077
if [[ -f "$ENV_FILE" && -s "$ENV_FILE" ]]; then
  printf '\nOPENAI_API_KEY=%s\n' "$TRANSLATION_API_KEY" >> "$ENV_FILE"
else
  printf 'OPENAI_API_KEY=%s\n' "$TRANSLATION_API_KEY" > "$ENV_FILE"
fi
chmod 0600 "$ENV_FILE"
unset TRANSLATION_API_KEY

printf 'OpenAI API key saved locally in .env.local with mode 600.\n'
