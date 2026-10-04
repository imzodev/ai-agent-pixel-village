// The riding pose: a character on a bicycle, pedalling. Built from the
// character's own composed LPC sheet (head and torso, cut at the waist)
// plus a bike, legs and an arm drawn here pixel by pixel, at the sprite's
// own scale. Layers interleave so it reads as riding, not standing behind
// a bike: far leg → bike → body → near leg and arm. Four frames per
// direction; the cranks, feet and wheel spokes turn together.
// Pure buffer code (no DOM), so it can be previewed off-line; the scene
// wraps it in a canvas (src/game/WorldScene.ts).

import { FRAME, ROWS } from "./lpc";
import type { PixelBuf, Rgb, RiderColors } from "@/types/game";
import type { Facing } from "@/types/world";

export const RIDE_FRAMES = 4;

const OUTLINE: Rgb = [28, 20, 32];
const TIRE: Rgb = [34, 34, 40];
const TIRE_HI: Rgb = [70, 70, 80];
const RIM: Rgb = [178, 184, 196];
const SPOKE: Rgb = [150, 156, 168];
const HUB: Rgb = [220, 224, 232];
const FRAME_C: Rgb = [196, 58, 44];
const FRAME_HI: Rgb = [236, 104, 84];
const FRAME_LO: Rgb = [132, 36, 30];
const STEEL: Rgb = [92, 96, 108];
const STEEL_HI: Rgb = [150, 156, 168];
const SADDLE: Rgb = [58, 40, 28];
const GRIP: Rgb = [30, 26, 30];
const LAMP: Rgb = [255, 236, 150];
const TAIL: Rgb = [235, 50, 50];

export const newBuf = (w: number, h: number): PixelBuf => ({ w, h, d: new Uint8ClampedArray(w * h * 4) });

function put(b: PixelBuf, x: number, y: number, c: Rgb, a = 255): void {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return;
  const o = (y * b.w + x) * 4;
  b.d[o] = c[0]; b.d[o + 1] = c[1]; b.d[o + 2] = c[2]; b.d[o + 3] = a;
}
const get = (b: PixelBuf, x: number, y: number): Rgb | null => {
  const o = (y * b.w + x) * 4;
  return b.d[o + 3] ? [b.d[o], b.d[o + 1], b.d[o + 2]] : null;
};
const shade = (c: Rgb, k: number): Rgb => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];

/** A line `w` px thick (a square brush along a Bresenham path). */
function line(b: PixelBuf, x0: number, y0: number, x1: number, y1: number, c: Rgb, w = 1): void {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  const r0 = -Math.floor((w - 1) / 2), r1 = Math.ceil((w - 1) / 2);
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
    for (let dy = r0; dy <= r1; dy++) for (let dx = r0; dx <= r1; dx++) put(b, x + dx, y + dy, c);
  }
}
/** An outlined limb or tube: the outline one px wider all round. */
function limb(b: PixelBuf, x0: number, y0: number, x1: number, y1: number, c: Rgb, w: number, outline: Rgb = OUTLINE): void {
  line(b, x0, y0, x1, y1, outline, w + 2);
  line(b, x0, y0, x1, y1, c, w);
}
function ring(b: PixelBuf, cx: number, cy: number, r: number, c: Rgb): void {
  for (let a = 0; a < 360; a += 3) put(b, cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180), c);
}
function disc(b: PixelBuf, cx: number, cy: number, r: number, c: Rgb): void {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) put(b, x, y, c);
}

/** A wheel seen side-on, its spokes turned by `turn` (0–1). */
function wheel(b: PixelBuf, cx: number, cy: number, turn: number): void {
  for (const r of [7.4, 6.6]) ring(b, cx, cy, r, TIRE);
  ring(b, cx, cy, 5.8, RIM);
  // Tread highlight on top of the tyre.
  for (let a = 220; a <= 320; a += 6) put(b, cx + 7 * Math.cos((a * Math.PI) / 180), cy + 7 * Math.sin((a * Math.PI) / 180), TIRE_HI);
  for (let k = 0; k < 4; k++) {
    const a = turn * (Math.PI / 2) + (k * Math.PI) / 4;
    line(b, cx + Math.cos(a) * 1.5, cy + Math.sin(a) * 1.5, cx + Math.cos(a) * 5.2, cy + Math.sin(a) * 5.2, SPOKE);
    line(b, cx - Math.cos(a) * 1.5, cy - Math.sin(a) * 1.5, cx - Math.cos(a) * 5.2, cy - Math.sin(a) * 5.2, SPOKE);
  }
  disc(b, cx, cy, 1.2, HUB);
}

/** Where the knee goes for a hip→foot reach (two-bone, bending forward). */
function knee(hx: number, hy: number, fx: number, fy: number, thigh: number, shin: number): [number, number] {
  const dx = fx - hx, dy = fy - hy;
  const d = Math.min(thigh + shin - 0.01, Math.max(Math.abs(thigh - shin) + 0.01, Math.hypot(dx, dy)));
  const base = Math.atan2(dy, dx);
  const bend = Math.acos((thigh * thigh + d * d - shin * shin) / (2 * thigh * d));
  const k1: [number, number] = [hx + thigh * Math.cos(base - bend), hy + thigh * Math.sin(base - bend)];
  const k2: [number, number] = [hx + thigh * Math.cos(base + bend), hy + thigh * Math.sin(base + bend)];
  return k1[0] >= k2[0] ? k1 : k2; // knees point forward (+x)
}

function legSide(b: PixelBuf, hip: [number, number], foot: [number, number], pants: Rgb, shoes: Rgb): void {
  const k = knee(hip[0], hip[1], foot[0], foot[1], 5.5, 6);
  limb(b, hip[0], hip[1], k[0], k[1], pants, 3);
  limb(b, k[0], k[1], foot[0], foot[1] - 1, pants, 3);
  // Shoe on the pedal, toe forward.
  line(b, foot[0] - 1, foot[1] + 1, foot[0] + 3, foot[1] + 1, OUTLINE, 1);
  line(b, foot[0] - 2, foot[1] - 1, foot[0] + 2, foot[1] - 1, OUTLINE, 1);
  line(b, foot[0] - 1, foot[1], foot[0] + 2, foot[1], shoes, 1);
  put(b, foot[0] - 2, foot[1], OUTLINE); put(b, foot[0] + 3, foot[1], OUTLINE);
}

// Side view (facing right), in frame pixels. Wheels sit on the ground line.
const REAR = [18, 55] as const, FRONT = [46, 55] as const, CRANK = [31, 56] as const;
const SEAT = [27, 46] as const, HEAD = [43, 46] as const, GRIP_AT = [41, 43] as const;
const CRANK_LEN = 3;

/** The far leg (behind the bike) for frame `f`. */
function sideFar(b: PixelBuf, f: number, col: RiderColors): void {
  const a = (f / RIDE_FRAMES) * Math.PI * 2 + Math.PI;
  const pedal: [number, number] = [CRANK[0] + CRANK_LEN * Math.cos(a), CRANK[1] + CRANK_LEN * Math.sin(a)];
  limb(b, CRANK[0], CRANK[1], pedal[0], pedal[1], STEEL, 1);
  legSide(b, [SEAT[0] + 1, SEAT[1]], pedal, shade(col.pants, 0.8), shade(col.shoes, 0.8));
}

function sideBike(b: PixelBuf, f: number): void {
  const turn = f / RIDE_FRAMES;
  wheel(b, REAR[0], REAR[1], turn);
  wheel(b, FRONT[0], FRONT[1], turn);
  // Chain and chainring.
  line(b, CRANK[0], CRANK[1] - 2, REAR[0], REAR[1] - 1, STEEL);
  line(b, CRANK[0], CRANK[1] + 2, REAR[0], REAR[1] + 1, STEEL);
  ring(b, CRANK[0], CRANK[1], 2.2, STEEL_HI);
  // Frame: stays, seat tube, top and down tubes (outlined, lit from above).
  const tube = (x0: number, y0: number, x1: number, y1: number) => { limb(b, x0, y0, x1, y1, FRAME_C, 2); line(b, x0, y0 - 1, x1, y1 - 1, FRAME_HI); };
  limb(b, REAR[0], REAR[1], CRANK[0], CRANK[1], FRAME_LO, 1);
  limb(b, REAR[0], REAR[1], SEAT[0] + 1, SEAT[1] + 3, FRAME_LO, 1);
  tube(SEAT[0], SEAT[1] + 1, CRANK[0], CRANK[1]);
  tube(SEAT[0] + 1, SEAT[1] + 3, HEAD[0], HEAD[1] + 2);
  tube(HEAD[0], HEAD[1] + 3, CRANK[0] + 1, CRANK[1] - 1);
  // Fork and head tube, then stem and bars.
  limb(b, HEAD[0], HEAD[1], FRONT[0], FRONT[1], STEEL, 1);
  limb(b, HEAD[0], HEAD[1] - 1, HEAD[0] - 0.5, GRIP_AT[1] + 1, STEEL, 1);
  limb(b, HEAD[0] - 0.5, GRIP_AT[1], GRIP_AT[0], GRIP_AT[1], STEEL, 1);
  // Saddle.
  line(b, SEAT[0] - 3, SEAT[1] - 1, SEAT[0] + 3, SEAT[1] - 1, OUTLINE);
  line(b, SEAT[0] - 3, SEAT[1], SEAT[0] + 2, SEAT[1], SADDLE, 1);
  line(b, SEAT[0] - 2, SEAT[1] + 1, SEAT[0] + 1, SEAT[1] + 1, OUTLINE);
  // Headlamp.
  put(b, HEAD[0] + 2, HEAD[1], LAMP); put(b, HEAD[0] + 2, HEAD[1] + 1, shade(LAMP, 0.8));
}

/** The near crank, leg and arm (in front of the bike and body). */
function sideNear(b: PixelBuf, f: number, col: RiderColors, shoulder: [number, number]): void {
  const a = (f / RIDE_FRAMES) * Math.PI * 2;
  const pedal: [number, number] = [CRANK[0] + CRANK_LEN * Math.cos(a), CRANK[1] + CRANK_LEN * Math.sin(a)];
  limb(b, CRANK[0], CRANK[1], pedal[0], pedal[1], STEEL_HI, 1);
  disc(b, CRANK[0], CRANK[1], 1, HUB);
  legSide(b, [SEAT[0] + 1, SEAT[1]], pedal, col.pants, col.shoes);
  // Arm reaching forward and down to the grip: sleeve, then the hand on the bar.
  limb(b, shoulder[0], shoulder[1], GRIP_AT[0] - 2, GRIP_AT[1] - 1, shade(col.shirt, 1.12), 2);
  disc(b, GRIP_AT[0] - 0.5, GRIP_AT[1] - 0.5, 1.3, OUTLINE);
  put(b, GRIP_AT[0] - 1, GRIP_AT[1] - 1, col.skin); put(b, GRIP_AT[0], GRIP_AT[1] - 1, col.skin); put(b, GRIP_AT[0] - 1, GRIP_AT[1], col.skin);
}

// Front / back views: the wheel in the middle, a leg either side.
const MID = 31.5;
function headOnLegs(b: PixelBuf, f: number, col: RiderColors, hipY: number): void {
  const a = (f / RIDE_FRAMES) * Math.PI * 2;
  for (const [x, phase] of [[MID - 6, 0], [MID + 6, Math.PI]] as const) {
    const footY = 56 + 2 * Math.sin(a + phase);
    const kneeY = hipY + 3 + 2 * Math.sin(a + phase); // knee lifts with the foot
    limb(b, x, hipY, x, kneeY, col.pants, 3);
    limb(b, x, kneeY, x, footY - 1, shade(col.pants, 0.85), 3);
    line(b, x - 2, footY, x + 2, footY, OUTLINE, 1);
    line(b, x - 1, footY - 1, x + 1, footY - 1, col.shoes, 1);
    line(b, x - 2, footY + 1, x + 2, footY + 1, OUTLINE, 1);
    line(b, x - 3, footY + 2, x + 3, footY + 2, STEEL_HI, 1); // pedal
  }
}
function headOnBike(b: PixelBuf, f: number, back: boolean): void {
  // Tyre (three px, outlined), with the tread moving down as it turns.
  for (let y = 48; y <= 63; y++) { put(b, MID - 2, y, OUTLINE); put(b, MID + 2, y, OUTLINE); for (const dx of [-1, 0, 1]) put(b, MID + dx, y, TIRE); }
  for (let y = 49 + (f % 2) * 2; y <= 62; y += 4) put(b, MID, y, TIRE_HI);
  // Mudguard over the top of the wheel.
  limb(b, MID - 1, 48, MID + 1, 48, back ? FRAME_C : STEEL_HI, 1);
  put(b, MID - 1.5, 63, OUTLINE); put(b, MID + 1.5, 63, OUTLINE);
  // Fork / stays and the head (or seat) tube.
  limb(b, MID - 3, 47, MID - 3, 55, back ? FRAME_C : STEEL, 1);
  limb(b, MID + 3, 47, MID + 3, 55, back ? FRAME_C : STEEL, 1);
  limb(b, MID, 44, MID, 48, FRAME_C, 2);
  if (back) { disc(b, MID, 50, 1.2, TAIL); } else { disc(b, MID, 46, 1.2, LAMP); }
}
function headOnBars(b: PixelBuf, y: number): void {
  limb(b, 17, y, 46, y, STEEL, 1);
  for (const x of [17, 18, 45, 46]) put(b, x, y, GRIP);
}

/** Composite `src` over `dst` (straight alpha, opaque pixels only). */
function over(dst: PixelBuf, src: PixelBuf, flip = false): void {
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const o = (y * src.w + x) * 4;
    if (!src.d[o + 3]) continue;
    const tx = flip ? src.w - 1 - x : x;
    const t = (y * dst.w + tx) * 4;
    dst.d[t] = src.d[o]; dst.d[t + 1] = src.d[o + 1]; dst.d[t + 2] = src.d[o + 2]; dst.d[t + 3] = 255;
  }
}

/** The standing frame for a facing, out of a composed sheet. */
function standing(sheet: PixelBuf, facing: Facing): PixelBuf {
  const f = newBuf(FRAME, FRAME);
  const sy = ROWS[facing] * FRAME;
  for (let y = 0; y < FRAME; y++) for (let x = 0; x < FRAME; x++) {
    const s = ((sy + y) * sheet.w + x) * 4, t = (y * FRAME + x) * 4;
    for (let k = 0; k < 4; k++) f.d[t + k] = sheet.d[s + k];
  }
  return f;
}

/** Where the trousers begin, per body and facing (the top of the LPC legs
 *  layer, measured from public/lpc/legs_*.png). Colour can't tell: dark
 *  shirts and dark trousers look alike. */
const WAIST: Readonly<Record<"male" | "female", Readonly<Record<Facing, number>>>> = {
  male: { up: 43, left: 45, down: 44, right: 45 },
  female: { up: 44, left: 46, down: 46, right: 46 },
};

/** Sample the character's real colours (they're recoloured by luminance, so not the raw hex). */
export function riderColors(sheet: PixelBuf, skinHex: string): RiderColors {
  const f = standing(sheet, "down");
  const pick = (x: number, y: number, fallback: Rgb): Rgb => get(f, x, y) ?? fallback;
  const n = parseInt(skinHex.slice(1), 16);
  return { shirt: pick(32, 39, [70, 110, 90]), pants: pick(29, 50, [58, 58, 74]), shoes: pick(28, 59, [80, 52, 34]), skin: [(n >> 16) & 255, (n >> 8) & 255, n & 255] };
}

/** Body rows to keep: head and torso, and (head-on) the hands at the sides. */
function body(f: PixelBuf, waist: number, keepHands: boolean): PixelBuf {
  const out = newBuf(FRAME, FRAME);
  for (let y = 0; y < FRAME; y++) for (let x = 0; x < FRAME; x++) {
    const hand = keepHands && y < waist + 5 && (x < 23 || x > 41);
    if (y >= waist && !hand) continue;
    const o = (y * FRAME + x) * 4;
    for (let k = 0; k < 4; k++) out.d[o + k] = f.d[o + k];
  }
  return out;
}

/** One riding frame (`f` of RIDE_FRAMES) for a facing. */
export function riderFrame(sheet: PixelBuf, facing: Facing, f: number, col: RiderColors, bodyType: "male" | "female"): PixelBuf {
  const stand = standing(sheet, facing);
  const waist = WAIST[bodyType][facing];
  const out = newBuf(FRAME, FRAME);
  if (facing === "left" || facing === "right") {
    const flip = facing === "left";
    const far = newBuf(FRAME, FRAME), bike = newBuf(FRAME, FRAME), near = newBuf(FRAME, FRAME);
    sideFar(far, f, col);
    sideBike(bike, f);
    sideNear(near, f, col, [31, waist - 7]);
    over(out, far, flip);
    over(out, bike, flip);
    over(out, body(stand, waist, false));
    over(out, near, flip);
  } else {
    const back = facing === "up";
    const legs = newBuf(FRAME, FRAME), bike = newBuf(FRAME, FRAME), bars = newBuf(FRAME, FRAME);
    headOnLegs(legs, f, col, waist);
    headOnBike(bike, f, back);
    headOnBars(bars, waist + 1);
    over(out, legs);
    if (back) { over(out, bars); over(out, body(stand, waist, true)); over(out, bike); }
    else { over(out, bike); over(out, bars); over(out, body(stand, waist, true)); }
  }
  return out;
}

/** The whole riding sheet: rows up/left/down/right (as ROWS), RIDE_FRAMES columns. */
export function riderSheet(sheet: PixelBuf, skinHex: string, bodyType: "male" | "female"): PixelBuf {
  const col = riderColors(sheet, skinHex);
  const out = newBuf(FRAME * RIDE_FRAMES, FRAME * 4);
  for (const facing of Object.keys(ROWS) as Facing[]) {
    for (let f = 0; f < RIDE_FRAMES; f++) {
      const fr = riderFrame(sheet, facing, f, col, bodyType);
      for (let y = 0; y < FRAME; y++) for (let x = 0; x < FRAME; x++) {
        const s = (y * FRAME + x) * 4, t = ((ROWS[facing] * FRAME + y) * out.w + f * FRAME + x) * 4;
        for (let k = 0; k < 4; k++) out.d[t + k] = fr.d[s + k];
      }
    }
  }
  return out;
}
