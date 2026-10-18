"use client";
// Bjorn's forge (inside the Hollowmere Forge): upgrade swords, axes and the
// fishing rod for coins and materials, and repair worn tools.
import { useCallback, useEffect, useState } from "react";
import { ITEM_ICONS } from "@/game/bus";
import { FORGE_MAX_PLUS } from "@/lib/forge";
import WearBar from "./WearBar";
import type { ForgeFamily, ForgeView } from "@/types/forge";

const EFFECT: Record<ForgeFamily, string> = { sword: "+1 damage", axe: "+1 wood per chop", rod: "a wider catch zone" };

export default function ForgePanel({ onMessage }: { onMessage: (text: string, kind: "good" | "bad") => void }) {
  const [view, setView] = useState<ForgeView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => fetch("/api/forge").then((r) => r.json()).then((r) => { if (r && !r.error) setView(r); }).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);

  const upgrade = async (itemKey: string, action?: "repair") => {
    if (busy) return;
    setBusy(`${action ?? "up"}:${itemKey}`);
    const r = await fetch("/api/forge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemKey, action }) }).then((r) => r.json()).catch(() => ({ error: "Network error" }));
    setBusy(null);
    if (r.error) onMessage(r.error, "bad");
    else { onMessage(r.message, "good"); if (r.view) setView(r.view); }
  };

  if (!view) return <div className="mt-3 text-stone-500">Bjorn wipes his hands on his apron…</div>;
  return (
    <div className="mt-3">
      <div className="mb-2 flex items-center text-xs text-amber-900"><span>🔨 Bring materials and coin; each level is permanent.</span><span className="flex-1" /><span className="font-bold">🪙 {view.coins}</span></div>
      {view.items.length === 0 && <div className="rounded bg-amber-50/90 p-2 text-sm text-stone-600">You&apos;re carrying nothing Bjorn can work on. Bring a sword, an axe or a fishing rod.</div>}
      <div className="space-y-1.5">
        {view.items.map((it) => {
          const need = it.next?.items[0];
          const have = need ? view.have[need.itemKey] ?? 0 : 0;
          const can = !!it.next && view.coins >= it.next.coins && have >= (need?.qty ?? 0);
          return (
            <div key={`${it.itemKey}+${it.plus}`} className="flex items-center gap-2 rounded bg-amber-50/90 p-2 text-sm">
              <span className="text-xl">{it.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="font-bold">{it.name} <span className="text-[11px] font-normal text-amber-700">{"★".repeat(it.plus)}{"☆".repeat(FORGE_MAX_PLUS - it.plus)}</span></div>
                {it.next && need ? (
                  <div className="text-[11px] text-stone-600">Next: {EFFECT[it.family]} · {it.next.coins} 🪙 + <span className={have >= need.qty ? "" : "font-bold text-red-700"}>{need.qty} {ITEM_ICONS[need.itemKey] ?? ""} {need.itemKey.replace(/_/g, " ")} ({have})</span></div>
                ) : <div className="text-[11px] text-emerald-700">Fully upgraded.</div>}
              </div>
              {it.next && <button disabled={!can || !!busy} onClick={() => void upgrade(it.itemKey)} className="pixel-btn bg-amber-300 px-2 py-1 text-xs font-bold disabled:opacity-40">{busy === `up:${it.itemKey}` ? "…" : `Upgrade to +${it.plus + 1}`}</button>}
            </div>
          );
        })}
      </div>
      {view.repairs.length > 0 && (
        <>
          <div className="mb-1 mt-3 text-xs font-bold text-amber-900">🔧 Repairs: worn tools work worse; Bjorn makes them like new.</div>
          <div className="space-y-1.5">
            {view.repairs.map((r) => (
              <div key={r.itemKey} className="flex items-center gap-2 rounded bg-amber-50/90 p-2 text-sm">
                <span className="text-xl">{r.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-bold">{r.name}</div>
                  <WearBar wear={r.wear} />
                </div>
                <button disabled={view.coins < r.cost || !!busy} onClick={() => void upgrade(r.itemKey, "repair")} className="pixel-btn bg-amber-300 px-2 py-1 text-xs font-bold disabled:opacity-40">{busy === `repair:${r.itemKey}` ? "…" : `Repair · ${r.cost} 🪙`}</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
