"use client";
// The world map (M): a small slippy-map viewer over the server's map tiles
// (src/lib/worldAtlasServer.ts), with fog of war, places, your lots,
// waystones (click an attuned one to fast-travel), you, and the quest star.
// Only the tiles in view are loaded, so it works for any world size.
import { useCallback, useEffect, useRef, useState } from "react";
import { bus } from "@/game/bus";
import { CHUNK_TILE_H, CHUNK_TILE_W } from "@/lib/chunkCollision";
import { MAP_MAX_ZOOM, MAP_TILE_H, MAP_TILE_W, WAYSTONE_NEAR_PX, chunkOfTile, seenChunks, travelCost } from "@/lib/worldAtlas";
import type { MapCamera, MapMarkers, MapWaystone } from "@/types/map";
import type { BountyView } from "@/types/bounty";
import { boardPoint } from "@/lib/bounties";

const images = new Map<string, HTMLImageElement>(); // map tiles, shared across opens
const PLACE_ICON = { inn: "🍺", forge: "🔨", cave: "🕳️" } as const;
const LOT_ICON = { home: "🏡", land: "🌱", ranch: "🐔" } as const;
const MIN_SCALE = 1 / 16, MAX_SCALE = 4;

export default function MapPanel({ me, guide, bounties = [], extraSeen, travelMode, onClose, onMessage }: {
  me: { x: number; y: number } | null;
  guide: { x: number; y: number } | null;
  /** Your bounties: their spots, parcels' boards, and boards to report to. */
  bounties?: readonly BountyView[];
  /** Chunks seen this session but not yet saved ("cx,cy"). */
  extraSeen: ReadonlySet<string>;
  /** Opened at a waystone: say so in the header. */
  travelMode: boolean;
  onClose: () => void;
  onMessage: (text: string, kind: "good" | "bad") => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [markers, setMarkers] = useState<MapMarkers | null>(null);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const cam = useRef<MapCamera>({ x: me?.x ?? 0, y: me?.y ?? 0, scale: 2 });
  const [hover, setHover] = useState<MapWaystone | null>(null);
  const [pick, setPick] = useState<MapWaystone | null>(null);
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  // Markers + the fog for the whole rendered area.
  useEffect(() => {
    let off = false;
    void fetch("/api/map/markers").then((r) => r.json()).then((m: MapMarkers & { error?: string }) => {
      if (off || m.error) return;
      setMarkers(m);
      const b = m.bounds;
      return fetch(`/api/map/seen?cx0=${b.cx0}&cx1=${b.cx1}&cy0=${b.cy0}&cy1=${b.cy1}`).then((r) => r.json()).then((s) => { if (!off && s.blocks) setSeen(seenChunks(s.blocks)); });
    }).catch(() => {});
    return () => { off = true; };
  }, []);

  const isSeen = useCallback((cx: number, cy: number) => seen.has(`${cx},${cy}`) || extraSeen.has(`${cx},${cy}`), [seen, extraSeen]);
  const seenAt = useCallback((x: number, y: number) => { const c = chunkOfTile(Math.floor(x / 16), Math.floor(y / 16)); return isSeen(c.cx, c.cy); }, [isSeen]);
  const atStone = !!me && !!markers?.waystones.some((w) => Math.hypot(w.x - me.x, w.y - me.y) <= WAYSTONE_NEAR_PX);

  // ── Drawing ────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const cv = canvas.current, box = wrap.current;
    if (!cv || !box || !markers) return;
    const dpr = window.devicePixelRatio || 1;
    const W = box.clientWidth, H = box.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingEnabled = false;
    g.fillStyle = "#101420";
    g.fillRect(0, 0, W, H);
    const { x: camX, y: camY, scale } = cam.current;
    // world px → screen px (scale = screen px per world tile)
    const sx = (x: number) => (x / 16 - camX / 16) * scale + W / 2;
    const sy = (y: number) => (y / 16 - camY / 16) * scale + H / 2;
    const tx0 = camX / 16 - W / 2 / scale, ty0 = camY / 16 - H / 2 / scale;
    const tx1 = camX / 16 + W / 2 / scale, ty1 = camY / 16 + H / 2 / scale;

    // map tiles at the zoom that fits the scale
    const z = Math.max(0, Math.min(MAP_MAX_ZOOM, Math.floor(Math.log2(1 / scale) + 0.5)));
    const k = 2 ** z, tw = MAP_TILE_W * k, th = MAP_TILE_H * k;
    for (let my = Math.floor(ty0 / th); my <= Math.floor(ty1 / th); my++) for (let mx = Math.floor(tx0 / tw); mx <= Math.floor(tx1 / tw); mx++) {
      const key = `${markers.version}/${z}/${mx}/${my}`;
      let img = images.get(key);
      if (!img) {
        img = new Image();
        img.src = `/api/map/tile/${z}/${mx}/${my}?v=${markers.version}`;
        images.set(key, img);
      }
      if (img.complete && img.naturalWidth) g.drawImage(img, sx(mx * tw * 16), sy(my * th * 16), tw * scale, th * scale);
    }

    // fog of war, per chunk (edges next to explored ground are lighter)
    const b = markers.bounds;
    const c0 = chunkOfTile(Math.floor(tx0), Math.floor(ty0)), c1 = chunkOfTile(Math.floor(tx1), Math.floor(ty1));
    const cxA = Math.max(b.cx0, c0.cx), cxB = Math.min(b.cx1, c1.cx), cyA = Math.max(b.cy0, c1.cy), cyB = Math.min(b.cy1, c0.cy);
    for (let cy = cyA; cy <= cyB; cy++) for (let cx = cxA; cx <= cxB; cx++) {
      if (isSeen(cx, cy)) continue;
      const edge = isSeen(cx - 1, cy) || isSeen(cx + 1, cy) || isSeen(cx, cy - 1) || isSeen(cx, cy + 1);
      g.fillStyle = edge ? "rgba(16,20,32,0.72)" : "rgba(16,20,32,0.95)";
      g.fillRect(Math.floor(sx(cx * CHUNK_TILE_W * 16)), Math.floor(sy(-cy * CHUNK_TILE_H * 16)), Math.ceil(CHUNK_TILE_W * scale) + 1, Math.ceil(CHUNK_TILE_H * scale) + 1);
    }

    // labels and icons
    g.textAlign = "center";
    g.textBaseline = "middle";
    const label = (text: string, x: number, y: number, size: number, color: string) => {
      g.font = `bold ${size}px var(--font-pixel), monospace`;
      g.lineWidth = 3;
      g.strokeStyle = "rgba(0,0,0,0.85)";
      g.strokeText(text, x, y);
      g.fillStyle = color;
      g.fillText(text, x, y);
    };
    if (scale >= 0.2) for (const r of markers.regions) if (seenAt(r.x, r.y)) label(r.name, sx(r.x), sy(r.y), scale >= 1 ? 15 : 12, "#ffe7a8");
    g.font = `${scale >= 1 ? 16 : 12}px serif`;
    for (const p of markers.places) if (seenAt(p.x, p.y)) g.fillText(PLACE_ICON[p.kind], sx(p.x), sy(p.y) - 6);
    for (const l of markers.lots) g.fillText(LOT_ICON[l.kind], sx(l.x), sy(l.y) - 6);
    for (const w of markers.waystones) {
      if (!w.attuned && !seenAt(w.x, w.y)) continue;
      const x = sx(w.x), y = sy(w.y) - 8, s = w === hover ? 8 : 6;
      if (w.attuned) { g.fillStyle = "rgba(90,176,240,0.35)"; g.beginPath(); g.arc(x, y, s + 5, 0, Math.PI * 2); g.fill(); }
      g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s * 0.7, y); g.lineTo(x, y + s); g.lineTo(x - s * 0.7, y); g.closePath();
      g.fillStyle = w.attuned ? "#7cc8ff" : "#9aa0a8"; g.fill();
      g.lineWidth = 1.5; g.strokeStyle = "#0b1a2e"; g.stroke();
    }
    // your bounties: where to go next
    g.font = `${scale >= 1 ? 16 : 13}px serif`;
    for (const b of bounties) {
      const m = b.mine;
      if (!m) continue;
      const at = m.progress >= m.target ? boardPoint(b.town)
        : b.data.kind === "explore" || b.data.kind === "wanted" ? b.data
        : b.data.kind === "delivery" ? boardPoint(b.data.toTown) : null;
      if (!at) continue;
      const icon = m.progress >= m.target ? "💰" : b.data.kind === "delivery" ? "📦" : "📜";
      g.fillText(icon, sx(at.x), sy(at.y) - 8);
    }
    // the quest star (pulsing) and you
    const t = performance.now() / 1000;
    if (guide) { g.font = `${16 + Math.sin(t * 4) * 3}px serif`; g.fillText("⭐", sx(guide.x), sy(guide.y) - 10); }
    if (me) {
      const x = sx(me.x), y = sy(me.y);
      g.fillStyle = "rgba(255,90,80,0.3)"; g.beginPath(); g.arc(x, y, 9 + Math.sin(t * 3) * 2, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(x, y + 1); g.lineTo(x - 6, y - 10); g.arc(x, y - 12, 6, Math.PI * 0.85, Math.PI * 0.15); g.closePath();
      g.fillStyle = "#e8483c"; g.fill(); g.lineWidth = 1.5; g.strokeStyle = "#3a0e0a"; g.stroke();
      g.fillStyle = "#fff"; g.beginPath(); g.arc(x, y - 12, 2.2, 0, Math.PI * 2); g.fill();
    }
  }, [markers, isSeen, seenAt, hover, guide, me, bounties]);

  // Redraw every frame while open (the star and your pin pulse).
  useEffect(() => {
    let raf = 0;
    const loop = () => { draw(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw]);

  // ── Input ──────────────────────────────────────────────────────────────
  const toWorld = (clientX: number, clientY: number) => {
    const r = wrap.current!.getBoundingClientRect();
    const { x, y, scale } = cam.current;
    return { x: x + ((clientX - r.left - r.width / 2) / scale) * 16, y: y + ((clientY - r.top - r.height / 2) / scale) * 16 };
  };
  const stoneAt = (clientX: number, clientY: number): MapWaystone | null => {
    if (!markers) return null;
    const r = wrap.current!.getBoundingClientRect();
    const { x, y, scale } = cam.current;
    for (const w of markers.waystones) {
      if (!w.attuned && !seenAt(w.x, w.y)) continue;
      const px = ((w.x - x) / 16) * scale + r.width / 2 + r.left, py = ((w.y - y) / 16) * scale + r.height / 2 + r.top - 8;
      if (Math.hypot(px - clientX, py - clientY) <= 12) return w;
    }
    return null;
  };
  const zoomAt = (factor: number, clientX?: number, clientY?: number) => {
    const c = cam.current;
    const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, c.scale * factor));
    if (clientX !== undefined && clientY !== undefined) {
      // keep the point under the cursor in place
      const before = toWorld(clientX, clientY);
      c.scale = next;
      const after = toWorld(clientX, clientY);
      c.x += before.x - after.x; c.y += before.y - after.y;
    } else c.scale = next;
  };
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.25 : 0.8, e.clientX, e.clientY); };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const travel = async (w: MapWaystone) => {
    if (busy) return;
    setBusy(true);
    const r = await fetch("/api/waystones", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "travel", key: w.key }) }).then((r) => r.json()).catch(() => ({ error: "Network error" }));
    setBusy(false);
    setPick(null);
    if (r.error) { onMessage(r.error, "bad"); return; }
    if (r.message) onMessage(r.message, "good");
    if (r.teleport) { bus.emit("teleport", r.teleport); bus.emit("refreshMe", undefined); }
    onClose();
  };

  const cost = travelCost(atStone);
  return (
    <div className="pointer-events-auto absolute inset-2 top-14 z-40 flex flex-col pixel-panel p-2 shadow-2xl sm:inset-6 sm:top-16">
      <div className="mb-1 flex items-center gap-2 text-amber-900">
        <span className="text-base font-bold">🗺️ The world{travelMode ? " · choose a waystone" : ""}</span>
        <span className="hidden text-[11px] text-stone-600 sm:inline">Drag to pan · scroll to zoom · click a blue ◆ to travel ({cost ? `${cost} 🪙` : "free from a waystone"})</span>
        <span className="flex-1" />
        <button className="pixel-btn bg-amber-100 px-2 text-sm" onClick={() => zoomAt(1.5)} aria-label="Zoom in">＋</button>
        <button className="pixel-btn bg-amber-100 px-2 text-sm" onClick={() => zoomAt(1 / 1.5)} aria-label="Zoom out">－</button>
        <button className="pixel-btn bg-amber-100 px-2 text-sm" onClick={() => { if (me) { cam.current.x = me.x; cam.current.y = me.y; } }} aria-label="Centre on me">⌖</button>
        <button className="px-2 text-stone-400 hover:text-stone-700" onClick={onClose} aria-label="Close map">✕</button>
      </div>
      <div
        ref={wrap}
        className="relative min-h-0 flex-1 cursor-grab touch-none overflow-hidden rounded border-2 border-amber-900/40 active:cursor-grabbing"
        onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, moved: false }; }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) {
            const dx = e.clientX - d.x, dy = e.clientY - d.y;
            if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
            cam.current.x -= (dx / cam.current.scale) * 16; cam.current.y -= (dy / cam.current.scale) * 16;
            d.x = e.clientX; d.y = e.clientY;
          } else setHover(stoneAt(e.clientX, e.clientY));
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved) { const w = stoneAt(e.clientX, e.clientY); if (w?.attuned) setPick(w); }
        }}
      >
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" style={{ imageRendering: "pixelated" }} />
        {!markers && <div className="absolute inset-0 flex items-center justify-center text-amber-100">Unrolling the map…</div>}
        {hover && !pick && <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/70 px-2 py-1 text-xs text-white">◆ {hover.name}{hover.attuned ? ` · travel ${cost ? `${cost} 🪙` : "free"}` : " · not attuned yet"}</div>}
        {pick && (
          <div className="absolute inset-x-0 bottom-3 mx-auto w-[min(92%,340px)] pixel-panel p-3 text-center text-sm text-amber-950">
            <div className="mb-2 font-bold">Travel to the {pick.name}?</div>
            <div className="mb-2 text-xs">{cost ? `${cost} 🪙 — it's free when you set out from a waystone.` : "Free: you're standing at a waystone."}</div>
            <div className="flex justify-center gap-2">
              <button disabled={busy} className="pixel-btn bg-sky-300 px-3 py-1 font-bold disabled:opacity-50" onClick={() => void travel(pick)}>🌀 Travel</button>
              <button className="pixel-btn bg-amber-100 px-3 py-1" onClick={() => setPick(null)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
