#!/usr/bin/env bash
# Back up the database and the uploads: a compressed pg_dump (custom format,
# restorable with pg_restore) and a tarball of the billboard posters in
# $BACKUP_DIR, keeping $RETAIN_DAYS days of them, and a copy of both off the
# server when BACKUP_S3_BUCKET is set.
#
#   scripts/backup-db.sh [label]        # label: nightly | predeploy | manual (default)
#
# DATABASE_URL, BILLBOARD_DIR and the BACKUP_S3_* settings come from the
# environment, else from /srv/thegroove/shared/.env.
# Off the server (any S3-compatible store, e.g. DigitalOcean Spaces; needs the aws CLI):
#   BACKUP_S3_BUCKET=thegroove-backups
#   BACKUP_S3_ENDPOINT=https://nyc3.digitaloceanspaces.com
#   BACKUP_S3_KEY=…  BACKUP_S3_SECRET=…
# A failed upload is reported (and fails a nightly run) but never stops a deploy.
# Nightly on the server (crontab -e):
#   15 3 * * * /srv/thegroove/current/scripts/backup-db.sh nightly >> /srv/thegroove/backups/backup.log 2>&1
# Restore: docs/RUNBOOK.md ("Backups").
set -euo pipefail

label="${1:-manual}"
BACKUP_DIR="${BACKUP_DIR:-/srv/thegroove/backups}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"
ENV_FILE="${ENV_FILE:-/srv/thegroove/shared/.env}"

# A setting from the environment, else from the env file.
setting() {
  local v="${!1:-}"
  if [ -z "$v" ] && [ -f "$ENV_FILE" ]; then
    v="$(grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' || true)"
  fi
  printf '%s' "$v"
}

DATABASE_URL="$(setting DATABASE_URL)"
[ -n "$DATABASE_URL" ] || { echo "backup-db: DATABASE_URL is not set" >&2; exit 1; }
POSTER_DIR="$(setting BILLBOARD_DIR)"
POSTER_DIR="${POSTER_DIR:-$(dirname "$ENV_FILE")/.data/billboards}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$BACKUP_DIR/thegroove-${label}-${stamp}.dump"
tmp="$out.partial"
pg_dump --format=custom --compress=6 --no-owner --file="$tmp" "$DATABASE_URL"
pg_restore --list "$tmp" > /dev/null # a dump that can't be read isn't a backup
mv "$tmp" "$out"
chmod 600 "$out"
echo "backup-db: $(date -u +%FT%TZ) wrote $out ($(du -h "$out" | cut -f1))"

# Billboard posters (advertisers' uploads, by content hash).
posters=""
if [ -d "$POSTER_DIR" ]; then
  posters="$BACKUP_DIR/thegroove-posters-${label}-${stamp}.tar.gz"
  tar -czf "$posters.partial" -C "$POSTER_DIR" .
  mv "$posters.partial" "$posters"
  chmod 600 "$posters"
  echo "backup-db: wrote $posters ($(du -h "$posters" | cut -f1))"
else
  echo "backup-db: no poster folder at $POSTER_DIR, skipped"
fi

find "$BACKUP_DIR" \( -name 'thegroove-*.dump' -o -name 'thegroove-posters-*.tar.gz' \) -mtime "+$RETAIN_DAYS" -delete

# Off the server. Old copies there are pruned by the bucket's lifecycle rule (RUNBOOK).
bucket="$(setting BACKUP_S3_BUCKET)"
[ -n "$bucket" ] || exit 0
failed=0
if ! command -v aws > /dev/null; then
  echo "backup-db: BACKUP_S3_BUCKET is set but the aws CLI isn't installed" >&2
  failed=1
else
  endpoint="$(setting BACKUP_S3_ENDPOINT)"
  AWS_ACCESS_KEY_ID="$(setting BACKUP_S3_KEY)" AWS_SECRET_ACCESS_KEY="$(setting BACKUP_S3_SECRET)"
  export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
  for f in "$out" ${posters:+"$posters"}; do
    if aws s3 cp --only-show-errors ${endpoint:+--endpoint-url "$endpoint"} "$f" "s3://$bucket/$(basename "$f")"; then
      echo "backup-db: copied $(basename "$f") to s3://$bucket"
    else
      echo "backup-db: copying $(basename "$f") to s3://$bucket failed" >&2
      failed=1
    fi
  done
fi
[ "$failed" = 0 ] || [ "$label" = predeploy ] || exit 3
