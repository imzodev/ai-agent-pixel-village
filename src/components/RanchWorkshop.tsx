"use client";
// The ranch's Workshop tab: run the mill, cheese press and loom, collect
// what's done and the hives' honey. Rules: src/lib/ranchUpgrades.ts.
import { ITEM_ICONS } from "@/game/bus";
import type { RanchGrowthView } from "@/types/ranchGrowth";

const mins = (ms: number) => `${Math.max(1, Math.ceil(ms / 60_000))}m`;

export default function RanchWorkshop({ g, busy, act }: { g: RanchGrowthView; busy: boolean; act: (body: Record<string, unknown>) => void }) {
  const ready = g.jobs.filter((j) => j.ready).length + (g.honey ?? 0);
  if (!g.recipes.length && g.honey == null) return <div className="text-[12px] text-stone-600">No machines yet. Build a mill, a cheese press, a loom or beehives in the Build tab.</div>;
  return (
    <div className="space-y-1.5">
      <button disabled={busy || ready === 0} onClick={() => act({ action: "workshop" })} className="pixel-btn bg-amber-300 px-2 py-1 text-sm font-bold disabled:opacity-40">🧺 Collect {ready > 0 ? `(${ready})` : ""}</button>
      {g.honey != null && <div className="text-[12px]">🍯 Beehives: {g.honey} honey ready</div>}
      {g.jobs.map((j) => (
        <div key={j.machine} className="text-[12px]">⚙️ {j.machine}: {ITEM_ICONS[j.output] ?? ""} {j.qty} {j.output} {j.ready ? <b className="text-emerald-700">ready!</b> : `in ${mins(j.inMs)}`}</div>
      ))}
      <div className="flex flex-wrap gap-1.5">
        {g.recipes.map((r) => (
          <button key={r.id} disabled={busy || !r.can} onClick={() => act({ action: "start", recipe: r.id })} className="pixel-btn bg-white/80 px-2 py-1 text-xs disabled:opacity-40" title={`${Math.round(r.ms / 60_000)} minutes`}>
            {ITEM_ICONS[r.output] ?? "⚙️"} {r.name}
          </button>
        ))}
      </div>
    </div>
  );
}
