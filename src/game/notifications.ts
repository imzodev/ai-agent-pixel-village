// The rules for on-screen notifications: repeats merge instead of stacking,
// each stack is capped, and everything expires on its own clock. Pure, so a
// burst of notifications is one state change (src/components/Notifications.tsx).

import type { GainInput, GainItem, ToastItem, ToastKind } from "@/types/notifications";

export const MAX_TOASTS = 4;
export const MAX_GAINS = 4;
export const TOAST_MS = 4200;
export const GAIN_MS = 2600;

let nextId = 0;
const newId = () => ++nextId;

/** Add a toast: the same text again bumps its count and keeps it up longer. */
export function pushToast(list: readonly ToastItem[], t: { text: string; kind?: ToastKind }, now: number): ToastItem[] {
  const kind = t.kind ?? "info";
  const same = list.find((x) => x.text === t.text && x.kind === kind);
  if (same) return list.map((x) => (x === same ? { ...x, count: x.count + 1, until: now + TOAST_MS } : x));
  return [...list, { id: newId(), text: t.text, kind, count: 1, until: now + TOAST_MS }].slice(-MAX_TOASTS);
}

/** Add gained items: more of an item already showing adds to it. */
export function pushGains(list: readonly GainItem[], items: readonly GainInput[], now: number): GainItem[] {
  let out = [...list];
  for (const g of items) {
    const label = g.label ?? g.itemKey.replace(/_/g, " ");
    const same = out.find((x) => x.itemKey === g.itemKey && x.label === label);
    out = same
      ? out.map((x) => (x === same ? { ...x, qty: x.qty + g.qty, until: now + GAIN_MS } : x))
      : [...out, { id: newId(), itemKey: g.itemKey, label, qty: g.qty, until: now + GAIN_MS }];
  }
  return out.slice(-MAX_GAINS);
}

/** Drop what has expired (the same list back when nothing has). */
export function sweep<T extends { until: number }>(list: readonly T[], now: number): readonly T[] {
  return list.some((x) => x.until <= now) ? list.filter((x) => x.until > now) : list;
}

/** When the next notification expires, or null when there are none. */
export function nextExpiry(...lists: readonly (readonly { until: number }[])[]): number | null {
  let soonest: number | null = null;
  for (const l of lists) for (const x of l) if (soonest == null || x.until < soonest) soonest = x.until;
  return soonest;
}
