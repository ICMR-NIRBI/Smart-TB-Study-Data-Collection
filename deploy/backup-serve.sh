#!/usr/bin/env bash
# The only thing the backup-pull SSH key may run (set as its forced command in authorized_keys). It allows exactly the
# two requests deploy/pull-backups.ps1 makes, listing the encrypted backups and downloading one of them, and refuses
# everything else, including a shell. The files stay encrypted: the PC that pulls them never needs the passphrase.
# Set-up: deploy/README.md, section 6.
set -euo pipefail

DIR=/opt/smarttb/backups
CMD="${SSH_ORIGINAL_COMMAND:-}"
CMD="${CMD#sudo }" # the pull script was written for a server where it used sudo; not needed here

if [[ "$CMD" == "find $DIR -maxdepth 1 -name smarttb-\\*.dump.enc -exec stat -c %n,%s {} +" ]]; then
  exec find "$DIR" -maxdepth 1 -name 'smarttb-*.dump.enc' -exec stat -c %n,%s {} +
elif [[ "$CMD" =~ ^cat\ (/opt/smarttb/backups/smarttb-(images-)?[0-9]{8}T[0-9]{6}Z\.dump\.enc)$ ]]; then
  exec cat "${BASH_REMATCH[1]}"
else
  echo "Not allowed: this key can only list and download the SMART-TB backup files." >&2
  exit 1
fi
