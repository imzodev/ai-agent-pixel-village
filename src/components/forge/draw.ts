// Drawing Bjorn's Forge (the game: src/lib/forgeGame/sim.ts) on a 2D canvas, the
// smithy seen front-on: Bjorn's board of commissions along the top; the brick
// forge with its coals and flames (as strong as the day's fire) on the left, the
// anvil on its stump with the hammer over it and the beat ring closing on it,
// and the quench barrel; the billet glowing with its heat (dark → cherry →
// orange → white) and taking shape as it's worked; the heat gauge with the
// piece's sweet band; the buttons. Before the fire is lit, the fuel and tools to
// choose from. Drawn in code, no sheet. Only for show; it never feeds back. Also
// says what a tap at (x, y) is on, and makes the sparks, steam and smoke.

import {
  COLD_MAX, FORGE_FUELS, FORGE_HAMMERS, FORGE_PIECES, FORGE_TONGS, HEAT_MAX, HOT_MIN, PREP_TICKS, SWING_TICKS, TICKS_PER_SEC,
} from "@/lib/forgeGame/rules";
import { fireAt } from "@/lib/forgeGame/course";
import { bandOf, canFinish, canMove, canQuench, onAnvil, swingOffset, swingPhase } from "@/lib/forgeGame/sim";
import type { ForgeCourse, ForgeFx, ForgeHit, ForgeLoadout, ForgeParticle, ForgePieceDef, ForgeState } from "@/types/forgeGame";

export const VIEW_W = 300;
export const VIEW_H = 420;

/** Where things are. */
const BOARD = { x: 6, y: 6, w: 288, h: 60 };
const CARD = { w: 66, h: 44, gap: 4 };
const SCENE = { y: 70, h: 236 };
const FLOOR_Y = 290;
const FORGE = { x: 6, w: 112, top: 212 };
const ANVIL = { x: 160, y: 236, w: 92 };
const BARREL = { x: 258, y: 246, w: 36, h: 52 };
const GAUGE = { x: 18, y: 314, w: 264, h: 12 };
const BTN_Y = 342;
const BUTTONS = {
  move: { x: 6, y: BTN_Y, w: 92, h: 72 },
  strike: { x: 104, y: BTN_Y, w: 108, h: 72 },
  quench: { x: 218, y: BTN_Y, w: 76, h: 34 },
  finish: { x: 218, y: BTN_Y + 38, w: 76, h: 34 },
};
/** The prep screen: three rows of three choices, then the button that lights the fire. */
const PREP = { y: 72, row: 74, cardY: 16, cardH: 54, cardW: 92, light: { x: 6, y: 346, w: 288, h: 66 } };
const prepCardX = (i: number) => 6 + i * (PREP.cardW + 6);

/** Where the billet lies in the coals and on the anvil (its middle). */
export const FIRE_SPOT = { x: 62, y: 204 };
export const ANVIL_SPOT = { x: 206, y: 229 };
export const BARREL_SPOT = { x: BARREL.x + BARREL.w / 2, y: BARREL.y + 6 };

const ROWS = ["fuel", "hammer", "tongs"] as const;
export const PREP_CHOICES = {
  fuel: Object.keys(FORGE_FUELS) as (keyof typeof FORGE_FUELS)[],
  hammer: Object.keys(FORGE_HAMMERS) as (keyof typeof FORGE_HAMMERS)[],
  tongs: Object.keys(FORGE_TONGS) as (keyof typeof FORGE_TONGS)[],
};

const inside = (x: number, y: number, r: { x: number; y: number; w: number; h: number }) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

/** What a tap at (x, y) lands on. */
export function hitTest(x: number, y: number, prep: boolean): ForgeHit | null {
  if (prep) {
    if (inside(x, y, PREP.light)) return { k: "light" };
    for (let r = 0; r < ROWS.length; r++) {
      const y0 = PREP.y + r * PREP.row + PREP.cardY;
      if (y < y0 || y >= y0 + PREP.cardH) continue;
      for (let i = 0; i < 3; i++) if (x >= prepCardX(i) && x < prepCardX(i) + PREP.cardW) return { k: ROWS[r], i };
    }
    return null;
  }
  for (const k of ["move", "strike", "quench", "finish"] as const) if (inside(x, y, BUTTONS[k])) return { k };
  if (y >= SCENE.y && y < SCENE.y + SCENE.h) {
    if (x < FORGE.x + FORGE.w + 6) return { k: "fire" };
    if (x >= 128) return { k: "anvil" };
  }
  return null;
}

// ---------- colour ----------

const STOPS: readonly (readonly [number, number, number, number])[] = [
  [0, 64, 62, 68], [190, 74, 56, 54], [280, 128, 36, 22], [380, 196, 58, 24], [480, 238, 110, 30], [580, 255, 178, 56], [660, 255, 232, 170], [767, 255, 255, 250],
];
function heatRgb(heat: number): [number, number, number] {
  for (let i = 1; i < STOPS.length; i++) {
    const [h1, r1, g1, b1] = STOPS[i], [h0, r0, g0, b0] = STOPS[i - 1];
    if (heat <= h1) {
      const t = (heat - h0) / (h1 - h0);
      return [r0 + (r1 - r0) * t, g0 + (g1 - g0) * t, b0 + (b1 - b0) * t];
    }
  }
  return [255, 255, 250];
}
const rgb = (c: readonly number[], k = 1, a = 1) => `rgba(${Math.round(Math.min(255, c[0] * k))},${Math.round(Math.min(255, c[1] * k))},${Math.round(Math.min(255, c[2] * k))},${a})`;
const hexRgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
/** The metal's colour at a heat: its own colour cold, glowing as it heats. */
function metalRgb(piece: ForgePieceDef, heat: number): [number, number, number] {
  const glow = heatRgb(heat), cold = hexRgb(piece.color);
  const t = Math.max(0, Math.min(1, (heat - 150) / 180));
  const dim = 0.62;
  return [cold[0] * dim + (glow[0] - cold[0] * dim) * t, cold[1] * dim + (glow[1] - cold[1] * dim) * t, cold[2] * dim + (glow[2] - cold[2] * dim) * t];
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

/** A small fixed hash for the stonework's shades (the same every frame). */
const shade = (a: number, b: number) => (((a * 73856093) ^ (b * 19349663)) >>> 0) % 1000 / 1000;

// ---------- the room (drawn once, kept) ----------

let room: HTMLCanvasElement | null = null;
const ROOM_SCALE = 3;

function roomCanvas(): HTMLCanvasElement {
  if (room) return room;
  room = document.createElement("canvas");
  room.width = VIEW_W * ROOM_SCALE; room.height = VIEW_H * ROOM_SCALE;
  const ctx = room.getContext("2d")!;
  ctx.scale(ROOM_SCALE, ROOM_SCALE);
  drawRoom(ctx);
  return room;
}

function drawRoom(ctx: CanvasRenderingContext2D): void {
  // Everything below the board: the smithy's back wall, its floor, the forge, the anvil, the barrel.
  ctx.fillStyle = "#1b1310"; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const top = SCENE.y, bottom = FLOOR_Y;
  // Stone wall, block by block.
  for (let row = 0, y = top; y < bottom; row++, y += 13) {
    const off = row % 2 ? 11 : 0;
    for (let col = -1, x = -off; x < VIEW_W; col++, x += 22) {
      const s = shade(col + 7, row + 3);
      const l = 38 + s * 12;
      ctx.fillStyle = `rgb(${l + 8},${l},${l - 6})`;
      ctx.fillRect(x + 1, y + 1, 20, 11);
      ctx.fillStyle = `rgba(255,240,220,${0.04 + s * 0.04})`; ctx.fillRect(x + 1, y + 1, 20, 1);
      ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(x + 1, y + 11, 20, 1);
    }
  }
  // A small window, dusk outside.
  const wx = 148, wy = 92, ww = 44, wh = 40;
  const sky = ctx.createLinearGradient(0, wy, 0, wy + wh);
  sky.addColorStop(0, "#2a3a6a"); sky.addColorStop(0.7, "#c8704a"); sky.addColorStop(1, "#f0a860");
  ctx.fillStyle = "#3a281c"; ctx.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
  ctx.fillStyle = sky; ctx.fillRect(wx, wy, ww, wh);
  ctx.fillStyle = "#2a3a2a";
  ctx.beginPath(); ctx.moveTo(wx, wy + wh); ctx.lineTo(wx + 10, wy + 28); ctx.lineTo(wx + 20, wy + 33); ctx.lineTo(wx + 32, wy + 24); ctx.lineTo(wx + ww, wy + 31); ctx.lineTo(wx + ww, wy + wh); ctx.fill();
  ctx.fillStyle = "#fff6d0"; ctx.fillRect(wx + 30, wy + 8, 2, 2); ctx.fillRect(wx + 12, wy + 13, 1, 1);
  ctx.fillStyle = "#3a281c"; ctx.fillRect(wx + ww / 2 - 1, wy, 2, wh); ctx.fillRect(wx, wy + wh / 2 - 1, ww, 2);
  ctx.fillStyle = "#5a3e2a"; ctx.fillRect(wx - 6, wy + wh + 4, ww + 12, 4);
  // The tool rack: tongs and hammers hanging.
  ctx.fillStyle = "#5a3a22"; ctx.fillRect(210, 96, 82, 6);
  ctx.fillStyle = "#7a5232"; ctx.fillRect(210, 96, 82, 2);
  const peg = (x: number) => { ctx.fillStyle = "#2a1a10"; ctx.fillRect(x - 1, 101, 3, 4); };
  [220, 238, 256, 276].forEach(peg);
  ctx.strokeStyle = "#4a4a52"; ctx.lineWidth = 2; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(219, 104); ctx.lineTo(216, 146); ctx.moveTo(221, 104); ctx.lineTo(225, 146); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(237, 104); ctx.lineTo(234, 134); ctx.moveTo(239, 104); ctx.lineTo(243, 134); ctx.stroke();
  ctx.fillStyle = "#6e4426"; ctx.fillRect(255, 104, 3, 34); ctx.fillStyle = "#55555e"; ctx.fillRect(250, 136, 13, 8);
  ctx.fillStyle = "#6e4426"; ctx.fillRect(275, 104, 3, 30); ctx.fillStyle = "#6a6a74"; ctx.fillRect(271, 132, 11, 7);
  ctx.lineCap = "butt";
  // A finished blade on the wall, for show.
  ctx.save(); ctx.translate(166, 160); ctx.rotate(-0.5);
  ctx.fillStyle = "#c8ccd4"; ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(34, -2); ctx.lineTo(40, 0); ctx.lineTo(34, 2); ctx.lineTo(0, 2); ctx.fill();
  ctx.fillStyle = "#8a6a2a"; ctx.fillRect(-3, -5, 3, 10); ctx.fillStyle = "#4a2c18"; ctx.fillRect(-12, -1.5, 9, 3);
  ctx.restore();
  // Floor: packed earth and a few flagstones.
  const fl = ctx.createLinearGradient(0, bottom, 0, SCENE.y + SCENE.h);
  fl.addColorStop(0, "#3a2a20"); fl.addColorStop(1, "#24180f");
  ctx.fillStyle = fl; ctx.fillRect(0, bottom, VIEW_W, SCENE.y + SCENE.h - bottom);
  ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(0, bottom, VIEW_W, 2);
  // The forge: brick hearth, iron hood, chimney.
  const fx = FORGE.x, fw = FORGE.w, ft = FORGE.top;
  ctx.fillStyle = "#2a1c16";
  ctx.beginPath(); ctx.moveTo(fx + 6, ft - 54); ctx.lineTo(fx + fw - 6, ft - 54); ctx.lineTo(fx + fw - 30, top + 16); ctx.lineTo(fx + 30, top + 16); ctx.fill();
  const hood = ctx.createLinearGradient(fx, 0, fx + fw, 0);
  hood.addColorStop(0, "#3a3a42"); hood.addColorStop(0.5, "#5a5a64"); hood.addColorStop(1, "#33333a");
  ctx.fillStyle = hood;
  ctx.beginPath(); ctx.moveTo(fx + 2, ft - 50); ctx.lineTo(fx + fw - 2, ft - 50); ctx.lineTo(fx + fw - 28, top + 18); ctx.lineTo(fx + 28, top + 18); ctx.fill();
  ctx.fillStyle = "#4a4a52"; ctx.fillRect(fx + 34, top, fw - 68, 20);
  ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fillRect(fx + 34, top, 4, 20);
  ctx.fillStyle = "#2a2a30"; ctx.fillRect(fx, ft - 52, fw, 6);
  ctx.fillStyle = "#8a8a94";
  for (let i = 0; i < 6; i++) { ctx.fillRect(fx + 8 + i * 19, ft - 50, 2, 2); }
  // The hood's plaque (the fire's strength is written on it each frame).
  ctx.fillStyle = "#3a2618"; rrect(ctx, fx + 30, ft - 86, fw - 60, 16, 3); ctx.fill();
  ctx.strokeStyle = "#8a6a3a"; ctx.lineWidth = 1; ctx.stroke();
  // Bricks.
  for (let row = 0, y = ft; y < bottom + 10; row++, y += 8) {
    const off = row % 2 ? 7 : 0;
    for (let col = 0, x = fx - off; x < fx + fw; col++, x += 14) {
      const s = shade(col + 31, row + 17);
      ctx.fillStyle = `rgb(${120 + s * 30},${54 + s * 14},${40 + s * 10})`;
      const x0 = Math.max(fx, x + 1), x1 = Math.min(fx + fw, x + 13);
      if (x1 > x0) ctx.fillRect(x0, y + 1, x1 - x0, 6);
    }
  }
  ctx.fillStyle = "#5a2a1c"; ctx.fillRect(fx - 2, ft - 4, fw + 4, 6);
  ctx.fillStyle = "#8a4a32"; ctx.fillRect(fx - 2, ft - 4, fw + 4, 2);
  // The firepot (the coals are drawn live in it).
  ctx.fillStyle = "#120a08"; rrect(ctx, fx + 14, ft - 22, fw - 28, 20, 4); ctx.fill();
  // The ash door below.
  ctx.fillStyle = "#2a1a14"; rrect(ctx, fx + 40, ft + 34, 32, 26, 3); ctx.fill();
  ctx.fillStyle = "#4a4a52"; ctx.fillRect(fx + 40, ft + 34, 32, 3); ctx.fillRect(fx + 54, ft + 44, 4, 4);
  // Bellows on the floor beside the hearth's foot.
  ctx.fillStyle = "#5a3418";
  ctx.beginPath(); ctx.moveTo(fx + fw + 2, bottom + 2); ctx.lineTo(fx + fw + 26, bottom - 6); ctx.lineTo(fx + fw + 26, bottom + 10); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#3a2210"; ctx.fillRect(fx + fw + 24, bottom - 8, 8, 20);
  // The stump.
  const sx = ANVIL.x + 14, sw = ANVIL.w - 28;
  ctx.fillStyle = "#5a3820"; ctx.fillRect(sx, ANVIL.y + 34, sw, FLOOR_Y - ANVIL.y - 26);
  ctx.fillStyle = "#6e4628"; for (let i = 0; i < 5; i++) ctx.fillRect(sx + 6 + i * 13, ANVIL.y + 36, 2, FLOOR_Y - ANVIL.y - 30);
  ctx.fillStyle = "#8a6038"; ctx.beginPath(); ctx.ellipse(sx + sw / 2, ANVIL.y + 34, sw / 2, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.ellipse(sx + sw / 2, FLOOR_Y + 8, sw / 2 + 6, 4, 0, 0, Math.PI * 2); ctx.fill();
  // The anvil: face, horn, waist, feet.
  const ax = ANVIL.x, ay = ANVIL.y, aw = ANVIL.w;
  const iron = ctx.createLinearGradient(0, ay, 0, ay + 34);
  iron.addColorStop(0, "#7a7a86"); iron.addColorStop(0.3, "#4e4e58"); iron.addColorStop(1, "#2e2e36");
  ctx.fillStyle = iron;
  ctx.beginPath();
  ctx.moveTo(ax - 24, ay + 2); ctx.quadraticCurveTo(ax - 8, ay, ax, ay); ctx.lineTo(ax + aw, ay); ctx.lineTo(ax + aw, ay + 11);
  ctx.lineTo(ax + aw - 14, ay + 13); ctx.lineTo(ax + aw - 20, ay + 24); ctx.lineTo(ax + aw - 6, ay + 32); ctx.lineTo(ax + 10, ay + 32);
  ctx.lineTo(ax + 24, ay + 24); ctx.lineTo(ax + 18, ay + 13); ctx.lineTo(ax, ay + 11); ctx.quadraticCurveTo(ax - 10, ay + 9, ax - 24, ay + 2);
  ctx.fill();
  ctx.strokeStyle = "#1a1a20"; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = "#a4a4b0"; ctx.fillRect(ax, ay, aw, 2);
  ctx.fillStyle = "#1a1a20"; ctx.fillRect(ax + aw - 14, ay + 3, 5, 4);
  // The barrel of water.
  const bx = BARREL.x, by = BARREL.y, bw = BARREL.w, bh = BARREL.h;
  ctx.fillStyle = "#5a3820"; ctx.fillRect(bx, by, bw, bh);
  for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? "#6a4428" : "#4e301a"; ctx.fillRect(bx + i * 9, by, 9, bh); }
  ctx.fillStyle = "#3a3a42"; ctx.fillRect(bx - 1, by + 8, bw + 2, 4); ctx.fillRect(bx - 1, by + bh - 12, bw + 2, 4);
  ctx.fillStyle = "#2a1a10"; ctx.beginPath(); ctx.ellipse(bx + bw / 2, by, bw / 2, 4, 0, 0, Math.PI * 2); ctx.fill();
  // The board's backing.
  const wood = ctx.createLinearGradient(0, BOARD.y, 0, BOARD.y + BOARD.h);
  wood.addColorStop(0, "#5a3a24"); wood.addColorStop(1, "#3e2616");
  ctx.fillStyle = wood; rrect(ctx, BOARD.x, BOARD.y, BOARD.w, BOARD.h, 4); ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.2)"; for (let y = BOARD.y + 9; y < BOARD.y + BOARD.h; y += 10) ctx.fillRect(BOARD.x + 2, y, BOARD.w - 4, 1);
  ctx.strokeStyle = "#2a180c"; ctx.lineWidth = 2; rrect(ctx, BOARD.x + 1, BOARD.y + 1, BOARD.w - 2, BOARD.h - 2, 4); ctx.stroke();
  // The panel under the scene.
  const panel = ctx.createLinearGradient(0, SCENE.y + SCENE.h, 0, VIEW_H);
  panel.addColorStop(0, "#2a1c14"); panel.addColorStop(1, "#1a110c");
  ctx.fillStyle = panel; ctx.fillRect(0, SCENE.y + SCENE.h, VIEW_W, VIEW_H - SCENE.y - SCENE.h);
  ctx.fillStyle = "#5a3a22"; ctx.fillRect(0, SCENE.y + SCENE.h, VIEW_W, 2);
}

// ---------- the live parts ----------

function board(ctx: CanvasRenderingContext2D, course: ForgeCourse, st: ForgeState, now: number): void {
  ctx.fillStyle = "#f4dca0"; ctx.font = "bold 7px sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillText(`BJORN'S BOARD · #${course.number}`, BOARD.x + 6, BOARD.y + 9);
  ctx.textAlign = "right"; ctx.fillStyle = "#ffd166";
  ctx.fillText(`${st.points} pts`, BOARD.x + BOARD.w - 6, BOARD.y + 9);
  course.commissions.forEach((c, i) => {
    const x = BOARD.x + 6 + i * (CARD.w + CARD.gap), y = BOARD.y + 13;
    const def = FORGE_PIECES[c.piece], out = st.outcomes[i];
    const current = st.phase !== "prep" && !st.done && i === st.commission;
    const future = !out && !current;
    ctx.save();
    ctx.translate(x + CARD.w / 2, y + CARD.h / 2);
    ctx.rotate(((i % 2 ? 1 : -1) * 0.02));
    ctx.translate(-CARD.w / 2, -CARD.h / 2);
    if (current) {
      ctx.shadowColor = "rgba(255,200,80,0.9)"; ctx.shadowBlur = 6 + 3 * Math.sin(now / 220);
    }
    ctx.fillStyle = future ? "#d8c49a" : "#f2e2bc";
    ctx.fillRect(0, 0, CARD.w, CARD.h);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(120,80,40,0.15)"; ctx.fillRect(0, CARD.h - 4, CARD.w, 4);
    ctx.strokeStyle = current ? "#e8a020" : "#a0784a"; ctx.lineWidth = current ? 2 : 1;
    ctx.strokeRect(0.5, 0.5, CARD.w - 1, CARD.h - 1);
    // The pin.
    ctx.fillStyle = "#b03a2a"; ctx.beginPath(); ctx.arc(CARD.w / 2, 3, 2, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = future ? 0.65 : 1;
    ctx.font = "16px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(def.icon, 14, 19);
    ctx.textBaseline = "alphabetic"; ctx.fillStyle = "#3a2414"; ctx.textAlign = "left";
    ctx.font = "bold 8px sans-serif"; ctx.fillText(`${c.strikes} blows`, 27, 16);
    ctx.font = "7px sans-serif"; ctx.fillStyle = "#6a4a2a"; ctx.fillText(`${c.points} pts`, 27, 26);
    // Progress: quality towards what it needs.
    const q = out === "made" ? 1 : out === "half" ? 0.5 : current ? Math.min(1, st.work.quality / c.quality) : 0;
    ctx.fillStyle = "#c8b088"; ctx.fillRect(5, 33, CARD.w - 10, 5);
    ctx.fillStyle = out === "made" ? "#4a9a48" : out === "half" ? "#d8a030" : "#e88a30";
    ctx.fillRect(5, 33, (CARD.w - 10) * q, 5);
    ctx.strokeStyle = "#8a6a48"; ctx.lineWidth = 0.5; ctx.strokeRect(5, 33, CARD.w - 10, 5);
    ctx.globalAlpha = 1;
    if (out) {
      // A stamp across the card.
      const [txt, col] = out === "made" ? ["MADE", "#2f8a3a"] : out === "half" ? ["½ PAID", "#b07a10"] : ["LOST", "#c0302a"];
      ctx.save(); ctx.translate(CARD.w / 2, CARD.h / 2 + 1); ctx.rotate(-0.22);
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.strokeRect(-24, -8, 48, 15);
      ctx.fillStyle = col; ctx.font = "bold 9px sans-serif"; ctx.textAlign = "center"; ctx.fillText(txt, 0, 3);
      ctx.restore();
    } else if (current && st.work.strikes > 0) {
      ctx.fillStyle = "#3a2414"; ctx.font = "bold 7px sans-serif"; ctx.textAlign = "right";
      ctx.fillText(`${Math.min(st.work.strikes, c.strikes)}/${c.strikes}`, CARD.w - 4, 26);
    }
    ctx.restore();
  });
  ctx.textAlign = "left";
}

const FIRE_WORDS = ["", "", "", "LOW", "STEADY", "ROARING"];

function fire(ctx: CanvasRenderingContext2D, strength: number, lit: boolean, now: number): void {
  const fx = FORGE.x, fw = FORGE.w, ft = FORGE.top;
  const k = lit ? strength / 4 : 0.45;
  // The glow on the wall and the hood.
  const g = ctx.createRadialGradient(FIRE_SPOT.x, ft - 14, 4, FIRE_SPOT.x, ft - 14, 70 + 30 * k);
  const flick = 0.85 + 0.15 * Math.sin(now / 90) * Math.sin(now / 137);
  g.addColorStop(0, `rgba(255,150,50,${0.55 * k * flick})`); g.addColorStop(1, "rgba(255,90,20,0)");
  ctx.fillStyle = g; ctx.fillRect(0, SCENE.y, 200, SCENE.h);
  // The coals.
  for (let i = 0; i < 13; i++) {
    const cx = fx + 22 + i * 5.6, cy = ft - 8 - (i % 3) * 2;
    const pulse = 0.6 + 0.4 * Math.sin(now / (160 + i * 23) + i * 1.7);
    const c = heatRgb(380 + 260 * pulse * k);
    ctx.fillStyle = rgb(c);
    ctx.beginPath(); ctx.arc(cx, cy, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(30,10,4,0.55)"; ctx.beginPath(); ctx.arc(cx + 1, cy + 1.2, 1.6, 0, Math.PI * 2); ctx.fill();
  }
  // The flames: tongues that sway, taller as the fire roars.
  const tongues = 7;
  for (let layer = 0; layer < 3; layer++) {
    const col = layer === 0 ? "rgba(230,70,20,0.85)" : layer === 1 ? "rgba(255,150,40,0.9)" : "rgba(255,230,140,0.95)";
    const shrink = 1 - layer * 0.3;
    ctx.fillStyle = col;
    for (let i = 0; i < tongues; i++) {
      const bx = fx + 24 + i * ((fw - 48) / (tongues - 1));
      const h = (14 + 10 * Math.sin(now / (110 + i * 17) + i * 2.1) + 8 * Math.sin(now / 53 + i)) * k * shrink + 4;
      const sway = 3 * Math.sin(now / 140 + i);
      const w = 7 * shrink;
      ctx.beginPath();
      ctx.moveTo(bx - w, ft - 9);
      ctx.quadraticCurveTo(bx - w * 0.6 + sway * 0.5, ft - 9 - h * 0.6, bx + sway, ft - 9 - h);
      ctx.quadraticCurveTo(bx + w * 0.6 + sway * 0.5, ft - 9 - h * 0.6, bx + w, ft - 9);
      ctx.fill();
    }
  }
  // The plaque on the hood.
  ctx.font = "bold 8px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = !lit ? "#a08868" : strength >= 5 ? "#ffb060" : strength <= 3 ? "#b8c8e8" : "#f4dca0";
  ctx.fillText(lit ? `🔥 ${FIRE_WORDS[strength]}` : "UNLIT", fx + fw / 2, ft - 78);
  ctx.textBaseline = "alphabetic";
}

/** The billet: a bar that becomes the piece as its quality grows, glowing with its heat. */
function billet(ctx: CanvasRenderingContext2D, x: number, y: number, piece: ForgePieceDef, progress: number, heat: number, scale: boolean, now: number): void {
  const c = metalRgb(piece, heat);
  if (heat > 240) {
    const r = 18 + (heat - 240) / 12;
    const g = ctx.createRadialGradient(x, y, 2, x, y, r);
    const glow = heatRgb(heat);
    g.addColorStop(0, rgb(glow, 1, Math.min(0.75, (heat - 240) / 500)));
    g.addColorStop(1, rgb(glow, 1, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  const p = Math.max(0, Math.min(1, progress));
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath();
  if (piece.shape === "axe") {
    // A block that spreads into an axe head: the eye on the left, the bit flaring right.
    const w = 22 + 6 * p, hl = 6, hr = 6 + 7 * p;
    ctx.moveTo(-w / 2, -hl); ctx.lineTo(w / 2 - 6 * p, -hl);
    ctx.quadraticCurveTo(w / 2, -hr, w / 2 + 2 * p, -hr);
    ctx.lineTo(w / 2 + 2 * p, hr);
    ctx.quadraticCurveTo(w / 2, hr, w / 2 - 6 * p, hl);
    ctx.lineTo(-w / 2, hl); ctx.closePath();
  } else {
    // A bar that draws out into a blade: longer, thinner, a point, a tang.
    const len = 30 + 30 * p, th = 5 - 1.5 * p, tip = 3 + 11 * p;
    const x0 = -len / 2, x1 = len / 2;
    ctx.moveTo(x0, -th); ctx.lineTo(x1 - tip, -th); ctx.lineTo(x1, 0); ctx.lineTo(x1 - tip, th); ctx.lineTo(x0, th);
    if (p > 0.25) { ctx.lineTo(x0, 1.5); ctx.lineTo(x0 - 4 - 6 * p, 1.2); ctx.lineTo(x0 - 4 - 6 * p, -1.2); ctx.lineTo(x0, -1.5); }
    ctx.closePath();
  }
  ctx.fillStyle = rgb(c);
  ctx.fill();
  ctx.strokeStyle = rgb(c, 0.55); ctx.lineWidth = 1; ctx.stroke();
  // A highlight along the top, and the fuller on a blade.
  ctx.fillStyle = rgb(c, 1.25, 0.6);
  if (piece.shape === "axe") ctx.fillRect(-10, -5, 14, 1.2);
  else {
    const len = 30 + 30 * p;
    ctx.fillRect(-len / 2 + 1, -4 + 1.5 * p, len - 6 - 8 * p, 1);
    if (p > 0.4) { ctx.fillStyle = rgb(c, 0.7, 0.8); ctx.fillRect(-len / 2 + 3, -0.4, len * 0.55, 0.8); }
  }
  if (scale) {
    // Flakes of scale on the iron.
    ctx.fillStyle = "#5a5048";
    for (let i = 0; i < 6; i++) {
      const fx = -14 + i * 6 + Math.sin(i * 3.1) * 2, fy = -3 + (i % 2) * 3;
      ctx.fillRect(fx, fy, 3, 2);
    }
    ctx.fillStyle = "#8a8070"; for (let i = 0; i < 6; i++) ctx.fillRect(-13 + i * 6, -3 + (i % 2) * 3, 1, 1);
  }
  ctx.restore();
  if (heat >= HOT_MIN) {
    // White hot: it fizzes.
    ctx.fillStyle = `rgba(255,255,230,${0.5 + 0.5 * Math.sin(now / 40)})`;
    for (let i = 0; i < 4; i++) ctx.fillRect(x - 12 + ((now / 7 + i * 37) % 28), y - 6 - ((now / 5 + i * 13) % 8), 1.5, 1.5);
  }
}

/** The tongs holding the billet, from a hand off to the bottom right. */
function tongs(ctx: CanvasRenderingContext2D, x: number, y: number, long: boolean): void {
  const hx = x + (long ? 92 : 64), hy = y + 50;
  ctx.strokeStyle = "#2a2a30"; ctx.lineWidth = 2.5; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(x + 8, y - 2); ctx.lineTo(hx, hy - 4); ctx.moveTo(x + 8, y + 2); ctx.lineTo(hx, hy + 2); ctx.stroke();
  ctx.strokeStyle = "#5a5a64"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x + 8, y - 2); ctx.lineTo(hx, hy - 4); ctx.stroke();
  ctx.lineCap = "butt";
}

/** The hammer over the anvil, slamming down when a blow is struck. */
function hammer(ctx: CanvasRenderingContext2D, st: ForgeState, frac: number, slamAt: number, now: number): void {
  const since = now - slamAt;
  // Resting high and to the right; it lifts a little as each beat comes round.
  const u = (swingPhase(st) + frac) / SWING_TICKS;
  let hx = 240, hy = 178 - 8 * u;
  if (since >= 0 && since < 180) {
    const t = since / 180;
    const down = t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7;
    hx = 240 + (ANVIL_SPOT.x + 14 - 240) * down;
    hy = hy + (ANVIL_SPOT.y - 12 - hy) * down;
  }
  const gx = 298, gy = 136;
  ctx.strokeStyle = "#6e4426"; ctx.lineWidth = 4; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(hx + 4, hy); ctx.lineTo(gx, gy); ctx.stroke();
  ctx.strokeStyle = "#8a5a32"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(hx + 4, hy - 1); ctx.lineTo(gx, gy - 1); ctx.stroke();
  ctx.lineCap = "butt";
  const ang = Math.atan2(gy - hy, gx - hx);
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(ang + Math.PI / 2);
  const head = ctx.createLinearGradient(-9, 0, 9, 0);
  head.addColorStop(0, "#3a3a42"); head.addColorStop(0.5, "#7a7a86"); head.addColorStop(1, "#3a3a42");
  ctx.fillStyle = head; ctx.fillRect(-10, -6, 20, 12);
  ctx.fillStyle = "#9a9aa6"; ctx.fillRect(-10, -6, 20, 2);
  ctx.strokeStyle = "#1a1a20"; ctx.lineWidth = 1; ctx.strokeRect(-10, -6, 20, 12);
  ctx.restore();
}

/** The ring that closes on the anvil as the beat comes; gold while a blow would count. */
function beatRing(ctx: CanvasRenderingContext2D, st: ForgeState, frac: number, now: number): void {
  if (st.phase !== "work" || st.done) return;
  const window = FORGE_HAMMERS[st.loadout.hammer].window;
  const offset = swingOffset(st);
  const live = onAnvil(st);
  const left = (SWING_TICKS - swingPhase(st) - frac) / SWING_TICKS;
  const r = 9 + 34 * left;
  const good = offset <= window;
  ctx.globalAlpha = live ? 1 : 0.3;
  // The target the ring closes on.
  ctx.strokeStyle = good ? "rgba(255,230,140,0.9)" : "rgba(255,230,140,0.35)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(ANVIL_SPOT.x, ANVIL_SPOT.y, 9, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = good ? "#ffd166" : "rgba(200,180,150,0.55)";
  ctx.lineWidth = good ? 2.5 : 1.5;
  ctx.beginPath(); ctx.arc(ANVIL_SPOT.x, ANVIL_SPOT.y, r, 0, Math.PI * 2); ctx.stroke();
  if (offset <= 1 && live) {
    ctx.fillStyle = `rgba(255,240,180,${0.25 + 0.15 * Math.sin(now / 30)})`;
    ctx.beginPath(); ctx.arc(ANVIL_SPOT.x, ANVIL_SPOT.y, 9, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** What to do now, in a few words over the scene. */
export function hint(st: ForgeState): { text: string; color: string; urgent?: boolean } | null {
  if (st.phase !== "work" || st.done || st.moving > 0) return null;
  const band = bandOf(st.work.piece);
  if (st.place === "fire") {
    if (st.heat >= HOT_MIN) return { text: "WHITE HOT — pull it out!", color: "#ff7a5a", urgent: true };
    if (st.heat >= band.high - 40) return { text: "Glowing — pull it out", color: "#ffd166", urgent: true };
    return { text: "Heating…", color: "#f4dca0" };
  }
  if (st.scale) return { text: "Knock the scale off", color: "#e8e0d0" };
  if (st.heat >= HOT_MIN) return { text: "Too hot to strike — let it cool", color: "#ff7a5a" };
  if (st.heat <= COLD_MAX) return { text: st.work.strikes || st.heat > 60 ? "Too cold — back in the fire" : "Heat the billet in the fire", color: "#a8c0e8" };
  if (st.heat > band.high) return { text: "A touch hot: blows count less", color: "#ffb060" };
  if (st.heat < band.low) return { text: "Cooling — reheat soon", color: "#c8b8a0" };
  return { text: "Strike on the beat!", color: "#ffd166" };
}

function banner(ctx: CanvasRenderingContext2D, st: ForgeState, now: number): void {
  const h = hint(st);
  if (!h) return;
  ctx.font = "bold 9px sans-serif"; ctx.textAlign = "center";
  const w = ctx.measureText(h.text).width + 16;
  const x = 206, y = SCENE.y + 10;
  ctx.globalAlpha = h.urgent ? 0.75 + 0.25 * Math.sin(now / 80) : 0.95;
  ctx.fillStyle = "rgba(20,12,8,0.78)"; rrect(ctx, x - w / 2, y, w, 15, 7); ctx.fill();
  ctx.strokeStyle = h.color; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = h.color; ctx.fillText(h.text, x, y + 10.5);
  ctx.globalAlpha = 1;
}

function gauge(ctx: CanvasRenderingContext2D, st: ForgeState, rising: number, now: number): void {
  const { x, y, w, h } = GAUGE;
  const at = (heat: number) => x + (w * heat) / HEAT_MAX;
  const grad = ctx.createLinearGradient(x, 0, x + w, 0);
  for (const [hh, r, g, b] of STOPS) grad.addColorStop(hh / HEAT_MAX, `rgb(${r},${g},${b})`);
  ctx.fillStyle = "#0e0806"; rrect(ctx, x - 3, y - 3, w + 6, h + 6, 5); ctx.fill();
  ctx.fillStyle = grad; ctx.fillRect(x, y, w, h);
  // Cold and white-hot ends, hatched.
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, at(COLD_MAX) - x, h); ctx.rect(at(HOT_MIN), y, x + w - at(HOT_MIN), h); ctx.clip();
  ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 2;
  for (let i = -h; i < w; i += 6) { ctx.beginPath(); ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h, y); ctx.stroke(); }
  ctx.restore();
  // The piece's sweet band.
  const band = bandOf(st.work.piece);
  const bl = at(band.low), bh = at(band.high);
  ctx.strokeStyle = "#fff6d0"; ctx.lineWidth = 1.5;
  ctx.strokeRect(bl, y - 1, bh - bl, h + 2);
  ctx.fillStyle = "rgba(255,246,208,0.18)"; ctx.fillRect(bl, y, bh - bl, h);
  ctx.font = "bold 7px sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "#a8c0e8";
  ctx.fillText("CRACKS", (x + at(COLD_MAX)) / 2, y + h + 10);
  ctx.fillStyle = "#fff6d0"; ctx.fillText("SWEET", (bl + bh) / 2, y + h + 10);
  ctx.fillStyle = "#ff8a6a"; ctx.fillText("BURNS", (at(HOT_MIN) + x + w) / 2, y + h + 10);
  // The iron's heat now.
  const mx = at(st.heat);
  const inBand = st.heat >= band.low && st.heat <= band.high;
  ctx.fillStyle = st.heat >= HOT_MIN || st.heat <= COLD_MAX ? "#ff6a4a" : inBand ? "#ffd166" : "#f4dca0";
  ctx.beginPath(); ctx.moveTo(mx, y - 1); ctx.lineTo(mx - 5, y - 8); ctx.lineTo(mx + 5, y - 8); ctx.closePath(); ctx.fill();
  ctx.fillRect(mx - 1, y, 2, h);
  if (rising !== 0) {
    ctx.fillStyle = rising > 0 ? "#ff9a50" : "#8ab0e0";
    const ax = mx + (rising > 0 ? 8 : -8), wob = Math.sin(now / 100) * 1.5;
    ctx.beginPath();
    if (rising > 0) { ctx.moveTo(ax + 4 + wob, y - 4.5); ctx.lineTo(ax + wob, y - 8); ctx.lineTo(ax + wob, y - 1); }
    else { ctx.moveTo(ax - 4 - wob, y - 4.5); ctx.lineTo(ax - wob, y - 8); ctx.lineTo(ax - wob, y - 1); }
    ctx.fill();
  }
}

function button(ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, icon: string, label: string, key: string, on: boolean, tone: [string, string, string], glow = false, now = 0): void {
  ctx.save();
  ctx.globalAlpha = on ? 1 : 0.4;
  if (glow && on) { ctx.shadowColor = tone[2]; ctx.shadowBlur = 8 + 4 * Math.sin(now / 120); }
  const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  g.addColorStop(0, tone[0]); g.addColorStop(1, tone[1]);
  ctx.fillStyle = g; rrect(ctx, r.x, r.y, r.w, r.h, 7); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = tone[2]; ctx.lineWidth = 1.5; rrect(ctx, r.x + 0.75, r.y + 0.75, r.w - 1.5, r.h - 1.5, 7); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.12)"; rrect(ctx, r.x + 3, r.y + 2, r.w - 6, Math.min(10, r.h / 3), 5); ctx.fill();
  const tall = r.h > 50;
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#fff6e0";
  if (tall) {
    ctx.font = "20px sans-serif"; ctx.fillText(icon, r.x + r.w / 2, r.y + 24);
    ctx.font = "bold 10px sans-serif"; ctx.fillText(label, r.x + r.w / 2, r.y + 48);
    ctx.font = "7px sans-serif"; ctx.fillStyle = "rgba(255,246,224,0.6)"; ctx.fillText(key, r.x + r.w / 2, r.y + 61);
  } else {
    ctx.font = "bold 9px sans-serif"; ctx.fillText(`${icon} ${label}`, r.x + r.w / 2, r.y + r.h / 2 - 3);
    ctx.font = "7px sans-serif"; ctx.fillStyle = "rgba(255,246,224,0.6)"; ctx.fillText(key, r.x + r.w / 2, r.y + r.h / 2 + 9);
  }
  ctx.restore();
  ctx.textBaseline = "alphabetic";
}

function controls(ctx: CanvasRenderingContext2D, st: ForgeState, now: number): void {
  const inFire = st.place === "fire";
  const band = bandOf(st.work.piece);
  const moveOn = canMove(st, inFire ? "anvil" : "fire");
  const pullNow = inFire && st.moving === 0 && st.heat >= band.high - 40;
  const heatNow = !inFire && st.moving === 0 && !st.scale && st.heat < band.low;
  button(ctx, BUTTONS.move, inFire ? "🫳" : "🔥", inFire ? "PULL OUT" : "TO THE FIRE", "F", moveOn, inFire ? ["#7a5a2a", "#4a3418", "#ffd166"] : ["#9a3a1a", "#5a1e0c", "#ff9a50"], pullNow || heatNow, now);
  const anvil = onAnvil(st) && st.phase === "work" && !st.done;
  button(ctx, BUTTONS.strike, st.scale ? "🧹" : "⚒️", st.scale ? "KNOCK SCALE" : "STRIKE", "SPACE", anvil, st.scale ? ["#5a5a64", "#33333a", "#e8e0d0"] : ["#8a2a1c", "#4a120a", "#ffd166"], anvil && swingOffset(st) <= FORGE_HAMMERS[st.loadout.hammer].window, now);
  const q = FORGE_TONGS[st.loadout.tongs].quenches > 0;
  button(ctx, BUTTONS.quench, "💧", q ? `QUENCH ×${st.quenchesLeft}` : "NO QUENCH", "Q", canQuench(st), ["#2a5a7a", "#16324a", "#8fd0ff"], st.heat >= HOT_MIN && canQuench(st), now);
  button(ctx, BUTTONS.finish, "✋", "HAND IN", "X · half pay", canFinish(st), ["#5a4a2a", "#342a16", "#d8c088"]);
}

// ---------- the prep screen ----------

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, lh: number): void {
  const words = text.split(" ");
  let line = "";
  for (const word of words) {
    const t = line ? `${line} ${word}` : word;
    if (ctx.measureText(t).width > w && line) { ctx.fillText(line, x, y); y += lh; line = word; } else line = t;
  }
  if (line) ctx.fillText(line, x, y);
}

function prep(ctx: CanvasRenderingContext2D, course: ForgeCourse, st: ForgeState, pick: ForgeLoadout, now: number): void {
  ctx.fillStyle = "rgba(16,10,6,0.9)"; ctx.fillRect(0, SCENE.y, VIEW_W, VIEW_H - SCENE.y);
  const labels = { fuel: "FUEL", hammer: "HAMMER", tongs: "TONGS" };
  const defs = { fuel: FORGE_FUELS, hammer: FORGE_HAMMERS, tongs: FORGE_TONGS } as const;
  ROWS.forEach((row, r) => {
    const y = PREP.y + r * PREP.row;
    ctx.fillStyle = "#f4dca0"; ctx.font = "bold 9px sans-serif"; ctx.textAlign = "left";
    ctx.fillText(labels[row], 8, y + 11);
    PREP_CHOICES[row].forEach((key, i) => {
      const d = (defs[row] as Record<string, { name: string; icon: string; blurb: string }>)[key];
      const x = prepCardX(i), cy = y + PREP.cardY;
      const on = pick[row] === key;
      ctx.save();
      if (on) { ctx.shadowColor = "rgba(255,190,80,0.8)"; ctx.shadowBlur = 8; }
      const g = ctx.createLinearGradient(0, cy, 0, cy + PREP.cardH);
      g.addColorStop(0, on ? "#7a4a1e" : "#3a2818"); g.addColorStop(1, on ? "#4a2a10" : "#24180e");
      ctx.fillStyle = g; rrect(ctx, x, cy, PREP.cardW, PREP.cardH, 6); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = on ? "#ffd166" : "#6a4a2a"; ctx.lineWidth = on ? 2 : 1; rrect(ctx, x + 0.5, cy + 0.5, PREP.cardW - 1, PREP.cardH - 1, 6); ctx.stroke();
      ctx.restore();
      ctx.font = "15px sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(d.icon, x + 5, cy + 13);
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = on ? "#fff6e0" : "#e0ccaa"; ctx.font = "bold 8px sans-serif";
      wrap(ctx, d.name, x + 24, cy + 11, PREP.cardW - 28, 9);
      ctx.fillStyle = on ? "#ffd8a0" : "#a89070"; ctx.font = "7px sans-serif";
      wrap(ctx, d.blurb, x + 5, cy + 33, PREP.cardW - 10, 8.5);
      if (on) { ctx.fillStyle = "#ffd166"; ctx.font = "bold 9px sans-serif"; ctx.textAlign = "right"; ctx.fillText("✓", x + PREP.cardW - 5, cy + PREP.cardH - 5); }
    });
  });
  // Today's fire, segment by segment.
  const fy = PREP.y + 3 * PREP.row + 2;
  ctx.fillStyle = "#f4dca0"; ctx.font = "bold 8px sans-serif"; ctx.textAlign = "left";
  ctx.fillText("TODAY'S FIRE", 8, fy + 8);
  const sw = (VIEW_W - 90) / course.fire.length;
  course.fire.forEach((s, i) => {
    const c = heatRgb(s === 5 ? 620 : s === 4 ? 480 : 320);
    ctx.fillStyle = rgb(c);
    const hh = 4 + (s - 2) * 3;
    ctx.fillRect(80 + i * sw, fy + 10 - hh, sw - 1.5, hh);
  });
  ctx.fillStyle = "#a89070"; ctx.font = "7px sans-serif"; ctx.textAlign = "right";
  ctx.fillText("taller = hotter", VIEW_W - 8, fy + 20);
  // Light the forge.
  const left = Math.max(0, PREP_TICKS - st.tick);
  const r = PREP.light;
  ctx.save();
  ctx.shadowColor = "rgba(255,120,40,0.9)"; ctx.shadowBlur = 10 + 5 * Math.sin(now / 160);
  const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  g.addColorStop(0, "#d8601e"); g.addColorStop(1, "#8a2a0c");
  ctx.fillStyle = g; rrect(ctx, r.x, r.y, r.w, r.h, 10); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "#ffd166"; ctx.lineWidth = 2; rrect(ctx, r.x + 1, r.y + 1, r.w - 2, r.h - 2, 10); ctx.stroke();
  ctx.fillStyle = "#fff6e0"; ctx.textAlign = "center"; ctx.font = "bold 16px sans-serif";
  ctx.fillText("🔥 LIGHT THE FORGE", VIEW_W / 2, r.y + 30);
  ctx.font = "9px sans-serif"; ctx.fillStyle = "rgba(255,246,224,0.8)";
  ctx.fillText(`tap or press space · lights itself in ${Math.ceil(left / TICKS_PER_SEC)}s`, VIEW_W / 2, r.y + 50);
}

/** One frame. `pick` is the loadout being chosen (the prep screen); `frac` how far into the next tick. */
export function drawForge(
  ctx: CanvasRenderingContext2D, course: ForgeCourse, st: ForgeState, now: number,
  view: { frac: number; pick: ForgeLoadout; slamAt: number; rising: number; particles: ForgeParticle[] },
): void {
  ctx.drawImage(roomCanvas(), 0, 0, VIEW_W, VIEW_H);
  const lit = st.phase !== "prep";
  const strength = fireAt(course, st);
  fire(ctx, strength, lit, now);
  // Embers drift up from the coals.
  if (lit && Math.random() < 0.08 * strength) {
    view.particles.push({ kind: "ember", x: FORGE.x + 24 + Math.random() * (FORGE.w - 48), y: FORGE.top - 14, vx: (Math.random() - 0.5) * 10, vy: -20 - Math.random() * 25 * (strength / 4), born: now, life: 900 + Math.random() * 800, size: 1 + Math.random(), color: "#ffb040" });
  }
  // The water in the barrel.
  ctx.fillStyle = "#2a5a7a"; ctx.beginPath(); ctx.ellipse(BARREL.x + BARREL.w / 2, BARREL.y + 1, BARREL.w / 2 - 3, 2.6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = `rgba(160,220,255,${0.35 + 0.2 * Math.sin(now / 400)})`; ctx.fillRect(BARREL.x + 10 + 3 * Math.sin(now / 500), BARREL.y, 8, 1);

  if (lit) {
    // Where the billet is: in the coals, on the anvil, or on its way.
    const tg = FORGE_TONGS[st.loadout.tongs];
    const toFire = st.place === "fire";
    const t = st.moving > 0 ? 1 - Math.max(0, st.moving - view.frac) / tg.moveTicks : 1;
    const from = toFire ? ANVIL_SPOT : FIRE_SPOT, to = toFire ? FIRE_SPOT : ANVIL_SPOT;
    const ease = t * t * (3 - 2 * t);
    const bx = from.x + (to.x - from.x) * ease, by = from.y + (to.y - from.y) * ease - Math.sin(Math.PI * ease) * 28;
    const def = FORGE_PIECES[st.work.piece];
    const need = course.commissions[Math.min(st.commission, course.commissions.length - 1)];
    if (!st.done) {
      billet(ctx, bx, by, def, st.work.quality / need.quality, st.heat, st.scale, now);
      if (st.place === "fire" || st.moving > 0) tongs(ctx, bx, by, st.loadout.tongs === "long");
      if (st.place === "fire" && st.moving === 0) {
        // The coals in front of the billet: it sits in the fire.
        for (let i = 0; i < 6; i++) {
          const cx = FIRE_SPOT.x - 18 + i * 7, pulse = 0.6 + 0.4 * Math.sin(now / (140 + i * 31) + i);
          ctx.fillStyle = rgb(heatRgb(420 + 220 * pulse * (strength / 4)));
          ctx.beginPath(); ctx.arc(cx, FIRE_SPOT.y + 5, 3, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    beatRing(ctx, st, view.frac, now);
    hammer(ctx, st, view.frac, view.slamAt, now);
  } else {
    hammer(ctx, st, 0, -1e9, now);
  }
  drawParticles(ctx, view.particles, now);
  board(ctx, course, st, now);
  if (!lit) { prep(ctx, course, st, view.pick, now); return; }
  banner(ctx, st, now);
  gauge(ctx, st, view.rising, now);
  controls(ctx, st, now);
}

// ---------- particles and words ----------

/** A burst of sparks, flakes, steam or smoke. */
export function burst(particles: ForgeParticle[], kind: ForgeParticle["kind"], x: number, y: number, n: number, now: number): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    if (kind === "spark") {
      const sp = 60 + Math.random() * 140;
      particles.push({ kind, x, y, vx: Math.cos(a) * sp, vy: -Math.abs(Math.sin(a)) * sp - 30, born: now, life: 300 + Math.random() * 400, size: 1 + Math.random() * 1.2, color: Math.random() < 0.3 ? "#fff6c0" : "#ffb040" });
    } else if (kind === "flake") {
      particles.push({ kind, x: x + (Math.random() - 0.5) * 24, y, vx: (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 60, born: now, life: 600 + Math.random() * 300, size: 1.5 + Math.random() * 1.5, color: Math.random() < 0.5 ? "#5a5048" : "#8a8070" });
    } else if (kind === "steam") {
      particles.push({ kind, x: x + (Math.random() - 0.5) * 22, y, vx: (Math.random() - 0.5) * 16, vy: -25 - Math.random() * 30, born: now, life: 900 + Math.random() * 600, size: 4 + Math.random() * 4, color: "#e8f4ff" });
    } else {
      particles.push({ kind, x: x + (Math.random() - 0.5) * 18, y, vx: (Math.random() - 0.5) * 20, vy: -18 - Math.random() * 22, born: now, life: 1000 + Math.random() * 700, size: 4 + Math.random() * 5, color: "#3a3430" });
    }
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: ForgeParticle[], now: number): void {
  for (let i = particles.length - 1; i >= 0; i--) if (now - particles[i].born > particles[i].life) particles.splice(i, 1);
  for (const p of particles) {
    const t = (now - p.born) / 1000, age = (now - p.born) / p.life;
    const grav = p.kind === "spark" ? 260 : p.kind === "flake" ? 300 : p.kind === "ember" ? -6 : -8;
    const x = p.x + p.vx * t + (p.kind === "ember" ? Math.sin(now / 200 + p.born) * 3 : 0);
    const y = p.y + p.vy * t + 0.5 * grav * t * t;
    if (p.kind === "steam" || p.kind === "smoke") {
      ctx.fillStyle = p.color; ctx.globalAlpha = (1 - age) * (p.kind === "steam" ? 0.45 : 0.6);
      ctx.beginPath(); ctx.arc(x, y, p.size * (1 + age * 1.5), 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.globalAlpha = 1 - age;
      ctx.fillStyle = p.color;
      if (p.kind === "spark") {
        // A short streak along its path.
        const vx = p.vx, vy = p.vy + grav * t;
        const len = 0.018;
        ctx.strokeStyle = p.color; ctx.lineWidth = p.size;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - vx * len, y - vy * len); ctx.stroke();
      } else ctx.fillRect(x - p.size / 2, y - p.size / 2, p.size, p.size);
    }
  }
  ctx.globalAlpha = 1;
}

/** Little words where things happen ("perfect!", "+12"), drawn over everything for a moment. */
export function drawFx(ctx: CanvasRenderingContext2D, fx: readonly ForgeFx[], now: number): void {
  ctx.textAlign = "center";
  for (const f of fx) {
    const age = (now - f.at) / 1200;
    if (age > 1 || age < 0) continue;
    const pop = age < 0.12 ? 0.6 + (age / 0.12) * 0.5 : 1.1 - Math.min(0.1, (age - 0.12));
    ctx.font = `bold ${Math.round((f.big ? 15 : 11) * pop)}px sans-serif`;
    ctx.globalAlpha = age < 0.7 ? 1 : 1 - (age - 0.7) / 0.3;
    ctx.strokeStyle = "rgba(20,12,8,0.9)"; ctx.lineWidth = 3; ctx.lineJoin = "round";
    ctx.strokeText(f.text, f.x, f.y - age * 26);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y - age * 26);
  }
  ctx.globalAlpha = 1;
}
