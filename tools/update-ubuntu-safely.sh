#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  printf 'Run this maintenance script as root: sudo %s\n' "$0" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="/var/backups/tomilov-ubuntu-update/$STAMP"
LOG_FILE="/var/log/tomilov-ubuntu-update-$STAMP.log"
REQUIRED_SERVICES=(nginx ssh)
SITE_SERVICES=(tomilov-telegram-live.service tomilov-photo-upload.service)

install -d -m 0700 "$BACKUP_DIR"
touch "$LOG_FILE"
chmod 0600 "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

on_error() {
  local status=$?
  printf 'ubuntu_update_failed status=%s backup=%s log=%s\n' \
    "$status" "$BACKUP_DIR" "$LOG_FILE" >&2
  exit "$status"
}
trap on_error ERR

service_exists() {
  systemctl list-unit-files "$1" --no-legend 2>/dev/null | grep -q .
}

verify_services() {
  local service

  for service in "${REQUIRED_SERVICES[@]}"; do
    systemctl is-active --quiet "$service"
    printf 'service_ok name=%s\n' "$service"
  done

  for service in "${SITE_SERVICES[@]}"; do
    if service_exists "$service"; then
      systemctl is-active --quiet "$service"
      printf 'service_ok name=%s\n' "$service"
    fi
  done
}

printf 'ubuntu_update_start stamp=%s\n' "$STAMP"
lsb_release -ds 2>/dev/null || sed -n '1,8p' /etc/os-release
uname -a
df -h /
free -h

dpkg --audit
apt-get check
nginx -t
sshd -t
netplan generate
verify_services
python3 "$ROOT_DIR/tools/check-production.py" --strict

cp -a /etc/nginx "$BACKUP_DIR/nginx"
dpkg-query -W -f='${binary:Package}\t${Version}\n' > "$BACKUP_DIR/packages-before.tsv"
apt-mark showhold > "$BACKUP_DIR/held-packages.txt"

for path in /etc/systemd/system/tomilov-*.service /etc/tomilov-*.env; do
  if [[ -e "$path" ]]; then
    cp -a "$path" "$BACKUP_DIR/"
  fi
done

printf 'ubuntu_update_backup_ready path=%s\n' "$BACKUP_DIR"
apt-get update

DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a \
  apt-get -y -o Dpkg::Options::="--force-confold" full-upgrade

dpkg --audit
apt-get check
nginx -t
sshd -t
netplan generate
verify_services

failed_units="$(systemctl --failed --no-legend --plain 2>/dev/null || true)"
if [[ -n "$failed_units" ]]; then
  printf 'Failed systemd units after update:\n%s\n' "$failed_units" >&2
  exit 1
fi

python3 "$ROOT_DIR/tools/check-production.py" --strict
apt list --upgradable 2>/dev/null || true

if [[ -f /var/run/reboot-required ]]; then
  printf 'ubuntu_update_ok reboot_required=yes backup=%s log=%s\n' \
    "$BACKUP_DIR" "$LOG_FILE"
  sed -n '1,80p' /var/run/reboot-required.pkgs 2>/dev/null || true
else
  printf 'ubuntu_update_ok reboot_required=no backup=%s log=%s\n' \
    "$BACKUP_DIR" "$LOG_FILE"
fi
