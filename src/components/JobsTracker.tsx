"use client";
// Today's shifts at a glance (in the bottom-left tracker, above bounties).
import { letterRecipientLabel } from "@/lib/jobs";
import type { JobView } from "@/types/jobs";

const ICON = { courier: "✉️", supplier: "📦", guard: "🛡️", escort: "🐎" } as const;

/** What's left to do today, in a few words. */
function hint(j: JobView): string {
  if (j.done) return "Done for today";
  if (j.kind === "courier") {
    if (!j.letters?.length) return `Pick up letters from ${j.employerName}`;
    return `Deliver to ${j.letters.filter((l) => !l.delivered).map((l) => letterRecipientLabel(l)).join(", ")}`;
  }
  if (j.kind === "supplier") return `Bring them to ${j.employerName}`;
  if (j.kind === "guard") return j.task.replace(/^Defeat \d+ /, "Defeat ");
  return j.riding ? `Stay by ${j.employerName}'s wagon until it arrives` : `Be by ${j.employerName}'s wagon when it leaves town`;
}

export default function JobsTracker({ list }: { list: JobView[] }) {
  return (
    <>
      {list.map((j) => (
        <div key={j.key} className="pixel-panel-dark px-2 py-1 text-[11px]">
          <div className="flex items-center gap-1"><span>{ICON[j.kind]}</span><b className="flex-1 truncate">{j.title} · {j.employerName}</b>{j.done ? <span className="text-emerald-300">✓</span> : <span>{j.count}/{j.need}</span>}</div>
          <div className="truncate text-[10px] opacity-75">{hint(j)}</div>
        </div>
      ))}
    </>
  );
}
