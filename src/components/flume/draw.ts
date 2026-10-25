// Drawing Log Flume (the game: src/lib/flume/sim.ts) on a 2D canvas, from
// above: the Whisperwood banks, the river (streaks flowing down, whiter over
// the rapids), rocks with foam, the logs (bark and rings; oak darker, the birch
// pale gold), and the mill at the bottom with its wheel and three gates. Drawn in
// code, no sheet; only for show (it may use angles), never feeding back.

import { gatesOf, riverAt } from "@/lib/flume/course";
import { FIELD_H, FIELD_W, LOG_KINDS, MILL_Y } from "@/lib/flume/rules";
import type { FlumeCourse, FlumeFx, FlumePose, FlumeState } from "@/types/flume";

export const VIEW_W = FIELD_W;
export const VIEW_H = FIELD_H;

/** Where a log is drawn this frame (between last tick and this one). */
export function logAt(st: FlumeState, prev: Map<number, FlumePose> | null, alpha: number, i: number): FlumePose {
  const l = st.logs[i], p = prev?.get(i);
  return p ? { x: p.x + (l.x - p.x) * alpha, y: p.y + (l.y - p.y) * alpha } : { x: l.x, y: l.y };
}

/** The afloat log under a point (its body, with some slack for fingers), nearest first; -1 if none. */
export function logUnder(course: FlumeCourse, st: FlumeState, x: number, y: number): number {
  let best = -1, bestD = Infinity;
  st.logs.forEach((l, i) => {
    if (l.status !== "afloat") return;
    const k = LOG_KINDS[course.logs[i].kind];
    const py = Math.max(l.y - k.halfLen, Math.min(l.y + k.halfLen, y));
    const d = Math.hypot(x - l.x, y - py);
    if (d < k.radius + 18 && d < bestD) { best = i; bestD = d; }
  });
  return best;
}

function banksAndWater(ctx: CanvasRenderingContext2D, course: FlumeCourse, now: number): void {
  ctx.fillStyle = "#4a7a34"; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // Pines on the banks (fixed by position).
  for (let y = -10; y < MILL_Y; y += 34) for (const side of [-1, 1]) {
    const { cx, hw } = riverAt(course.river, y);
    for (let k = 0; k < 3; k++) {
      const x = side < 0 ? cx - hw - 18 - k * 26 - ((y * 7) % 11) : cx + hw + 18 + k * 26 + ((y * 5) % 11);
      if (x < -10 || x > VIEW_W + 10) continue;
      ctx.fillStyle = "#2a5a30"; ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x - 10, y + 8); ctx.lineTo(x + 10, y + 8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#1c4a28"; ctx.fillRect(x - 1, y + 8, 3, 4);
    }
  }
  // The water, bank to bank.
  const pts: { y: number; l: number; r: number }[] = [];
  for (let y = -20; y <= VIEW_H + 20; y += 10) { const { cx, hw } = riverAt(course.river, y); pts.push({ y, l: cx - hw, r: cx + hw }); }
  ctx.fillStyle = "#8a7048";
  ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.l - 4, p.y) : ctx.moveTo(p.l - 4, p.y))); [...pts].reverse().forEach((p) => ctx.lineTo(p.r + 4, p.y)); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#3a7ab0";
  ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.l, p.y) : ctx.moveTo(p.l, p.y))); [...pts].reverse().forEach((p) => ctx.lineTo(p.r, p.y)); ctx.closePath(); ctx.fill();
  // Rapids: paler water.
  for (const r of course.rapids) {
    ctx.fillStyle = "rgba(200,230,255,0.22)";
    ctx.beginPath();
    for (let y = r.y0; y <= r.y1; y += 6) { const { cx, hw } = riverAt(course.river, y); if (y === r.y0) ctx.moveTo(cx - hw, y); else ctx.lineTo(cx - hw, y); }
    for (let y = r.y1; y >= r.y0; y -= 6) { const { cx, hw } = riverAt(course.river, y); ctx.lineTo(cx + hw, y); }
    ctx.closePath(); ctx.fill();
  }
  // Streaks flowing down (faster over the rapids).
  ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1;
  for (let i = 0; i < 46; i++) {
    const lane = ((i * 37) % 100) / 100;
    const yy = ((i * 53 + now * 0.07) % (VIEW_H + 40)) - 20;
    const fast = course.rapids.some((r) => yy >= r.y0 && yy <= r.y1);
    const y = fast ? ((i * 53 + now * 0.12) % (VIEW_H + 40)) - 20 : yy;
    const { cx, hw, slope } = riverAt(course.river, y);
    const x = cx - hw + 6 + lane * (2 * hw - 12);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + slope * 10, y + (fast ? 14 : 9)); ctx.stroke();
  }
}

function rocks(ctx: CanvasRenderingContext2D, course: FlumeCourse, now: number): void {
  for (const r of course.rocks) {
    ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.2 * Math.sin(now / 200 + r.x)})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(r.x, r.y - 3, r.r + 4, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.fillStyle = "#6a6a74"; ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#8a8a92"; ctx.beginPath(); ctx.arc(r.x - r.r * 0.3, r.y - r.r * 0.3, r.r * 0.55, 0, Math.PI * 2); ctx.fill();
  }
}

function mill(ctx: CanvasRenderingContext2D, course: FlumeCourse, now: number): void {
  const { spans, posts } = gatesOf(course);
  // The mill's floor below the gates.
  ctx.fillStyle = "#6e4426"; ctx.fillRect(0, MILL_Y + 4, VIEW_W, VIEW_H - MILL_Y);
  ctx.fillStyle = "#5a3a20"; for (let x = 0; x < VIEW_W; x += 12) ctx.fillRect(x, MILL_Y + 4, 1, VIEW_H - MILL_Y);
  spans.forEach((s, g) => {
    const spill = g === course.mill.spillway;
    ctx.fillStyle = spill ? "#3a7ab0" : "#2a1a10";
    ctx.fillRect(s.x0 + 6, MILL_Y + 4, s.x1 - s.x0 - 12, VIEW_H - MILL_Y);
    ctx.font = "15px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(spill ? "💦" : "🪚", (s.x0 + s.x1) / 2, MILL_Y + 16);
    if (g === course.mill.birchSaw) { ctx.font = "10px sans-serif"; ctx.fillText("⭐", (s.x0 + s.x1) / 2 + 12, MILL_Y + 9); }
    ctx.textBaseline = "alphabetic";
  });
  for (const p of posts) { ctx.fillStyle = "#4a2c18"; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
  // The wheel, turning, beside the mill.
  const { cx, hw } = riverAt(course.river, MILL_Y);
  const wx = cx + hw + 22, wy = MILL_Y + 2, a = now / 600;
  if (wx < VIEW_W + 14) {
    ctx.strokeStyle = "#4a2c18"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(wx, wy, 16, 0, Math.PI * 2); ctx.stroke();
    for (let k = 0; k < 6; k++) { const t = a + (k * Math.PI) / 3; ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + Math.cos(t) * 16, wy + Math.sin(t) * 16); ctx.stroke(); }
  }
}

function logs(ctx: CanvasRenderingContext2D, course: FlumeCourse, st: FlumeState, prev: Map<number, FlumePose> | null, alpha: number): void {
  st.logs.forEach((l, i) => {
    if (l.status !== "afloat") return;
    const k = LOG_KINDS[course.logs[i].kind], p = logAt(st, prev, alpha, i);
    const tilt = Math.atan2(l.vx, Math.max(20, l.vy)) * 0.6;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(-tilt);
    if (st.held === i) { ctx.strokeStyle = "#fff6a0"; ctx.lineWidth = 3; ctx.strokeRect(-k.radius - 3, -k.halfLen - 3, 2 * k.radius + 6, 2 * k.halfLen + 6); }
    ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.fillRect(-k.radius + 2, -k.halfLen + 3, 2 * k.radius, 2 * k.halfLen);
    ctx.fillStyle = k.color; ctx.fillRect(-k.radius, -k.halfLen, 2 * k.radius, 2 * k.halfLen);
    // Bark lines, and the cut ends' rings.
    ctx.fillStyle = course.logs[i].kind === "birch" ? "#4a3a30" : "rgba(0,0,0,0.25)";
    for (let y = -k.halfLen + 4; y < k.halfLen - 2; y += 6) ctx.fillRect(-k.radius + 2 + ((y * 3) & 3), y, 3, 1);
    for (const end of [-1, 1]) {
      ctx.fillStyle = "#e8c890"; ctx.beginPath(); ctx.ellipse(0, end * k.halfLen, k.radius, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#a07848"; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(0, end * k.halfLen, k.radius * 0.5, 1.5, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  });
}

/** One frame. */
export function drawFlume(ctx: CanvasRenderingContext2D, course: FlumeCourse, st: FlumeState, prev: Map<number, FlumePose> | null, alpha: number, now: number): void {
  banksAndWater(ctx, course, now);
  rocks(ctx, course, now);
  logs(ctx, course, st, prev, alpha);
  mill(ctx, course, now);
}

/** Little words where things happen ("milled +20"), drawn over everything for a moment. */
export function drawFx(ctx: CanvasRenderingContext2D, fx: readonly FlumeFx[], now: number): void {
  ctx.textAlign = "center";
  ctx.font = "bold 12px sans-serif";
  for (const f of fx) {
    const age = (now - f.at) / 1200;
    if (age > 1) continue;
    ctx.globalAlpha = 1 - age;
    ctx.strokeStyle = "rgba(20,14,10,0.85)"; ctx.lineWidth = 3;
    ctx.strokeText(f.text, f.x, f.y - age * 20);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y - age * 20);
  }
  ctx.globalAlpha = 1;
}
