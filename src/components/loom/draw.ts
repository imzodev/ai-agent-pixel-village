// Della's Loom drawn on a canvas, front-on: the loom with the day's cloth growing
// up from the breast beam, the row on the loom (lit thread by thread while Della
// shows it, woven as you tap), the shuttle, Della with what she's saying, and the
// spools to tap along the bottom, each with its own mark as well as its colour.
// Drawing only: nothing here feeds back into the run.

import { GOLD, ROWS } from "@/lib/loom/rules";
import { litAt } from "@/lib/loom/course";
import { shownBy } from "@/lib/loom/sim";
import type { LoomCourse, LoomFx, LoomRow, LoomState } from "@/types/loom";

export const VIEW_W = 480;
export const VIEW_H = 320;

/** Cream, madder, woad, weld, gold. */
export const SPOOL_COLORS = ["#efe3c8", "#b8402f", "#2f5f9e", "#cdbf32", "#d9a530"];
export const SPOOL_NAMES = ["cream", "madder", "woad", "weld", "gold"];
const SPOOL_MARKS = ["○", "✕", "△", "□", "★"];

/** The cloth: its left edge, width, the breast beam's top, a row's height, rows in view. */
const CLOTH_X = 140, CLOTH_W = 220, BEAM_Y = 214, BAND = 9, IN_VIEW = 15;
const SPOOL_Y = 270, SPOOL_R = 23;
export const READY_BOX = { x: 388, y: 168, w: 82, h: 34 };

/** Where spool c of n sits. */
export function spoolAt(c: number, n: number): { x: number; y: number } {
  const span = 320, x0 = (VIEW_W - span) / 2 + 30;
  return { x: x0 + (n === 1 ? span / 2 : (c * span) / (n - 1)), y: SPOOL_Y };
}

/** The spool under a point, or -1. */
export function spoolHit(x: number, y: number, n: number): number {
  for (let c = 0; c < n; c++) {
    const p = spoolAt(c, n);
    if ((x - p.x) * (x - p.x) + (y - p.y) * (y - p.y) <= (SPOOL_R + 8) * (SPOOL_R + 8)) return c;
  }
  return -1;
}

export const readyHit = (x: number, y: number): boolean =>
  x >= READY_BOX.x && x <= READY_BOX.x + READY_BOX.w && y >= READY_BOX.y && y <= READY_BOX.y + READY_BOX.h;

/** The middle of thread slot i of a row of len, on band b (0 = the row on the loom). */
export function slotAt(i: number, len: number, b: number): { x: number; y: number } {
  const w = CLOTH_W / len;
  return { x: CLOTH_X + w * i + w / 2, y: BEAM_Y - BAND * (b + 1) + BAND / 2 };
}

function thread(ctx: CanvasRenderingContext2D, c: number, x: number, y: number, w: number, h: number, t: number): void {
  ctx.fillStyle = SPOOL_COLORS[c];
  ctx.fillRect(x, y, w, h);
  // Weave texture: a darker pick every few pixels.
  ctx.fillStyle = "rgba(0,0,0,.12)";
  for (let xx = x + ((y / 3) % 2); xx < x + w; xx += 3) ctx.fillRect(xx, y + 1, 1, h - 2);
  if (c === GOLD) {
    const g = (Math.sin(t / 220 + x / 17) + 1) / 2;
    ctx.fillStyle = `rgba(255,248,200,${0.25 + g * 0.5})`;
    ctx.fillRect(x, y + 2, w, 2);
  }
}

function band(ctx: CanvasRenderingContext2D, threads: number[], y: number, t: number, upTo = threads.length): void {
  const w = CLOTH_W / threads.length;
  for (let i = 0; i < upTo; i++) thread(ctx, threads[i], CLOTH_X + w * i, y, Math.ceil(w), BAND, t);
}

/** The order a row's threads lie in the cloth (a "back" row is woven from the right). */
const laid = (row: LoomRow, n: number): { slot: number; c: number }[] => {
  const out: { slot: number; c: number }[] = [];
  const len = row.threads.length;
  for (let k = 0; k < n; k++) {
    const slot = row.kind === "back" ? len - 1 - k : k;
    out.push({ slot, c: row.threads[slot] });
  }
  return out;
};

function della(ctx: CanvasRenderingContext2D, say: string, t: number, cheer: boolean): void {
  const x = 62, y = 236, bob = Math.sin(t / 400) * 1.5;
  ctx.fillStyle = "rgba(0,0,0,.18)";
  ctx.beginPath(); ctx.ellipse(x, y + 4, 22, 5, 0, 0, Math.PI * 2); ctx.fill();
  // Skirt, apron, bodice, arms, head, kerchief.
  ctx.fillStyle = "#6a4a8a"; ctx.beginPath(); ctx.moveTo(x - 20, y); ctx.lineTo(x + 20, y); ctx.lineTo(x + 12, y - 44 + bob); ctx.lineTo(x - 12, y - 44 + bob); ctx.fill();
  ctx.fillStyle = "#efe3c8"; ctx.fillRect(x - 9, y - 40 + bob, 18, 36);
  ctx.fillStyle = "#8a5a9e"; ctx.fillRect(x - 12, y - 62 + bob, 24, 20);
  ctx.fillStyle = "#e8b48a";
  ctx.fillRect(x + 11, y - 60 + bob + (cheer ? -10 : 0), 6, 18);
  ctx.fillRect(x - 17, y - 60 + bob, 6, 18);
  ctx.beginPath(); ctx.arc(x, y - 74 + bob, 12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#b8402f"; ctx.beginPath(); ctx.arc(x, y - 78 + bob, 12, Math.PI, 0); ctx.fill();
  ctx.fillStyle = "#3a2a1a"; ctx.fillRect(x - 5, y - 75 + bob, 2, 2); ctx.fillRect(x + 3, y - 75 + bob, 2, 2);
  ctx.fillRect(x - 3, y - 69 + bob, 6, 1);
  if (!say) return;
  // Speech bubble.
  ctx.font = "bold 12px system-ui, sans-serif";
  const w = Math.min(124, ctx.measureText(say).width + 16), bx = 8, by = 92;
  ctx.fillStyle = "#fffaf0"; ctx.strokeStyle = "#3a2a1a"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(bx, by, w, 26, 8); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx + 40, by + 26); ctx.lineTo(bx + 52, by + 38); ctx.lineTo(bx + 54, by + 26); ctx.fill();
  ctx.fillStyle = "#3a2a1a"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText(say, bx + 8, by + 13, w - 16);
}

export type LoomView = {
  /** The spool lit by a tap (and when), for a flash. */
  tapped: { c: number; at: number } | null;
  /** Show the Ready button (playing, not a replay). */
  readyButton: boolean;
};

export function drawLoom(ctx: CanvasRenderingContext2D, course: LoomCourse, st: LoomState, t: number, view: LoomView): void {
  // The ranch's weaving room: plank wall, a window.
  ctx.fillStyle = "#7a5a3a"; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  for (let x = 0; x < VIEW_W; x += 32) { ctx.fillStyle = (x / 32) % 2 ? "#74553a" : "#80603f"; ctx.fillRect(x, 0, 31, 236); }
  ctx.fillStyle = "#cfe6f2"; ctx.fillRect(398, 22, 56, 60);
  ctx.fillStyle = "#e8f4fa"; ctx.fillRect(402, 26, 22, 24); ctx.fillRect(428, 26, 22, 24);
  ctx.strokeStyle = "#4a3422"; ctx.lineWidth = 4; ctx.strokeRect(398, 22, 56, 60);
  ctx.fillStyle = "#5e4630"; ctx.fillRect(0, 236, VIEW_W, VIEW_H - 236);

  // The loom: posts, the top beam, the warp down to the breast beam.
  ctx.fillStyle = "#5a3a22";
  ctx.fillRect(CLOTH_X - 22, 18, 12, 222); ctx.fillRect(CLOTH_X + CLOTH_W + 10, 18, 12, 222);
  ctx.fillStyle = "#7a4e2c"; ctx.fillRect(CLOTH_X - 26, 14, CLOTH_W + 52, 12);
  ctx.strokeStyle = "rgba(240,230,210,.55)"; ctx.lineWidth = 1;
  for (let i = 0; i <= 44; i++) { const x = CLOTH_X + 2 + i * ((CLOTH_W - 4) / 44); ctx.beginPath(); ctx.moveTo(x, 26); ctx.lineTo(x, BEAM_Y); ctx.stroke(); }

  // The cloth so far: the newest rows just above the beam, the older ones scrolling up.
  const onLoom = Math.min(st.row, ROWS);
  const first = Math.max(0, onLoom - (IN_VIEW - 1));
  for (let r = first; r < onLoom; r++) band(ctx, course.rows[r].threads, BEAM_Y - BAND * (onLoom - r + 1), t);
  ctx.strokeStyle = "#5b2a2a"; ctx.lineWidth = 2;
  for (const s of st.snagged) {
    const b = onLoom - s.row; // bands above the row on the loom
    if (s.row >= first && s.row < onLoom) {
      const p = slotAt(s.i, course.rows[s.row].threads.length, b);
      ctx.beginPath(); ctx.arc(p.x, p.y - 4, 4, Math.PI * 0.1, Math.PI * 0.9, true); ctx.stroke();
    }
  }

  // The row on the loom.
  const row = st.row < ROWS ? course.rows[st.row] : null;
  let say = "";
  let litSpool = -1;
  if (row && !st.done) {
    const len = row.threads.length, w = CLOTH_W / len, y = BEAM_Y - BAND;
    ctx.fillStyle = "rgba(255,255,255,.08)"; ctx.fillRect(CLOTH_X, y, CLOTH_W, BAND);
    if (st.phase === "show") {
      const n = shownBy(row, st.showAt, st.tick);
      if (n > 0) {
        const i = n - 1, since = st.tick - st.showAt - litAt(row, i);
        if (since < row.show) {
          litSpool = row.threads[i];
          thread(ctx, row.threads[i], CLOTH_X + w * i, y, Math.ceil(w), BAND, t);
          ctx.strokeStyle = "#fff8d0"; ctx.lineWidth = 2; ctx.strokeRect(CLOTH_X + w * i, y - 1, Math.ceil(w), BAND + 2);
        }
      }
      say = st.firstShow ? (row.kind === "back" ? "Watch… then back again!" : "Watch closely…") : "Once more, slowly…";
    } else {
      for (const { slot, c } of laid(row, st.at)) thread(ctx, c, CLOTH_X + w * slot, y, Math.ceil(w), BAND, t);
      // The shuttle, at the next slot.
      if (st.at < len) {
        const slot = row.kind === "back" ? len - 1 - st.at : st.at, sx = CLOTH_X + w * slot + w / 2;
        ctx.fillStyle = "#c08a4a"; ctx.beginPath(); ctx.ellipse(sx, y + BAND / 2, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#3a2a1a"; ctx.fillRect(sx - 3, y + BAND / 2 - 1, 6, 2);
      }
      say = row.kind === "back" ? "Back again: last first!" : "Your turn!";
    }
    // Which way this row goes.
    ctx.fillStyle = "#fff4d8"; ctx.font = "bold 13px system-ui, sans-serif"; ctx.textBaseline = "middle";
    ctx.textAlign = "left"; ctx.fillText(row.kind === "back" ? "◀ back" : "▶", CLOTH_X + CLOTH_W + 26, BEAM_Y - BAND / 2);
  }
  // The breast beam.
  ctx.fillStyle = "#7a4e2c"; ctx.fillRect(CLOTH_X - 26, BEAM_Y, CLOTH_W + 52, 14);
  ctx.fillStyle = "#5a3a22"; ctx.fillRect(CLOTH_X - 26, BEAM_Y + 12, CLOTH_W + 52, 3);

  if (st.done) say = st.row >= ROWS ? "The whole cloth! Lovely." : st.snags >= 3 ? "Let's untangle that…" : "That's the bell!";
  della(ctx, say, t, st.done && st.row >= ROWS);

  // Ready.
  if (view.readyButton && row && st.phase === "show" && !st.done) {
    const b = READY_BOX, can = shownBy(row, st.showAt, st.tick) >= 1;
    ctx.globalAlpha = can ? 1 : 0.45;
    ctx.fillStyle = "#3c8a46"; ctx.strokeStyle = "#1e4a24"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 9); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = "bold 13px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(st.firstShow ? "Got it!" : "Ready", b.x + b.w / 2, b.y + b.h / 2);
    ctx.globalAlpha = 1;
  }

  // The spools.
  for (let c = 0; c < course.colors; c++) {
    const p = spoolAt(c, course.colors);
    const tap = view.tapped && view.tapped.c === c && t - view.tapped.at < 160;
    const lit = litSpool === c || tap;
    if (lit) { ctx.fillStyle = "rgba(255,248,200,.55)"; ctx.beginPath(); ctx.arc(p.x, p.y, SPOOL_R + 9, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = "#4a3422"; ctx.fillRect(p.x - SPOOL_R - 4, p.y - 6, 8, 12); ctx.fillRect(p.x + SPOOL_R - 4, p.y - 6, 8, 12);
    ctx.fillStyle = SPOOL_COLORS[c]; ctx.strokeStyle = lit ? "#fff8d0" : "#2a1a10"; ctx.lineWidth = lit ? 3 : 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, SPOOL_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,.14)"; ctx.lineWidth = 1;
    for (let k = -SPOOL_R + 5; k < SPOOL_R; k += 4) { ctx.beginPath(); ctx.moveTo(p.x - SPOOL_R + 3, p.y + k); ctx.lineTo(p.x + SPOOL_R - 3, p.y + k); ctx.stroke(); }
    ctx.fillStyle = c === 0 || c === 3 || c === GOLD ? "#3a2a1a" : "#fff8ec";
    ctx.font = "bold 16px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(SPOOL_MARKS[c], p.x, p.y - 1);
    ctx.fillStyle = "#e8dcc4"; ctx.font = "10px system-ui, sans-serif";
    ctx.fillText(String(c + 1), p.x, p.y + SPOOL_R + 10);
  }
}

export function drawFx(ctx: CanvasRenderingContext2D, fx: LoomFx[], t: number): void {
  for (const f of fx) {
    const age = (t - f.at) / 1200;
    if (age > 1) continue;
    ctx.globalAlpha = 1 - age;
    ctx.font = `bold ${f.big ? 17 : 13}px system-ui, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(30,20,10,.85)";
    ctx.strokeText(f.text, f.x, f.y - age * 26);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y - age * 26);
  }
  ctx.globalAlpha = 1;
}
