"use client";
// A wooden sign that slides in from the top-left with the name of the
// region you just walked into (emitted by WorldScene on region changes).

import { useEffect, useState } from "react";
import { bus } from "@/game/bus";

export default function LocationBanner() {
  const [shown, setShown] = useState<{ name: string; n: number } | null>(null);
  useEffect(() => bus.on("region", ({ name }) => setShown((prev) => ({ name, n: (prev?.n ?? 0) + 1 }))), []);
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), 3300);
    return () => clearTimeout(t);
  }, [shown]);
  if (!shown) return null;
  return (
    <div key={shown.n} className="location-banner pointer-events-none absolute left-3 top-14 z-40 px-5 py-2 font-pixel text-xl font-bold tracking-wide">
      {shown.name}
    </div>
  );
}
