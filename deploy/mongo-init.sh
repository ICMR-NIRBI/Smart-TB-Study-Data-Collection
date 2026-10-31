#!/usr/bin/env bash
# Step 2 of 2 for MongoDB on a new server: create the database logins and switch login on. Run as root, after
# deploy/mongo-setup.sh and a first deploy/deploy.sh (it needs the app's code and packages). Run it once.
#
# What it does, in order (the same steps used on the live server):
#   1. makes the single node a replica set (login is still off, and MongoDB listens on 127.0.0.1 only)
#   2. creates the administrator login   (address stored in /opt/smarttb/.env.mongo, never printed)
#   3. switches login and the key file on, restarts MongoDB
#   4. creates the app login and the owner login, with the rights listed in src/server/mongo/schema.ts, and the
#      collections and indexes
# Afterwards: run deploy.sh again (applies the schema and starts the app), then npm run db:preflight, then
# npm run db:create-admin.
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Run as root"; exit 1; }
APP=/opt/smarttb/app
ENV_FILE=/opt/smarttb/.env
MONGO_ENV=/opt/smarttb/.env.mongo
DB=smarttb
[[ -d $APP/node_modules ]] || { echo "Run deploy.sh first: the app's packages are needed."; exit 1; }
if [[ -s $MONGO_ENV ]] && grep -q '^MONGO_ADMIN_URI=' "$MONGO_ENV"; then
  echo "$MONGO_ENV already has the logins. Nothing to do."
  exit 0
fi
as_app() { sudo -u smarttb -H bash -c "set -a; source $ENV_FILE; set +a; cd $APP; $1"; }

# Only the app user may read the addresses (they contain passwords).
install -o smarttb -g smarttb -m 600 /dev/null "$MONGO_ENV"

echo "==> 1/4 Replica set"
as_app "npm run db:init-replica-set -- --port 27017"

echo "==> 2/4 Administrator login"
as_app "npm run db:bootstrap -- --env $MONGO_ENV --port 27017"

echo "==> 3/4 Switching login on"
if ! grep -q '^security:' /etc/mongod.conf; then
  cat >> /etc/mongod.conf <<'CONF'
security:
  authorization: enabled
  keyFile: /etc/mongodb-keyfile
CONF
fi
systemctl restart mongod
sleep 6
systemctl is-active --quiet mongod || { echo "MongoDB did not restart. Look at: journalctl -u mongod -n 30"; exit 1; }

echo "==> 4/4 App and owner logins, collections and indexes"
as_app "npm run db:setup -- --env $MONGO_ENV --db $DB --port 27017"

chmod 600 "$MONGO_ENV"
echo
echo "Done. The addresses are in $MONGO_ENV (not shown). Next: bash $APP/deploy/deploy.sh"
