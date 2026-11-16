"use client";
// The story card (src/lib/story/): the current chapter, how far along it is,
// what it pays, and the guide arrow to its person, foe or place. With no
// story yet, an invitation to pick or write one.
import { useEffect, useMemo, useState } from "react";
import { bus, type Snapshot } from "@/game/bus";
import { locateTarget } from "@/game/guideTarget";
import type { StoryView } from "@/types/story";

const MIN_KEY = "grove_story_min";

/** What to do, in a few words ("Bring Bjorn 2 Wolf Pelt"). */
function goal(v: StoryView): string {
  const { chapter: c, names: n } = v;
  switch (c.event) {
    case "talk": return `Talk to ${n.npc}`;
    case "deliver": return `Bring ${n.npc} ${c.qty} × ${n.item}`;
    case "collect": return `Get ${c.qty} × ${n.item}`;
    case "defeat": return `Defeat ${c.qty} × ${n.foe}`;
    case "visit": return `Travel to ${n.region}`;
    case "fish": return `Catch ${c.qty} fish`;
    case "plant": return `Plant ${c.qty} seeds`;
    case "sell": return `Sell ${c.qty} things to villagers`;
  }
}

/** Where the arrow points: the person or foe if in sight, else their home or the region. */
function aim(v: StoryView, snap: Snapshot): { x: number; y: number; npcId?: number } | null {
  const c = v.chapter;
  if (c.match.npcKey) return locateTarget({ kind: "npc", npcKey: c.match.npcKey }, snap) ?? v.where;
  if (c.event === "defeat" && c.match.enemyKind && snap.enemies.some((e) => e.kind === c.match.enemyKind && e.hp > 0)) {
    return locateTarget({ kind: "enemy", enemyKind: c.match.enemyKind, fallback: { x: 0, y: 0 } }, snap);
  }
  return v.where;
}

export default function StoryTracker({ view, snap, onOpen }: { view: StoryView | null; snap: Snapshot | null; onOpen: () => void }) {
  const [min, setMin] = useState(() => { try { return localStorage.getItem(MIN_KEY) === "1"; } catch { return false; } });
  const toggle = () => setMin((m) => { try { localStorage.setItem(MIN_KEY, m ? "0" : "1"); } catch { /* ignore */ } return !m; });

  const target = useMemo(() => (view && snap ? aim(view, snap) : null), [view, snap]);
  const tx = target ? Math.round(target.x / 8) : null, ty = target ? Math.round(target.y / 8) : null;
  useEffect(() => {
    if (view) bus.emit("guide", target);
    // Only re-emit when the target meaningfully moves (8 px grid).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx, ty, target?.npcId, view?.id, view?.step]);
  useEffect(() => () => bus.emit("guide", null), []);

  if (!view) {
    return (
      <button onClick={onOpen} className="pixel-panel pointer-events-auto block w-full p-2 text-left text-amber-950 hover:brightness-105">
        <div className="text-[11px] font-bold uppercase tracking-wide text-violet-800">📜 Your story</div>
        <div className="text-sm font-bold leading-tight">Every hero needs a story.</div>
        <div className="mt-0.5 text-xs leading-snug">Pick one, or tell us who you are and the village will write yours. ▸</div>
      </button>
    );
  }
  const c = view.chapter;
  const counted = c.qty > 1 && c.event !== "deliver";
  return (
    <div className="pixel-panel pointer-events-auto p-2 text-amber-950">
      <div className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-violet-800">
        <button className="truncate text-left hover:underline" onClick={onOpen} title={view.premise}>📜 {view.title} · {view.step + 1}/{view.total}</button>
        <span className="flex-1" />
        <button className="px-1 text-violet-800/70 hover:text-violet-950" onClick={toggle} aria-label={min ? "Expand" : "Collapse"}>{min ? "▸" : "▾"}</button>
      </div>
      <div className="text-sm font-bold leading-tight">{c.title}</div>
      {!min && (
        <>
          <p className="mt-1 text-xs leading-snug">{c.text}</p>
          <div className="mt-1 text-xs font-bold text-violet-900">➜ {goal(view)}{counted ? ` (${Math.min(view.progress, c.qty)}/${c.qty})` : ""}</div>
          {counted && <div className="mt-1 h-1.5 overflow-hidden rounded bg-amber-900/20"><div className="h-full bg-violet-500" style={{ width: `${(100 * Math.min(view.progress, c.qty)) / c.qty}%` }} /></div>}
          <div className="mt-1 text-[11px] text-amber-900/80">🎁 {c.reward.coins} 🪙 · {c.reward.xp} XP</div>
        </>
      )}
    </div>
  );
}
