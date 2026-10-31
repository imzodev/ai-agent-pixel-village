// Drawing Pip's Archery Butts (the game: src/lib/archery/sim.ts) on a 2D canvas,
// the range seen side-on: Pip with the bow on the left, the butts down the
// mown grass (on posts, on a rope from a gantry, on Tobin's cart, the King's
// butt at weekends), the scarecrow with the golden apple on its hat, the
// distance pegs, the wind's pennant and the clouds it pushes. Heights are drawn
// at a bigger scale than distances so the faces read. While the string is
// drawn, the start of the arc (no wind) and the pull. Drawn in code, no sheet.
// Only for show; it never feeds back.

import { APPLE_R, ARROWS, FIELD_END, LAUNCH_X, LAUNCH_Y, MAX_DRAW, RING_BULL, RING_INNER, RING_OUTER, RUN_TICKS, WIND_MAX } from "@/lib/archery/rules";
import { appleUp, targetAt, windAt } from "@/lib/archery/course";
import { canLoose, flyStep, launch } from "@/lib/archery/sim";
import type { ArcheryArrow, ArcheryCourse, ArcheryFx, ArcheryParticle, ArcheryState, ArcheryTarget } from "@/types/archery";

export const VIEW_W = 480;
export const VIEW_H = 320;
/** Pixels a metre along the range, and up. */
const SX = 8;
const SY = 14;
const ORIGIN_X = 26;
export const GROUND_Y = 268;
/** View pixels of drag for a full pull. */
export const PULL_PX = 130;

export const toView = (x: number, y: number): { x: number; y: number } => ({ x: ORIGIN_X + x * SX, y: GROUND_Y - y * SY });

/** A drag in view pixels (pulled back from where it started) as a pull the bow can make. */
export function pullOf(fromX: number, fromY: number, toX: number, toY: number, minDy: number): { dx: number; dy: number } | null {
  const k = MAX_DRAW / PULL_PX;
  let dx = (fromX - toX) * k, dy = (toY - fromY) * k;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < MAX_DRAW * 0.08) return null;
  if (len > MAX_DRAW) { dx = (dx * MAX_DRAW) / len; dy = (dy * MAX_DRAW) / len; }
  return fitPull(Math.round(dx), Math.round(dy), minDy);
}

/** Round a pull into what validAim takes: forward, not too low, inside a full draw. */
export function fitPull(dx: number, dy: number, minDy: number): { dx: number; dy: number } {
  dx = Math.max(1, Math.min(MAX_DRAW, dx));
  dy = Math.max(minDy, Math.min(MAX_DRAW, dy));
  while (dx * dx + dy * dy > MAX_DRAW * MAX_DRAW) {
    if (dx > Math.abs(dy) && dx > 1) dx--;
    else dy += dy > 0 ? -1 : 1;
  }
  return { dx, dy };
}

const RING_COLORS = ["#2f6fb8", "#d24a3a", "#f2c230"];

function drawSky(ctx: CanvasRenderingContext2D, course: ArcheryCourse, tick: number, now: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  g.addColorStop(0, "#8fc4ec");
  g.addColorStop(1, "#d8ecf4");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, GROUND_Y);
  // Clouds drift with the wind.
  const w = windAt(course, tick);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  for (let i = 0; i < 4; i++) {
    const base = (course.seed >>> (i * 5)) % VIEW_W;
    const x = ((((base + (now / 1000) * (4 + w * 5) * (1 + i * 0.3)) % (VIEW_W + 120)) + VIEW_W + 120) % (VIEW_W + 120)) - 60;
    const y = 26 + i * 22;
    ctx.beginPath();
    ctx.ellipse(x, y, 26, 8, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 14, y - 5, 16, 8, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 12, y - 3, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Far hills and the wood's edge.
  ctx.fillStyle = "#9cc48a";
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y - 34);
  for (let x = 0; x <= VIEW_W; x += 20) ctx.lineTo(x, GROUND_Y - 34 - Math.sin(x / 70 + course.seed) * 10 - Math.sin(x / 23) * 4);
  ctx.lineTo(VIEW_W, GROUND_Y); ctx.lineTo(0, GROUND_Y);
  ctx.fill();
  ctx.fillStyle = "#5e9450";
  for (let x = 8; x < VIEW_W; x += 17) {
    const h = 14 + ((x * 7919 + course.seed) % 11);
    ctx.beginPath();
    ctx.moveTo(x - 7, GROUND_Y - 16); ctx.lineTo(x, GROUND_Y - 16 - h); ctx.lineTo(x + 7, GROUND_Y - 16);
    ctx.fill();
  }
}

function drawGround(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#6fae4e";
  ctx.fillRect(0, GROUND_Y - 16, VIEW_W, 16);
  ctx.fillStyle = "#5b9a40";
  ctx.fillRect(0, GROUND_Y, VIEW_W, VIEW_H - GROUND_Y);
  // Mown stripes.
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  for (let m = 0; m < FIELD_END; m += 10) {
    const a = toView(m, 0).x, b = toView(m + 5, 0).x;
    ctx.fillRect(a, GROUND_Y - 16, b - a, 16);
  }
  ctx.fillStyle = "#4a8434";
  ctx.fillRect(0, GROUND_Y, VIEW_W, 2);
  // Distance pegs.
  ctx.font = "bold 8px sans-serif";
  ctx.textAlign = "center";
  for (let m = 10; m <= 50; m += 10) {
    const p = toView(m, 0);
    ctx.fillStyle = "#f4ead0";
    ctx.fillRect(p.x - 1, GROUND_Y + 2, 2, 7);
    ctx.fillStyle = "rgba(30,50,20,0.75)";
    ctx.fillText(`${m}m`, p.x, GROUND_Y + 19);
  }
}

/** The wind's pennant and how strong it blows. */
function drawWind(ctx: CanvasRenderingContext2D, course: ArcheryCourse, tick: number, now: number): void {
  const w = windAt(course, tick), x = VIEW_W / 2, top = 10;
  ctx.fillStyle = "#6b4a2a";
  ctx.fillRect(x - 1, top, 2, 34);
  const len = 8 + Math.abs(w) * 7, dir = w === 0 ? 0 : w > 0 ? 1 : -1;
  const flap = Math.sin(now / 120) * (1 + Math.abs(w) * 0.6);
  ctx.fillStyle = Math.abs(w) >= 3 ? "#e0533a" : "#f0b840";
  ctx.beginPath();
  if (dir === 0) {
    ctx.moveTo(x + 1, top); ctx.lineTo(x + 4, top + 16); ctx.lineTo(x + 1, top + 12);
  } else {
    ctx.moveTo(x, top); ctx.lineTo(x + dir * len, top + 5 + flap); ctx.lineTo(x, top + 10);
  }
  ctx.fill();
  ctx.font = "bold 10px sans-serif";
  ctx.textAlign = "center";
  ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,0.8)";
  const label = w === 0 ? "calm" : `${w < 0 ? "← " : ""}wind ${Math.abs(w)}${w > 0 ? " →" : ""}`;
  ctx.strokeText(label, x, top + 46);
  ctx.fillStyle = Math.abs(w) >= WIND_MAX - 1 ? "#a8321e" : "#2a3a48";
  ctx.fillText(label, x, top + 46);
}

/** A butt's stand: legs for a post, a gantry and rope for a hoist, Tobin's cart, a banner for the King's. */
function drawStand(ctx: CanvasRenderingContext2D, t: ArcheryTarget, at: { x: number; y: number }): void {
  const p = toView(at.x, at.y), half = RING_OUTER * SY;
  ctx.fillStyle = "#7a5230";
  if (t.kind === "hoist") {
    const top = toView(t.x0, Math.max(t.y0, t.y1) + RING_OUTER + 0.8).y;
    ctx.fillRect(p.x - 10, top, 3, GROUND_Y - top);
    ctx.fillRect(p.x + 8, top, 3, GROUND_Y - top);
    ctx.fillRect(p.x - 12, top - 3, 25, 4);
    ctx.strokeStyle = "#d8c8a0"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(p.x + 0.5, top + 1); ctx.lineTo(p.x + 0.5, p.y - half); ctx.stroke();
  } else if (t.kind === "cart") {
    const bed = GROUND_Y - 10;
    ctx.fillRect(p.x - 13, bed - 3, 26, 5);
    ctx.fillRect(p.x - 1, p.y + half - 2, 3, bed - (p.y + half) + 2);
    ctx.fillStyle = "#4a3420";
    for (const dx of [-8, 8]) { ctx.beginPath(); ctx.arc(p.x + dx, bed + 4, 5, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = "#b89060";
    for (const dx of [-8, 8]) { ctx.beginPath(); ctx.arc(p.x + dx, bed + 4, 1.6, 0, Math.PI * 2); ctx.fill(); }
  } else {
    ctx.save();
    ctx.lineWidth = 3; ctx.strokeStyle = "#7a5230";
    ctx.beginPath();
    ctx.moveTo(p.x - 1, p.y); ctx.lineTo(p.x - 7, GROUND_Y);
    ctx.moveTo(p.x + 1, p.y); ctx.lineTo(p.x + 6, GROUND_Y);
    ctx.stroke();
    ctx.restore();
    if (t.kind === "king") {
      ctx.fillStyle = "#6b4a2a";
      ctx.fillRect(p.x + 12, p.y - half - 22, 2, GROUND_Y - (p.y - half - 22));
      ctx.fillStyle = "#7a2a8a";
      ctx.fillRect(p.x + 14, p.y - half - 22, 12, 9);
      ctx.fillStyle = "#f2c230";
      ctx.fillRect(p.x + 17, p.y - half - 19, 6, 2);
    }
  }
}

/** The straw boss and its painted face (seen at a slant, so an upright ellipse). */
function drawFace(ctx: CanvasRenderingContext2D, t: ArcheryTarget, at: { x: number; y: number }): void {
  const p = toView(at.x, at.y), h = RING_OUTER * SY, w = h * 0.42;
  ctx.fillStyle = "#c8a45a";
  ctx.beginPath(); ctx.ellipse(p.x + 2.5, p.y, w + 1.5, h + 1.5, 0, 0, Math.PI * 2); ctx.fill();
  const rings = [RING_OUTER, RING_INNER, RING_BULL];
  for (let i = 0; i < rings.length; i++) {
    const r = rings[i] / RING_OUTER;
    ctx.fillStyle = i === 0 ? "#f4f0e4" : RING_COLORS[i];
    ctx.beginPath(); ctx.ellipse(p.x, p.y, w * r, h * r, 0, 0, Math.PI * 2); ctx.fill();
    if (i === 0) {
      ctx.fillStyle = RING_COLORS[0];
      ctx.beginPath(); ctx.ellipse(p.x, p.y, w * r * 0.86, h * r * 0.86, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (t.kind === "king") {
    ctx.strokeStyle = "#f2c230"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, w + 1, h + 1, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = "rgba(20,30,20,0.8)";
  ctx.font = "bold 8px sans-serif"; ctx.textAlign = "center";
  ctx.fillText(`×${t.worth}`, p.x, p.y - h - 4);
}

function drawScarecrow(ctx: CanvasRenderingContext2D, course: ArcheryCourse, st: ArcheryState, tick: number, now: number): void {
  const base = toView(course.scarecrowX, 0), head = toView(course.scarecrowX, 1.7);
  ctx.fillStyle = "#6b4a2a";
  ctx.fillRect(base.x - 1.5, head.y, 3, GROUND_Y - head.y);
  ctx.fillRect(base.x - 11, head.y + 9, 22, 2.5);
  ctx.fillStyle = "#8a5a3a";
  ctx.fillRect(base.x - 7, head.y + 7, 14, 12);
  ctx.fillStyle = "#e8cf8a";
  ctx.beginPath(); ctx.arc(base.x, head.y + 1, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#c8a040";
  ctx.fillRect(base.x - 8, head.y - 4, 16, 2);
  ctx.fillRect(base.x - 4, head.y - 9, 8, 6);
  const a = course.apple, ap = toView(a.x, a.y);
  if (appleUp(course, tick) && !st.apple) {
    const r = APPLE_R * SY;
    const glow = 0.5 + 0.5 * Math.sin(now / 160);
    ctx.fillStyle = `rgba(255,220,90,${0.25 + glow * 0.25})`;
    ctx.beginPath(); ctx.arc(ap.x, ap.y, r + 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#f2c230";
    ctx.beginPath(); ctx.arc(ap.x, ap.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff4c0";
    ctx.beginPath(); ctx.arc(ap.x - 1, ap.y - 1, r * 0.35, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#4a8a30";
    ctx.fillRect(ap.x, ap.y - r - 2, 2, 2);
  } else if (tick < a.from) {
    // A crow keeps the hat warm until the apple goes up.
    ctx.fillStyle = "#26222a";
    ctx.beginPath(); ctx.ellipse(ap.x, ap.y + 2, 4, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ap.x + 3, ap.y, 1.8, 0, Math.PI * 2); ctx.fill();
  }
}

/** An arrow at (x, y) in metres, pointing along (vx, vy). */
function drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, vx: number, vy: number, sunk: number): void {
  const p = toView(x, y);
  // Direction on screen (y down, heights scaled more).
  let ux = vx * SX, uy = -vy * SY;
  const len = Math.sqrt(ux * ux + uy * uy) || 1;
  ux /= len; uy /= len;
  const L = 13, tipX = p.x + ux * sunk, tipY = p.y + uy * sunk;
  const tailX = tipX - ux * L, tailY = tipY - uy * L;
  ctx.strokeStyle = "#5a3a20"; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(tipX, tipY); ctx.stroke();
  ctx.strokeStyle = "#e8e4dc"; ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(tailX + ux * 3, tailY + uy * 3); ctx.lineTo(tailX - uy * 2.5, tailY + ux * 2.5);
  ctx.moveTo(tailX + ux * 3, tailY + uy * 3); ctx.lineTo(tailX + uy * 2.5, tailY - ux * 2.5);
  ctx.stroke();
}

function drawArrows(ctx: CanvasRenderingContext2D, course: ArcheryCourse, st: ArcheryState, frac: number, tick: number): void {
  for (const a of st.arrows) {
    if (a.state === "gone" || a.state === "apple") continue;
    if (a.state === "stuck") {
      const at = targetAt(course.targets[a.target], tick);
      drawArrow(ctx, at.x, at.y + a.dy, a.vx, a.vy, 3);
    } else if (a.state === "ground") {
      drawArrow(ctx, a.x, a.y, a.vx, a.vy, 4);
    } else {
      const x = a.x + a.vx * frac, y = a.y + a.vy * frac;
      const p = toView(x, y);
      if (p.y < 4) {
        // Up out of sight: a mark where it is.
        ctx.fillStyle = "rgba(60,40,20,0.8)";
        ctx.beginPath(); ctx.moveTo(p.x, 2); ctx.lineTo(p.x - 4, 9); ctx.lineTo(p.x + 4, 9); ctx.fill();
      } else drawArrow(ctx, x, y, a.vx, a.vy, 0);
    }
  }
}

/** Pip and the bow: pointing along the pull while drawn, at the last pull otherwise. */
function drawArcher(ctx: CanvasRenderingContext2D, st: ArcheryState, aim: { dx: number; dy: number }, drawn: boolean): void {
  const foot = toView(0, 0), x = foot.x - 4, hip = GROUND_Y - 14, shoulder = toView(0, LAUNCH_Y).y;
  ctx.fillStyle = "#3a3a3a";
  ctx.fillRect(x - 3, hip, 2.5, GROUND_Y - hip);
  ctx.fillRect(x + 1, hip, 2.5, GROUND_Y - hip);
  ctx.fillStyle = "#4a7c59";
  ctx.fillRect(x - 4, shoulder - 2, 8, hip - shoulder + 3);
  ctx.fillStyle = "#f1c9a5";
  ctx.beginPath(); ctx.arc(x, shoulder - 6, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#e8c14a";
  for (let i = -3; i <= 3; i += 2) { ctx.beginPath(); ctx.moveTo(x + i - 1.5, shoulder - 8); ctx.lineTo(x + i, shoulder - 13); ctx.lineTo(x + i + 1.5, shoulder - 8); ctx.fill(); }
  // The quiver on the back, with what's left in it.
  ctx.fillStyle = "#7a4a2a";
  ctx.fillRect(x - 8, shoulder - 2, 4, 11);
  ctx.fillStyle = "#e8e4dc";
  for (let i = 0; i < Math.min(6, Math.ceil(st.quiver / 4)); i++) ctx.fillRect(x - 8 + (i % 3) * 1.4, shoulder - 5 - (i > 2 ? 1 : 0), 1, 3);
  // The bow.
  const bx = toView(LAUNCH_X, LAUNCH_Y);
  let ux = aim.dx * SX, uy = -aim.dy * SY;
  const len = Math.sqrt(ux * ux + uy * uy) || 1;
  ux /= len; uy /= len;
  const r = 11, pull = drawn ? (Math.sqrt(aim.dx * aim.dx + aim.dy * aim.dy) / MAX_DRAW) * 8 : 0;
  ctx.strokeStyle = "#8a5a2a"; ctx.lineWidth = 2;
  const ang = Math.atan2(uy, ux);
  ctx.beginPath(); ctx.arc(bx.x - ux * 2, bx.y - uy * 2, r, ang - 1.2, ang + 1.2); ctx.stroke();
  const e1 = { x: bx.x - ux * 2 + Math.cos(ang - 1.2) * r, y: bx.y - uy * 2 + Math.sin(ang - 1.2) * r };
  const e2 = { x: bx.x - ux * 2 + Math.cos(ang + 1.2) * r, y: bx.y - uy * 2 + Math.sin(ang + 1.2) * r };
  const nock = { x: bx.x - ux * (2 + r * 0.36 + pull), y: bx.y - uy * (2 + r * 0.36 + pull) };
  ctx.strokeStyle = "#f4f0e0"; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(e1.x, e1.y); ctx.lineTo(nock.x, nock.y); ctx.lineTo(e2.x, e2.y); ctx.stroke();
  if (canLoose(st)) {
    ctx.strokeStyle = "#5a3a20"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(nock.x, nock.y); ctx.lineTo(nock.x + ux * 15, nock.y + uy * 15); ctx.stroke();
  }
}

/** While the string is drawn: the first stretch of the arc, as it would fly in still air. */
function drawPreview(ctx: CanvasRenderingContext2D, course: ArcheryCourse, aim: { dx: number; dy: number }): void {
  const calm = { ...course, targets: [], wind: [0] };
  const a = launch(aim.dx, aim.dy, 0);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  for (let t = 0; t < 26; t++) {
    if (flyStep(a, calm, t, false)) break;
    if (t % 3 !== 2) continue;
    const p = toView(a.x, a.y);
    ctx.beginPath(); ctx.arc(p.x, p.y, 1.4, 0, Math.PI * 2); ctx.fill();
  }
  // How hard: a bar by the archer.
  const power = Math.sqrt(aim.dx * aim.dx + aim.dy * aim.dy) / MAX_DRAW;
  const x = 8, y = GROUND_Y - 70, h = 50;
  ctx.fillStyle = "rgba(20,30,20,0.4)";
  ctx.fillRect(x, y, 5, h);
  ctx.fillStyle = power > 0.9 ? "#e0533a" : "#f0b840";
  ctx.fillRect(x, y + h * (1 - power), 5, h * power);
}

export type DrawOpts = {
  frac: number;
  aim: { dx: number; dy: number };
  drawn: boolean;
  particles: ArcheryParticle[];
};

export function drawArchery(ctx: CanvasRenderingContext2D, course: ArcheryCourse, st: ArcheryState, now: number, o: DrawOpts): void {
  const tick = st.tick + o.frac;
  drawSky(ctx, course, st.tick, now);
  drawWind(ctx, course, st.tick, now);
  drawGround(ctx);
  drawScarecrow(ctx, course, st, st.tick, now);
  course.targets.forEach((t) => { const at = targetAt(t, tick); drawStand(ctx, t, at); drawFace(ctx, t, at); });
  drawArrows(ctx, course, st, o.frac, tick);
  drawArcher(ctx, st, o.aim, o.drawn);
  if (o.drawn) drawPreview(ctx, course, o.aim);
  drawParticles(ctx, o.particles, now);
  // Arrows left, along the bottom.
  ctx.fillStyle = "rgba(20,30,20,0.55)";
  ctx.fillRect(0, VIEW_H - 14, VIEW_W, 14);
  for (let i = 0; i < ARROWS; i++) {
    ctx.fillStyle = i < st.quiver ? "#f4ead0" : "rgba(244,234,208,0.2)";
    ctx.fillRect(8 + i * 7, VIEW_H - 11, 2, 8);
  }
  if (st.tick >= RUN_TICKS && !st.done) {
    ctx.font = "bold 12px sans-serif"; ctx.textAlign = "right"; ctx.fillStyle = "#fff4c0";
    ctx.fillText("the bell! arrows still in the air…", VIEW_W - 8, VIEW_H - 3);
  }
}

/** A puff where an arrow struck: straw off a butt, dust off the ground, gold off the apple. */
export function burst(particles: ArcheryParticle[], kind: ArcheryParticle["kind"], at: ArcheryArrow | { x: number; y: number }, n: number, now: number): void {
  const p = toView(at.x, at.y);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 20 + Math.random() * 60;
    particles.push({
      kind, x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: -Math.abs(Math.sin(a)) * sp - 10, born: now, life: 400 + Math.random() * 400,
      size: kind === "gold" ? 1.5 + Math.random() : 1 + Math.random() * 1.5,
      color: kind === "straw" ? (Math.random() < 0.5 ? "#e8cf8a" : "#c8a45a") : kind === "gold" ? (Math.random() < 0.4 ? "#fff4c0" : "#f2c230") : "#a08a6a",
    });
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: ArcheryParticle[], now: number): void {
  for (let i = particles.length - 1; i >= 0; i--) if (now - particles[i].born > particles[i].life) particles.splice(i, 1);
  for (const p of particles) {
    const t = (now - p.born) / 1000, age = (now - p.born) / p.life;
    ctx.globalAlpha = 1 - age;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x + p.vx * t, p.y + p.vy * t + 120 * t * t, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

export function drawFx(ctx: CanvasRenderingContext2D, fx: readonly ArcheryFx[], now: number): void {
  ctx.textAlign = "center";
  for (const f of fx) {
    const age = (now - f.at) / 1200;
    if (age > 1 || age < 0) continue;
    const pop = age < 0.12 ? 0.6 + (age / 0.12) * 0.5 : 1.1 - Math.min(0.1, age - 0.12);
    ctx.font = `bold ${Math.round((f.big ? 15 : 11) * pop)}px sans-serif`;
    ctx.globalAlpha = age < 0.7 ? 1 : 1 - (age - 0.7) / 0.3;
    ctx.strokeStyle = "rgba(20,24,16,0.9)"; ctx.lineWidth = 3; ctx.lineJoin = "round";
    ctx.strokeText(f.text, f.x, f.y - age * 26);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y - age * 26);
  }
  ctx.globalAlpha = 1;
}
