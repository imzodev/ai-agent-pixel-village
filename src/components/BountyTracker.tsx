"use client";
// Your bounties at a glance (bottom-left): what's left to do on each.
import type { BountyView } from "@/types/bounty";

export default function BountyTracker({ list }: { list: BountyView[] }) {
  if (list.length === 0) return null;
  return (
    <div className="pointer-events-none absolute bottom-14 left-2 z-10 w-60 max-w-[calc(100vw-1rem)] space-y-1">
      {list.map((b) => {
        const m = b.mine!;
        const done = m.progress >= m.target;
        return (
          <div key={b.id} className="pixel-panel-dark px-2 py-1 text-[11px]">
            <div className="flex items-center gap-1"><span>📜</span><b className="flex-1 truncate">{b.title}</b>{done ? <span className="text-emerald-300">✓</span> : <span>{m.progress}/{m.target}</span>}</div>
            <div className="text-[10px] opacity-75">{done ? `Turn in at ${b.townName}'s board` : b.data.kind === "delivery" ? "Carry the parcel to its board" : b.data.kind === "explore" || b.data.kind === "wanted" ? "Marked on your map (M)" : b.data.kind === "gather" ? `Bring them to ${b.townName}` : "Anywhere in the wilds"}</div>
          </div>
        );
      })}
    </div>
  );
}
