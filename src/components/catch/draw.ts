// Fenwick's Orchard Catch drawn on a canvas, side-on: the sky and the orchard
// grass, the three trees (they rustle before Fenwick's fruit drops), Fenwick
// by the tree he's shaking, the falling fruit and wasps with their shadows,
// the basket with what's in it, and Fenwick's press at the left. The view is
// the field itself (1 unit = 1 px of the game). Drawing only: nothing here
// feeds back into the run.

import { BASKET_CAP, BASKET_HALF, FIELD_W, FRUIT, GROUND_Y, PRESS_X, RIM_Y, SHAKE_TICKS, SUB } from "@/lib/catch/rules";
import { windAt } from "@/lib/catch/course";
import type { CatchCourse, CatchFruitKind, CatchFx, CatchParticle, CatchState } from "@/types/catch";

export const VIEW_W = FIELD_W;
export const VIEW_H = 320;

const COLORS: Record<CatchFruitKind, string> = {
  apple: "#d23a2a", pear: "#b8c840", plum: "#6a3a8a", golden: "#ffcf3a", rotten: "#6a5030", wasp: "#f2c230",
};

function fruit(ctx: CanvasRenderingContext2D, kind: CatchFruitKind, x: number, y: number, t: number): void {
  const r = FRUIT[kind].r;
  if (kind === "wasp") {
    const flap = Math.sin(t / 30) * 3;
    ctx.fillStyle = "rgba(230,240,255,.7)";
    ctx.beginPath(); ctx.ellipse(x - 3, y - 6, 4, 6 + flap, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 3, y - 6, 4, 6 + flap, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COLORS.wasp; ctx.beginPath(); ctx.ellipse(x, y, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#1a1a1a"; ctx.fillRect(x - 3, y - 5, 2, 10); ctx.fillRect(x + 2, y - 5, 2, 10);
    ctx.beginPath(); ctx.moveTo(x + 8, y); ctx.lineTo(x + 12, y + 1); ctx.lineTo(x + 8, y + 2); ctx.fill();
    return;
  }
  if (kind === "golden") {
    const g = (Math.sin(t / 120) + 1) / 2;
    ctx.fillStyle = `rgba(255,230,120,${0.25 + g * 0.3})`;
    ctx.beginPath(); ctx.arc(x, y, r + 7, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = COLORS[kind];
  if (kind === "pear" || kind === "golden") {
    ctx.beginPath(); ctx.arc(x, y + 2, r, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y - r + 3, r * 0.6, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.3, r * 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#4a3020"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + 1, y - r - 4); ctx.stroke();
  if (kind === "rotten") {
    ctx.fillStyle = "#3a2a18";
    ctx.beginPath(); ctx.arc(x + 2, y + 1, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x - 3, y - 2, 1.5, 0, Math.PI * 2); ctx.fill();
  } else if (kind === "apple") {
    ctx.fillStyle = "#3c8a2a"; ctx.beginPath(); ctx.ellipse(x + 3, y - r - 2, 3, 1.6, -0.6, 0, Math.PI * 2); ctx.fill();
  }
}

/** Fruit hanging in a crown (offsets from the trunk). */
const RIPE: [number, number, CatchFruitKind][] = [[-44, 88, "apple"], [-24, 70, "pear"], [-8, 96, "apple"], [6, 54, "apple"], [20, 78, "plum"], [36, 98, "apple"], [46, 80, "pear"], [-30, 106, "apple"]];

function tree(ctx: CanvasRenderingContext2D, x: number, shake: number, t: number, ripe: boolean): void {
  const dx = shake > 0 ? Math.sin(t / 25) * 3 * shake : 0;
  ctx.fillStyle = "#6a4426"; ctx.fillRect(x - 7, 110, 14, GROUND_Y - 108);
  ctx.fillStyle = "#5a3820"; ctx.fillRect(x - 7, 110, 4, GROUND_Y - 108);
  const blobs: [number, number, number][] = [[-38, 84, 34], [0, 64, 42], [38, 84, 34], [-18, 100, 30], [20, 100, 30]];
  for (const [ox, oy, r] of blobs) { ctx.fillStyle = "#2f6a2a"; ctx.beginPath(); ctx.arc(x + ox + dx, oy + 2, r, 0, Math.PI * 2); ctx.fill(); }
  for (const [ox, oy, r] of blobs) { ctx.fillStyle = "#3f8a34"; ctx.beginPath(); ctx.arc(x + ox + dx, oy - 2, r - 4, 0, Math.PI * 2); ctx.fill(); }
  if (ripe) for (const [ox, oy, k] of RIPE) {
    ctx.fillStyle = COLORS[k]; ctx.beginPath(); ctx.arc(x + ox + dx, oy, 3.5, 0, Math.PI * 2); ctx.fill();
  }
}

function fenwick(ctx: CanvasRenderingContext2D, x: number, shaking: boolean, t: number): void {
  const y = GROUND_Y, arm = shaking ? Math.sin(t / 25) * 4 : 0;
  ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.beginPath(); ctx.ellipse(x, y + 2, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#4a3a2a"; ctx.fillRect(x - 8, y - 18, 7, 18); ctx.fillRect(x + 1, y - 18, 7, 18);
  ctx.fillStyle = "#7a2f3a"; ctx.beginPath(); ctx.ellipse(x, y - 30, 13, 15, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#f1c9a5"; ctx.fillRect(x + 10, y - 44 + arm, 5, 16); ctx.fillRect(x - 15, y - 38, 5, 14);
  ctx.beginPath(); ctx.arc(x, y - 52, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#e88a7a"; ctx.beginPath(); ctx.arc(x - 4, y - 50, 2.5, 0, Math.PI * 2); ctx.arc(x + 4, y - 50, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#a04a2a"; ctx.beginPath(); ctx.arc(x, y - 56, 9, Math.PI, 0); ctx.fill();
  ctx.fillStyle = "#2a1a10"; ctx.fillRect(x - 4, y - 54, 2, 2); ctx.fillRect(x + 2, y - 54, 2, 2);
}

function press(ctx: CanvasRenderingContext2D, full: boolean, t: number): void {
  const x = 8, w = PRESS_X - 14;
  ctx.fillStyle = "#5a3a22"; ctx.fillRect(x + w / 2 - 3, 176, 6, 50);
  ctx.fillStyle = "#7a4e2c"; ctx.fillRect(x - 2, 170, w + 4, 10);
  ctx.fillStyle = "#8a5a32"; ctx.fillRect(x, 226, w, GROUND_Y - 226);
  ctx.strokeStyle = "#3a2414"; ctx.lineWidth = 2;
  for (let yy = 234; yy < GROUND_Y; yy += 12) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); }
  ctx.strokeRect(x, 226, w, GROUND_Y - 226);
  ctx.fillStyle = "#c08a2a"; ctx.fillRect(x + w - 6, GROUND_Y - 10, 10, 4);
  if (full) {
    const a = (Math.sin(t / 150) + 1) / 2;
    ctx.globalAlpha = 0.6 + a * 0.4;
    ctx.fillStyle = "#fff4c0"; ctx.strokeStyle = "#3a2414"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(4, 132, 96, 26, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#3a2414"; ctx.font = "bold 12px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("◀ Tip it in!", 52, 145);
    ctx.globalAlpha = 1;
  }
}

function basket(ctx: CanvasRenderingContext2D, x: number, load: number, stunned: boolean, t: number): void {
  const w = BASKET_HALF * 2, top = RIM_Y, h = 26;
  ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.beginPath(); ctx.ellipse(x, GROUND_Y + 2, BASKET_HALF + 4, 4, 0, 0, Math.PI * 2); ctx.fill();
  // What's in it, peeking over the rim.
  for (let i = 0; i < Math.min(load, BASKET_CAP); i++) {
    const fx = x - BASKET_HALF + 7 + ((i * 11) % (w - 14)), fy = top + 2 - (i >= 5 ? 6 : 0);
    ctx.fillStyle = i % 3 === 1 ? COLORS.pear : i % 3 === 2 ? COLORS.plum : COLORS.apple;
    ctx.beginPath(); ctx.arc(fx, fy, 5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = stunned ? "#c86a4a" : "#b8843a";
  ctx.beginPath(); ctx.moveTo(x - BASKET_HALF, top); ctx.lineTo(x + BASKET_HALF, top); ctx.lineTo(x + BASKET_HALF - 5, top + h); ctx.lineTo(x - BASKET_HALF + 5, top + h); ctx.fill();
  ctx.strokeStyle = "#7a5222"; ctx.lineWidth = 1.5;
  for (let yy = top + 6; yy < top + h; yy += 6) { ctx.beginPath(); ctx.moveTo(x - BASKET_HALF + 2, yy); ctx.lineTo(x + BASKET_HALF - 2, yy); ctx.stroke(); }
  ctx.fillStyle = "#8a5a22"; ctx.fillRect(x - BASKET_HALF - 2, top - 3, w + 4, 5);
  // How full: a bar under it.
  ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(x - BASKET_HALF, top + h + 4, w, 4);
  ctx.fillStyle = load >= BASKET_CAP ? "#ff7a5a" : load >= BASKET_CAP - 2 ? "#ffd166" : "#8ad06a";
  ctx.fillRect(x - BASKET_HALF, top + h + 4, (w * Math.min(load, BASKET_CAP)) / BASKET_CAP, 4);
  if (stunned) {
    ctx.fillStyle = "#fff"; ctx.font = "bold 12px system-ui, sans-serif"; ctx.textAlign = "center";
    ctx.fillText("ow!", x + Math.sin(t / 40) * 2, top - 14);
  }
}

export type CatchView = { particles: CatchParticle[] };

export function drawCatch(ctx: CanvasRenderingContext2D, course: CatchCourse, st: CatchState, t: number, view: CatchView): void {
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, "#8fc8ee"); sky.addColorStop(1, "#d8eef6");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, VIEW_W, GROUND_Y);
  ctx.fillStyle = "#9ac87a"; ctx.beginPath(); ctx.ellipse(120, GROUND_Y, 200, 60, 0, Math.PI, 0); ctx.fill();
  ctx.beginPath(); ctx.ellipse(400, GROUND_Y, 180, 50, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = "#5b9a40"; ctx.fillRect(0, GROUND_Y, VIEW_W, VIEW_H - GROUND_Y);
  ctx.fillStyle = "#4e8a36"; for (let x = 4; x < VIEW_W; x += 11) ctx.fillRect(x, GROUND_Y + ((x * 7) % 9), 2, 3);

  // Leaves on the wind.
  const gust = windAt(course, st.tick);
  for (let i = 0; i < 6; i++) {
    const sp = gust * 0.06 + (gust === 0 ? 0.01 : 0);
    const lx = ((i * 97 + t * sp) % VIEW_W + VIEW_W) % VIEW_W, ly = 30 + ((i * 53) % 120) + Math.sin(t / 400 + i) * 6;
    ctx.fillStyle = i % 2 ? "#6aa83a" : "#c8a040"; ctx.beginPath(); ctx.ellipse(lx, ly, 4, 2, t / 300 + i, 0, Math.PI * 2); ctx.fill();
  }

  // Trees, shaking while Fenwick's at them.
  let shakeTree = -1;
  for (const s of course.shakes) if (s.at <= st.tick && st.tick < s.at + SHAKE_TICKS + 12) shakeTree = s.tree;
  let lastTree = 1;
  for (const s of course.shakes) if (s.at <= st.tick) lastTree = s.tree;
  course.trees.forEach((x, i) => tree(ctx, x, i === shakeTree ? 1 : 0, t, st.tick < course.shakes[course.shakes.length - 1]?.at + 40));
  fenwick(ctx, course.trees[lastTree] + 22, shakeTree === lastTree, t);

  press(ctx, st.load >= BASKET_CAP && !st.done, t);

  // Falling things and their shadows.
  for (const f of st.fruit) {
    if (f.state !== "fall") continue;
    const x = f.x / SUB, y = f.y / SUB, near = Math.max(0, Math.min(1, (y - 100) / (GROUND_Y - 100)));
    ctx.fillStyle = `rgba(0,0,0,${0.08 + near * 0.18})`;
    ctx.beginPath(); ctx.ellipse(x, GROUND_Y + 1, 3 + near * 5, 2, 0, 0, Math.PI * 2); ctx.fill();
  }
  basket(ctx, st.basketX / SUB, st.load, st.tick < st.stunUntil, t);
  for (const f of st.fruit) {
    if (f.state === "fall") fruit(ctx, f.kind, f.x / SUB, f.y / SUB, t);
    else if (f.state === "ground" && st.tick - f.at < 60 && f.kind !== "wasp") {
      ctx.globalAlpha = 1 - (st.tick - f.at) / 60;
      fruit(ctx, f.kind, f.x / SUB, GROUND_Y - 3, t);
      ctx.globalAlpha = 1;
    }
  }

  // Particles.
  for (let i = view.particles.length - 1; i >= 0; i--) {
    const p = view.particles[i], age = (t - p.born) / p.life;
    if (age >= 1) { view.particles.splice(i, 1); continue; }
    const dt = (t - p.born) / 16;
    ctx.globalAlpha = 1 - age;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x + p.vx * dt, p.y + p.vy * dt + 0.08 * dt * dt, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

/** A splash of juice, a puff, gold sparks (drawing only). */
export function burst(out: CatchParticle[], x: number, y: number, color: string, n: number, t: number): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, s = 0.8 + ((i * 7) % 5) * 0.3;
    out.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.2, born: t, life: 500 + ((i * 13) % 300), size: 2 + (i % 2), color });
  }
}

export function drawFx(ctx: CanvasRenderingContext2D, fx: CatchFx[], t: number): void {
  for (const f of fx) {
    const age = (t - f.at) / 1100;
    if (age > 1) continue;
    ctx.globalAlpha = 1 - age;
    ctx.font = `bold ${f.big ? 17 : 13}px system-ui, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(30,20,10,.85)";
    ctx.strokeText(f.text, f.x, f.y - age * 24);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y - age * 24);
  }
  ctx.globalAlpha = 1;
}

export const fruitColor = (k: CatchFruitKind): string => COLORS[k];
