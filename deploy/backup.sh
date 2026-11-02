#!/usr/bin/env bash
# Hourly database copy, run by smarttb-backup.timer. Dumps MongoDB (every collection from the same moment), encrypts it
# with BACKUP_PASSPHRASE, checks the file can be read back, keeps the last 72 copies on this server and uploads to
# E2E Object Storage if configured (kept 30 days there). Then archives the Module 5 photos added since the last run
# (smarttb-images-<time>.dump.enc, encrypted the same way, never deleted: together they hold every photo).
# Restore: see deploy/OPERATIONS.md.
#
# The paths below are the server's; they can be overridden for a trial run on another computer:
#   SMARTTB_APP_DIR  SMARTTB_ENV_FILE  SMARTTB_MONGO_ENV_FILE  SMARTTB_BACKUP_DIR  SMARTTB_UPLOAD_DIR
set -euo pipefail

APP_DIR="${SMARTTB_APP_DIR:-/opt/smarttb/app}"
ENV_FILE="${SMARTTB_ENV_FILE:-/opt/smarttb/.env}"
MONGO_ENV_FILE="${SMARTTB_MONGO_ENV_FILE:-/opt/smarttb/.env.mongo}"
DIR="${SMARTTB_BACKUP_DIR:-/opt/smarttb/backups}"
UPLOADS="${SMARTTB_UPLOAD_DIR:-/opt/smarttb/uploads}"

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
cleanup() { [[ "${OK:-}" == yes ]] || rm -f "$FILE"; [[ -n "${IFILE:-}" && "${IOK:-}" != yes ]] && rm -f "$IFILE"; return 0; }
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
# Optional: let the restricted backup-pull account (deploy/backup-serve.sh) read the encrypted file.
if [[ -n "${BACKUP_READ_GROUP:-}" ]]; then chgrp "$BACKUP_READ_GROUP" "$FILE" && chmod 640 "$FILE"; fi
echo "Backup written and verified: $FILE ($(du -h "$FILE" | cut -f1))"

# Keep the 72 newest database copies (3 days of hourly backups, so a PC that pulls copies can catch up after a
# weekend). Photo archives are not touched: each holds only the photos added in its hour.
ls -1t "$DIR"/smarttb-2*.dump.enc 2>/dev/null | tail -n +73 | xargs -r rm -f

# Module 5 photos added since the last run. The list of photos already archived is kept next to the backups.
if [[ -d "$UPLOADS" ]]; then
  STATE="$DIR/.images-archived"
  touch "$STATE"
  NEW="$(cd "$UPLOADS" && find . -type f ! -name '*.tmp' | sed 's#^\./##' | LC_ALL=C sort | LC_ALL=C comm -23 - <(LC_ALL=C sort "$STATE"))"
  if [[ -n "$NEW" ]]; then
    IFILE="$DIR/smarttb-images-$STAMP.dump.enc"
    (cd "$UPLOADS" && printf '%s\n' "$NEW" | tar -czf - -T -) \
      | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$IFILE"
    # Read it back: every photo listed must be in the archive.
    INARCHIVE="$(openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$IFILE" | tar -tzf - | wc -l)"
    COUNT="$(printf '%s\n' "$NEW" | wc -l)"
    if (( INARCHIVE != COUNT )); then echo "Photo archive check failed ($INARCHIVE of $COUNT)"; exit 1; fi
    if [[ -n "${BACKUP_READ_GROUP:-}" ]]; then chgrp "$BACKUP_READ_GROUP" "$IFILE" && chmod 640 "$IFILE"; fi
    IOK=yes
    printf '%s\n' "$NEW" >> "$STATE"
    echo "Photos: $COUNT new, archived and verified: $IFILE ($(du -h "$IFILE" | cut -f1))"
  else
    echo "Photos: none new since the last backup"
  fi
fi

if [[ -n "${BACKUP_BUCKET:-}" && -n "${RCLONE_CONFIG_EOS_ENDPOINT:-}" ]]; then
  rclone copy "$FILE" "eos:$BACKUP_BUCKET/db/" --s3-no-check-bucket
  if [[ "${IOK:-}" == yes ]]; then rclone copy "$IFILE" "eos:$BACKUP_BUCKET/images/" --s3-no-check-bucket; fi
  rclone delete "eos:$BACKUP_BUCKET/db/" --min-age 30d --s3-no-check-bucket
  echo "Uploaded to object storage: $BACKUP_BUCKET/db/"
else
  echo "Object storage not configured (BACKUP_BUCKET / RCLONE_CONFIG_EOS_*); local copy only"
fi
