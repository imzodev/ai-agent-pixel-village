// The bakery bread tables on the client (src/lib/bakery.ts): how the loaves
// of a batch are laid out on the table, and which batches this player has
// already taken their loaf from. Filled by the HUD (on login, and on every
// loaf taken), read by the scene. Others still see the loaves you didn't take.

import { BATCH_LOAVES } from "@/lib/bakery";
import type { BreadTableDef, LoafSlot } from "@/types/bakery";

/** A loaf, 8×4 world px (src/game/textures.ts). */
export const LOAF_ROWS = ["..cccc..", ".cLccLc.", "cccccccd", ".dddddd."];
export const LOAF_PALETTE = { c: "#d08a40", L: "#fadaa0", d: "#7a3e18" };

/**
 * Where each loaf of a full batch sits, front row first: a heap of three
 * rows of four on the cloth. The first `left` slots are drawn, so the top
 * of the heap goes first.
 */
export function loafSlots(t: BreadTableDef): LoafSlot[] {
  const x0 = t.tx * 16 + 1, y0 = t.ty * 16 + 1;
  const out: LoafSlot[] = [];
  for (const [dy, dx] of [[1, 0], [-2, 3], [-5, 5]]) for (let k = 0; k < 4; k++) out.push({ x: x0 + dx + k * 6, y: y0 + dy });
  return out.slice(0, BATCH_LOAVES);
}

const taken = new Set<number>();

/** Replace everything (from the server, on login). */
export function setBreadTaken(batchIds: readonly number[]): void {
  taken.clear();
  for (const id of batchIds) taken.add(id);
}

/** You just took your loaf from this batch. */
export function tookBread(batchId: number): void {
  taken.add(batchId);
}

/** Have you had your loaf from this batch? */
export function breadTakenByMe(batchId: number | null): boolean {
  return batchId != null && taken.has(batchId);
}
