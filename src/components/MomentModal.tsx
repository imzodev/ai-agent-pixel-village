"use client";
// A proud moment's share card: the card itself, and one tap to post it on X
// (or the phone's share sheet, or a copied link). Shown once per moment;
// closing marks it seen (src/lib/momentsServer.ts).

import { useEffect, useState } from "react";
import { inputRouter } from "@/game/input/router";
import { xShareUrl } from "@/lib/moments";
import type { MomentNotice } from "@/types/moments";
import { trackShare } from "@/lib/shareTracking";

export default function MomentModal({ moment, onClose }: { moment: MomentNotice; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/m/${moment.id}` : `/m/${moment.id}`;
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches;

  useEffect(() => inputRouter.pushKeymap({
    label: "moment",
    bindings: [{ keys: ["escape"], command: "ui.close" as const, mode: "press" as const }],
    handlers: [{ id: "ui.close" as const, scope: "ui" as const, run: () => { onClose(); } }],
  }), [onClose]);

  const copy = async () => {
    trackShare("copy", "moment");
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
  };
  const nativeShare = async () => {
    trackShare("native", "moment");
    try { await navigator.share({ title: moment.data.headline, text: moment.data.share, url }); } catch { /* dismissed */ }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={moment.data.headline} onClick={onClose} className="pointer-events-auto fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3">
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[calc(100dvh-1.5rem)] w-[min(96vw,640px)] flex-col overflow-y-auto overscroll-contain rounded-2xl border-4 border-amber-300 bg-[#1a2238] p-4 text-white shadow-2xl">
        <div className="flex shrink-0 items-start">
          <div className="flex-1">
            <div className="text-[12px] font-bold uppercase tracking-wider text-amber-300">A moment worth sharing</div>
            <div className="text-xl font-extrabold">{moment.data.headline}</div>
          </div>
          <button onClick={onClose} className="-m-2 p-2 text-lg text-stone-400 hover:text-white" aria-label="Close">✕</button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- a generated card */}
        <img src={`/m/${moment.id}/card.png`} width={1200} height={630} alt={moment.data.headline} className="mt-3 w-full rounded-lg border-2 border-amber-300/60" style={{ imageRendering: "pixelated" }} />
        <p className="mt-2 text-sm text-stone-300">{moment.data.sub}{moment.data.extra ? ` · ${moment.data.extra}` : ""}</p>
        <div className="mt-3 flex shrink-0 flex-wrap gap-2">
          <a href={xShareUrl(moment.data.share, url)} target="_blank" rel="noopener noreferrer" onClick={() => { trackShare("x", "moment"); setTimeout(onClose, 300); }}
            className="rounded-xl bg-black px-4 py-2 font-extrabold text-white ring-2 ring-white/30 hover:bg-stone-800">Share on 𝕏</a>
          {canNativeShare && <button onClick={() => void nativeShare()} className="rounded-xl bg-sky-600 px-4 py-2 font-bold text-white hover:brightness-110">Share…</button>}
          <button onClick={() => void copy()} className="rounded-xl bg-white/10 px-4 py-2 font-bold text-white hover:bg-white/20">{copied ? "Link copied ✓" : "Copy link"}</button>
          <span className="flex-1" />
          <button onClick={onClose} className="rounded-xl px-3 py-2 text-stone-300 hover:text-white">Later</button>
        </div>
      </div>
    </div>
  );
}
