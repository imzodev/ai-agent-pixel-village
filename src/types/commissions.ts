// Furniture commissions (src/lib/commissions.ts). Types only.

/** A piece an NPC might order, and how many. */
export type CommissionWish = { item: string; qty: number };

/** An NPC who orders furniture now and then. */
export type Commissioner = { npcKey: string; wishes: readonly CommissionWish[] };
