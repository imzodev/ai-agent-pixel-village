// Drawing Beehive Builder (the game: src/lib/hive/sim.ts) on a 2D canvas: the
// honeycomb (old comb darker, flowers and the royal jelly on their cells), lines
// flashing gold as they turn to honey, the tray of three pieces, and the piece
// being placed as a ghost (green where it fits, red where it doesn't). Drawn in
// code, no sheet; only for show. Also turns a point into a cell and back.

import { CELLS, cellIndex } from "@/lib/hive/board";
import { PIECES, TRAY } from "@/lib/hive/rules";
import { trayPiece } from "@/lib/hive/sim";
import type { HiveCell, HiveCourse, HiveFx, HiveShapeDef, HiveState } from "@/types/hive";

export const VIEW_W = 300;
export const VIEW_H = 420;

/** The comb: hex size (centre to corner, pointy-top) and its middle. */
const S = 21;
const MID = { x: 150, y: 152 };
const SQ3 = Math.sqrt(3);
/** The tray: three slots along the bottom. */
const TRAY_Y = 300, TRAY_H = 112, SLOT_W = 96;
const slotX = (i: number) => 6 + i * (SLOT_W + 3);
const TRAY_S = 10;

/** A cell's centre on the comb (or at another size, about another middle). */
export function cellCentre(q: number, r: number, size = S, mid = MID): { x: number; y: number } {
  return { x: mid.x + size * SQ3 * (q + r / 2), y: mid.y + size * 1.5 * r };
}

/** The cell under a point (cube rounding), or null off the comb. */
export function hexAt(x: number, y: number): HiveCell | null {
  const px = x - MID.x, py = y - MID.y;
  const fq = ((SQ3 / 3) * px - py / 3) / S, fr = ((2 / 3) * py) / S, fs = -fq - fr;
  let q = Math.round(fq), r = Math.round(fr);
  const s = Math.round(fs);
  const dq = Math.abs(q - fq), dr = Math.abs(r - fr), ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return cellIndex(q, r) >= 0 ? [q, r] : null;
}

/** The tray slot under a point, or null. */
export function slotAt(x: number, y: number): number | null {
  if (y < TRAY_Y || y > TRAY_Y + TRAY_H) return null;
  for (let i = 0; i < TRAY; i++) if (x >= slotX(i) && x <= slotX(i) + SLOT_W) return i;
  return null;
}

/** A piece's middle, in comb pixels from its anchor (so a dragged piece sits under the finger by its middle). */
export function pieceMiddle(shape: HiveShapeDef): { x: number; y: number } {
  let x = 0, y = 0;
  for (const [q, r] of shape.cells) { const p = cellCentre(q, r, S, { x: 0, y: 0 }); x += p.x; y += p.y; }
  return { x: x / shape.cells.length, y: y / shape.cells.length };
}

function hex(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 3) * k - Math.PI / 6;
    const hx = x + size * Math.cos(a), hy = y + size * Math.sin(a);
    if (k) ctx.lineTo(hx, hy); else ctx.moveTo(hx, hy);
  }
  ctx.closePath();
}

const has = (cells: readonly HiveCell[], q: number, r: number) => cells.some(([a, b]) => a === q && b === r);

/** One frame. `ghost`: the piece being placed and where (and whether it fits); `flash`: cells turning to honey, and when. */
export function drawHive(
  ctx: CanvasRenderingContext2D, course: HiveCourse, st: HiveState, now: number,
  opts: { ghost: { slot: number; q: number; r: number; ok: boolean } | null; held: number | null; flash: { cells: number[]; at: number }[] },
): void {
  // The meadow behind.
  ctx.fillStyle = "#6a9a3a"; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = "#5a8a30";
  for (let y = 4; y < VIEW_H; y += 11) for (let x = (y * 5) % 9; x < VIEW_W; x += 14) ctx.fillRect(x, y, 2, 2);
  // The comb's wooden frame: a larger hex under every cell.
  ctx.fillStyle = "#7a5020";
  for (const [q, r] of CELLS) { const { x, y } = cellCentre(q, r); hex(ctx, x, y, S + 4); ctx.fill(); }

  const ghostCells = new Set<number>();
  if (opts.ghost) {
    const shape = trayPiece(st, course, opts.ghost.slot);
    if (shape) for (const [dq, dr] of shape.cells) { const i = cellIndex(opts.ghost.q + dq, opts.ghost.r + dr); if (i >= 0) ghostCells.add(i); }
  }
  CELLS.forEach(([q, r], i) => {
    const { x, y } = cellCentre(q, r);
    const old = has(course.comb, q, r);
    hex(ctx, x, y, S - 1.5);
    ctx.fillStyle = st.filled[i] ? (old ? "#c07a20" : "#e8a830") : "#f6dca0";
    ctx.fill();
    ctx.strokeStyle = "#a06a20"; ctx.lineWidth = 1.5; ctx.stroke();
    if (st.filled[i]) { ctx.fillStyle = "rgba(255,240,180,0.35)"; hex(ctx, x - 3, y - 3, S * 0.45); ctx.fill(); }
    if (has(course.flowers, q, r)) { ctx.font = "13px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("🌼", x, y + 1); ctx.textBaseline = "alphabetic"; }
    if (course.jelly && !st.jellyTaken && course.jelly[0] === q && course.jelly[1] === r) {
      ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.4 * Math.sin(now / 250)})`; ctx.lineWidth = 3; hex(ctx, x, y, S - 4); ctx.stroke();
    }
    if (ghostCells.has(i) && opts.ghost) {
      hex(ctx, x, y, S - 3);
      ctx.fillStyle = opts.ghost.ok ? "rgba(90,200,90,0.55)" : "rgba(232,72,88,0.5)";
      ctx.fill();
    }
  });
  // Lines turning to honey: a gold flash that fades.
  for (const f of opts.flash) {
    const age = (now - f.at) / 600;
    if (age > 1) continue;
    ctx.fillStyle = `rgba(255,220,90,${0.85 * (1 - age)})`;
    for (const i of f.cells) { const { x, y } = cellCentre(CELLS[i][0], CELLS[i][1]); hex(ctx, x, y, S * (1 + age * 0.2)); ctx.fill(); }
  }

  // The tray.
  ctx.fillStyle = "rgba(60,40,20,0.55)"; ctx.fillRect(0, TRAY_Y - 6, VIEW_W, TRAY_H + 12);
  for (let s = 0; s < TRAY; s++) {
    const x = slotX(s), shape = trayPiece(st, course, s), held = opts.held === s;
    ctx.fillStyle = held ? "#fff0b0" : "#f6e6c0";
    ctx.globalAlpha = shape ? 1 : 0.35;
    ctx.fillRect(x, TRAY_Y, SLOT_W, TRAY_H);
    ctx.strokeStyle = held ? "#e8a020" : "#8a6a48"; ctx.lineWidth = held ? 3 : 1; ctx.strokeRect(x + 0.5, TRAY_Y + 0.5, SLOT_W - 1, TRAY_H - 1);
    if (shape) {
      const m = pieceMiddle(shape), k = TRAY_S / S;
      for (const [q, r] of shape.cells) {
        const c = cellCentre(q, r, TRAY_S, { x: x + SLOT_W / 2 - m.x * k, y: TRAY_Y + TRAY_H / 2 - m.y * k });
        hex(ctx, c.x, c.y, TRAY_S - 1); ctx.fillStyle = "#e8a830"; ctx.fill(); ctx.strokeStyle = "#a06a20"; ctx.lineWidth = 1; ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
  // How many trays are left.
  const left = Math.max(0, Math.ceil((PIECES - st.trayAt - TRAY) / TRAY));
  ctx.fillStyle = "#fff6d0"; ctx.font = "bold 8px sans-serif"; ctx.textAlign = "right";
  ctx.fillText(left ? `${left} more tray${left === 1 ? "" : "s"}` : "last tray", VIEW_W - 8, TRAY_Y - 10);
}

/** The piece being dragged, drawn with its middle at (x, y) (over everything). */
export function drawHeld(ctx: CanvasRenderingContext2D, shape: HiveShapeDef, x: number, y: number, alpha = 0.75): void {
  const m = pieceMiddle(shape);
  ctx.globalAlpha = alpha;
  for (const [q, r] of shape.cells) {
    const c = cellCentre(q, r, S, { x: x - m.x, y: y - m.y });
    hex(ctx, c.x, c.y, S - 2); ctx.fillStyle = "#e8a830"; ctx.fill(); ctx.strokeStyle = "#7a5020"; ctx.lineWidth = 1.5; ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Little words where things happen ("+140 ×2!"), drawn over everything for a moment. */
export function drawFx(ctx: CanvasRenderingContext2D, fx: readonly HiveFx[], now: number): void {
  ctx.textAlign = "center";
  ctx.font = "bold 14px sans-serif";
  for (const f of fx) {
    const age = (now - f.at) / 1300;
    if (age > 1) continue;
    ctx.globalAlpha = 1 - age;
    ctx.strokeStyle = "rgba(40,24,8,0.85)"; ctx.lineWidth = 3;
    ctx.strokeText(f.text, f.x, f.y - age * 24);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y - age * 24);
  }
  ctx.globalAlpha = 1;
}

