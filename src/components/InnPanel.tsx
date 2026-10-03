"use client";
// Inside an inn: rest by the hearth, buy hot stew for the road or an old
// treasure map, read the rumour board, and see who else is here.
import { useCallback, useEffect, useState } from "react";
import type { InnView } from "@/types/inn";

export default function InnPanel({ innKey, hurt, onMessage, onGain }: { innKey: string; hurt: boolean; onMessage: (text: string, kind: "good" | "bad") => void; onGain: (items: { itemKey: string; qty: number }[]) => void }) {
  const [view, setView] = useState<InnView | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => fetch(`/api/inn?key=${encodeURIComponent(innKey)}`).then((r) => r.json()).then((r) => { if (r && !r.error) setView(r); }).catch(() => {}), [innKey]);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 10_000); // patrons come and go
    return () => clearInterval(t);
  }, [load]);

  const act = async (action: "rest" | "stew" | "cheers" | "map") => {
    if (busy) return;
    setBusy(true);
    const r = await fetch("/api/inn", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: innKey, action }) }).then((r) => r.json()).catch(() => ({ error: "Network error" }));
    setBusy(false);
    if (r.error) onMessage(r.error, "bad");
    else {
      if (r.message) onMessage(r.message, "good");
      if (r.gained) onGain(r.gained);
      void load();
    }
  };

  if (!view) return <div className="mt-3 text-stone-500">The door creaks open…</div>;
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        <button disabled={busy || !hurt} onClick={() => void act("rest")} className="pixel-btn bg-amber-300 px-2 py-1 text-sm font-bold disabled:opacity-40" title={hurt ? "" : "You're already fighting fit"}>
          🛏️ Rest by the hearth {view.restFree ? "(free)" : `· ${view.restCost} 🪙`}
        </button>
        <button disabled={busy} onClick={() => void act("stew")} className="pixel-btn bg-amber-200 px-2 py-1 text-sm font-bold disabled:opacity-40">🍲 Hot stew to go · {view.stewCost} 🪙</button>
        <button disabled={busy} onClick={() => void act("map")} className="pixel-btn bg-amber-200 px-2 py-1 text-sm font-bold disabled:opacity-40" title="A rumour of buried treasure, scrawled on a scrap of map (3 a day)">🗺️ Buy an old map · {view.mapCost} 🪙</button>
        <button disabled={busy} onClick={() => void act("cheers")} className="pixel-btn bg-amber-100 px-2 py-1 text-sm disabled:opacity-40">🍺 Cheers!</button>
      </div>
      <div className="rounded bg-amber-50/90 p-2">
        <div className="mb-1 text-xs font-bold uppercase tracking-wide text-amber-800">📌 Rumour board <span className="font-normal normal-case text-stone-500">— {view.innkeeper} hears everything</span></div>
        <ul className="space-y-1 text-[13px] leading-snug">
          {view.rumours.map((r) => <li key={r}>{r}</li>)}
        </ul>
      </div>
      <div className="rounded bg-amber-50/90 p-2">
        <div className="mb-1 text-xs font-bold uppercase tracking-wide text-amber-800">👥 At the tables ({view.patrons.length})</div>
        {view.patrons.length <= 1 ? <div className="text-[13px] text-stone-500">Quiet tonight. Others who stop by will show up here.</div> : (
          <div className="flex flex-wrap gap-1">
            {view.patrons.map((p) => <span key={p.id} className="rounded bg-amber-200/70 px-2 py-0.5 text-xs"><b>{p.name}</b> Lv {p.level}{p.title ? ` · « ${p.title} »` : ""}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}
