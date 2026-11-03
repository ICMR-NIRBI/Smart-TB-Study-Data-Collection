#!/usr/bin/env bash
# Runs the actions System control may ask for, as root. Started by smarttb-actions.path whenever the app drops a
# request file in /opt/smarttb/actions. Only two actions exist: "backup" (run the hourly backup now) and "restart"
# (restart the app). Anything else is ignored. The request's contents are never read or run: only its name counts.
# Results go to /var/lib/smarttb-actions (root-owned; the app can read but not write there).
set -uo pipefail

REQ=/opt/smarttb/actions
OUT=/var/lib/smarttb-actions
install -d -m 755 "$OUT"

result() { # action ok message started
  local tmp
  tmp="$(mktemp "$OUT/.result.XXXXXX")"
  printf '{"action":"%s","ok":%s,"message":"%s","startedAt":"%s","finishedAt":"%s"}\n' "$1" "$2" "$3" "$4" "$(date -u +%FT%TZ)" >"$tmp"
  chmod 644 "$tmp"
  mv -f "$tmp" "$OUT/$1.json"
}

for f in "$REQ"/*.request; do
  [[ -e "$f" || -L "$f" ]] || continue
  name="$(basename "$f" .request)"
  rm -f -- "$f"
  started="$(date -u +%FT%TZ)"
  case "$name" in
    backup)
      if systemctl start smarttb-backup.service; then
        result backup true "Backup written and verified" "$started"
      else
        result backup false "The backup failed. On the server: journalctl -u smarttb-backup -n 30" "$started"
      fi
      ;;
    restart)
      result restart true "Restarting" "$started"
      systemctl restart smarttb.service
      ok=false
      for _ in $(seq 1 30); do
        sleep 2
        if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; then ok=true; break; fi
      done
      if $ok; then
        result restart true "Restarted; health check OK" "$started"
      else
        result restart false "Restarted, but the app did not come back. On the server: journalctl -u smarttb -n 100" "$started"
      fi
      ;;
    *) ;;
  esac
done
