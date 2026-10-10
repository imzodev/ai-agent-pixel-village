"use client";
// The guided first session's tracker: a small card with the current step,
// plus the target the scene's guide arrow points at (bus "guide").
import { useEffect, useMemo, useState } from "react";
import { bus, type Snapshot } from "@/game/bus";
import { positionAt } from "@/lib/motion";
import { TUTORIAL_STEPS } from "@/lib/tutorial";
import type { TutorialTarget } from "@/types/tutorial";

const WELCOME_KEY = "grove_tutorial_welcome_v1";

export default function QuestTracker({ step, progress, snap, onSkip }: { step: number; progress: number; snap: Snapshot | null; onSkip: () => Promise<void> }) {
  const def = TUTORIAL_STEPS[step];
  // The HUD renders client-only, so localStorage is safe to read up front.
  const [welcomeSeen, setWelcomeSeen] = useState(() => { try { return !!localStorage.getItem(WELCOME_KEY); } catch { return false; } });
  const welcome = !welcomeSeen && step === 0 && progress === 0;
  const [confirmSkip, setConfirmSkip] = useState(false);
  const [min, setMin] = useState(false);

  const start = () => {
    try { localStorage.setItem(WELCOME_KEY, "1"); } catch { /* ignore */ }
    setWelcomeSeen(true);
  };

  const target = useMemo(() => (def && snap ? locate(def.target, snap) : null), [def, snap]);
  const tx = target ? Math.round(target.x / 8) : null, ty = target ? Math.round(target.y / 8) : null;
  useEffect(() => {
    bus.emit("guide", target);
    // Only re-emit when the target meaningfully moves (8 px grid).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx, ty, target?.npcId]);
  useEffect(() => () => bus.emit("guide", null), []);

  if (!def) return null;

  if (welcome) {
    return (
      <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
        <div className="pixel-panel w-full max-w-sm p-4 text-amber-950">
          <div className="mb-1 text-lg font-bold">🌳 Welcome to the grove!</div>
          <p className="mb-3 text-sm leading-snug">Elder Oswin will show you around: five quick steps to farm, chop, fight and trade. Follow the golden arrow. Each step has a reward.</p>
          <p className="mb-4 text-xs text-amber-900/80">Move with WASD / arrows (or the joystick). Press E to talk or use things.</p>
          <div className="flex gap-2">
            <button className="pixel-btn flex-1" onClick={() => { start(); void onSkip(); }}>Skip tutorial</button>
            <button className="pixel-btn flex-[2] font-bold" onClick={start}>Let&apos;s go!</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto absolute left-2 top-14 z-10 w-56 sm:w-64 max-w-[calc(100vw-1rem)]">
      <div className="pixel-panel p-2 text-amber-950">
        <div className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-amber-800">
          <span>📜 Step {step + 1}/{TUTORIAL_STEPS.length}</span>
          <span className="flex-1" />
          <button className="px-1 text-amber-800/70 hover:text-amber-950" onClick={() => setMin((m) => !m)} aria-label={min ? "Expand" : "Collapse"}>{min ? "▸" : "▾"}</button>
        </div>
        <div className="text-sm font-bold leading-tight">{def.title}{def.qty > 1 ? ` (${Math.min(progress, def.qty)}/${def.qty})` : ""}</div>
        {!min && (
          <>
            <p className="mt-1 text-xs leading-snug">{def.hint}</p>
            {def.qty > 1 && (
              <div className="mt-1 h-1.5 overflow-hidden rounded bg-amber-900/20"><div className="h-full bg-amber-500" style={{ width: `${(100 * Math.min(progress, def.qty)) / def.qty}%` }} /></div>
            )}
            <div className="mt-1 text-[11px] text-amber-900/80">🎁 {rewardText(def.reward)}</div>
            <div className="mt-1 text-right">
              {confirmSkip ? (
                <span className="text-[11px]">Skip the tutorial? <button className="font-bold underline" onClick={() => void onSkip()}>Yes</button> · <button className="underline" onClick={() => setConfirmSkip(false)}>No</button></span>
              ) : (
                <button className="text-[11px] text-amber-900/60 underline hover:text-amber-950" onClick={() => setConfirmSkip(true)}>Skip tutorial</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function rewardText(r: { coins?: number; items?: { itemKey: string; qty: number }[]; title?: string }): string {
  const parts: string[] = [];
  if (r.coins) parts.push(`${r.coins} 🪙`);
  for (const i of r.items ?? []) parts.push(`${i.qty > 1 ? `${i.qty}× ` : ""}${i.itemKey.replace(/_/g, " ")}`);
  if (r.title) parts.push(`title “${r.title}”`);
  return parts.join(", ");
}

/** World position of a step's target, from what the snapshot shows. */
function locate(t: TutorialTarget, s: Snapshot): { x: number; y: number; npcId?: number } | null {
  const me = s.me;
  const near = <T extends { x: number; y: number }>(list: T[]): T | null => {
    if (!me || list.length === 0) return list[0] ?? null;
    return list.reduce((a, b) => (Math.hypot(b.x - me.x, b.y - me.y) < Math.hypot(a.x - me.x, a.y - me.y) ? b : a));
  };
  const now = Date.now();
  switch (t.kind) {
    case "point": return { x: t.x, y: t.y };
    case "npc": {
      const n = s.npcs.find((n) => n.key === t.npcKey);
      if (!n) return null;
      const p = n.move ? positionAt(n.move, now) : n;
      return { x: p.x, y: p.y, npcId: n.id };
    }
    case "enemy": {
      const live = s.enemies.filter((e) => e.kind === t.enemyKind && e.hp > 0).map((e) => (e.move ? { ...e, ...positionAt(e.move, now) } : e));
      const e = near(live);
      return e ? { x: e.x, y: e.y } : t.fallback;
    }
    case "freeLand": {
      // Your own field first (plant there), else the nearest unclaimed one.
      const land = s.buildings.filter((b) => b.key.startsWith("land_"));
      const lot = (key: string) => s.lots.find((l) => l.key === key);
      const mine = land.filter((b) => me && lot(b.key)?.owner?.id === me.id);
      const free = land.filter((b) => { const l = lot(b.key); return !l || !l.owner; });
      const b = near((mine.length ? mine : free).map((b) => ({ ...b, x: b.doorX, y: b.doorY })));
      return b ? { x: b.x, y: b.y } : null;
    }
  }
}
