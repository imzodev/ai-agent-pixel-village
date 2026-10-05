"use client";
// The ranch's Build tab: farm level, then what you can build next (coop and
// barn upgrades, silo, feeder, machines), each with its cost and what's
// missing. Rules: src/lib/ranchUpgrades.ts.
import { ITEM_ICONS } from "@/game/bus";
import type { RanchGrowthView } from "@/types/ranchGrowth";

export default function RanchUpgrades({ g, busy, act }: { g: RanchGrowthView; busy: boolean; act: (body: Record<string, unknown>) => void }) {
  return (
    <div className="space-y-1.5">
      {g.silo && (
        <div className="flex items-center gap-2 rounded bg-amber-50/90 p-1.5 text-[12px]">
          <span className="font-bold">🌾 Silo {g.silo.stored}/{g.silo.cap}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded bg-stone-300"><div className="h-full bg-amber-500" style={{ width: `${(100 * g.silo.stored) / g.silo.cap}%` }} /></div>
          <button disabled={busy || g.silo.stored >= g.silo.cap} onClick={() => act({ action: "deposit" })} className="pixel-btn bg-amber-200 px-2 py-0.5 text-xs font-bold disabled:opacity-40">Pour in feed</button>
          {g.built.includes("feeder") && <span className="text-[11px] text-emerald-700">Feeder on: animals eat from it</span>}
        </div>
      )}
      {g.builds.length === 0 && <div className="text-[12px] text-stone-600">Everything&apos;s built. What a farm!</div>}
      {g.builds.map((b) => (
        <div key={b.id} className="flex items-center gap-2 rounded border border-amber-900/20 bg-white/60 p-1.5 text-[12px]">
          <div className="flex-1">
            <div className="font-bold">{b.name}{b.level > 1 ? ` (level ${b.level})` : ""}</div>
            <div className="text-[11px] text-stone-600">{b.description}</div>
            <div className="text-[11px]">🪙 {b.coins} · {Object.entries(b.items).map(([k, n]) => `${ITEM_ICONS[k] ?? ""}${n} ${k}`).join(" · ")} · farm lv {b.farmLevel}</div>
            {b.why && <div className="text-[11px] text-red-700">{b.why}</div>}
          </div>
          <button disabled={busy || !b.can} onClick={() => act({ action: "build", step: b.id })} className="pixel-btn bg-emerald-300 px-2 py-1 text-xs font-bold disabled:opacity-40">🔨 Build</button>
        </div>
      ))}
      <div className="text-[11px] text-stone-500">Wood: chop trees. Stone: the fields and hills. 🔩 Fittings: Bjorn&apos;s forge in Hollowmere.</div>
    </div>
  );
}
