// Drawing Whistle's field on a 2D canvas (the game: src/lib/whistle/sim.ts).
// The context is already scaled so 1 field unit = 1 pixel at scale 1. Sprites
// are the world's own sheets (ANIMAL_SPRITES): the sheep and the wolf. Drawing
// is only for show: it never feeds back into the simulation.

import { BREATH_COST, FIELD_H, FIELD_W, RING_MAX, RING_SPEED } from "@/lib/whistle/rules";
import { makeRng } from "@/lib/whistle/rng";
import type { Course, RunState, WRect, WhistleFx, WhistlePrev, WhistleSprites } from "@/types/whistle";

const SHEEP_FRAME = 128, SHEEP_K = 0.34;
const WOLF_FRAME = 48, WOLF_K = 0.8;
/** Sheet rows by facing (both sheets): up, left, down, right. */
const ROW = { up: 0, left: 1, down: 2, right: 3 } as const;

export function loadSprites(): Promise<WhistleSprites> {
  const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
  return Promise.all([load("/assets/animals/sheep.png"), load("/assets/animals/wolf.png")]).then(([sheep, wolf]) => ({ sheep, wolf }));
}

const facing = (vx: number, vy: number): keyof typeof ROW =>
  Math.abs(vx) >= Math.abs(vy) ? (vx < 0 ? "left" : "right") : vy < 0 ? "up" : "down";

/** The ground: grass with tufts and flowers placed from the course's seed (so it's the same each time). */
function ground(ctx: CanvasRenderingContext2D, course: Course): void {
  ctx.fillStyle = "#79b04a";
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  const rnd = makeRng(course.seed ^ 0x9e3779b9);
  for (let i = 0; i < 260; i++) {
    const x = Math.floor(rnd() * FIELD_W), y = Math.floor(rnd() * FIELD_H), k = rnd();
    if (k < 0.75) {
      ctx.fillStyle = k < 0.4 ? "#6a9e3f" : "#8cc25a";
      ctx.fillRect(x, y, 1, 3); ctx.fillRect(x + 2, y + 1, 1, 2);
    } else {
      ctx.fillStyle = k < 0.85 ? "#fff6d0" : k < 0.93 ? "#ffd166" : "#f4a3c0";
      ctx.fillRect(x, y, 2, 2);
    }
  }
}

function water(ctx: CanvasRenderingContext2D, r: WRect, t: number): void {
  ctx.fillStyle = "#3d7fb8";
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = "#5a9fd4";
  ctx.fillRect(r.x, r.y, r.w, 2);
  ctx.fillStyle = "#2c5f8f";
  ctx.fillRect(r.x, r.y + r.h - 2, r.w, 2);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  for (let x = r.x + 4; x < r.x + r.w - 6; x += 14) {
    const y = r.y + 6 + ((x * 7 + Math.floor(t / 400)) % Math.max(1, r.h - 12));
    ctx.fillRect(x, y, 5, 1);
  }
}

/** A fence (thin) or a hedge (thick). */
function wall(ctx: CanvasRenderingContext2D, r: WRect): void {
  if (Math.min(r.w, r.h) <= 6) {
    ctx.fillStyle = "#6b4226";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = "#a0693c";
    if (r.w >= r.h) ctx.fillRect(r.x, r.y, r.w, 1); else ctx.fillRect(r.x, r.y, 1, r.h);
    ctx.fillStyle = "#4a2c18";
    if (r.w >= r.h) for (let x = r.x; x < r.x + r.w; x += 10) ctx.fillRect(x, r.y - 2, 2, r.h + 3);
    else for (let y = r.y; y < r.y + r.h; y += 10) ctx.fillRect(r.x - 1, y, r.w + 2, 2);
    return;
  }
  ctx.fillStyle = "#3f7a2c";
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = "#2f5e21";
  ctx.fillRect(r.x, r.y + r.h - 3, r.w, 3);
  ctx.fillStyle = "#5c9b3c";
  for (let x = r.x + 2; x < r.x + r.w - 2; x += 6) ctx.fillRect(x, r.y + 1 + ((x * 3) % 4), 3, 2);
}

function den(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = "#4a3a2a";
  ctx.beginPath(); ctx.ellipse(x, y + 4, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#1e1610";
  ctx.beginPath(); ctx.ellipse(x, y + 4, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
}

/** What never moves (grass, pen, fences, hedges, dens), drawn once per course at 2× for sharpness. */
let cached: { seed: number; canvas: HTMLCanvasElement } | null = null;
function backdrop(course: Course): HTMLCanvasElement {
  if (cached?.seed === course.seed) return cached.canvas;
  const canvas = document.createElement("canvas");
  canvas.width = FIELD_W * 2; canvas.height = FIELD_H * 2;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(2, 2);
  ground(ctx, course);
  const p = course.pen;
  ctx.fillStyle = "#e3cf8f";
  ctx.fillRect(p.x, p.y, p.w, p.h);
  ctx.fillStyle = "#d4bc74";
  for (let y = p.y + 4; y < p.y + p.h; y += 8) ctx.fillRect(p.x + 2, y, p.w - 4, 1);
  for (const w of course.walls) wall(ctx, w);
  for (const d of course.dens) den(ctx, d.x, d.y);
  cached = { seed: course.seed, canvas };
  return canvas;
}

/** One frame: the course, the pen, the waves, the animals (back to front), the puffs. */
export function drawField(
  ctx: CanvasRenderingContext2D, course: Course, st: RunState, prev: WhistlePrev | null, alpha: number,
  sprites: WhistleSprites | null, fx: readonly WhistleFx[], now: number,
): void {
  ctx.drawImage(backdrop(course), 0, 0, FIELD_W, FIELD_H);
  for (const w of course.water) water(ctx, w, now);

  // Waves (drawn between ticks).
  for (const r of st.rings) {
    const radius = (st.tick - r.born + alpha) * RING_SPEED;
    if (radius > RING_MAX) continue;
    const a = 1 - radius / RING_MAX;
    ctx.strokeStyle = `rgba(255,255,255,${(0.85 * a).toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(r.x, r.y, Math.max(1, radius), 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${(0.35 * a).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(r.x, r.y, Math.max(1, radius - 6), 0, Math.PI * 2); ctx.stroke();
  }

  const bodies: { y: number; draw: () => void }[] = [];
  const lerp = (a: number, b: number) => a + (b - a) * alpha;
  st.sheep.forEach((s, i) => {
    if (s.status === "lost") return;
    const x = prev ? lerp(prev.sheep[i].x, s.x) : s.x, y = prev ? lerp(prev.sheep[i].y, s.y) : s.y;
    const speed = Math.abs(s.vx) + Math.abs(s.vy);
    bodies.push({
      y,
      draw: () => {
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        ctx.beginPath(); ctx.ellipse(x, y + 6, 7, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        if (!sprites) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); return; }
        const moving = speed > 0.12;
        const row = ROW[facing(s.vx, s.vy)] + (moving ? 0 : 4);
        const frame = moving ? Math.floor(now / 140 + i) % 4 : Math.floor(now / 500 + i * 1.7) % 4;
        ctx.drawImage(sprites.sheep, frame * SHEEP_FRAME, row * SHEEP_FRAME, SHEEP_FRAME, SHEEP_FRAME,
          x - 64 * SHEEP_K, y - 66 * SHEEP_K, SHEEP_FRAME * SHEEP_K, SHEEP_FRAME * SHEEP_K);
        if (s.panic > 26 && s.status === "free") {
          ctx.fillStyle = "#ffd166";
          ctx.fillRect(x - 1, y - 16, 2, 5); ctx.fillRect(x - 1, y - 10, 2, 2);
        }
      },
    });
  });
  st.wolves.forEach((w, i) => {
    const x = prev ? lerp(prev.wolves[i].x, w.x) : w.x, y = prev ? lerp(prev.wolves[i].y, w.y) : w.y;
    const moving = Math.abs(w.vx) + Math.abs(w.vy) > 0.15;
    bodies.push({
      y,
      draw: () => {
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ctx.beginPath(); ctx.ellipse(x, y + 7, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
        if (!sprites) { ctx.fillStyle = "#555"; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); return; }
        const row = ROW[facing(w.vx, w.vy)] + (moving ? 0 : 4);
        const frame = moving ? Math.floor(now / 80) % 6 : Math.floor(now / 250) % 4;
        ctx.drawImage(sprites.wolf, frame * WOLF_FRAME, row * WOLF_FRAME, WOLF_FRAME, WOLF_FRAME,
          x - 24 * WOLF_K, y - 34 * WOLF_K, WOLF_FRAME * WOLF_K, WOLF_FRAME * WOLF_K);
      },
    });
  });
  bodies.sort((a, b) => a.y - b.y);
  for (const b of bodies) b.draw();

  for (const f of fx) {
    const age = (now - f.at) / 600;
    if (age > 1) continue;
    ctx.globalAlpha = 1 - age;
    if (f.kind === "penned") {
      ctx.fillStyle = "#fff6d0";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("+1", f.x, f.y - 14 - age * 12);
    } else if (f.kind === "lost") {
      ctx.fillStyle = "#e5e5e5";
      for (let k = 0; k < 6; k++) ctx.fillRect(f.x + ((k * 7) % 13) - 6 + age * (k - 3) * 4, f.y - 4 - age * 10 + (k % 3) * 3, 3, 3);
    } else {
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(f.x, f.y, 4 + age * 6, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

/** Breath as whistles ready (0–3, fractional). */
export const breathWhistles = (st: RunState): number => st.breath / BREATH_COST;
