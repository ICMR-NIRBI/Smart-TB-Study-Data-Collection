#!/usr/bin/env bash
# Install or update SMART-TB on the server: fetch code, build, apply database changes, restart. Run as root.
#   bash deploy.sh            # deploy the main branch
#   bash deploy.sh <git-ref>  # deploy a specific commit or tag
set -euo pipefail

REPO="git@github.com:ICMR-NIRBI/Smart-TB-Study-Data-Collection.git"
APP=/opt/smarttb/app
ENV_FILE=/opt/smarttb/.env
# MongoDB addresses (they contain "&", so this file is read by the scripts and by systemd, never sourced by a shell).
MONGO_ENV=/opt/smarttb/.env.mongo
REF="${1:-origin/main}"

[[ $EUID -eq 0 ]] || { echo "Run as root"; exit 1; }
[[ -f $ENV_FILE ]] || { echo "Missing $ENV_FILE"; exit 1; }
as_app() { sudo -u smarttb -H bash -c "set -a; source $ENV_FILE; set +a; export SMARTTB_ENV_FILES=$ENV_FILE,$MONGO_ENV; cd $APP; $1"; }

if [[ ! -d $APP/.git ]]; then
  echo "==> First install: cloning"
  sudo -u smarttb -H git clone "$REPO" "$APP"
fi

echo "==> Fetching $REF"
sudo -u smarttb -H git -C "$APP" fetch --prune origin
sudo -u smarttb -H git -C "$APP" reset --hard "$REF"

# Where Module 5 photos are kept (the service may write only here and in the build folder).
install -d -o smarttb -g smarttb -m 750 /opt/smarttb/uploads

# Server helpers, from this copy of the deploy folder: the service file, the hourly backup, the backup-pull account's
# command, and the System control helper (backup now, restart). Installing them every time keeps the server in step.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "==> Installing server helpers"
install -m 644 "$HERE/smarttb.service" /etc/systemd/system/smarttb.service
install -m 755 "$HERE/backup.sh" /usr/local/bin/smarttb-backup
if id backuppull >/dev/null 2>&1; then
  install -m 755 "$HERE/backup-serve.sh" /usr/local/bin/smarttb-backup-serve
  install -d -o backuppull -g backuppull -m 755 /var/lib/smarttb-pull
fi
install -m 755 "$HERE/smarttb-actions.sh" /usr/local/bin/smarttb-actions
install -m 644 "$HERE/smarttb-actions.path" "$HERE/smarttb-actions.service" /etc/systemd/system/
install -d -o smarttb -g smarttb -m 750 /opt/smarttb/actions
install -d -m 755 /var/lib/smarttb-actions
touch /var/lib/smarttb-actions/installed
systemctl daemon-reload
systemctl enable --now smarttb-actions.path >/dev/null

echo "==> Installing dependencies and building"
as_app "npm ci --no-audit --no-fund"
as_app "npm run build"

echo "==> Applying database changes (collections and indexes)"
if [[ -s $MONGO_ENV ]]; then
  # The app login's rights follow the schema (a new collection needs them); needs the administrator address.
  if grep -q '^MONGO_ADMIN_URI=' "$MONGO_ENV"; then as_app "npm run --silent db:sync-role -- --env $MONGO_ENV"; fi
  as_app "npm run db:migrate"
else
  echo "MongoDB logins are not set up yet ($MONGO_ENV is missing): run deploy/mongo-setup.sh and deploy/mongo-init.sh, then deploy again."
fi

echo "==> Restarting"
systemctl restart smarttb
sleep 3
if curl -fsS http://127.0.0.1:3000/api/health >/dev/null; then
  echo "Deployed $(sudo -u smarttb git -C "$APP" rev-parse --short HEAD) — health check OK"
else
  echo "Deployed, but the health check failed. Logs: journalctl -u smarttb -n 100"
  exit 1
fi
