// The player's guide (/guide), its pieces: a section with an anchor and a
// small table that scrolls sideways on a phone instead of squashing.
import type { ReactNode } from "react";

export function Section({ id, icon, title, children }: { id: string; icon: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-white/10 pt-6">
      <h2 className="text-2xl font-extrabold text-amber-300">{icon} {title}</h2>
      {children}
    </section>
  );
}

export function Table({ head, rows }: { head: readonly string[]; rows: readonly (readonly string[])[] }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full min-w-[480px] text-left text-[13px]">
        <thead className="bg-white/5 text-amber-200">
          <tr>{head.map((h) => <th key={h} className="px-3 py-2 font-bold">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-white/5 align-top">
              {r.map((c, j) => <td key={j} className={`px-3 py-1.5 ${j === 0 ? "whitespace-nowrap font-bold text-stone-100" : "text-stone-300"}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A "how to" tip in a box. */
export function Tip({ children }: { children: ReactNode }) {
  return <div className="mt-3 rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-[14px] text-amber-100">💡 {children}</div>;
}
