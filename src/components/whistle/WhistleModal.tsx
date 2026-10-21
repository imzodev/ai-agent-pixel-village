"use client";
// Whistle in the village: the sheepfold in the plaza opens the game in a
// window (the same game and boards as /whistle). Escape closes it, and walking
// stops while it's open.

import { useEffect, useState } from "react";
import Link from "next/link";
import { inputRouter } from "@/game/input/router";
import WhistleGame from "./WhistleGame";
import type { WhistleView } from "@/types/whistle";

export default function WhistleModal({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<WhistleView | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => inputRouter.pushKeymap({
    label: "whistle",
    bindings: [{ keys: ["escape"], command: "ui.close" as const, mode: "press" as const }],
    handlers: [{ id: "ui.close" as const, scope: "ui" as const, run: () => { onClose(); } }],
  }), [onClose]);
  useEffect(() => {
    let alive = true;
    void fetch("/api/whistle").then((r) => (r.ok ? r.json() : null)).then((v: WhistleView | null) => {
      if (!alive) return;
      if (v) setView(v); else setErr(true);
    }).catch(() => alive && setErr(true));
    return () => { alive = false; };
  }, []);

  return (
    <div role="dialog" aria-modal="true" aria-label="Whistle" onClick={onClose} className="pointer-events-auto fixed inset-0 z-[70] flex items-center justify-center bg-black/50">
      <div onClick={(e) => e.stopPropagation()} className="flex h-[min(94dvh,820px)] w-[min(96vw,460px)] flex-col rounded-xl border-2 border-amber-800/60 bg-[#141c3c] p-2 text-white shadow-2xl">
        <div className="mb-1 flex shrink-0 items-center px-1">
          <span className="text-sm text-stone-300">{view?.me?.best ? <>Your best today: <b className="text-amber-300">{view.me.best.toLocaleString("en-US")}</b> (#{view.me.rank})</> : "The sheepfold"}</span>
          <div className="flex-1" />
          <Link href="/whistle" target="_blank" className="mr-2 text-[12px] text-amber-200 underline">boards ↗</Link>
          <button onClick={onClose} className="-m-1 p-2 text-lg text-stone-400 hover:text-white" aria-label="Close">✕</button>
        </div>
        {view ? <WhistleGame today={view.course} signedIn={!!view.me} compact /> : (
          <div className="flex flex-1 items-center justify-center text-stone-300">{err ? "The sheep won't come out right now." : "Calling the flock…"}</div>
        )}
      </div>
    </div>
  );
}
