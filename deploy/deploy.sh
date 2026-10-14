#!/usr/bin/env bash
# Install or update SMART-TB on the server: fetch code, build, apply database migrations, restart. Run as root.
#   bash deploy.sh            # deploy the main branch
#   bash deploy.sh <git-ref>  # deploy a specific commit or tag
set -euo pipefail

REPO="git@github.com:ICMR-NIRBI/Smart-TB-Study-Data-Collection.git"
APP=/opt/smarttb/app
ENV_FILE=/opt/smarttb/.env
REF="${1:-origin/main}"

[[ $EUID -eq 0 ]] || { echo "Run as root"; exit 1; }
[[ -f $ENV_FILE ]] || { echo "Missing $ENV_FILE"; exit 1; }
as_app() { sudo -u smarttb -H bash -c "set -a; source $ENV_FILE; set +a; cd $APP; $1"; }

if [[ ! -d $APP/.git ]]; then
  echo "==> First install: cloning"
  sudo -u smarttb -H git clone "$REPO" "$APP"
fi

echo "==> Fetching $REF"
sudo -u smarttb -H git -C "$APP" fetch --prune origin
sudo -u smarttb -H git -C "$APP" reset --hard "$REF"

echo "==> Installing dependencies and building"
as_app "npm ci --no-audit --no-fund"
as_app "npm run build"

echo "==> Applying database migrations"
as_app "npm run db:migrate"

echo "==> Restarting"
systemctl restart smarttb
sleep 3
if curl -fsS http://127.0.0.1:3000/api/health >/dev/null; then
  echo "Deployed $(sudo -u smarttb git -C "$APP" rev-parse --short HEAD) — health check OK"
else
  echo "Deployed, but the health check failed. Logs: journalctl -u smarttb -n 100"
  exit 1
fi
