"use client";
// An arcade game in the village: its spot (the sheepfold in the plaza, Della's
// cart by the ranch) opens the game in a window, the same game and boards as
// its page. Escape closes it, and walking stops while it's open.

import { useEffect, useState } from "react";
import Link from "next/link";
import { inputRouter } from "@/game/input/router";
import { ARCADE_GAMES } from "@/lib/arcade/games";
import ArcadeShell from "./ArcadeShell";
import type { ArcadeGameKey, ArcadeView } from "@/types/arcade";

export default function ArcadeModal({ game, onClose }: { game: ArcadeGameKey; onClose: () => void }) {
  const g = ARCADE_GAMES[game];
  const [view, setView] = useState<ArcadeView | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => inputRouter.pushKeymap({
    label: "arcade",
    bindings: [{ keys: ["escape"], command: "ui.close" as const, mode: "press" as const }],
    handlers: [{ id: "ui.close" as const, scope: "ui" as const, run: () => { onClose(); } }],
  }), [onClose]);
  useEffect(() => {
    let alive = true;
    void fetch(`/api/arcade/${game}`).then((r) => (r.ok ? r.json() : null)).then((v: ArcadeView | null) => {
      if (!alive) return;
      if (v) setView(v); else setErr(true);
    }).catch(() => alive && setErr(true));
    return () => { alive = false; };
  }, [game]);

  return (
    <div role="dialog" aria-modal="true" aria-label={g.name} onClick={onClose} className="pointer-events-auto fixed inset-0 z-[70] flex items-center justify-center bg-black/50">
      <div onClick={(e) => e.stopPropagation()} className="flex h-[min(94dvh,820px)] w-[min(96vw,460px)] flex-col rounded-xl border-2 border-amber-800/60 bg-[#141c3c] p-2 text-white shadow-2xl">
        <div className="mb-1 flex shrink-0 items-center px-1">
          <span className="text-sm text-stone-300">{view?.me?.best ? <>Your best today: <b className="text-amber-300">{view.me.best.toLocaleString("en-US")}</b> (#{view.me.rank})</> : g.tagline}</span>
          <div className="flex-1" />
          <Link href={g.path} target="_blank" className="mr-2 text-[12px] text-amber-200 underline">boards ↗</Link>
          <button onClick={onClose} className="-m-1 p-2 text-lg text-stone-400 hover:text-white" aria-label="Close">✕</button>
        </div>
        {view ? <ArcadeShell game={game} today={view.course} number={view.number} signedIn={!!view.me} compact /> : (
          <div className="flex flex-1 items-center justify-center text-stone-300">{err ? "This game won't load right now." : "Getting it ready…"}</div>
        )}
      </div>
    </div>
  );
}
