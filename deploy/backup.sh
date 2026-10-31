#!/usr/bin/env bash
# Hourly database copy, run by smarttb-backup.timer. Dumps MongoDB (every collection from the same moment), encrypts it
# with BACKUP_PASSPHRASE, checks the file can be read back, keeps the last 72 copies on this server and uploads to
# E2E Object Storage if configured (kept 30 days there). Restore: see deploy/OPERATIONS.md.
#
# The paths below are the server's; they can be overridden for a trial run on another computer:
#   SMARTTB_APP_DIR  SMARTTB_ENV_FILE  SMARTTB_MONGO_ENV_FILE  SMARTTB_BACKUP_DIR
set -euo pipefail

APP_DIR="${SMARTTB_APP_DIR:-/opt/smarttb/app}"
ENV_FILE="${SMARTTB_ENV_FILE:-/opt/smarttb/.env}"
MONGO_ENV_FILE="${SMARTTB_MONGO_ENV_FILE:-/opt/smarttb/.env.mongo}"
DIR="${SMARTTB_BACKUP_DIR:-/opt/smarttb/backups}"

# The main env file is plain KEY=value and safe to source. The MongoDB addresses contain "&", so they are never
# sourced: the dump script reads that file itself.
set -a; source "$ENV_FILE"; set +a
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is missing from $ENV_FILE}"
export SMARTTB_ENV_FILES="$ENV_FILE,$MONGO_ENV_FILE"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$DIR/smarttb-$STAMP.dump.enc"
umask 077
mkdir -p "$DIR"

# A half-written file must never look like a backup.
cleanup() { [[ "${OK:-}" == yes ]] || rm -f "$FILE"; }
trap cleanup EXIT

cd "$APP_DIR"
node --import tsx scripts/mongo/backup.mts \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$FILE"

# Read it back: decrypt and check the compressed data is whole. Catches a wrong passphrase or a damaged file now,
# not on the day it is needed.
SIZE="$(stat -c %s "$FILE")"
if (( SIZE < 200 )); then echo "Backup is suspiciously small ($SIZE bytes)"; exit 1; fi
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$FILE" | gzip -t
OK=yes
echo "Backup written and verified: $FILE ($(du -h "$FILE" | cut -f1))"

# Keep the 72 newest local copies (3 days of hourly backups, so a PC that pulls copies can catch up after a weekend).
ls -1t "$DIR"/smarttb-*.dump.enc 2>/dev/null | tail -n +73 | xargs -r rm -f

if [[ -n "${BACKUP_BUCKET:-}" && -n "${RCLONE_CONFIG_EOS_ENDPOINT:-}" ]]; then
  rclone copy "$FILE" "eos:$BACKUP_BUCKET/db/" --s3-no-check-bucket
  rclone delete "eos:$BACKUP_BUCKET/db/" --min-age 30d --s3-no-check-bucket
  echo "Uploaded to object storage: $BACKUP_BUCKET/db/"
else
  echo "Object storage not configured (BACKUP_BUCKET / RCLONE_CONFIG_EOS_*); local copy only"
fi
