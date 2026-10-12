"use client";
// The journey's tracker (after the tutorial): the current goal, how far
// along it is, its reward, and the guide arrow when there's somewhere to go.
import { useEffect, useMemo, useState } from "react";
import { bus, type Snapshot } from "@/game/bus";
import { locateTarget } from "@/game/guideTarget";
import { deviceKeys } from "@/lib/keyHints";
import type { JourneyView } from "@/types/journey";

const MIN_KEY = "grove_journey_min";

export default function JourneyTracker({ view, snap, touch }: { view: JourneyView; snap: Snapshot | null; touch: boolean }) {
  const [min, setMin] = useState(() => { try { return localStorage.getItem(MIN_KEY) === "1"; } catch { return false; } });
  const toggle = () => setMin((m) => { try { localStorage.setItem(MIN_KEY, m ? "0" : "1"); } catch { /* ignore */ } return !m; });

  const target = useMemo(() => (view.target && snap ? locateTarget(view.target, snap) : null), [view.target, snap]);
  const tx = target ? Math.round(target.x / 8) : null, ty = target ? Math.round(target.y / 8) : null;
  useEffect(() => {
    bus.emit("guide", target);
    // Only re-emit when the target meaningfully moves (8 px grid).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx, ty, target?.npcId, view.key]);
  useEffect(() => () => bus.emit("guide", null), []);

  const counted = view.need > 1;
  return (
    <div className="pointer-events-auto absolute left-2 top-[var(--hud-top,3.5rem)] z-10 w-[min(14rem,calc(50vw-0.75rem))] sm:w-64">
      <div className="pixel-panel p-2 text-amber-950">
        <div className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-emerald-800">
          <span>🧭 Journey {view.step + 1}/{view.total}</span>
          <span className="flex-1" />
          <button className="px-1 text-emerald-800/70 hover:text-emerald-950" onClick={toggle} aria-label={min ? "Expand" : "Collapse"}>{min ? "▸" : "▾"}</button>
        </div>
        <div className="text-sm font-bold leading-tight">{view.title}{counted ? ` (${Math.min(view.have, view.need)}/${view.need})` : ""}</div>
        {!min && (
          <>
            <p className="mt-1 text-xs leading-snug">{deviceKeys(view.hint, touch)}</p>
            {counted && <div className="mt-1 h-1.5 overflow-hidden rounded bg-amber-900/20"><div className="h-full bg-emerald-500" style={{ width: `${(100 * Math.min(view.have, view.need)) / view.need}%` }} /></div>}
            <div className="mt-1 text-[11px] text-amber-900/80">🎁 {view.reward.coins} 🪙 · {view.reward.xp} XP</div>
          </>
        )}
      </div>
    </div>
  );
}
