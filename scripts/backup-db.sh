#!/usr/bin/env bash
# Back up the database: a compressed pg_dump (custom format, restorable with
# pg_restore) in $BACKUP_DIR, keeping $RETAIN_DAYS days of them.
#
#   scripts/backup-db.sh [label]        # label: nightly | predeploy | manual (default)
#
# DATABASE_URL comes from the environment, else from /srv/thegroove/shared/.env.
# Nightly on the server (crontab -e):
#   15 3 * * * /srv/thegroove/current/scripts/backup-db.sh nightly >> /srv/thegroove/backups/backup.log 2>&1
# Restore: docs/RUNBOOK.md ("Backups").
set -euo pipefail

label="${1:-manual}"
BACKUP_DIR="${BACKUP_DIR:-/srv/thegroove/backups}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"
ENV_FILE="${ENV_FILE:-/srv/thegroove/shared/.env}"

if [ -z "${DATABASE_URL:-}" ] && [ -f "$ENV_FILE" ]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
fi
[ -n "${DATABASE_URL:-}" ] || { echo "backup-db: DATABASE_URL is not set" >&2; exit 1; }

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
out="$BACKUP_DIR/thegroove-${label}-$(date -u +%Y%m%dT%H%M%SZ).dump"
tmp="$out.partial"
pg_dump --format=custom --compress=6 --no-owner --file="$tmp" "$DATABASE_URL"
pg_restore --list "$tmp" > /dev/null # a dump that can't be read isn't a backup
mv "$tmp" "$out"
chmod 600 "$out"
find "$BACKUP_DIR" -name 'thegroove-*.dump' -mtime "+$RETAIN_DAYS" -delete
echo "backup-db: $(date -u +%FT%TZ) wrote $out ($(du -h "$out" | cut -f1))"
