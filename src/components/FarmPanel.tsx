"use client";
// The farm window's contents, in the ranch panel's style: lot-wide actions on
// top, a card per crop type (harvest / water just those), planting, and the
// spot E was pressed on. Shared by the E farm menu (Hud) and a vineyard's or
// orchard's Farm tab (RanchPanel). Every enabled button is numbered: 1–9
// picks it from the keyboard while this is on screen.
import { useEffect, useRef } from "react";
import type { FarmView } from "@/types/garden";

/** A button's keyboard number (1–9). */
function FarmBadge({ n }: { n: number | null }) {
  return n ? <span className="mr-1 rounded bg-amber-900/80 px-1 text-[10px] text-white">{n}</span> : null;
}

export default function FarmPanel({ view, coins }: { view: FarmView; coins: number }) {
  // Number every enabled action in reading order (top row, crop cards, planting, this spot).
  const actions: (() => void)[] = [];
  const num = (run: (() => void) | null) => { if (!run) return null; actions.push(run); return actions.length <= 9 ? actions.length : null; };
  const nHarvestAll = num(view.harvestAll), nWaterAll = num(view.waterAll);
  const kindNums = view.kinds.map((k) => ({ h: num(k.harvest), w: num(k.water) }));
  const plantNums = view.plant.map((p) => num(p.run));
  const hereNums = view.here.map((h) => num(h.run));
  const keys = useRef(actions);
  useEffect(() => { keys.current = actions; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > 9 || e.repeat) return;
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const run = keys.current[n - 1];
      if (!run) return;
      e.preventDefault();
      run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={!view.harvestAll} onClick={() => view.harvestAll?.()} className="pixel-btn bg-amber-300 px-2 py-1 text-sm font-bold disabled:opacity-40"><FarmBadge n={nHarvestAll} />🧺 Harvest all{view.ripe ? ` (${view.ripe})` : ""}</button>
        <button disabled={!view.waterAll} onClick={() => view.waterAll?.()} className="pixel-btn bg-sky-200 px-2 py-1 text-sm font-bold disabled:opacity-40"><FarmBadge n={nWaterAll} />💧 Water all{view.thirsty ? ` (${view.thirsty})` : ""}</button>
        <span className="flex-1" /><span className="text-xs font-bold">🪙 {coins}</span>
      </div>
      <div className="rounded bg-amber-50/90 p-2">
        {view.kinds.length === 0 ? <div className="text-[13px] text-stone-500">Nothing growing yet. Plant something below.</div> : (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {view.kinds.map((k, i) => (
              <div key={k.kind} className="rounded border border-amber-900/20 bg-white/60 p-1.5 text-[12px]">
                <div className="font-bold capitalize">{k.icon} {k.name} <span className="font-normal text-stone-500">×{k.total}</span></div>
                <div className="text-[11px] text-stone-600">{k.ripe ? `${k.ripe} ripe` : "none ripe"}{k.thirsty ? ` · ${k.thirsty} thirsty` : ""}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  <button disabled={!k.harvest} onClick={() => k.harvest?.()} className="pixel-btn bg-amber-200 px-1.5 py-0.5 text-[11px] font-bold disabled:opacity-40"><FarmBadge n={kindNums[i].h} />🧺 Harvest</button>
                  <button disabled={!k.water} onClick={() => k.water?.()} className="pixel-btn bg-sky-100 px-1.5 py-0.5 text-[11px] font-bold disabled:opacity-40"><FarmBadge n={kindNums[i].w} />💧 Water</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {view.plant.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] font-bold text-amber-900">🌱 Plant all:</span>
          {view.plant.map((p, i) => (
            <button key={p.key} onClick={p.run} className="pixel-btn bg-white/80 px-2 py-1 text-xs capitalize"><FarmBadge n={plantNums[i]} />{p.label}</button>
          ))}
        </div>
      )}
      {view.here.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] font-bold text-amber-900">This spot:</span>
          {view.here.map((h, i) => (
            <button key={h.key} onClick={h.run} className="pixel-btn bg-emerald-100 px-2 py-1 text-xs"><FarmBadge n={hereNums[i]} />{h.label}</button>
          ))}
        </div>
      )}
      <div className="text-right text-[11px] text-stone-500">Number keys pick an action</div>
    </div>
  );
}
