"use client";
// A town's notice board: the bounties posted there — take them, turn
// finished ones in, or drop them.
import { useCallback, useEffect, useState } from "react";
import { MAX_ACTIVE } from "@/lib/bounties";
import type { BountyView } from "@/types/bounty";

const left = (at: number) => { const m = Math.max(0, Math.round((at - Date.now()) / 60_000)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };

export default function BountyPanel({ town, name, activeCount, onClose, onMessage, onChanged }: {
  town: string; name: string; activeCount: number;
  onClose: () => void;
  onMessage: (text: string, kind: "good" | "bad", notices?: string[]) => void;
  onChanged: () => void;
}) {
  const [list, setList] = useState<BountyView[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const load = useCallback(() => fetch(`/api/bounties?town=${encodeURIComponent(town)}`).then((r) => r.json()).then((r) => { if (r?.bounties) setList(r.bounties); }).catch(() => {}), [town]);
  useEffect(() => { void load(); }, [load]);

  const act = async (action: string, id: number) => {
    if (busy) return;
    setBusy(id);
    const r = await fetch("/api/bounties", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, id }) }).then((r) => r.json()).catch(() => ({ error: "Network error" }));
    setBusy(null);
    if (r.error) onMessage(r.error, "bad");
    else onMessage(r.message, "good", r.notices);
    void load();
    onChanged();
  };

  return (
    <div className="pointer-events-auto absolute left-1/2 top-1/2 z-30 w-[min(94vw,560px)] -translate-x-1/2 -translate-y-1/2 pixel-panel p-4 shadow-2xl">
      <div className="mb-2 flex items-center">
        <div className="text-lg font-bold text-amber-900">📜 {name} Bounty Board</div>
        <span className="flex-1" />
        <span className="mr-2 text-xs text-stone-600">{activeCount}/{MAX_ACTIVE} carried</span>
        <button className="text-stone-400 hover:text-stone-700" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="max-h-[60vh] space-y-2 overflow-y-auto rounded p-2" style={{ background: "repeating-linear-gradient(90deg,#b98a56 0 30px,#a87a48 30px 34px)" }}>
        {!list && <div className="text-amber-50">Reading the notices…</div>}
        {list?.length === 0 && <div className="text-amber-50">The board&apos;s bare. New work goes up soon.</div>}
        {list?.map((b) => {
          const ready = !!b.mine && b.mine.progress >= b.mine.target;
          return (
            <div key={b.id} className={`rounded border-2 p-2 text-sm shadow ${b.data.kind === "wanted" ? "border-red-900/60 bg-amber-100" : "border-amber-900/30 bg-amber-50"}`} style={{ transform: `rotate(${(b.id % 5) - 2}deg)` }}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className={`font-bold ${b.data.kind === "wanted" ? "text-red-800" : "text-amber-950"}`}>{b.title}</div>
                  <div className="text-[12px] leading-snug text-stone-700">{b.description}</div>
                  <div className="mt-1 text-[11px] text-stone-600">💰 {b.reward.coins} 🪙 · ✨ {b.reward.xp} XP · 🏘️ +{b.reward.rep} · ⏳ {left(b.expiresAt)}</div>
                  {b.mine && (
                    <div className="mt-1 h-1.5 overflow-hidden rounded bg-amber-900/20"><div className="h-full bg-emerald-600" style={{ width: `${(100 * Math.min(b.mine.progress, b.mine.target)) / b.mine.target}%` }} /></div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  {!b.mine && <button disabled={busy !== null || activeCount >= MAX_ACTIVE} onClick={() => void act("accept", b.id)} className="pixel-btn bg-amber-300 px-2 py-1 text-xs font-bold disabled:opacity-40">Take it</button>}
                  {b.mine && <button disabled={busy !== null || !ready} onClick={() => void act("turnin", b.id)} className="pixel-btn bg-emerald-400 px-2 py-1 text-xs font-bold disabled:opacity-40">{ready ? "Turn in" : `${b.mine.progress}/${b.mine.target}`}</button>}
                  {b.mine && <button disabled={busy !== null} onClick={() => void act("abandon", b.id)} className="px-2 text-[11px] text-stone-500 underline">drop</button>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-[11px] text-stone-600">Hunts count anywhere in the wilds. Scouting spots and wanted beasts are marked on your map (M). Turn bounties in here, where they were posted.</div>
    </div>
  );
}
