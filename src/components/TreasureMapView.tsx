"use client";
// Reading a treasure map: the hand-drawn sketch (drawn by the server, so
// it shows the land and the X but never where on the world map it is),
// the province it's in, and a Dig button for when you think you're there.
import { useEffect, useState } from "react";
import type { TreasureMapView as MapView } from "@/types/treasure";
import { TRAIL_PARTS } from "@/lib/treasure";

const STARS = ["", "★", "★★", "★★★", "★★★★"];

export default function TreasureMapView({ mapId, onClose, onMessage, onDug }: {
  mapId: number;
  onClose: () => void;
  onMessage: (text: string, kind: "good" | "bad") => void;
  onDug: () => void;
}) {
  const [view, setView] = useState<MapView | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void fetch("/api/treasure").then((r) => r.json()).then((r: { maps?: MapView[] }) => setView(r.maps?.find((m) => m.mapId === mapId) ?? null)).catch(() => {});
  }, [mapId]);

  const dig = async () => {
    if (busy) return;
    setBusy(true);
    const r = await fetch("/api/treasure", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "dig", mapId }) }).then((r) => r.json()).catch(() => ({ error: "Network error" }));
    setBusy(false);
    if (r.error) { onMessage(r.error, "bad"); return; }
    onMessage(r.message, "good");
    for (const n of r.notices ?? []) onMessage(n, "good");
    onDug();
    onClose();
  };

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3" onClick={onClose}>
      <div className="w-full max-w-[380px] rounded-lg border-4 border-amber-900/70 bg-[#e9d6aa] p-3 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center">
          <div className="font-bold text-amber-950">🗺️ Treasure map {view?.part ? <span className="text-xs font-normal">· part {view.part} of {TRAIL_PARTS}</span> : null}</div>
          <div className="flex-1" />
          <button onClick={onClose} className="text-amber-900/60 hover:text-amber-950">✕</button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- a server-drawn PNG, not a static asset */}
        <img src={`/api/treasure/sketch/${mapId}`} alt="A hand-drawn map with a red X" className="w-full rounded border-2 border-amber-900/40" style={{ imageRendering: "pixelated" }} />
        <div className="mt-2 text-sm text-amber-950">
          {view ? <><b>{view.where}.</b> <span className="text-amber-800" title="Danger">{STARS[view.tier]}</span></> : "An old, creased scrap…"}
        </div>
        <div className="mt-1 text-[11px] leading-snug text-amber-900/80">
          Match the coasts, rivers, roads and woods to the land around you. Stand right on the X and dig.
          {view?.part ? " The chest holds the next map of the trail." : ""}
        </div>
        <div className="mt-2 flex gap-2">
          <button disabled={busy} onClick={() => void dig()} className="pixel-btn bg-amber-500 px-3 py-1 text-sm font-bold text-white disabled:opacity-50">⛏️ Dig here</button>
          <button onClick={onClose} className="pixel-btn bg-amber-100 px-3 py-1 text-sm">Put it away</button>
        </div>
      </div>
    </div>
  );
}
