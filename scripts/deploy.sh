#!/usr/bin/env bash
# Deploy one commit to the droplet. Run on the droplet (the GitHub Action does
# this over SSH, or run it by hand):
#
#   /srv/thegroove/current/scripts/deploy.sh <git-sha>
#
# Layout (DEPLOY_BASE, default /srv/thegroove):
#   releases/<sha>/   one checkout per deploy; the live one is `current`
#   current           symlink to the live release
#   shared/.env       secrets, linked into every release
#   shared/.cache/    map tiles and nav grids, linked into every release
#   shared/lpc/*.png  sprite sheets (public/lpc is gitignored), linked in
#
# The old release serves until the symlink swap. If the health check fails
# after the swap, `current` goes back to the previous release.

set -euo pipefail

SHA="${1:?usage: deploy.sh <git-sha>}"
BASE="${DEPLOY_BASE:-/srv/thegroove}"
REPO_URL="${REPO_URL:-git@github.com:imzodev/ai-agent-pixel-village.git}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
KEEP=5
TSX="node_modules/.bin/tsx"

log() { printf '[deploy %s] %s\n' "$(date +%H:%M:%S)" "$*"; }

# One deploy at a time.
exec 9>"$BASE/deploy.lock"
flock -n 9 || { log "another deploy is running"; exit 1; }

rel="$BASE/releases/$SHA"

# 1. Check out the commit (skipped if an earlier attempt already did).
if [ ! -d "$rel/.git" ]; then
  log "cloning $SHA"
  rm -rf "$rel.tmp"
  git clone --quiet "$REPO_URL" "$rel.tmp"
  git -C "$rel.tmp" checkout --quiet --detach "$SHA"
  mv "$rel.tmp" "$rel"
fi

# 2. Link shared state into the release.
compgen -G "$BASE/shared/lpc/*.png" >/dev/null \
  || { log "no sprite sheets in $BASE/shared/lpc (see RUNBOOK: Deploying)"; exit 1; }
ln -sfn "$BASE/shared/.env" "$rel/.env"
ln -sfn "$BASE/shared/.cache" "$rel/.cache"
mkdir -p "$rel/public/lpc"
for f in "$BASE"/shared/lpc/*.png; do ln -sfn "$f" "$rel/public/lpc/"; done

cd "$rel"

# 3. Dependencies and build (the live release keeps serving meanwhile).
log "installing dependencies"
pnpm install --frozen-lockfile
log "building"
pnpm build

# 4. Database: the drift fix, then push. drizzle-kit can't prompt without a
#    terminal, and `timeout` stops it if it waits anyway. Never answer
#    "truncate" (AGENTS.md).
set -a; . "$rel/.env"; set +a
log "fixing constraint drift"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f scripts/fix-db-drift.sql
log "pushing schema"
timeout 300 pnpm db:push </dev/null

# 5. Draw the map for this version before traffic arrives.
log "drawing map tiles"
"$TSX" --env-file=.env --tsconfig tsconfig.json scripts/build-map.ts

# 6. Swap the symlink, then restart. The server goes first, then tickd, so
#    tickd's advisory lock is released cleanly before the new one takes it.
prev="$(readlink -f "$BASE/current" 2>/dev/null || true)"

# pm2 reload/startOrReload keeps an app's original cwd and script, so the apps
# are deleted and started from the new ecosystem file. Each one still gets
# kill_timeout to drain and release the tickd lock.
switch_to() {
  ln -sfn "$1" "$BASE/current.next"
  mv -Tf "$BASE/current.next" "$BASE/current"
  (
    cd "$BASE/current"
    pm2 delete ai-village-server ai-village-tickd >/dev/null 2>&1 || true
    pm2 start ecosystem.config.js
    pm2 save >/dev/null
  )
}

log "switching to $SHA"
switch_to "$rel"

# 7. Health check. Roll back if it never comes up.
healthy() {
  for _ in $(seq 1 30); do
    curl -fsS -o /dev/null "$HEALTH_URL" && return 0
    sleep 2
  done
  return 1
}

if ! healthy; then
  log "health check failed"
  if [ -n "$prev" ] && [ -d "$prev" ] && [ "$prev" != "$rel" ]; then
    log "rolling back to $(basename "$prev")"
    switch_to "$prev"
  fi
  exit 1
fi
log "healthy"

# 8. Keep the newest $KEEP releases; never the live one.
live="$(readlink -f "$BASE/current")"
ls -1t "$BASE/releases" | tail -n +$((KEEP + 1)) | while read -r old; do
  [ "$BASE/releases/$old" = "$live" ] || rm -rf "$BASE/releases/$old"
done

log "deployed $SHA"
