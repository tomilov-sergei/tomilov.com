#!/usr/bin/env bash
set -euo pipefail

VERSION="10.2"
COMMIT="adfd7f6a8e990272851777eeb3ae0def4216f161"
REPOSITORY="https://github.com/tdlib/telegram-bot-api.git"
BINARY="${TELEGRAM_BOT_API_BINARY:-/usr/local/bin/telegram-bot-api}"
SERVICE="${TELEGRAM_BOT_API_SERVICE:-telegram-bot-api-local.service}"
BUILD_JOBS="${BUILD_JOBS:-1}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

current_version=""
if [[ -x "$BINARY" ]]; then
  current_version="$($BINARY --version 2>&1 | awk '/^Bot API / { print $3; exit }')"
fi

if [[ -n "$current_version" && "$(printf '%s\n%s\n' "$VERSION" "$current_version" | sort -V | head -n 1)" == "$VERSION" ]]; then
  echo "Telegram Bot API $current_version is already installed; required version is $VERSION."
  exit 0
fi

build_root="$(mktemp -d /tmp/telegram-bot-api-build.XXXXXX)"
trap 'rm -rf "$build_root"' EXIT

git init "$build_root/source"
git -C "$build_root/source" remote add origin "$REPOSITORY"
git -C "$build_root/source" fetch --depth 1 origin "$COMMIT"
git -C "$build_root/source" checkout --detach FETCH_HEAD
git -C "$build_root/source" submodule update --init --recursive --depth 1

cmake \
  -S "$build_root/source" \
  -B "$build_root/build" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX="$build_root/install"
cmake --build "$build_root/build" --target install --parallel "$BUILD_JOBS"

candidate="$build_root/install/bin/telegram-bot-api"
candidate_version="$($candidate --version 2>&1 | awk '/^Bot API / { print $3; exit }')"

if [[ "$candidate_version" != "$VERSION" ]]; then
  echo "Expected Bot API $VERSION, built ${candidate_version:-unknown}." >&2
  exit 1
fi

backup="${BINARY}.backup-${current_version:-unknown}-$(date -u +%Y%m%dT%H%M%SZ)"
systemctl stop "$SERVICE"
cp -p "$BINARY" "$backup"
install -o root -g root -m 0755 "$candidate" "$BINARY"

if ! systemctl start "$SERVICE" || ! systemctl is-active --quiet "$SERVICE"; then
  echo "Bot API $VERSION failed to start; restoring $backup." >&2
  install -o root -g root -m 0755 "$backup" "$BINARY"
  systemctl restart "$SERVICE"
  exit 1
fi

installed_version="$($BINARY --version 2>&1 | awk '/^Bot API / { print $3; exit }')"
if [[ "$installed_version" != "$VERSION" ]]; then
  echo "Unexpected installed version ${installed_version:-unknown}; restoring $backup." >&2
  systemctl stop "$SERVICE"
  install -o root -g root -m 0755 "$backup" "$BINARY"
  systemctl restart "$SERVICE"
  exit 1
fi

echo "Updated Telegram Bot API from ${current_version:-unknown} to $installed_version."
echo "Backup: $backup"
