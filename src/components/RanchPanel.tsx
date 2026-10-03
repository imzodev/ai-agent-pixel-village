"use client";
// Inside a ranch: your animals, their hunger and produce, buying chicks /
// lambs / calves, feeding them crops, and collecting eggs, wool and milk.
import { useCallback, useEffect, useState } from "react";
import { ITEM_ICONS } from "@/game/bus";
import { FED_BELOW, HUNGRY_AT, MAX_STORED, RANCH_SPECIES, isRanchSpecies } from "@/lib/ranch";
import type { RanchView } from "@/types/ranch";

const mins = (ms: number) => `${Math.max(1, Math.ceil(ms / 60_000))}m`;

export default function RanchPanel({ ranchKey, onMessage, onGain }: { ranchKey: string; onMessage: (text: string, kind: "good" | "bad") => void; onGain: (items: { itemKey: string; qty: number }[]) => void }) {
  const [view, setView] = useState<RanchView | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => fetch(`/api/ranch?key=${encodeURIComponent(ranchKey)}`).then((r) => r.json()).then((r) => { if (r && !r.error) setView(r); }).catch(() => {}), [ranchKey]);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (body: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    const r = await fetch("/api/ranch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: ranchKey, ...body }) }).then((r) => r.json()).catch(() => ({ error: "Network error" }));
    setBusy(false);
    if (r.error) { onMessage(r.error, "bad"); return; }
    if (r.message) onMessage(r.message, "good");
    if (r.gained) onGain(r.gained);
    if (r.view) setView(r.view);
  };

  if (!view) return <div className="mt-3 text-stone-500">The hens cluck as you open the gate…</div>;
  if (!view.mine) {
    return (
      <div className="mt-3 rounded bg-amber-50/90 p-2 text-sm">
        {view.owner ? <>🐔 {view.owner.name}&apos;s ranch. {view.animals.length ? `${view.animals.map((a) => a.name).join(", ")} live here.` : "It's quiet — no animals yet."}</>
          : <>This ranch is free. Claim it at the gate (40 🪙) to raise your own animals.</>}
      </div>
    );
  }
  const ready = view.animals.reduce((s, a) => s + a.ready, 0);
  const hungry = view.animals.filter((a) => a.hunger >= FED_BELOW).length;
  const feedTotal = view.feed.reduce((s, f) => s + f.qty, 0);
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={busy || ready === 0} onClick={() => void act({ action: "collect" })} className="pixel-btn bg-amber-300 px-2 py-1 text-sm font-bold disabled:opacity-40">🧺 Collect {ready > 0 ? `(${ready})` : ""}</button>
        <button disabled={busy || hungry === 0 || feedTotal === 0} onClick={() => void act({ action: "feed" })} className="pixel-btn bg-amber-200 px-2 py-1 text-sm font-bold disabled:opacity-40">🌾 Feed {hungry > 0 ? `${hungry} hungry` : ""}</button>
        <span className="text-[11px] text-stone-600">Feed: {feedTotal > 0 ? view.feed.map((f) => `${ITEM_ICONS[f.itemKey] ?? "🌾"}${f.qty}`).join(" ") : "none — bring wheat or crops"}</span>
        <span className="flex-1" /><span className="text-xs font-bold">🪙 {view.coins}</span>
      </div>
      <div className="rounded bg-amber-50/90 p-2">
        {view.animals.length === 0 ? <div className="text-[13px] text-stone-500">Your pen is empty. Buy a chick to start — hens lay an egg every 20 minutes while fed.</div> : (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {view.animals.map((a) => {
              const def = isRanchSpecies(a.species) ? RANCH_SPECIES[a.species] : null;
              const starving = a.hunger >= HUNGRY_AT;
              return (
                <div key={a.id} className="rounded border border-amber-900/20 bg-white/60 p-1.5 text-[12px]">
                  <div className="font-bold">{def?.icon} {a.name}</div>
                  <div className="mt-0.5 h-1.5 overflow-hidden rounded bg-stone-300" title={`Hunger ${a.hunger}/100`}><div className={`h-full ${starving ? "bg-red-500" : a.hunger >= FED_BELOW ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${100 - a.hunger}%` }} /></div>
                  <div className="text-[11px] text-stone-600">
                    {starving ? "Too hungry to produce" : `${ITEM_ICONS[def?.produce ?? ""] ?? ""} ${a.ready}/${MAX_STORED}${a.nextInMs != null ? ` · next in ${mins(a.nextInMs)}` : ""}`}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {view.shop.map((s) => (
          <button key={s.species} disabled={busy || s.owned >= s.cap || view.coins < s.price} onClick={() => void act({ action: "buy", species: s.species })} className="pixel-btn bg-white/80 px-2 py-1 text-xs disabled:opacity-40" title={`Lives in the ${s.home}; gives ${s.produce}`}>
            {s.icon} Buy a {s.young.toLowerCase()} · {s.price} 🪙 <span className="text-stone-500">({s.owned}/{s.cap})</span>
          </button>
        ))}
      </div>
    </div>
  );
}
