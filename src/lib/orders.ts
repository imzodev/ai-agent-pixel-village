// Standing orders, the pure part: a player signs up to supply an NPC with a
// mind so many of an item a week (src/lib/mind/profiles.ts `orders`). Each
// delivery is paid from the NPC's purse; filling the whole week pays a
// bonus. The week starts over lazily. Server: src/lib/ordersServer.ts.

import type { OrderView } from "@/types/mind";

export const WEEK_MS = 7 * 24 * 3600_000;
/** Most players supplying one NPC with one item. */
export const MAX_ORDERS_PER_ITEM = 5;
/** Extra pay for filling the whole week. */
export const ORDER_BONUS = 0.2;

/** Has the order's week run out (a fresh week starts)? */
export function weekRolled(weekStart: number, now: number): boolean {
  return now - weekStart >= WEEK_MS;
}

/** How many to deliver now: what's left this week, what you carry. */
export function deliverable(qtyPerWeek: number, delivered: number, have: number): number {
  return Math.max(0, Math.min(have, qtyPerWeek - delivered));
}

/** Pay for a delivery, and the bonus if it fills the week. */
export function deliveryPay(o: { qtyPerWeek: number; delivered: number }, n: number, pay: number): { coins: number; bonus: number; filled: boolean } {
  const filled = o.delivered < o.qtyPerWeek && o.delivered + n >= o.qtyPerWeek;
  return { coins: n * pay, bonus: filled ? Math.round(o.qtyPerWeek * pay * ORDER_BONUS) : 0, filled };
}

/** One row of an NPC's Orders menu, from the order's terms and your sign-up (if any). */
export function orderRow(
  o: { itemKey: string; name: string; qty: number; pay: number },
  mine: { qtyPerWeek: number; delivered: number; weekStart: number } | null,
  have: number,
  takenByOthers: number,
  now: number,
): OrderView {
  const delivered = mine && !weekRolled(mine.weekStart, now) ? mine.delivered : 0;
  return {
    itemKey: o.itemKey, name: o.name, qtyPerWeek: mine?.qtyPerWeek ?? o.qty, pay: o.pay,
    taken: !!mine,
    deliveredThisWeek: delivered,
    canDeliver: mine ? deliverable(mine.qtyPerWeek, delivered, have) : 0,
    full: !mine && takenByOthers >= MAX_ORDERS_PER_ITEM,
  };
}
