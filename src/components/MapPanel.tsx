"use client";
// The world map (M): a small slippy-map viewer over the server's map tiles
// (src/lib/worldAtlasServer.ts), with fog of war, places, your lots,
// waystones (click an attuned one to fast-travel), you, and the quest star.
// Only the tiles in view are loaded, so it works for any world size.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bus } from "@/game/bus";
import { CHUNK_TILE_H, CHUNK_TILE_W } from "@/lib/chunkCollision";
import { MAP_BOUNDS, MAP_TILE_H, MAP_TILE_W, WAYSTONE_NEAR_PX, mapTileInBounds, mapTileRect, seenChunks, travelCost } from "@/lib/worldAtlas";
import type { MapCamera, MapFog, MapMarkers, MapWaystone } from "@/types/map";
import type { BountyView } from "@/types/bounty";
import type { EncounterView } from "@/types/encounter";
import { boardPoint } from "@/lib/bounties";
import { mapMemory, tileImage } from "@/game/mapTiles";
import { MAX_TILE_ZOOM, OPEN_LEVEL, ZOOM_LEVELS, clampCamera, maxLevelFor, tileZoomFor } from "@/lib/mapZoom";

/** The fog of war as a small image (1 px per chunk over the map bounds), plus
 *  a summed table so "is any chunk of this rectangle explored?" is one lookup. */
function buildFog(seen: ReadonlySet<string>, extra: ReadonlySet<string>): MapFog {
  const b = MAP_BOUNDS, W = b.cx1 - b.cx0 + 1, H = b.cy1 - b.cy0 + 1;
  const grid = new Uint8Array(W * H);
  const mark = (k: string) => {
    const comma = k.indexOf(","), cx = Number(k.slice(0, comma)), cy = Number(k.slice(comma + 1));
    const i = cx - b.cx0, j = b.cy1 - cy;
    if (i >= 0 && j >= 0 && i < W && j < H) grid[j * W + i] = 1;
  };
  seen.forEach(mark); extra.forEach(mark);
  const sum = new Int32Array((W + 1) * (H + 1));
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) sum[(j + 1) * (W + 1) + i + 1] = grid[j * W + i] + sum[j * (W + 1) + i + 1] + sum[(j + 1) * (W + 1) + i] - sum[j * (W + 1) + i];
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(W, H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (grid[j * W + i]) continue;
    const edge = (i > 0 && grid[j * W + i - 1]) || (i < W - 1 && grid[j * W + i + 1]) || (j > 0 && grid[(j - 1) * W + i]) || (j < H - 1 && grid[(j + 1) * W + i]);
    const o = (j * W + i) * 4;
    img.data[o] = 16; img.data[o + 1] = 20; img.data[o + 2] = 32; img.data[o + 3] = edge ? 184 : 242;
  }
  ctx.putImageData(img, 0, 0);
  const seenCount = (i0: number, j0: number, i1: number, j1: number) => {
    i0 = Math.max(0, i0); j0 = Math.max(0, j0); i1 = Math.min(W - 1, i1); j1 = Math.min(H - 1, j1);
    if (i0 > i1 || j0 > j1) return 0;
    return sum[(j1 + 1) * (W + 1) + i1 + 1] - sum[j0 * (W + 1) + i1 + 1] - sum[(j1 + 1) * (W + 1) + i0] + sum[j0 * (W + 1) + i0];
  };
  return {
    canvas,
    anySeenIn: (r) => seenCount(Math.floor(r.tx / CHUNK_TILE_W) - b.cx0, b.cy1 + Math.floor(r.ty / CHUNK_TILE_H), Math.floor((r.tx + r.tw - 1) / CHUNK_TILE_W) - b.cx0, b.cy1 + Math.floor((r.ty + r.th - 1) / CHUNK_TILE_H)) > 0,
    seenAtPx: (x, y) => {
      const i = Math.floor(x / 16 / CHUNK_TILE_W) - b.cx0, j = b.cy1 + Math.floor(y / 16 / CHUNK_TILE_H);
      return i >= 0 && j >= 0 && i < W && j < H && grid[j * W + i] === 1;
    },
  };
}

const PLACE_ICON = { inn: "🍺", forge: "🔨", cave: "🕳️" } as const;
const LOT_ICON = { home: "🏡", land: "🌱", ranch: "🐔", vineyard: "🍇", workshop: "🪚" } as const;

export default function MapPanel({ me, guide, bounties = [], encounters = [], extraSeen, travelMode, onClose, onMessage }: {
  me: { x: number; y: number } | null;
  guide: { x: number; y: number } | null;
  /** Your bounties: their spots, parcels' boards, and boards to report to. */
  bounties?: readonly BountyView[];
  /** Random encounters near you (❗ while someone needs help). */
  encounters?: readonly EncounterView[];
  /** Chunks seen this session but not yet saved ("cx,cy"). */
  extraSeen: ReadonlySet<string>;
  /** Opened at a waystone: say so in the header. */
  travelMode: boolean;
  onClose: () => void;
  onMessage: (text: string, kind: "good" | "bad") => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  // What the map had last time: drawn at once, refreshed below.
  const [markers, setMarkers] = useState<MapMarkers | null>(mapMemory.markers);
  const [seen, setSeen] = useState<Set<string>>(mapMemory.seen ?? new Set());
  const cam = useRef<MapCamera>({ x: me?.x ?? 0, y: me?.y ?? 0, scale: ZOOM_LEVELS[OPEN_LEVEL] });
  /** The zoom level shown (an index into ZOOM_LEVELS), and where to keep still while easing to it. */
  const zoom = useRef<{ level: number; anchor: { sx: number; sy: number; wx: number; wy: number } | null }>({ level: OPEN_LEVEL, anchor: null });
  const [hover, setHover] = useState<MapWaystone | null>(null);
  const [pick, setPick] = useState<MapWaystone | null>(null);
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const drawingNote = useRef<HTMLDivElement>(null);

  // Markers and the fog for the whole map, fetched together.
  useEffect(() => {
    let off = false;
    const b = MAP_BOUNDS;
    void fetch("/api/map/markers").then((r) => r.json()).then((m: MapMarkers & { error?: string }) => { if (off || m.error) return; mapMemory.markers = m; setMarkers(m); }).catch(() => {});
    void fetch(`/api/map/seen?cx0=${b.cx0}&cx1=${b.cx1}&cy0=${b.cy0}&cy1=${b.cy1}`).then((r) => r.json()).then((s) => { if (off || !s.blocks) return; const set = seenChunks(s.blocks); mapMemory.seen = set; setSeen(set); }).catch(() => {});
    return () => { off = true; };
  }, []);

  // The fog as one small image (1 px per chunk), rebuilt only when what you've
  // explored changes; each frame draws it scaled over the view. Plus a summed
  // table so "is any of this tile explored?" is one lookup (tiles all under
  // fog are never asked for).
  const fog = useMemo(() => buildFog(seen, extraSeen), [seen, extraSeen]);

  const seenAt = useCallback((x: number, y: number) => fog.seenAtPx(x, y), [fog]);
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
    // Never further out than "the continent fits"; ease toward the chosen level
    // (keeping the point under the cursor still), and keep the map on screen.
    const zm = zoom.current;
    zm.level = Math.min(zm.level, maxLevelFor(W, H));
    const target = ZOOM_LEVELS[zm.level], c = cam.current;
    if (c.scale !== target) {
      const next = Math.abs(Math.log2(target / c.scale)) < 0.02 ? target : c.scale * (target / c.scale) ** 0.3;
      c.scale = next;
      if (zm.anchor) { c.x = zm.anchor.wx - ((zm.anchor.sx - W / 2) / next) * 16; c.y = zm.anchor.wy - ((zm.anchor.sy - H / 2) / next) * 16; }
      if (next === target) zm.anchor = null;
    }
    Object.assign(c, clampCamera(c, W, H));
    const { x: camX, y: camY, scale } = c;
    // world px → screen px (scale = screen px per world tile)
    const sx = (x: number) => (x / 16 - camX / 16) * scale + W / 2;
    const sy = (y: number) => (y / 16 - camY / 16) * scale + H / 2;
    const tx0 = camX / 16 - W / 2 / scale, ty0 = camY / 16 - H / 2 / scale;
    const tx1 = camX / 16 + W / 2 / scale, ty1 = camY / 16 + H / 2 / scale;

    // Where a picture isn't drawn yet: parchment with a faint grid (never
    // the fog's colour, so explored land never looks unexplored while it loads).
    g.fillStyle = "#d9c9a0";
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(120,90,50,0.18)";
    g.lineWidth = 1;
    const gridPx = Math.max(24, 128 * scale);
    for (let x = ((sx(0) % gridPx) + gridPx) % gridPx; x < W; x += gridPx) { g.beginPath(); g.moveTo(Math.round(x) + 0.5, 0); g.lineTo(Math.round(x) + 0.5, H); g.stroke(); }
    for (let y = ((sy(0) % gridPx) + gridPx) % gridPx; y < H; y += gridPx) { g.beginPath(); g.moveTo(0, Math.round(y) + 0.5); g.lineTo(W, Math.round(y) + 0.5); g.stroke(); }

    // The level's own pictures at their real size; where one isn't there yet,
    // the next zoom out stands in under it. Tiles all under your fog aren't asked for.
    const z = tileZoomFor(target);
    const k = 2 ** z, tw = MAP_TILE_W * k, th = MAP_TILE_H * k;
    let pending = 0;
    const stoodIn = new Set<string>();
    for (let my = Math.floor(ty0 / th); my <= Math.floor(ty1 / th); my++) for (let mx = Math.floor(tx0 / tw); mx <= Math.floor(tx1 / tw); mx++) {
      if (!mapTileInBounds(z, mx, my) || !fog.anySeenIn(mapTileRect(z, mx, my))) continue;
      const img = tileImage(markers.version, z, mx, my);
      if (img.complete && img.naturalWidth) { g.drawImage(img, sx(mx * tw * 16), sy(my * th * 16), tw * scale, th * scale); continue; }
      pending++;
      const pmx = Math.floor(mx / 2), pmy = Math.floor(my / 2), pk = `${pmx},${pmy}`;
      if (z + 1 > MAX_TILE_ZOOM || stoodIn.has(pk)) continue;
      stoodIn.add(pk);
      const parent = tileImage(markers.version, z + 1, pmx, pmy);
      if (parent.complete && parent.naturalWidth) {
        // only the missing quarter, so it never covers a drawn tile
        const qx = (mx - pmx * 2) * MAP_TILE_W / 2, qy = (my - pmy * 2) * MAP_TILE_H / 2;
        g.drawImage(parent, qx, qy, MAP_TILE_W / 2, MAP_TILE_H / 2, sx(mx * tw * 16), sy(my * th * 16), tw * scale, th * scale);
        stoodIn.delete(pk);
      }
    }
    if (drawingNote.current) drawingNote.current.style.display = pending ? "block" : "none";

    // fog of war: one image scaled over the view (soft edges)
    const b = MAP_BOUNDS;
    g.imageSmoothingEnabled = true;
    g.drawImage(fog.canvas, sx(b.cx0 * CHUNK_TILE_W * 16), sy(-b.cy1 * CHUNK_TILE_H * 16), fog.canvas.width * CHUNK_TILE_W * scale, fog.canvas.height * CHUNK_TILE_H * scale);
    g.imageSmoothingEnabled = false;

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
    for (const e of encounters) if (e.state === "active") g.fillText("❗", sx(e.x), sy(e.y) - 8);
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
  }, [markers, fog, seenAt, hover, guide, me, bounties, encounters]);

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
  /** One zoom level in (−1) or out (+1), around the cursor (or the view's centre). */
  const zoomStep = (dir: -1 | 1, clientX?: number, clientY?: number) => {
    const box = wrap.current;
    if (!box) return;
    const zm = zoom.current;
    const next = Math.max(0, Math.min(maxLevelFor(box.clientWidth, box.clientHeight), zm.level + dir));
    if (next === zm.level) return;
    zm.level = next;
    const r = box.getBoundingClientRect();
    const sxp = clientX !== undefined ? clientX - r.left : r.width / 2, syp = clientY !== undefined ? clientY - r.top : r.height / 2;
    const w = toWorld(r.left + sxp, r.top + syp);
    zm.anchor = { sx: sxp, sy: syp, wx: w.x, wy: w.y };
  };
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    // one level per notch (a burst of trackpad events counts once)
    let last = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const now = performance.now();
      if (now - last < 180 || Math.abs(e.deltaY) < 4) return;
      last = now;
      zoomStep(e.deltaY < 0 ? -1 : 1, e.clientX, e.clientY);
    };
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
        <button className="pixel-btn bg-amber-100 px-2 text-sm" onClick={() => zoomStep(-1)} aria-label="Zoom in">＋</button>
        <button className="pixel-btn bg-amber-100 px-2 text-sm" onClick={() => zoomStep(1)} aria-label="Zoom out">－</button>
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
        <div ref={drawingNote} className="pointer-events-none absolute bottom-2 left-2 rounded bg-amber-50/90 px-2 py-0.5 text-[11px] text-amber-900" style={{ display: "none" }}>✏️ drawing the map…</div>
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
