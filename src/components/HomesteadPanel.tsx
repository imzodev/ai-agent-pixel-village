"use client";
// The homestead window (src/lib/homestead.ts): claim a free site at its
// signpost; on your own, a map of your parcels (north up) to buy the land
// next to yours and choose what each parcel is for, your animals (the
// pastures: RanchPanel) and your fields (FarmPanel, when you're on it).
// Big tap targets: it's played on phones too.
import { useCallback, useEffect, useState } from "react";
import { GRID, PARCEL_USES, SETTABLE_USES } from "@/lib/homestead";
import type { HomesteadView, ParcelCell, ParcelUse, UseChangeCost } from "@/types/homestead";
import RanchPanel from "./RanchPanel";

const TINT: Record<ParcelUse, string> = {
  wild: "bg-lime-200", field: "bg-amber-300", pasture: "bg-green-300", vineyard: "bg-purple-200",
  orchard: "bg-emerald-200", barn: "bg-red-200", workshop: "bg-orange-200",
};
const same = (a: ParcelCell, b: ParcelCell) => a.col === b.col && a.row === b.row;

type Pick = { kind: "owned"; cell: ParcelCell; use: ParcelUse } | { kind: "buy"; cell: ParcelCell };

export default function HomesteadPanel({ homesteadKey, onMessage, onGain, farm, onReleased }: {
  homesteadKey: string;
  onMessage: (text: string, kind: "good" | "bad") => void;
  onGain: (items: { itemKey: string; qty: number }[]) => void;
  /** Plant / water / harvest all (FarmPanel), when you stand on your homestead. */
  farm?: React.ReactNode;
  onReleased?: () => void;
}) {
  const [view, setView] = useState<HomesteadView | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"land" | "animals" | "farm">("land");
  const [pick, setPick] = useState<Pick | null>(null);
  const [confirm, setConfirm] = useState<{ use: ParcelUse; cost: UseChangeCost } | null>(null);
  const [giveUp, setGiveUp] = useState(false);
  const load = useCallback(() => fetch(`/api/homestead?key=${encodeURIComponent(homesteadKey)}`).then((r) => r.json()).then((r) => { if (r && !r.error) setView(r); }).catch(() => {}), [homesteadKey]);
  useEffect(() => { void load(); }, [load]);

  const post = async (body: Record<string, unknown>): Promise<Record<string, unknown> | null> => {
    if (busy) return null;
    setBusy(true);
    const r = await fetch("/api/homestead", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: homesteadKey, ...body }) }).then((r) => r.json()).catch(() => ({ error: "Network error" }));
    setBusy(false);
    if (r.error) { onMessage(r.error, "bad"); return null; }
    if (r.message) onMessage(r.message, "good");
    if (r.gained) onGain(r.gained);
    if (r.view) setView(r.view);
    return r;
  };

  if (!view) return <div className="mt-3 text-stone-500">You look over the land…</div>;

  if (!view.owner) {
    return (
      <div className="mt-2 space-y-2 text-sm">
        <div className="rounded bg-amber-50/90 p-2">
          <b>🏡 Homestead for sale.</b> Claim it free and you get four parcels to start: two fields and two pastures.
          Grow it a parcel at a time ({view.price} 🪙 each, the same for every one), up to {GRID}×{GRID}. Make each parcel what you like: fields, pastures, a vineyard, an orchard.
        </div>
        <button disabled={busy} onClick={() => void post({ action: "claim" })} className="pixel-btn w-full bg-emerald-500 px-3 py-2 text-base font-bold text-white disabled:opacity-40">🏡 Claim this homestead (free)</button>
      </div>
    );
  }
  if (!view.mine) {
    return <div className="mt-3 rounded bg-amber-50/90 p-2 text-sm">🏡 {view.owner.name}&apos;s homestead · {view.parcels.length} parcel{view.parcels.length === 1 ? "" : "s"}.</div>;
  }

  const full = view.parcels.length >= view.cap;
  const pickUse = async (use: ParcelUse) => {
    if (pick?.kind !== "owned" || use === pick.use) return;
    const cost = await post({ action: "preview", ...pick.cell, use }) as UseChangeCost | null;
    if (!cost) return;
    if (cost.crops > 0) { setConfirm({ use, cost }); return; }
    if (await post({ action: "use", ...pick.cell, use })) setPick(null);
  };

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
        <b>🗺️ {view.parcels.length}/{view.cap} parcels</b>
        <span>🐔 Space {view.space.used}/{view.space.total}</span>
        <span>🪙 {view.coins}</span>
        <span className="flex-1" />
        {(["land", "animals", ...(farm ? ["farm"] as const : [])] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded px-2.5 py-1 text-xs font-bold ${tab === t ? "bg-amber-600 text-white" : "bg-amber-200/70 text-amber-900"}`}>{t === "land" ? "🗺️ Land" : t === "animals" ? "🏚️ Barn & animals" : "🌾 Farm"}</button>
        ))}
      </div>

      {tab === "animals" && <RanchPanel ranchKey={homesteadKey} onMessage={onMessage} onGain={onGain} />}
      {tab === "farm" && farm}

      {tab === "land" && <>
        <div className="mx-auto grid w-full max-w-[360px] gap-1" style={{ gridTemplateColumns: `repeat(${GRID}, minmax(0, 1fr))` }} role="grid" aria-label="Your parcels, north at the top">
          {Array.from({ length: GRID * GRID }, (_, i) => {
            const cell = { col: i % GRID, row: Math.floor(i / GRID) };
            const owned = view.parcels.find((p) => same(p, cell));
            const buyable = !owned && view.buyable.some((b) => same(b, cell));
            const chosen = pick && same(pick.cell, cell);
            if (owned) {
              const def = PARCEL_USES[owned.use];
              return <button key={i} onClick={() => { setConfirm(null); setPick({ kind: "owned", cell, use: owned.use }); }} aria-label={`${def.name} parcel`} className={`aspect-square rounded border-2 text-xl ${TINT[owned.use]} ${chosen ? "border-amber-700 ring-2 ring-amber-500" : "border-amber-900/40"}`}>{def.icon}</button>;
            }
            if (buyable) {
              return <button key={i} onClick={() => { setConfirm(null); setPick({ kind: "buy", cell }); }} aria-label="Buy this parcel" className={`aspect-square rounded border-2 border-dashed text-[11px] font-bold ${chosen ? "border-amber-700 bg-amber-100" : "border-amber-900/40 bg-white/50"} ${full ? "text-stone-400" : "text-amber-900"}`}>+{view.price}</button>;
            }
            return <div key={i} className="aspect-square rounded bg-stone-300/40" />;
          })}
        </div>

        {pick?.kind === "buy" && (
          <div className="rounded bg-amber-50/90 p-2 text-sm">
            {full ? <>You hold all the parcels you can for now ({view.cap}).{view.nextCapAt ? ` At level ${view.nextCapAt.level}, ${view.nextCapAt.cap}.` : ""}</> : <>Buy this parcel for <b>{view.price} 🪙</b>? It starts wild; then pick what it&apos;s for.</>}
            <div className="mt-2 flex gap-2">
              <button disabled={busy || full || view.coins < view.price} onClick={async () => { if (await post({ action: "buy", ...pick.cell })) setPick({ kind: "owned", cell: pick.cell, use: "wild" }); }} className="pixel-btn flex-1 bg-emerald-500 px-3 py-2 font-bold text-white disabled:opacity-40">Buy · {view.price} 🪙</button>
              <button onClick={() => setPick(null)} className="pixel-btn bg-stone-200 px-3 py-2">Cancel</button>
            </div>
          </div>
        )}

        {pick?.kind === "owned" && (
          <div className="rounded bg-amber-50/90 p-2 text-sm">
            <div className="mb-1.5"><b>{PARCEL_USES[pick.use].icon} {PARCEL_USES[pick.use].name}.</b> {PARCEL_USES[pick.use].blurb}</div>
            {confirm ? (
              <div>
                Make it a {PARCEL_USES[confirm.use].name.toLowerCase()}? The {confirm.cost.crops} crop{confirm.cost.crops === 1 ? "" : "s"} on it will be cleared.
                <div className="mt-2 flex gap-2">
                  <button disabled={busy} onClick={async () => { if (await post({ action: "use", ...pick.cell, use: confirm.use })) { setPick(null); setConfirm(null); } }} className="pixel-btn flex-1 bg-amber-600 px-3 py-2 font-bold text-white disabled:opacity-40">Yes, change it</button>
                  <button onClick={() => setConfirm(null)} className="pixel-btn bg-stone-200 px-3 py-2">Keep it</button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {SETTABLE_USES.map((u) => (
                  <button key={u} disabled={busy || u === pick.use} onClick={() => void pickUse(u)} className={`pixel-btn px-2 py-2 text-left text-[13px] font-bold disabled:opacity-60 ${u === pick.use ? "bg-amber-300" : "bg-white/80"}`}>{PARCEL_USES[u].icon} {PARCEL_USES[u].name}</button>
                ))}
              </div>
            )}
          </div>
        )}

        {!pick && <div className="text-center text-[11px] text-stone-600">Tap a parcel to choose what it&apos;s for, or a <b>+</b> to buy the land next to yours.{view.nextCapAt ? ` More land at level ${view.nextCapAt.level}.` : ""}</div>}

        <div className="pt-1 text-right">
          {giveUp ? (
            <span className="text-[12px]">Give it all up? Crops and animals go. <button disabled={busy} onClick={async () => { if (await post({ action: "release" })) { setGiveUp(false); onReleased?.(); } }} className="font-bold text-red-700 underline">Yes</button> · <button onClick={() => setGiveUp(false)} className="underline">No</button></span>
          ) : <button onClick={() => setGiveUp(true)} className="text-[11px] text-stone-500 underline">Give up the homestead</button>}
        </div>
      </>}
    </div>
  );
}
