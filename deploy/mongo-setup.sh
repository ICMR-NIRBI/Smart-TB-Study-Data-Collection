#!/usr/bin/env bash
# Step 1 of 2 for MongoDB on a new server: install it and start it with the right settings. Run as root, after
# server-setup.sh. Safe to run again. Step 2 is deploy/mongo-init.sh, once the app code is on the server.
#
# What this sets up: MongoDB 8.0 from MongoDB's own package source, listening on this server only (127.0.0.1), as a
# single-node replica set (needed for transactions), with a key file ready for login. Login itself is switched on in
# step 2, after the administrator login exists.
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Run as root"; exit 1; }
VERSION=8.0
CODENAME="$(. /etc/os-release && echo "$VERSION_CODENAME")"
[[ "$CODENAME" == noble ]] || echo "Note: tested on Ubuntu 24.04 (noble); this is $CODENAME."

echo "==> MongoDB $VERSION package source"
curl -fsSL "https://www.mongodb.org/static/pgp/server-$VERSION.asc" | gpg --dearmor --yes -o "/usr/share/keyrings/mongodb-server-$VERSION.gpg"
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-$VERSION.gpg ] https://repo.mongodb.org/apt/ubuntu $CODENAME/mongodb-org/$VERSION multiverse" \
  > "/etc/apt/sources.list.d/mongodb-org-$VERSION.list"
apt-get update -qq

echo "==> Installing mongodb-org-server"
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends mongodb-org-server
systemctl stop mongod
# Updates to MongoDB are done on purpose (and re-tested), not by the nightly automatic updates.
apt-mark hold mongodb-org-server >/dev/null

echo "==> Key file (lets the replica set member trust itself once login is on)"
if [[ ! -f /etc/mongodb-keyfile ]]; then
  (umask 277; openssl rand -base64 756 | tr -d '\n' > /etc/mongodb-keyfile)
fi
chown mongodb:mongodb /etc/mongodb-keyfile
chmod 400 /etc/mongodb-keyfile

echo "==> Configuration (this server only, replica set rs0, modest memory cap)"
if [[ ! -f /etc/mongod.conf.orig ]]; then cp /etc/mongod.conf /etc/mongod.conf.orig; fi
cat > /etc/mongod.conf <<'CONF'
# SMART-TB. Listens on this server only. Login (the security block) is added by deploy/mongo-init.sh.
storage:
  dbPath: /var/lib/mongodb
  wiredTiger:
    engineConfig:
      cacheSizeGB: 1
systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log
net:
  port: 27017
  bindIp: 127.0.0.1
processManagement:
  timeZoneInfo: /usr/share/zoneinfo
replication:
  replSetName: rs0
CONF

echo "==> Kernel 6.19 and newer workaround"
# MongoDB 8.0.x refuses to start on Linux 6.19+ when the package's GLIBC_TUNABLES=glibc.pthread.rseq=0 is set
# (SERVER-121912). Without it the server starts and logs one performance warning, which does not matter at this
# data size. Re-test after any MongoDB or kernel update.
mkdir -p /etc/systemd/system/mongod.service.d
cat > /etc/systemd/system/mongod.service.d/rseq.conf <<'CONF'
[Service]
UnsetEnvironment=GLIBC_TUNABLES
CONF
systemctl daemon-reload
systemctl enable --now mongod
sleep 5
systemctl is-active --quiet mongod || { echo "MongoDB did not start. Look at: journalctl -u mongod -n 30"; exit 1; }

cat <<EOF

MongoDB is installed and running (version $(mongod --version | head -1)).
Next:
1. Put the app on the server:  bash $(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/deploy.sh
   (the first run builds the app; it will say the database logins are not set up yet - that is expected)
2. Then:                        bash $(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/mongo-init.sh
EOF
