// Drawing Fishing Derby (the game: src/lib/derby/sim.ts) on a 2D canvas, from
// above: the bank, the pond, lily pads and reeds, the fish's shadows (the
// trophy glows), the dock and the angler, the line and the bobber, and the
// tension bar while a fish is on. The hour and the weather tint it. Drawn in
// code, no sheet. Only for show (it may use angles); it never feeds back.

import { DERBY_FISH, DOCK, FIELD_H, FIELD_W, FLIGHT_TICKS, TIP } from "@/lib/derby/rules";
import type { DerbyCourse, DerbyFx, DerbyPose, DerbyState } from "@/types/derby";

export const VIEW_W = FIELD_W;
export const VIEW_H = FIELD_H;

const SKY = {
  day: { bank: "#7cb850", bankDark: "#5a9a3c", water: "#3d86c0", deep: "#2a6a9e", tint: null },
  dusk: { bank: "#8aa848", bankDark: "#6a8a38", water: "#4a7aa8", deep: "#355e88", tint: "rgba(255,140,60,0.16)" },
  night: { bank: "#3a5a3a", bankDark: "#2a442c", water: "#1e3e62", deep: "#152e4c", tint: "rgba(10,20,60,0.35)" },
} as const;

/** A fish's shadow length for its weight. */
export const fishLen = (grams: number): number => 8 + Math.sqrt(grams) / 3.2;

function pond(ctx: CanvasRenderingContext2D, course: DerbyCourse, now: number): void {
  const sky = SKY[course.time];
  ctx.fillStyle = sky.bank;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // Tufts on the bank (fixed by position, so they don't flicker).
  ctx.fillStyle = sky.bankDark;
  for (let y = 4; y < VIEW_H; y += 13) for (let x = (y * 7) % 11; x < VIEW_W; x += 17) ctx.fillRect(x, y, 2, 3);
  // The shore (a muddy rim), then the water, then a deeper middle.
  for (const [grow, color] of [[5, "#8a7048"], [0, sky.water], [-26, sky.deep]] as const) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const p of course.pond) if (p.r + grow > 0) { ctx.moveTo(p.x + p.r + grow, p.y); ctx.arc(p.x, p.y, p.r + grow, 0, Math.PI * 2); }
    ctx.fill();
  }
  // Glints drifting on the water.
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  for (let i = 0; i < 18; i++) {
    const p = course.pond[i % course.pond.length];
    const a = i * 2.39996 + now / 9000, r = (p.r - 12) * (0.25 + ((i * 37) % 70) / 100);
    ctx.fillRect(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r * 0.9, 6, 1);
  }
}

function plants(ctx: CanvasRenderingContext2D, course: DerbyCourse, now: number): void {
  for (const p of course.pads) {
    ctx.fillStyle = "#3c8a46";
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.arc(p.x, p.y, p.r, 0.3, Math.PI * 2 - 0.3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#56a850"; ctx.fillRect(p.x - p.r / 2, p.y - 1, p.r / 2, 1);
  }
  for (const r of course.reeds) {
    ctx.fillStyle = "rgba(60,110,50,0.35)";
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 22; i++) {
      const a = i * 2.39996, d = r.r * Math.sqrt(((i * 53) % 100) / 100);
      const x = r.x + Math.cos(a) * d, y = r.y + Math.sin(a) * d, sway = Math.sin(now / 700 + i) * 1.2;
      ctx.strokeStyle = i % 3 ? "#5a8a3a" : "#7aa850"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.lineTo(x + sway, y - 7); ctx.stroke();
      if (i % 5 === 0) { ctx.fillStyle = "#6a4a2a"; ctx.fillRect(x + sway - 1, y - 10, 2, 4); }
    }
  }
}

function fishShadows(ctx: CanvasRenderingContext2D, course: DerbyCourse, st: DerbyState, prev: Map<number, DerbyPose> | null, alpha: number, now: number): void {
  const trophy = course.fish.length - 1;
  st.fish.forEach((f, i) => {
    if (f.status === "hidden" || f.status === "caught" || f.status === "lost" || f.status === "gone") return;
    const p = prev?.get(i), x = p ? p.x + (f.x - p.x) * alpha : f.x, y = p ? p.y + (f.y - p.y) * alpha : f.y;
    const cf = course.fish[i], def = DERBY_FISH[cf.key], len = fishLen(cf.grams), w = len * 0.36;
    const wag = Math.sin(now / (f.status === "hooked" ? 70 : 180) + i) * 0.25;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(f.s, f.c));
    if (i === trophy) {
      ctx.fillStyle = `rgba(255,220,120,${0.25 + 0.15 * Math.sin(now / 250)})`;
      ctx.beginPath(); ctx.ellipse(0, 0, len * 0.9, w * 2, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = course.time === "night" && i !== trophy ? 0.55 : 0.8;
    ctx.fillStyle = def.color;
    ctx.beginPath(); ctx.ellipse(0, 0, len / 2, w / 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-len / 2 + 1, 0); ctx.lineTo(-len / 2 - w * 0.9, -w * 0.6 + wag * w); ctx.lineTo(-len / 2 - w * 0.9, w * 0.6 + wag * w); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  });
}

/** The angler at the end of the dock, the rod, the line, the bobber in flight or afloat. */
function dockAndLine(ctx: CanvasRenderingContext2D, course: DerbyCourse, st: DerbyState, prev: Map<number, DerbyPose> | null, alpha: number, now: number): void {
  ctx.fillStyle = "#946036"; ctx.fillRect(DOCK.x, DOCK.y, DOCK.w, DOCK.h);
  ctx.fillStyle = "#6e4426";
  for (let y = DOCK.y + 5; y < DOCK.y + DOCK.h; y += 6) ctx.fillRect(DOCK.x, y, DOCK.w, 1);
  ctx.fillRect(DOCK.x - 2, DOCK.y + 2, 3, 6); ctx.fillRect(DOCK.x + DOCK.w - 1, DOCK.y + 2, 3, 6);
  // The angler, from above: hat, shoulders.
  const ax = TIP.x, ay = DOCK.y + 16;
  ctx.fillStyle = "#3c6aa8"; ctx.beginPath(); ctx.ellipse(ax, ay + 4, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#d8b45a"; ctx.beginPath(); ctx.arc(ax, ay, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#b8903a"; ctx.beginPath(); ctx.arc(ax, ay, 3, 0, Math.PI * 2); ctx.fill();

  // Where the line goes.
  let ex: number = TIP.x, ey: number = TIP.y, lift = 0, show = false;
  if (st.phase === "flight") {
    const k = Math.min(1, (st.tick - st.phaseAt + alpha) / FLIGHT_TICKS);
    ex = TIP.x + (st.bx - TIP.x) * k; ey = TIP.y + (st.by - TIP.y) * k; lift = 40 * k * (1 - k) * 4 * 0.5; show = true;
  } else if (st.phase === "waiting" || st.phase === "bite") { ex = st.bx; ey = st.by; show = true; }
  else if (st.phase === "reel" && st.target >= 0) {
    const f = st.fish[st.target], p = prev?.get(st.target);
    ex = p ? p.x + (f.x - p.x) * alpha : f.x; ey = p ? p.y + (f.y - p.y) * alpha : f.y; show = true;
  }
  // The rod points at the line.
  const rdx = ex - ax, rdy = ey - ay, rl = Math.hypot(rdx, rdy) || 1;
  const rx = ax + (rdx / rl) * 22, ry = ay + (rdy / rl) * 22;
  ctx.strokeStyle = "#4a2c18"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(ax + 4, ay); ctx.lineTo(rx, ry); ctx.stroke();
  if (!show) return;
  const tight = st.phase === "reel" ? st.tension : 0.1;
  ctx.strokeStyle = tight > 0.8 ? "rgba(255,120,110,0.95)" : "rgba(255,255,255,0.75)"; ctx.lineWidth = 1;
  const mx = (rx + ex) / 2, my = (ry + ey) / 2 + (1 - Math.min(1, tight)) * 10 - lift;
  ctx.beginPath(); ctx.moveTo(rx, ry); ctx.quadraticCurveTo(mx, my, ex, ey - lift); ctx.stroke();

  if (st.phase === "reel") {
    // Splashes while it runs.
    if (st.running) {
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      for (let i = 0; i < 3; i++) { const r = ((now / 4 + i * 40) % 120) / 10; ctx.beginPath(); ctx.arc(ex, ey, 4 + r, 0, Math.PI * 2); ctx.stroke(); }
    }
    return;
  }
  // The bobber: bobs, dips on a nibble, goes under on the bite.
  const nibbling = st.phase === "waiting" && st.target >= 0 && st.fish[st.target].biteAt >= 0;
  const dip = st.phase === "bite" ? 3 : nibbling ? Math.max(0, Math.sin(now / 60)) * 1.5 : Math.sin(now / 400) * 0.6;
  const by = ey - lift + dip;
  if (st.phase !== "flight") {
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.beginPath(); ctx.ellipse(ex, ey + 1, 6 + (st.phase === "bite" ? 3 : 0), 3, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = "#f4f4f4"; ctx.fillRect(ex - 2, by - 1, 4, 3);
  if (st.phase !== "bite") { ctx.fillStyle = "#e84858"; ctx.fillRect(ex - 2, by - 4, 4, 3); }
  if (st.phase === "bite") {
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#2a1e18"; ctx.lineWidth = 2;
    ctx.font = "bold 16px sans-serif"; ctx.textAlign = "center";
    ctx.strokeText("!", ex, ey - 10); ctx.fillText("!", ex, ey - 10);
  }
}

/** The tension bar while a fish is on. */
function tensionBar(ctx: CanvasRenderingContext2D, st: DerbyState): void {
  if (st.phase !== "reel") return;
  const x = 14, y = 120, h = 180, w = 12, t = Math.min(1, st.tension);
  ctx.fillStyle = "rgba(20,14,10,0.6)"; ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
  ctx.fillStyle = "rgba(232,72,88,0.35)"; ctx.fillRect(x, y, w, h * 0.2);
  ctx.fillStyle = "rgba(240,200,80,0.25)"; ctx.fillRect(x, y + h * 0.94, w, h * 0.06);
  ctx.fillStyle = t > 0.8 ? "#e84858" : t > 0.55 ? "#f0c040" : "#72b866";
  ctx.fillRect(x, y + h * (1 - t), w, h * t);
  ctx.fillStyle = "#fff6d0"; ctx.font = "bold 8px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("LINE", x + w / 2, y + h + 12);
}

/** Rain on the water, and the hour's tint. */
function weather(ctx: CanvasRenderingContext2D, course: DerbyCourse, now: number): void {
  const tint = SKY[course.time].tint;
  if (tint) { ctx.fillStyle = tint; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
  if (course.weather !== "rain") return;
  ctx.strokeStyle = "rgba(200,220,255,0.35)"; ctx.lineWidth = 1;
  for (let i = 0; i < 70; i++) {
    const x = (i * 97 + now / 6) % (VIEW_W + 40) - 20, y = (i * 61 + now / 2.2) % (VIEW_H + 20) - 10;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 8); ctx.stroke();
  }
}

/** One frame. */
export function drawDerby(ctx: CanvasRenderingContext2D, course: DerbyCourse, st: DerbyState, prev: Map<number, DerbyPose> | null, alpha: number, now: number): void {
  pond(ctx, course, now);
  fishShadows(ctx, course, st, prev, alpha, now);
  plants(ctx, course, now);
  dockAndLine(ctx, course, st, prev, alpha, now);
  weather(ctx, course, now);
  tensionBar(ctx, st);
}

/** Little words where things happen ("snap!", "+1.2 kg"), drawn over everything for a moment. */
export function drawFx(ctx: CanvasRenderingContext2D, fx: readonly DerbyFx[], now: number): void {
  ctx.textAlign = "center";
  ctx.font = "bold 11px sans-serif";
  for (const f of fx) {
    const age = (now - f.at) / 1400;
    if (age > 1) continue;
    ctx.globalAlpha = 1 - age;
    ctx.strokeStyle = "rgba(20,14,10,0.8)"; ctx.lineWidth = 3;
    ctx.strokeText(f.text, f.x, f.y - 14 - age * 18);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y - 14 - age * 18);
  }
  ctx.globalAlpha = 1;
}
