"use client";
// An arcade game's page (/whistle, /haul): the game, and the boards (today,
// this week, last week's champions), refreshed after each run that goes in.

import { useCallback, useState } from "react";
import Link from "next/link";
import ArcadeShell from "./ArcadeShell";
import { ARCADE_GAMES, ARCADE_KEYS } from "@/lib/arcade/games";
import { cosmoByKey } from "@/lib/cosmetics";
import type { ArcadeBoardRow, ArcadeGameKey, ArcadeView } from "@/types/arcade";

const fmt = (n: number) => n.toLocaleString("en-US");

function Board({ title, rows, empty, linkTo }: { title: string; rows: ArcadeBoardRow[]; empty: string; linkTo?: string }) {
  return (
    <section className="rounded-xl border-2 border-amber-800/40 bg-black/30 p-3">
      <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-amber-300">{title}</h2>
      {rows.length === 0 ? <p className="text-sm text-stone-400">{empty}</p> : (
        <ol className="space-y-0.5 text-sm">
          {rows.map((r) => (
            <li key={`${r.rank}-${r.name}`} className={`flex items-baseline gap-2 rounded px-1.5 py-0.5 ${r.me ? "bg-amber-400/20 font-bold" : ""}`}>
              <span className="w-6 text-right text-stone-400">{r.rank <= 3 ? ["🥇", "🥈", "🥉"][r.rank - 1] : r.rank}</span>
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              {linkTo && r.runId ? <Link href={`${linkTo}/r/${r.runId}`} className="tabular-nums underline decoration-dotted hover:text-amber-200">{fmt(r.score)}</Link> : <span className="tabular-nums">{fmt(r.score)}</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default function ArcadePage({ game, initial }: { game: ArcadeGameKey; initial: ArcadeView }) {
  const g = ARCADE_GAMES[game];
  const [view, setView] = useState(initial);
  const reload = useCallback(async () => {
    const r = await fetch(`/api/arcade/${game}`).catch(() => null);
    if (r?.ok) setView((await r.json()) as ArcadeView);
  }, [game]);
  const hours = Math.floor(view.nextInMs / 3_600_000), mins = Math.floor((view.nextInMs % 3_600_000) / 60_000);
  const wear = cosmoByKey(g.prize.cosmetic)?.name ?? "a prize to wear";
  const others = ARCADE_KEYS.filter((k) => k !== game).map((k) => ARCADE_GAMES[k]);

  return (
    <main className="min-h-dvh bg-[#141c3c] text-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-3 py-3 md:flex-row md:items-start md:py-6">
        <div className="flex h-[calc(100dvh-24px)] min-h-[520px] flex-1 flex-col md:h-[760px]">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="flex items-center gap-3">
              <Link href="/" className="font-extrabold text-amber-300">🌳 thegroove</Link>
              <Link href="/play" className="text-[13px] text-stone-300 underline">🕹 all games</Link>
            </span>
            <span className="text-[12px] text-stone-400">next course in {hours}h {mins}m</span>
          </div>
          <ArcadeShell game={game} today={view.course} number={view.number} signedIn={!!view.me} onSubmitted={() => void reload()} />
        </div>
        <aside className="flex w-full flex-col gap-3 md:w-72">
          {view.me && (
            <div className="rounded-xl bg-emerald-700/30 p-3 text-sm">
              <b>{view.me.name}</b>: {view.me.best ? <>best today <b>{fmt(view.me.best)}</b> (#{view.me.rank})</> : "no run today yet"}
              {view.me.weekRank && <> · #{view.me.weekRank} this week</>}
            </div>
          )}
          <Board title={`Today · #${view.number}`} rows={view.today} empty="Nobody yet. Be the first!" linkTo={g.path} />
          <Board title="This week" rows={view.week} empty="The week's just started." />
          <section className="rounded-xl border-2 border-amber-800/40 bg-black/30 p-3 text-sm text-stone-300">
            <h2 className="mb-1 text-sm font-extrabold uppercase tracking-wide text-amber-300">🏆 Weekly prizes</h2>
            <p>Your week is your best score each day, added up. Every Monday the top three get gems, the <b>{g.prize.title}</b> title and the {wear} to wear in thegroove.</p>
          </section>
          {view.champions.length > 0 && <Board title="Last week's champions" rows={view.champions} empty="" />}
          {others.map((o) => (
            <Link key={o.key} href={o.path} className="rounded-xl border-2 border-lime-700/40 bg-lime-900/20 p-3 text-sm hover:bg-lime-900/40">
              <b>{o.emoji} {o.name}</b>: {o.tagline} →
            </Link>
          ))}
          <p className="px-1 text-[12px] text-stone-400">
            {g.name} is a game inside <Link href="/" className="underline">thegroove</Link>, a pixel village where the AI villagers keep shops, trade and remember you. Prizes are in-game only. <Link href="/terms" className="underline">Terms</Link>
          </p>
        </aside>
      </div>
    </main>
  );
}
