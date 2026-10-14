#!/usr/bin/env bash
# Extra database copy, on top of the managed database's own daily snapshots. Run by smarttb-backup.timer.
# Dumps the database, encrypts it with BACKUP_PASSPHRASE, keeps the last 3 copies on this server and uploads to
# E2E Object Storage (kept 30 days there). Restore: see deploy/README.md.
set -euo pipefail
set -a; source /opt/smarttb/.env; set +a

: "${DATABASE_OWNER_URL:?missing}" "${BACKUP_PASSPHRASE:?missing}"
DIR=/opt/smarttb/backups
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$DIR/smarttb-$STAMP.dump.enc"

if [[ -n "${DATABASE_SSL_CA:-}" ]]; then
  export PGSSLMODE=verify-full PGSSLROOTCERT="$DATABASE_SSL_CA"
fi

umask 077
pg_dump --format=custom --no-owner --dbname="$DATABASE_OWNER_URL" \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$FILE"
echo "Backup written: $FILE ($(du -h "$FILE" | cut -f1))"

# Keep the 3 newest local copies.
ls -1t "$DIR"/smarttb-*.dump.enc 2>/dev/null | tail -n +4 | xargs -r rm -f

if [[ -n "${BACKUP_BUCKET:-}" && -n "${RCLONE_CONFIG_EOS_ENDPOINT:-}" ]]; then
  rclone copy "$FILE" "eos:$BACKUP_BUCKET/db/" --s3-no-check-bucket
  rclone delete "eos:$BACKUP_BUCKET/db/" --min-age 30d --s3-no-check-bucket
  echo "Uploaded to object storage: $BACKUP_BUCKET/db/"
else
  echo "Object storage not configured (BACKUP_BUCKET / RCLONE_CONFIG_EOS_*); local copy only"
fi
