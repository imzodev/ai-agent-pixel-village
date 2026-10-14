"use client";
// The guided first session's tracker: a small card with the current step,
// plus the target the scene's guide arrow points at (bus "guide").
import { useEffect, useMemo, useState } from "react";
import { bus, type Snapshot } from "@/game/bus";
import { TUTORIAL_STEPS } from "@/lib/tutorial";
import { locateTarget as locate } from "@/game/guideTarget";
import { deviceKeys } from "@/lib/keyHints";

const WELCOME_KEY = "grove_tutorial_welcome_v1";

export default function QuestTracker({ step, progress, snap, touch, onSkip }: { step: number; progress: number; snap: Snapshot | null; touch: boolean; onSkip: () => Promise<void> }) {
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
          <p className="mb-4 text-xs text-amber-900/80">{touch ? "Move with the stick (push it all the way to run). A talks and uses things, ⚔ attacks, B goes back. ☰ has your bag, map and help." : "Move with WASD or the arrow keys. Press E to talk or use things, J to attack. ❓ Help shows every key."}</p>
          <div className="flex gap-2">
            <button className="pixel-btn flex-1" onClick={() => { start(); void onSkip(); }}>Skip tutorial</button>
            <button className="pixel-btn flex-[2] font-bold" onClick={start}>Let&apos;s go!</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto absolute left-2 top-[var(--hud-top,3.5rem)] z-10 w-[min(14rem,calc(50vw-0.75rem))] sm:w-64">
      <div className="pixel-panel p-2 text-amber-950">
        <div className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-amber-800">
          <span>📜 Step {step + 1}/{TUTORIAL_STEPS.length}</span>
          <span className="flex-1" />
          <button className="px-1 text-amber-800/70 hover:text-amber-950" onClick={() => setMin((m) => !m)} aria-label={min ? "Expand" : "Collapse"}>{min ? "▸" : "▾"}</button>
        </div>
        <div className="text-sm font-bold leading-tight">{def.title}{def.qty > 1 ? ` (${Math.min(progress, def.qty)}/${def.qty})` : ""}</div>
        {!min && (
          <>
            <p className="mt-1 text-xs leading-snug">{deviceKeys(def.hint, touch)}</p>
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

export function rewardText(r: { coins?: number; xp?: number; items?: { itemKey: string; qty: number }[]; title?: string }): string {
  const parts: string[] = [];
  if (r.coins) parts.push(`${r.coins} 🪙`);
  if (r.xp) parts.push(`${r.xp} XP`);
  for (const i of r.items ?? []) parts.push(`${i.qty > 1 ? `${i.qty}× ` : ""}${i.itemKey.replace(/_/g, " ")}`);
  if (r.title) parts.push(`title “${r.title}”`);
  return parts.join(", ");
}
