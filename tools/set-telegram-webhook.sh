#!/usr/bin/env bash
set -euo pipefail

: "${TELEGRAM_BOT_TOKEN:?TELEGRAM_BOT_TOKEN is required}"
: "${TELEGRAM_WEBHOOK_URL:?TELEGRAM_WEBHOOK_URL is required}"
: "${TELEGRAM_WEBHOOK_SECRET:?TELEGRAM_WEBHOOK_SECRET is required}"

curl -fsS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -F "url=${TELEGRAM_WEBHOOK_URL}" \
  -F "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
  -F 'allowed_updates=["channel_post","edited_channel_post"]'

printf '\n'
