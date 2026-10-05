"use client";
// A workshop's Showroom tab: the furniture on show on the porch (everyone
// passing by sees it) and the pieces in your bag you could put up.
// Rules: src/lib/ranchServer.ts showroom().
import FurnitureSprite from "./FurnitureSprite";
import { SHOWROOM_SIZE } from "@/game/workshopProps";
import type { RanchGrowthView } from "@/types/ranchGrowth";

export default function RanchShowroom({ g, busy, act }: { g: RanchGrowthView; busy: boolean; act: (body: Record<string, unknown>) => void }) {
  const shown = g.display ?? [];
  return (
    <div className="space-y-2">
      <div className="text-[12px] text-stone-600">On the porch ({shown.length}/{SHOWROOM_SIZE}) — everyone walking by can see them. Click one to take it back.</div>
      <div className="flex flex-wrap gap-1.5">
        {shown.length === 0 && <span className="text-[12px] text-stone-500">Nothing on show yet.</span>}
        {shown.map((item, i) => (
          <button key={`${item}-${i}`} disabled={busy} onClick={() => act({ action: "undisplay", index: i })} className="rounded border border-amber-900/20 bg-amber-50/90 p-1 hover:bg-amber-100" title="Take it back">
            <FurnitureSprite itemKey={item} size={48} />
          </button>
        ))}
      </div>
      <div className="text-[12px] font-bold">From your bag</div>
      <div className="flex flex-wrap gap-1.5">
        {g.displayable.length === 0 && <span className="text-[12px] text-stone-500">No furniture in your bag. Make some in the Workshop tab.</span>}
        {g.displayable.map((d) => (
          <button key={d.itemKey} disabled={busy || shown.length >= SHOWROOM_SIZE} onClick={() => act({ action: "display", item: d.itemKey })} className="pixel-btn flex items-center gap-1 bg-white/80 px-2 py-1 text-xs disabled:opacity-40" title="Put it on show">
            <FurnitureSprite itemKey={d.itemKey} size={24} /> ×{d.qty}
          </button>
        ))}
      </div>
    </div>
  );
}
