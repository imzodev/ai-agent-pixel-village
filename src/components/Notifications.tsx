"use client";
// The toasts (top right) and the "+2 wood" badges. Kept apart from the HUD
// so a burst of notifications re-renders only this little component: they
// arrive over the bus ("toast", "gained"), are batched into one update per
// animation frame, merge when they repeat (src/game/notifications.ts), and
// expire on a single timer.
import { memo, useEffect, useRef, useState } from "react";
import { bus, ITEM_ICONS } from "@/game/bus";
import { nextExpiry, pushGains, pushToast, sweep } from "@/game/notifications";
import type { GainInput, GainItem, ToastItem, ToastKind } from "@/types/notifications";

/** A quick one-time pop-in (no endless animation over the game). */
const popIn = (el: HTMLElement | null) => {
  if (el && !el.dataset.popped) {
    el.dataset.popped = "1";
    el.animate?.([{ transform: "translateY(-6px) scale(0.96)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 180, easing: "ease-out" });
  }
};

function Notifications() {
  const [toasts, setToasts] = useState<readonly ToastItem[]>([]);
  const [gains, setGains] = useState<readonly GainItem[]>([]);

  // Arrivals wait here until the next frame, then go in as one update.
  const queue = useRef<{ toasts: { text: string; kind?: ToastKind }[]; gains: GainInput[] }>({ toasts: [], gains: [] });
  const frame = useRef(0);
  useEffect(() => {
    const flush = () => {
      frame.current = 0;
      const now = Date.now();
      const q = queue.current;
      queue.current = { toasts: [], gains: [] };
      if (q.toasts.length) setToasts((l) => q.toasts.reduce<ToastItem[]>((acc, t) => pushToast(acc, t, now), [...sweep(l, now)]));
      if (q.gains.length) setGains((l) => pushGains(sweep(l, now), q.gains, now));
    };
    const later = () => { if (!frame.current) frame.current = requestAnimationFrame(flush); };
    const offToast = bus.on("toast", (t) => { queue.current.toasts.push(t); later(); });
    const offGained = bus.on("gained", (items) => { queue.current.gains.push(...items); later(); });
    return () => { offToast(); offGained(); if (frame.current) cancelAnimationFrame(frame.current); };
  }, []);

  // One timer, set for whichever notification expires first.
  const soonest = nextExpiry(toasts, gains);
  useEffect(() => {
    if (soonest == null) return;
    const t = setTimeout(() => {
      const now = Date.now();
      setToasts((l) => sweep(l, now));
      setGains((l) => sweep(l, now));
    }, Math.max(0, soonest - Date.now()) + 20);
    return () => clearTimeout(t);
  }, [soonest]);

  return (
    <div className="pointer-events-none absolute right-2 top-14 flex w-[min(18rem,calc(100vw-1rem))] flex-col sm:right-3 gap-1" style={{ contain: "layout paint" }}>
      {toasts.map((t) => (
        <div key={t.id} ref={popIn} className={`rounded-lg border-2 px-3 py-1.5 shadow ${t.kind === "bad" ? "border-red-800/50 bg-red-100 text-red-900" : t.kind === "good" ? "border-emerald-800/50 bg-emerald-100 text-emerald-900" : "border-stone-500/50 bg-stone-100"}`}>
          {t.text}{t.count > 1 && <span className="ml-1 rounded bg-black/10 px-1 text-[11px] font-bold">×{t.count}</span>}
        </div>
      ))}
      {gains.map((g) => (
        <div key={g.id} ref={popIn} className="rounded-lg bg-amber-300 px-3 py-1 font-bold text-amber-900 shadow">
          {ITEM_ICONS[g.itemKey] ?? "📦"} +{g.qty} {g.label}
        </div>
      ))}
    </div>
  );
}

export default memo(Notifications);
