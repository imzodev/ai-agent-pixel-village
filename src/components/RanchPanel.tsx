"use client";
// Inside a ranch: your animals, their hunger, love and produce, buying
// chicks / lambs / calves, feeding them, collecting eggs, wool and milk —
// and growing the farm (Build and Workshop tabs: RanchUpgrades, RanchWorkshop).
// Vineyards and workshops share it: no animals, just their Build and Workshop
// tabs (and a workshop's Showroom, RanchShowroom).
import { useCallback, useEffect, useState } from "react";
import { ITEM_ICONS } from "@/game/bus";
import { FED_BELOW, HUNGRY_AT, MAX_STORED, RANCH_SPECIES, isRanchSpecies } from "@/lib/ranch";
import type { RanchView } from "@/types/ranch";
import RanchUpgrades from "./RanchUpgrades";
import RanchWorkshop from "./RanchWorkshop";
import RanchShowroom from "./RanchShowroom";

const mins = (ms: number) => `${Math.max(1, Math.ceil(ms / 60_000))}m`;

export default function RanchPanel({ ranchKey, onMessage, onGain }: { ranchKey: string; onMessage: (text: string, kind: "good" | "bad") => void; onGain: (items: { itemKey: string; qty: number }[]) => void }) {
  const [view, setView] = useState<RanchView | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"animals" | "build" | "workshop" | "showroom">("animals");
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
  const vineyard = view.kind === "vineyard", workshop = view.kind === "workshop", orchard = view.kind === "orchard";
  const animalless = vineyard || workshop || orchard;
  if (!view.mine && vineyard) {
    return <div className="mt-3 rounded bg-amber-50/90 p-2 text-sm">{view.owner ? <>🍇 {view.owner.name}&apos;s vineyard.</> : <>This vineyard is free. Claim it at the gate to grow grapes and apples.</>}</div>;
  }
  if (!view.mine && orchard) {
    return <div className="mt-3 rounded bg-amber-50/90 p-2 text-sm">{view.owner ? <>🍑 {view.owner.name}&apos;s orchard.</> : <>This orchard is free. Claim it at the gate to grow fruit trees.</>}</div>;
  }
  if (!view.mine && workshop) {
    return <div className="mt-3 rounded bg-amber-50/90 p-2 text-sm">{view.owner ? <>🪚 {view.owner.name}&apos;s workshop. Their best pieces are on the porch.</> : <>This workshop is free. Claim it at the gate to make furniture.</>}</div>;
  }
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
  const g = view.growth;
  const pettable = view.animals.filter((a) => a.pettable).length;
  return (
    <div className="mt-3 space-y-2">
      {g && (
        <div className="flex items-center gap-2 text-[12px]">
          <b>🏡 Farm level {g.farmLevel}</b>
          <div className="h-1.5 w-28 overflow-hidden rounded bg-stone-300"><div className="h-full bg-emerald-500" style={{ width: `${g.nextAt ? Math.min(100, (100 * g.farmXp) / g.nextAt) : 100}%` }} /></div>
          <span className="text-stone-600">{g.nextAt ? `${g.farmXp}/${g.nextAt} XP` : "max"}</span>
          <span className="flex-1" />
          {(workshop ? (["build", "workshop", "showroom"] as const) : vineyard || orchard ? (["build", "workshop"] as const) : (["animals", "build", "workshop"] as const)).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded px-2 py-0.5 text-xs font-bold ${(tab === t || (animalless && tab === "animals" && t === "build")) ? "bg-amber-600 text-white" : "bg-amber-200/70 text-amber-900"}`}>{t === "animals" ? "🐔 Animals" : t === "build" ? "🔨 Build" : t === "showroom" ? "🪑 Showroom" : workshop ? "🪚 Make" : "⚙️ Workshop"}</button>
          ))}
        </div>
      )}
      {vineyard && <div className="text-[11px] text-stone-600">🍇 Plant grape cuttings on the trellises and apple saplings in the orchard (Pip sells them). Once grown they fruit again and again. Water them to speed them up.</div>}
      {workshop && <div className="text-[11px] text-stone-600">🪚 Saw logs into planks, then make furniture at the workbench. Cloth and wool come from a ranch, honey wax from its hives, fittings from Bjorn. Put your best pieces on the porch.</div>}
      {g && (tab === "build" || (animalless && tab === "animals")) && <RanchUpgrades g={g} busy={busy} act={(b) => void act(b)} />}
      {g && tab === "showroom" && <RanchShowroom g={g} busy={busy} act={(b) => void act(b)} />}
      {g && tab === "workshop" && <RanchWorkshop g={g} busy={busy} act={(b) => void act(b)} />}
      {!animalless && (!g || tab === "animals") && <>
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={busy || ready === 0} onClick={() => void act({ action: "collect" })} className="pixel-btn bg-amber-300 px-2 py-1 text-sm font-bold disabled:opacity-40">🧺 Collect {ready > 0 ? `(${ready})` : ""}</button>
        <button disabled={busy || hungry === 0 || feedTotal === 0} onClick={() => void act({ action: "feed" })} className="pixel-btn bg-amber-200 px-2 py-1 text-sm font-bold disabled:opacity-40">🌾 Feed {hungry > 0 ? `${hungry} hungry` : ""}</button>
        <button disabled={busy || pettable === 0} onClick={() => void act({ action: "pet_all" })} className="pixel-btn bg-pink-200 px-2 py-1 text-sm font-bold disabled:opacity-40" title="Once a day each: loved animals sometimes give golden eggs, fine wool and rich milk">💕 Pet everyone {pettable > 0 ? `(${pettable})` : ""}</button>
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
                  <div className="font-bold">{def?.icon} {a.name} <span className="font-normal text-pink-600" title={`Affection ${a.affection}/100`}>{"♥".repeat(Math.round(a.affection / 20)) || "♡"}</span></div>
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
      </>}
    </div>
  );
}
