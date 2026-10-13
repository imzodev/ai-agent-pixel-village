"use client";
// A wooden sign that slides in near the top with the name of the
// region you just walked into (emitted by WorldScene on region changes).

import { useEffect, useState } from "react";
import { bus } from "@/game/bus";

export default function LocationBanner() {
  const [shown, setShown] = useState<{ name: string; n: number } | null>(null);
  useEffect(() => bus.on("region", ({ name, quiet }) => { if (!quiet) setShown((prev) => ({ name, n: (prev?.n ?? 0) + 1 })); }), []);
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), 3300);
    return () => clearTimeout(t);
  }, [shown]);
  if (!shown) return null;
  return (
    // Centred, so it never lands on the quest card (left) or the toasts
    // (right): just under the top bar from sm up, above the player on phones.
    <div className="pointer-events-none absolute inset-x-0 top-[34%] z-40 flex justify-center sm:top-[calc(var(--hud-top,3.5rem)+0.75rem)]">
      <div key={shown.n} className="location-banner px-5 py-2 font-pixel text-xl font-bold tracking-wide">
        {shown.name}
      </div>
    </div>
  );
}
