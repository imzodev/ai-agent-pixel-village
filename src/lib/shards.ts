// WS shard parsing and pickShard. Logic only — types in @/types/shards.
//
// Single-process deployments don't actually shard anything: they run one
// WS process and the LB routes nothing. The plumbing exists so a
// multi-process deployment can declare WS_SHARD_REGIONS without code
// changes.
//
// Format: "xMin-xMax,yMin-yMax;xMin-xMax,yMin-yMax;..."
// Example: WS_SHARD_REGIONS="0-9,-9-0;10-19,0-9;20-29,-9-0"

import type { ShardRegion } from "@/types/shards";

/** Parse WS_SHARD_REGIONS into a list of regions. Empty env → one
 *  unbounded region (whole world). */
export function parseShardRegions(env: string | undefined): ShardRegion[] {
  if (!env || !env.trim()) return [unboundedRegion()];
  const out: ShardRegion[] = [];
  for (const part of env.split(";")) {
    const piece = part.trim();
    if (!piece) continue;
    const [xy, yrange] = piece.split(",");
    if (!xy || !yrange) continue;
    const [xMin, xMax] = parseRange(xy);
    const [yMin, yMax] = parseRange(yrange);
    if (xMin === null || yMin === null) continue;
    out.push({ xMin, xMax, yMin, yMax });
  }
  return out.length ? out : [unboundedRegion()];
}

function parseRange(token: string): [number, number] | [null, null] {
  const [a, b] = token.split("-");
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return [null, null];
  const lo = Math.min(x, y);
  const hi = Math.max(x, y);
  return [lo, hi];
}

function unboundedRegion(): ShardRegion {
  return { xMin: Number.MIN_SAFE_INTEGER, xMax: Number.MAX_SAFE_INTEGER, yMin: Number.MIN_SAFE_INTEGER, yMax: Number.MAX_SAFE_INTEGER };
}

/** Is the given chunk inside any of the regions? */
export function chunkInRegions(cx: number, cy: number, regions: ShardRegion[]): boolean {
  return regions.some(
    (r) => cx >= r.xMin && cx <= r.xMax && cy >= r.yMin && cy <= r.yMax,
  );
}

/** Pick a shard id for a player at world position (cx, cy). Returns the
 *  index of the matching region in `regions`, or "0" if none match. */
export function pickShardId(cx: number, cy: number, regions: ShardRegion[]): string {
  const idx = regions.findIndex(
    (r) => cx >= r.xMin && cx <= r.xMax && cy >= r.yMin && cy <= r.yMax,
  );
  return idx >= 0 ? String(idx) : "0";
}

/**
 * Pick a shard id for a player at the given world pixel (x, y). Convenience
 * wrapper that handles chunk math. Single-process deployments (one region)
 * always return "0".
 */
export function pickShardForPosition(x: number, y: number): string {
  const cx = Math.floor(x / 384);
  const cy = Math.floor(y / 240);
  return pickShardId(cx, cy, parseShardRegions(process.env.WS_SHARD_REGIONS));
}

/** Process-local shard id (from WS_SHARD_ID, defaults to "0"). */
export const localShardId = (): string => process.env.WS_SHARD_ID ?? "0";

/** Process-local region (parsed once). */
export const localShardRegion = (): ShardRegion => {
  const regions = parseShardRegions(process.env.WS_SHARD_REGIONS);
  return regions[0] ?? unboundedRegion();
};
