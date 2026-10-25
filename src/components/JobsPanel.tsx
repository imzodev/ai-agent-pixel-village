"use client";
// An employer's jobs (src/lib/jobs.ts): what they offer, your rank and
// today's shift, and Hire / Hand in / Pick up letters / Quit.
import { useEffect, useState } from "react";
import { inputRouter } from "@/game/input/router";
import { RANK_AT, letterRecipientLabel } from "@/lib/jobs";
import type { JobOffer, JobsResponse } from "@/types/jobs";

const ICON = { courier: "✉️", supplier: "📦", guard: "🛡️", escort: "🐎" } as const;

async function post(body: unknown): Promise<{ ok?: boolean; error?: string; message?: string; notices?: string[]; gained?: { itemKey: string; qty: number }[] }> {
  return fetch("/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => ({ error: "Network error" }));
}

export default function JobsPanel({ npcKey, npcName, onMessage, onClose }: {
  npcKey: string;
  npcName: string;
  onMessage: (text: string, kind: "good" | "bad", notices?: string[], gained?: { itemKey: string; qty: number }[]) => void;
  onClose: () => void;
}) {
  const [offers, setOffers] = useState<JobOffer[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [quitting, setQuitting] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    void fetch(`/api/jobs?npcKey=${encodeURIComponent(npcKey)}`).then((r) => r.json()).then((r: JobsResponse & { error?: string }) => { if (alive) setOffers(r.error ? [] : r.offers); }).catch(() => alive && setOffers([]));
    return () => { alive = false; };
  }, [npcKey, version]);
  useEffect(() => inputRouter.pushKeymap({
    label: "jobs",
    bindings: [{ keys: ["escape"], command: "ui.close" as const, mode: "press" as const }],
    handlers: [{ id: "ui.close" as const, scope: "ui" as const, run: () => { onClose(); } }],
  }), [onClose]);

  const act = async (body: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    const r = await post(body);
    if (r.error) onMessage(r.error, "bad");
    else onMessage(r.message ?? "Done.", "good", r.notices, r.gained);
    setQuitting(null);
    setVersion((v) => v + 1);
    setBusy(false);
  };

  return (
    <div role="dialog" aria-modal="true" onClick={onClose} className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[min(85dvh,calc(100dvh-1.5rem))] w-[min(94vw,520px)] flex-col rounded-2xl border-4 border-amber-900/70 bg-amber-50 p-4 shadow-2xl">
        <div className="flex shrink-0 items-start gap-3">
          <div className="flex-1">
            <div className="text-lg font-bold text-amber-900">💼 Work for {npcName}</div>
            <div className="mt-0.5 text-[12px] text-stone-600">A shift a day for a wage. Steady work gets you promoted; miss three days and you&apos;re let go. Up to three jobs at once.</div>
          </div>
          <button onClick={onClose} className="-m-2 p-2 text-lg text-stone-400 hover:text-stone-700" aria-label="Close">✕</button>
        </div>
        <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain">
          {!offers && <div className="p-3 text-center text-stone-500">Asking about work…</div>}
          {offers?.length === 0 && <div className="rounded bg-stone-100 p-3 text-center text-stone-500">{npcName} isn&apos;t hiring.</div>}
          {offers?.map((o) => {
            const m = o.mine;
            return (
              <div key={o.key} className="rounded-lg bg-white p-3 shadow">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{ICON[o.kind]}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-stone-800">{m ? m.title : o.title}</div>
                    <div className="text-[11px] text-stone-500">{m ? `${m.shiftsDone} shifts done · streak ${m.streak}${m.toNextRank != null ? ` · ${m.toNextRank} to promotion` : " · top rank"}` : `about ${o.pay} 🪙 a shift`}</div>
                  </div>
                </div>
                {!m && <div className="mt-1 text-[12px] italic text-stone-600">&ldquo;{o.pitch}&rdquo;</div>}
                <div className="mt-1 text-[12px] text-stone-700">Each day: {m ? m.task : o.task}.</div>
                {m && (
                  <>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-stone-600">
                      <div className="h-1.5 flex-1 overflow-hidden rounded bg-stone-200"><div className={`h-full ${m.done ? "bg-emerald-500" : "bg-sky-500"}`} style={{ width: `${(100 * Math.min(m.count, m.need)) / Math.max(1, m.need)}%` }} /></div>
                      <span>{m.done ? "Done today ✓" : `${m.count}/${m.need} today`}</span>
                    </div>
                    {m.letters && <div className="mt-1 text-[11px] text-stone-600">Letters: {m.letters.map((l) => `${l.delivered ? "✓" : "✉️"} ${letterRecipientLabel(l)} (${l.pay} 🪙)`).join(" · ")}</div>}
                    <div className="mt-1 flex gap-1 text-[10px] text-stone-500">{RANK_AT.map((at, i) => <span key={at} className={i <= m.rank ? "font-bold text-amber-800" : ""}>{i > 0 && "→ "}{["Apprentice", "Hand", "Foreman"][i]} ({at})</span>)}</div>
                  </>
                )}
                <div className="mt-2 flex flex-wrap justify-end gap-2">
                  {!m && (o.blocked
                    ? <span className="text-[12px] font-bold text-stone-500">{o.blocked}</span>
                    : <button disabled={busy} onClick={() => void act({ action: "hire", jobKey: o.key })} className="pixel-btn bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-40">Take the job</button>)}
                  {m && !m.done && o.kind === "supplier" && <button disabled={busy} onClick={() => void act({ action: "work", jobKey: o.key })} className="pixel-btn bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-40">📦 Hand in</button>}
                  {m && !m.done && o.kind === "courier" && !m.letters?.length && <button disabled={busy} onClick={() => void act({ action: "work", jobKey: o.key })} className="pixel-btn bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-40">✉️ Pick up today&apos;s letters</button>}
                  {m && (quitting === o.key
                    ? <><span className="self-center text-[12px] text-stone-600">Leave this job?</span><button disabled={busy} onClick={() => void act({ action: "quit", jobKey: o.key })} className="pixel-btn bg-rose-600 px-3 py-1.5 text-sm font-bold text-white">Yes, quit</button><button onClick={() => setQuitting(null)} className="pixel-btn bg-white px-3 py-1.5 text-sm">Stay</button></>
                    : <button disabled={busy} onClick={() => setQuitting(o.key)} className="pixel-btn bg-white px-3 py-1.5 text-sm text-stone-600">Quit</button>)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
