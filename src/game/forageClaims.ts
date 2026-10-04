// The wild patches this player has picked and when each is theirs again
// (src/lib/forage.ts). Picks are personal: a picked patch disappears for
// you alone and comes back when your cooldown ends; others still see it.
// Filled by the HUD (on login, and on every pick), read by the scene.

import { forageKey, isForage } from "@/lib/forage";

const readyAt = new Map<string, number>();

/** Replace everything (from the server, on login). */
export function setForageClaims(claims: readonly { patch: string; readyAt: number }[]): void {
  readyAt.clear();
  for (const c of claims) readyAt.set(c.patch, c.readyAt);
}

/** You just picked a patch: hidden for you until `at`. */
export function claimForage(kind: string, x: number, y: number, at: number): void {
  readyAt.set(forageKey(kind, x, y), at);
}

/** Is this node a wild patch you've picked that isn't back yet? */
export function pickedByMe(kind: string, x: number, y: number, now = Date.now()): boolean {
  if (!isForage(kind)) return false;
  const key = forageKey(kind, x, y);
  const t = readyAt.get(key);
  if (t == null) return false;
  if (t <= now) { readyAt.delete(key); return false; }
  return true;
}
