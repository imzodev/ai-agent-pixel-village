// Pure fan-out planning for per-beat `moves` messages. No sockets, no
// DB: the WS server hands in its connections and the beat's moves and
// gets back one payload per spatial bucket to send to every member.

import { tileCenter } from "./motion";
import type { FanoutBucket, FanoutPeer, ScheduledMove } from "@/types/motion";

/** True when a move's origin or destination lies inside the box. */
function moveInBox(m: ScheduledMove, xMin: number, xMax: number, yMin: number, yMax: number): boolean {
  const o = tileCenter(m.move.path[0]);
  const inside = (x: number, y: number) => x >= xMin && x < xMax && y >= yMin && y < yMax;
  return inside(o.x, o.y) || inside(m.x, m.y);
}

/**
 * Group peers on a `bucketPx` grid and pick, per bucket, the moves
 * within `radiusPx` of any point in it — a superset of each member's
 * own proximity window, so a single serialised payload serves all of
 * them. Backed-up peers are skipped (the next beat / resync heals
 * them); buckets with nothing nearby are dropped.
 */
export function planMoveFanout<P extends FanoutPeer>(
  peers: Iterable<P>,
  moves: readonly ScheduledMove[],
  bucketPx: number,
  radiusPx: number,
): FanoutBucket<P>[] {
  const buckets = new Map<string, { bx: number; by: number; peers: P[] }>();
  for (const p of peers) {
    if (p.backedUp) continue;
    const bx = Math.floor(p.x / bucketPx);
    const by = Math.floor(p.y / bucketPx);
    const key = `${bx},${by}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { bx, by, peers: [] }));
    b.peers.push(p);
  }
  const out: FanoutBucket<P>[] = [];
  const span = bucketPx + 2 * radiusPx;
  for (const b of buckets.values()) {
    const xMin = b.bx * bucketPx - radiusPx;
    const yMin = b.by * bucketPx - radiusPx;
    const near = moves.filter((m) => moveInBox(m, xMin, xMin + span, yMin, yMin + span));
    if (near.length > 0) out.push({ peers: b.peers, moves: near });
  }
  return out;
}
