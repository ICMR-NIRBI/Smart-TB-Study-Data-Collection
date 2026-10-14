#!/usr/bin/env bash
# One-time preparation of a fresh Ubuntu 24.04 server (E2E C3.8GB node) for SMART-TB. Run as root:
#   bash server-setup.sh                  # production: database is the managed E2E DBaaS
#   bash server-setup.sh --with-local-db  # team testing: PostgreSQL on this server, dummy data only
set -euo pipefail

WITH_LOCAL_DB=false
[[ "${1:-}" == "--with-local-db" ]] && WITH_LOCAL_DB=true
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[[ $EUID -eq 0 ]] || { echo "Run as root"; exit 1; }

echo "==> System updates and base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y curl git ufw fail2ban unattended-upgrades rclone openssl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https postgresql-client
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> Node.js 22 LTS"
if ! command -v node >/dev/null || [[ "$(node -v)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "==> Caddy (HTTPS reverse proxy)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

if $WITH_LOCAL_DB; then
  echo "==> PostgreSQL on this server (testing only; listens on localhost)"
  apt-get install -y postgresql postgresql-contrib
fi

echo "==> App user and folders"
id smarttb >/dev/null 2>&1 || useradd --system --create-home --home-dir /home/smarttb --shell /bin/bash smarttb
install -d -o smarttb -g smarttb -m 750 /opt/smarttb /opt/smarttb/backups
if [[ ! -f /home/smarttb/.ssh/id_ed25519 ]]; then
  sudo -u smarttb ssh-keygen -t ed25519 -N '' -C "smarttb-deploy@$(hostname)" -f /home/smarttb/.ssh/id_ed25519 >/dev/null
  sudo -u smarttb bash -c 'ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null'
fi
if [[ ! -f /opt/smarttb/.env ]]; then
  install -o root -g smarttb -m 640 "$HERE/env.production.example" /opt/smarttb/.env
fi

echo "==> Services"
install -m 644 "$HERE/smarttb.service" /etc/systemd/system/smarttb.service
install -m 644 "$HERE/smarttb-backup.service" /etc/systemd/system/smarttb-backup.service
install -m 644 "$HERE/smarttb-backup.timer" /etc/systemd/system/smarttb-backup.timer
install -m 755 "$HERE/backup.sh" /usr/local/bin/smarttb-backup
[[ -f /etc/caddy/Caddyfile.orig ]] || cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.orig
install -m 644 "$HERE/Caddyfile.ip" /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable smarttb.service
systemctl reload-or-restart caddy

echo "==> Firewall: SSH, HTTP, HTTPS only"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
systemctl enable --now fail2ban

cat <<EOF

Server prepared.
1. Add this read-only deploy key to GitHub (repo > Settings > Deploy keys):
$(cat /home/smarttb/.ssh/id_ed25519.pub)
2. Fill in /opt/smarttb/.env  (see deploy/README.md)
3. Run: bash $HERE/deploy.sh
EOF
