// On-screen notifications (src/components/Notifications.tsx). Types only.

export type ToastKind = "info" | "good" | "bad";

/** A text notification; repeats of the same text merge into one (`count`). */
export type ToastItem = { id: number; text: string; kind: ToastKind; count: number; until: number };

/** An item you just got; more of the same item adds to its `qty`. */
export type GainItem = { id: number; itemKey: string; label: string; qty: number; until: number };

export type GainInput = { itemKey: string; qty: number; label?: string };
