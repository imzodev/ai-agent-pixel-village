// Drawing Marigold's Oven (the game: src/lib/oven/sim.ts) on a 2D canvas, the
// bakery seen front-on: the customers' tickets along the top (what they want,
// what they've had, how long they'll wait), three brick ovens with what's in
// them and how done it is (dough → golden → burnt, the perfect middle marked),
// the shelf, and the three dough bins. Drawn in code, no sheet. Only for show;
// it never feeds back. Also says what a tap at (x, y) is on.

import { OVENS, OVEN_GOODS, HOT_HEAT } from "@/lib/oven/rules";
import { doughsOf } from "@/lib/oven/course";
import { bakeOf } from "@/lib/oven/sim";
import type { OvenCourse, OvenFx, OvenGoodKey, OvenState } from "@/types/oven";

export const VIEW_W = 300;
export const VIEW_H = 420;

/** Where things are. */
const TICKET = { y: 8, h: 92, w: 68, gap: 6 };
const OVEN = { y: 128, w: 88, h: 150, gap: 8 };
const BIN = { y: 324, w: 88, h: 84 };
const colX = (i: number) => 8 + i * (OVEN.w + OVEN.gap);

/** What a tap at (x, y) lands on. */
export function hitTest(x: number, y: number): { kind: "oven" | "bin"; i: number } | null {
  for (let i = 0; i < OVENS; i++) {
    const x0 = colX(i);
    if (x < x0 || x > x0 + OVEN.w) continue;
    if (y >= OVEN.y && y <= OVEN.y + OVEN.h) return { kind: "oven", i };
    if (y >= BIN.y && y <= BIN.y + BIN.h) return { kind: "bin", i };
  }
  return null;
}

/** The middle of an oven (for words that float up from it). */
export const ovenCentre = (i: number) => ({ x: colX(i) + OVEN.w / 2, y: OVEN.y + 60 });
/** The middle of a customer's ticket, by its place in the row. */
export const ticketCentre = (slot: number) => ({ x: 8 + slot * (TICKET.w + TICKET.gap) + TICKET.w / 2, y: TICKET.y + 40 });

function good(ctx: CanvasRenderingContext2D, key: OvenGoodKey, x: number, y: number, size: number): void {
  ctx.font = `${size}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(OVEN_GOODS[key].icon, x, y);
  // Pies share an icon: a dab of filling says which.
  if (key.endsWith("_pie")) {
    ctx.fillStyle = OVEN_GOODS[key].fill;
    ctx.beginPath(); ctx.arc(x + size * 0.32, y - size * 0.32, size * 0.16, 0, Math.PI * 2); ctx.fill();
  }
  ctx.textBaseline = "alphabetic";
}

/** The customers waiting, oldest first (up to four), and how many more are coming. Returns their ticket indices in order. */
function tickets(ctx: CanvasRenderingContext2D, course: OvenCourse, st: OvenState): number[] {
  const open = st.tickets.map((t, i) => (t.status === "open" ? i : -1)).filter((i) => i >= 0).slice(0, 4);
  open.forEach((i, slot) => {
    const c = course.tickets[i], t = st.tickets[i];
    const x = 8 + slot * (TICKET.w + TICKET.gap), y = TICKET.y;
    const left = Math.max(0, c.at + c.patience - st.tick) / c.patience;
    ctx.fillStyle = c.rush ? "#fff0f4" : "#fffaec";
    ctx.fillRect(x, y, TICKET.w, TICKET.h);
    ctx.strokeStyle = "#8a6a48"; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, TICKET.w - 1, TICKET.h - 1);
    ctx.fillStyle = "#6a4a2a"; ctx.font = "bold 8px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(c.rush ? "WEDDING!" : `ORDER ${i + 1}`, x + TICKET.w / 2, y + 10);
    c.items.forEach((g, j) => {
      const cols = c.items.length > 3 ? 3 : c.items.length;
      const gx = x + (TICKET.w / (cols + 1)) * ((j % 3) + 1), gy = y + 30 + Math.floor(j / 3) * 24;
      ctx.globalAlpha = t.got[j] ? 0.35 : 1;
      good(ctx, g, gx, gy, 18);
      ctx.globalAlpha = 1;
      if (t.got[j]) { ctx.fillStyle = "#2a8a3a"; ctx.font = "bold 14px sans-serif"; ctx.fillText("✓", gx + 7, gy + 6); }
    });
    // Patience: green, then amber, then red.
    ctx.fillStyle = "#e6dcc8"; ctx.fillRect(x + 6, y + TICKET.h - 12, TICKET.w - 12, 6);
    ctx.fillStyle = left > 0.5 ? "#72b866" : left > 0.25 ? "#f0c040" : "#e84858";
    ctx.fillRect(x + 6, y + TICKET.h - 12, (TICKET.w - 12) * left, 6);
  });
  const coming = st.tickets.filter((t) => t.status === "coming").length;
  const queued = st.tickets.filter((t) => t.status === "open").length - open.length;
  if (coming || queued) {
    ctx.fillStyle = "#fff6d0"; ctx.font = "bold 8px sans-serif"; ctx.textAlign = "right";
    ctx.fillText(`${queued ? `+${queued} waiting · ` : ""}${coming} to come`, VIEW_W - 8, TICKET.y + TICKET.h + 12);
  }
  return open;
}

function oven(ctx: CanvasRenderingContext2D, course: OvenCourse, st: OvenState, i: number, alpha: number, now: number): void {
  const x = colX(i), y = OVEN.y, w = OVEN.w, h = OVEN.h, hot = course.heat[i] === HOT_HEAT;
  // Bricks.
  ctx.fillStyle = hot ? "#a84c38" : "#8a3a2c";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  for (let r = 0; r < h; r += 8) ctx.fillRect(x, y + r, w, 1);
  for (let r = 0; r < h; r += 8) for (let c = (r / 8) % 2 ? 0 : 7; c < w; c += 14) ctx.fillRect(x + c, y + r, 1, 8);
  // The mouth, glowing.
  const mx = x + 12, my = y + 22, mw = w - 24, mh = 70;
  const glow = 0.55 + 0.15 * Math.sin(now / 300 + i);
  ctx.fillStyle = "#2a1410";
  ctx.beginPath(); ctx.moveTo(mx, my + mh); ctx.lineTo(mx, my + mw / 2); ctx.arc(mx + mw / 2, my + mw / 2, mw / 2, Math.PI, 0); ctx.lineTo(mx + mw, my + mh); ctx.closePath(); ctx.fill();
  ctx.fillStyle = hot ? `rgba(255,110,40,${glow})` : `rgba(255,150,60,${glow * 0.75})`;
  ctx.fillRect(mx + 4, my + mh - 18, mw - 8, 14);
  if (hot) { ctx.fillStyle = "#ffd166"; ctx.font = "bold 9px sans-serif"; ctx.textAlign = "center"; ctx.fillText("🔥 HOT", x + w / 2, y + 12); }

  const slot = st.ovens[i];
  if (!slot) {
    ctx.fillStyle = "rgba(255,246,208,0.55)"; ctx.font = "bold 9px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("empty", x + w / 2, my + 40);
  } else {
    const b = bakeOf(course, i, slot.item, slot.at, st.tick + alpha);
    const p = b.e / b.burnt;
    // The bake darkens as it goes, and smokes once burnt.
    good(ctx, slot.item, x + w / 2, my + 44, 30);
    if (p > 0) {
      const tint = b.e < b.golden ? 0 : b.e < b.burnt ? 0.15 : Math.min(0.75, 0.3 + (b.e - b.burnt) / b.burnt);
      ctx.fillStyle = `rgba(40,20,10,${tint})`;
      ctx.beginPath(); ctx.arc(x + w / 2, my + 44, 17, 0, Math.PI * 2); ctx.fill();
    }
    if (b.e >= b.burnt) {
      ctx.fillStyle = "rgba(90,90,90,0.5)";
      for (let k = 0; k < 4; k++) { const t = ((now / 900 + k / 4) % 1); ctx.beginPath(); ctx.arc(x + w / 2 + Math.sin(k * 2 + now / 400) * 8, y + 20 - t * 30, 5 + t * 8, 0, Math.PI * 2); ctx.fill(); }
    }
    // The bar: dough, golden (perfect middle brighter), burnt; a marker for now.
    const bx = x + 8, by = y + h - 30, bw = w - 16, bh = 10;
    const at = (e: number) => bx + bw * Math.min(1, e / (b.burnt * 1.25));
    ctx.fillStyle = "#e8dcc0"; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = "#e8a84a"; ctx.fillRect(at(b.golden), by, at(b.burnt) - at(b.golden), bh);
    ctx.fillStyle = "#ffd166"; ctx.fillRect(at(b.perfectFrom), by, at(b.perfectTo) - at(b.perfectFrom), bh);
    ctx.fillStyle = "#3a2418"; ctx.fillRect(at(b.burnt), by, bx + bw - at(b.burnt), bh);
    ctx.fillStyle = "#fff"; ctx.fillRect(at(b.e) - 1, by - 3, 2, bh + 6);
    ctx.fillStyle = "#fff6d0"; ctx.font = "bold 8px sans-serif"; ctx.textAlign = "center";
    const word = b.e < b.golden ? "baking…" : b.e >= b.burnt ? "BURNT" : b.e >= b.perfectFrom && b.e <= b.perfectTo ? "PERFECT — take it!" : "golden";
    ctx.fillText(word, x + w / 2, by + bh + 11);
  }
}

function bins(ctx: CanvasRenderingContext2D, course: OvenCourse, picked: number | null): void {
  doughsOf(course).forEach((g, i) => {
    const x = colX(i), y = BIN.y, on = picked === i;
    ctx.fillStyle = on ? "#fff0b0" : "#d8b888";
    ctx.fillRect(x, y, BIN.w, BIN.h);
    ctx.strokeStyle = on ? "#e8a020" : "#8a6a48"; ctx.lineWidth = on ? 3 : 1;
    ctx.strokeRect(x + 1, y + 1, BIN.w - 2, BIN.h - 2);
    good(ctx, g, x + BIN.w / 2, y + 34, 30);
    ctx.fillStyle = "#4a2c18"; ctx.font = "bold 9px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(OVEN_GOODS[g].name, x + BIN.w / 2, y + 66);
    ctx.fillStyle = "rgba(74,44,24,0.6)"; ctx.font = "8px sans-serif";
    ctx.fillText(`key ${i + 1}`, x + BIN.w / 2, y + 77);
  });
}

function shelf(ctx: CanvasRenderingContext2D, course: OvenCourse, st: OvenState): void {
  const y = OVEN.y + OVEN.h + 10;
  ctx.fillStyle = "#6e4426"; ctx.fillRect(8, y + 18, VIEW_W - 16, 4);
  ctx.fillStyle = "#fff6d0"; ctx.font = "bold 8px sans-serif"; ctx.textAlign = "left";
  ctx.fillText("SHELF", 10, y + 8);
  let x = 50;
  for (const g of doughsOf(course)) for (let k = 0; k < st.shelf[g].length && x < VIEW_W - 12; k++, x += 18) good(ctx, g, x, y + 8, 14);
}

/** One frame. `picked` is the dough bin chosen, if any. */
export function drawOven(ctx: CanvasRenderingContext2D, course: OvenCourse, st: OvenState, alpha: number, picked: number | null, now: number): number[] {
  ctx.fillStyle = "#3a2a22"; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = "#4a3428"; for (let x = 0; x < VIEW_W; x += 20) ctx.fillRect(x, 0, 1, VIEW_H);
  ctx.fillStyle = "#5a4030"; ctx.fillRect(0, OVEN.y - 14, VIEW_W, 6); // the counter's edge
  const order = tickets(ctx, course, st);
  for (let i = 0; i < OVENS; i++) oven(ctx, course, st, i, alpha, now);
  shelf(ctx, course, st);
  bins(ctx, course, picked);
  return order;
}

/** Little words where things happen ("perfect!", "+42"), drawn over everything for a moment. */
export function drawFx(ctx: CanvasRenderingContext2D, fx: readonly OvenFx[], now: number): void {
  ctx.textAlign = "center";
  ctx.font = "bold 12px sans-serif";
  for (const f of fx) {
    const age = (now - f.at) / 1200;
    if (age > 1) continue;
    ctx.globalAlpha = 1 - age;
    ctx.strokeStyle = "rgba(20,14,10,0.85)"; ctx.lineWidth = 3;
    ctx.strokeText(f.text, f.x, f.y - age * 22);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y - age * 22);
  }
  ctx.globalAlpha = 1;
}
