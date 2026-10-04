// Fresh batches: the baker sets loaves out on a table in front of the
// bakery every BAKE_INTERVAL_MS (only while they're at the bakery), and
// anyone passing may take one free loaf per batch until they run out.
// Pure data + rules; tickd bakes and the route serves (src/lib/bakeryServer.ts).

import type { BreadTableDef } from "@/types/bakery";

export type { BreadState, BreadTableDef, BreadTableSnapshot, BreadTakeResult } from "@/types/bakery";

export const BAKE_INTERVAL_MS = 30 * 60_000;
export const BATCH_LOAVES = 12;
/** The baker only bakes when standing within this of the table. */
export const BAKER_HOME_PX = 12 * 16;
/** How close you must be to take a loaf. */
export const BREAD_REACH_PX = 56;
export const BREAD_ITEM = "bread";

export const BREAD_TABLES: readonly BreadTableDef[] = [
  // In front of Marigold's bakery (bakery_village at 38,6; the table is
  // template cols 10–11, row 13 — scripts/draw-trade-buildings.mjs).
  { key: "bakery_village", name: "Marigold's bread table", bakerKey: "village_marigold", tx: 48, ty: 19 },
];

/** Where you stand to take a loaf: just in front of the table's middle. */
export function tablePoint(t: BreadTableDef): { x: number; y: number } {
  return { x: (t.tx + 1) * 16, y: (t.ty + 1) * 16 + 4 };
}

export function tableByKey(key: string): BreadTableDef | undefined {
  return BREAD_TABLES.find((t) => t.key === key);
}

/** Loaves left in a batch. */
export function loavesLeft(batch: { qty: number; taken: number } | null | undefined): number {
  return batch ? Math.max(0, batch.qty - batch.taken) : 0;
}

/** Is a new batch due (none yet, or the last one is BAKE_INTERVAL_MS old)? */
export function batchDue(lastBakedAt: number | null, now: number): boolean {
  return lastBakedAt == null || now - lastBakedAt >= BAKE_INTERVAL_MS;
}
