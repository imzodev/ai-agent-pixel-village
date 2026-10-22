// Drawing Harvest Haul (the game: src/lib/haul/sim.ts) on a 2D canvas: sky,
// hills, the road, the market, the cart and its pony, the load, and the next
// item hanging where it'll drop. Sprites from public/assets/haul.png
// (scripts/draw-haul.mjs, frames in src/lib/haul/sheet.json). Drawing is only
// for show (it may use angles); it never feeds back into the simulation.

import SHEET from "@/lib/haul/sheet.json";
import { BED_HH, HAUL_ITEMS, RIDE_H, WHEEL_X } from "@/lib/haul/rules";
import { START_X, marketX, roadAt } from "@/lib/haul/course";
import { CART_PARTS, canDrop, holdPoint } from "@/lib/haul/sim";
import type { HaulCamera, HaulCourse, HaulFx, HaulPose, HaulState } from "@/types/haul";

/** The view, in game units (the canvas is scaled to fit it). */
export const VIEW_W = 300;
export const VIEW_H = 420;

const frames = SHEET.frames as Record<string, number[]>;

export function loadHaulSheet(): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = "/assets/haul.png";
  });
}

/** Draw a frame centred at (x, y), turned by the unit pair (c, s), at its game size. */
function sprite(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, name: string, x: number, y: number, c = 1, s = 0, ox = 0.5, oy = 0.5): void {
  const f = frames[name];
  if (!f || !img) return;
  const w = f[2] / SHEET.scale, h = f[3] / SHEET.scale;
  ctx.save();
  ctx.translate(x, y);
  ctx.transform(c, s, -s, c, 0, 0);
  ctx.drawImage(img, f[0], f[1], f[2], f[3], -w * ox, -h * oy, w, h);
  ctx.restore();
}

/** Where the camera wants to be: following the cart (and keeping the next drop in view while loading). */
export function cameraTarget(st: HaulState, course: HaulCourse, aimX: number, aimR: number): HaulCamera {
  const bed = st.bodies[0];
  const driving = st.phase === "drive" || st.phase === "arrive" || st.phase === "done";
  let y = bed.y - VIEW_H * (driving ? 0.66 : 0.74);
  if (!driving) {
    const hold = holdPoint(st, course, aimX, aimR);
    y = Math.min(y, hold.y - 60);
  }
  return { x: bed.x + (driving ? 55 : 0) - VIEW_W / 2, y };
}

function backdrop(ctx: CanvasRenderingContext2D, cam: HaulCamera): void {
  const g = ctx.createLinearGradient(0, cam.y, 0, cam.y + VIEW_H);
  g.addColorStop(0, "#7ec8f0"); g.addColorStop(1, "#d8f0ff");
  ctx.fillStyle = g;
  ctx.fillRect(cam.x, cam.y, VIEW_W, VIEW_H);
  // Hills, slower than the road (parallax).
  for (const [k, color, base, amp, wave] of [[0.25, "#a8d890", 60, 30, 140], [0.5, "#86c070", 25, 22, 90]] as const) {
    ctx.fillStyle = color;
    ctx.beginPath();
    const off = cam.x * k;
    ctx.moveTo(cam.x, cam.y + VIEW_H);
    for (let sx = 0; sx <= VIEW_W; sx += 6) {
      const wx = sx + off;
      ctx.lineTo(cam.x + sx, cam.y + VIEW_H * 0.55 + base - amp * (0.5 + 0.5 * Math.sin(wx / wave)) - 10 * Math.sin(wx / (wave * 0.37)));
    }
    ctx.lineTo(cam.x + VIEW_W, cam.y + VIEW_H);
    ctx.fill();
  }
}

function road(ctx: CanvasRenderingContext2D, course: HaulCourse, cam: HaulCamera): void {
  const x0 = Math.floor(cam.x / 10) * 10 - 10, x1 = cam.x + VIEW_W + 10;
  ctx.beginPath();
  ctx.moveTo(x0, cam.y + VIEW_H + 10);
  for (let x = x0; x <= x1; x += 10) ctx.lineTo(x, roadAt(course.road, x));
  ctx.lineTo(x1, cam.y + VIEW_H + 10);
  ctx.closePath();
  ctx.fillStyle = "#9a7348";
  ctx.fill();
  ctx.strokeStyle = "#6a4a2a"; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = x0; x <= x1; x += 10) { const y = roadAt(course.road, x); if (x === x0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
  ctx.stroke();
  // Grass along the verge, and pebbles.
  ctx.fillStyle = "#5aa040";
  for (let x = Math.floor(x0 / 7) * 7; x <= x1; x += 7) ctx.fillRect(x, roadAt(course.road, x) - 3, 2, 3);
  ctx.fillStyle = "#7a5a38";
  for (let x = Math.floor(x0 / 23) * 23; x <= x1; x += 23) ctx.fillRect(x + 5, roadAt(course.road, x) + 8 + (x % 3) * 4, 3, 2);
}

/** Landmarks: the ranch's sign where you load, the market at the end. */
function landmarks(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, course: HaulCourse): void {
  const sx = START_X - 110, sy = roadAt(course.road, sx);
  ctx.fillStyle = "#6e4426"; ctx.fillRect(sx - 2, sy - 34, 4, 34);
  ctx.fillStyle = "#b8804a"; ctx.fillRect(sx - 26, sy - 40, 52, 14);
  ctx.fillStyle = "#3a2a1e"; ctx.font = "bold 7px sans-serif"; ctx.textAlign = "center"; ctx.fillText("VILLAGE RANCH", sx, sy - 30);
  const mx = marketX(course.road) + 120, my = roadAt(course.road, mx);
  sprite(ctx, img, "stall", mx, my, 1, 0, 0.5, 1);
  ctx.fillStyle = "#3a2a1e"; ctx.font = "bold 8px sans-serif"; ctx.fillText("MARKET", mx, my - 41);
}

/** One frame. `aim` is the next drop (x on the cart, quarter turns), or null. */
export function drawHaul(
  ctx: CanvasRenderingContext2D, course: HaulCourse, st: HaulState, prev: Map<number, HaulPose> | null,
  alpha: number, img: HTMLImageElement | null, cam: HaulCamera, aim: { x: number; r: number } | null, now: number,
): void {
  backdrop(ctx, cam);
  road(ctx, course, cam);
  landmarks(ctx, img, course);

  const pose = (b: HaulState["bodies"][number]) => {
    const p = prev?.get(b.id);
    if (!p) return b;
    const c = p.c + (b.c - p.c) * alpha, s = p.s + (b.s - p.s) * alpha, len = Math.hypot(c, s) || 1;
    return { x: p.x + (b.x - p.x) * alpha, y: p.y + (b.y - p.y) * alpha, c: c / len, s: s / len };
  };
  const bed = pose(st.bodies[0]);

  // The pony walks the road ahead of the cart.
  const px = bed.x + BED_HH + 112, py = roadAt(course.road, px);
  const trot = st.phase === "drive" && st.speed > 1 ? Math.sin(now / 90) * 1.5 : 0;
  sprite(ctx, img, "pony", px, py + trot, 1, 0, 0.5, 1);
  ctx.strokeStyle = "#4a2c18"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(bed.x + 74 * bed.c, bed.y + 74 * bed.s); ctx.lineTo(px - 14, py - 20 + trot); ctx.stroke();

  // The load, behind the cart's sides.
  for (let i = CART_PARTS; i < st.bodies.length; i++) {
    const b = st.bodies[i], p = pose(b);
    const key = course.items[b.item];
    const broken = st.broken[b.item] && frames[`${key}_broken`];
    sprite(ctx, img, broken ? `${key}_broken` : key, p.x, p.y, p.c, p.s);
  }

  // The cart and its wheels (they turn with the distance).
  sprite(ctx, img, "cart", bed.x, bed.y, bed.c, bed.s, 0.5, 23 / 28);
  const turn = (st.dist - START_X) / 12;
  for (const side of [-1, 1]) {
    const lx = side * WHEEL_X, ly = BED_HH + RIDE_H - 12;
    const wx = bed.x + bed.c * lx - bed.s * ly, wy = bed.y + bed.s * lx + bed.c * ly;
    sprite(ctx, img, "wheel", wx, wy, Math.cos(turn), Math.sin(turn));
  }

  // The next item, hanging where it'll drop, and a line down to where it lands.
  if (aim && canDrop(st, course)) {
    const at = holdPoint(st, course, aim.x, aim.r);
    const key = course.items[st.next];
    const [c, s] = [[1, 0], [0, 1], [-1, 0], [0, -1]][aim.r % 4];
    ctx.globalAlpha = 0.9;
    sprite(ctx, img, key, at.x, at.y, c, s);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(at.x, at.y + 12); ctx.lineTo(at.x, bed.y - BED_HH); ctx.stroke();
    ctx.setLineDash([]);
    const shape = HAUL_ITEMS[key].shape;
    ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.font = "bold 8px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(HAUL_ITEMS[key].name, at.x, at.y - (shape.kind === "circle" ? shape.r : Math.max(shape.hw, shape.hh)) - 6);
  }
}

/** Little words where things happen ("crack!", "+1"), drawn over everything for a moment. */
export function drawFx(ctx: CanvasRenderingContext2D, fx: readonly HaulFx[], now: number): void {
  ctx.textAlign = "center";
  ctx.font = "bold 10px sans-serif";
  for (const f of fx) {
    const age = (now - f.at) / 900;
    if (age > 1) continue;
    ctx.globalAlpha = 1 - age;
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y - 18 - age * 16);
  }
  ctx.globalAlpha = 1;
}
