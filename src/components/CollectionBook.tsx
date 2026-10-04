"use client";
// The 📖 Book panel: collection pages (fish, crops, creatures, places,
// folk, hidden relic sets), page rewards, achievements and the title shown on your nameplate.
import { useCallback, useEffect, useState } from "react";
import type { CollectionBookView } from "@/types/collection";
import type { RepView } from "@/types/reputation";
import type { RelicSetKey } from "@/types/treasure";
import RelicIcon from "./RelicIcon";

/** A relic entry's set, from its key (`<set>_<n>`). */
const relicSetOf = (key: string) => key.slice(0, key.lastIndexOf("_")) as RelicSetKey;

export default function CollectionBook({ onMessage }: { onMessage: (text: string, kind: "good" | "bad") => void }) {
  const [book, setBook] = useState<CollectionBookView | null>(null);
  const [tab, setTab] = useState<string>("fish");
  const [busy, setBusy] = useState(false);
  const [towns, setTowns] = useState<RepView[]>([]);
  useEffect(() => { void fetch("/api/reputation").then((r) => r.json()).then((r) => { if (r?.towns) setTowns(r.towns); }).catch(() => {}); }, []);

  const load = useCallback(() => fetch("/api/collection").then((r) => r.json()).then((r) => { if (r && !r.error) setBook(r); }).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);

  const send = async (url: string, body: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => ({ error: "Network error" }));
    setBusy(false);
    if (r.error) onMessage(r.error, "bad");
    else if (r.message) onMessage(r.message, "good");
    void load();
  };

  if (!book) return <div className="p-4 text-center text-stone-500">Opening the book…</div>;
  const page = book.pages.find((p) => p.key === tab);
  const found = (p: CollectionBookView["pages"][number]) => p.entries.filter((e) => e.count > 0).length;

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1">
        {book.pages.map((p) => (
          <button key={p.key} onClick={() => setTab(p.key)} className={`rounded px-2 py-1 text-xs font-bold ${tab === p.key ? "bg-amber-600 text-white" : "bg-amber-200/70 text-amber-900 hover:bg-amber-200"}`}>
            {p.icon} {p.name} <span className="opacity-70">{found(p)}/{p.entries.length}</span>
          </button>
        ))}
        {towns.length > 0 && (
          <button onClick={() => setTab("towns")} className={`rounded px-2 py-1 text-xs font-bold ${tab === "towns" ? "bg-amber-600 text-white" : "bg-amber-200/70 text-amber-900 hover:bg-amber-200"}`}>🏘️ Towns</button>
        )}
        <button onClick={() => setTab("achievements")} className={`rounded px-2 py-1 text-xs font-bold ${tab === "achievements" ? "bg-amber-600 text-white" : "bg-amber-200/70 text-amber-900 hover:bg-amber-200"}`}>
          🏆 Feats <span className="opacity-70">{book.achievements.filter((a) => a.done).length}/{book.achievements.length}</span>
        </button>
      </div>

      {page && (
        <>
          <div className="mb-2 h-2 overflow-hidden rounded bg-amber-900/20"><div className="h-full bg-amber-500" style={{ width: `${(100 * found(page)) / Math.max(1, page.entries.length)}%` }} /></div>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {page.entries.map((e) => (
              <div key={e.key} className={`rounded border-2 p-1.5 text-center ${e.count > 0 ? "border-amber-700/40 bg-amber-50" : "border-dashed border-stone-400/50 bg-stone-200/50"}`} title={e.count > 0 ? e.name : "Not found yet"}>
                <div className={`flex h-8 items-center justify-center text-2xl ${e.count > 0 ? "" : "opacity-40 brightness-0"}`}>{page.kind === "relic" ? <RelicIcon set={relicSetOf(e.key)} size={26} /> : e.icon}</div>
                <div className="truncate text-[11px] font-bold">{e.count > 0 ? e.name : "???"}</div>
                {e.count > 0 && page.kind !== "region" && page.kind !== "npc" && page.kind !== "relic" && <div className="text-[10px] text-stone-500">×{e.count}</div>}
                {e.count === 0 && e.hint && <div className="text-[9px] leading-tight text-stone-500">{e.hint}</div>}
              </div>
            ))}
          </div>
          {page.kind === "relic" && <div className="mt-2 text-[11px] text-stone-600"><b>Look for:</b> {page.blurb} A star twinkles over each one, and you&apos;ll hear about it when you&apos;re close. Walk up and press E.</div>}
          <div className="mt-2 flex items-center gap-2 rounded bg-amber-100 p-2 text-xs">
            <span className="flex-1">Complete the page: <b>{page.reward.coins} 🪙</b>, the title <b>“{page.reward.title}”</b>{page.reward.treasureMap && <> and <b>a treasure map 🗺️</b></>}</span>
            {page.claimed ? <span className="font-bold text-emerald-700">✓ Claimed</span> : (
              <button disabled={busy || found(page) < page.entries.length} onClick={() => void send("/api/collection", { action: "claim", page: page.key })} className="pixel-btn px-2 py-1 disabled:opacity-40">Claim</button>
            )}
          </div>
        </>
      )}

      {tab === "towns" && (
        <div className="space-y-1">
          <div className="text-[11px] text-stone-600">Trade with a town&apos;s people and take its bounties to raise your standing: shop discounts, and at Revered a title.</div>
          {towns.map((t) => (
            <div key={t.town} className="rounded bg-amber-50 p-2 text-xs">
              <div className="flex items-center"><b className="flex-1">🏘️ {t.name}</b><span>{t.tier}{t.discount ? ` · −${Math.round(t.discount * 100)}% in shops` : ""}</span></div>
              {t.next && <div className="mt-1 h-1.5 overflow-hidden rounded bg-amber-900/20" title={`${t.points}/${t.next.min} to ${t.next.name}`}><div className="h-full bg-amber-500" style={{ width: `${(100 * t.points) / t.next.min}%` }} /></div>}
            </div>
          ))}
        </div>
      )}
      {tab === "achievements" && (
        <div className="space-y-1">
          {book.achievements.map((a) => (
            <div key={a.key} className={`flex items-center gap-2 rounded p-2 text-xs ${a.done ? "bg-amber-50" : "bg-stone-200/50 text-stone-500"}`}>
              <span className="text-lg">{a.done ? "🏆" : "🔒"}</span>
              <div className="flex-1"><div className="font-bold">{a.name}</div><div>{a.description}</div></div>
              <span className="text-[11px] italic">“{a.title}”</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 border-t border-amber-900/20 pt-2">
        <div className="mb-1 text-xs font-bold text-amber-900">Your title</div>
        {book.titles.length === 0 ? <div className="text-xs text-stone-500">Earn titles from achievements and completed pages.</div> : (
          <div className="flex flex-wrap gap-1">
            <button disabled={busy} onClick={() => void send("/api/titles", { title: null })} className={`rounded px-2 py-1 text-xs ${book.title == null ? "bg-amber-600 font-bold text-white" : "bg-stone-200 hover:bg-stone-300"}`}>None</button>
            {book.titles.map((t) => (
              <button key={t} disabled={busy} onClick={() => void send("/api/titles", { title: t })} className={`rounded px-2 py-1 text-xs ${book.title === t ? "bg-amber-600 font-bold text-white" : "bg-stone-200 hover:bg-stone-300"}`}>« {t} »</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
