// Tiny pixel-art toolkit for the procedurally drawn animal sheets
// (scripts/draw-duck.mjs, scripts/draw-rabbit.mjs).
//
// A frame is an F×F grid of [r, g, b] | [r, g, b, a] | null (alpha
// defaults to opaque; translucent pixels, e.g. a flying creature's ground
// shadow, should be drawn after outline() so they don't get outlined). Draw with ellipse/rect/put,
// finish with outline(), then writeSheet() lays the frames out in the
// format src/game/animalSprites.ts expects: columns = animation frames,
// rows = directions (up / left / down / right), one block of 4 rows per
// action.

import sharp from "sharp";
import path from "node:path";

export let F = 32; // frame size

/** Use bigger frames for a detailed sheet (call before drawing). */
export function setFrameSize(n) {
  F = n;
}
export const DIRS = ["up", "left", "down", "right"];

export function blank() {
  return Array.from({ length: F }, () => Array(F).fill(null));
}

export function put(fr, x, y, c) {
  x = Math.round(x); y = Math.round(y);
  if (x >= 0 && y >= 0 && x < F && y < F) fr[y][x] = c;
}

/** Filled ellipse; with `shade`, the lower part uses the shade colour. */
export function ellipse(fr, cx, cy, rx, ry, c, shade) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d <= 1) put(fr, x, y, shade && y > cy + ry * 0.35 ? shade : c);
    }
  }
}

export function rect(fr, x0, y0, w, h, c) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) put(fr, x, y, c);
}

/** Filled polygon (even-odd scanline), points as [[x, y], …]. */
export function poly(fr, pts, c) {
  const ys = pts.map((p) => p[1]);
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
    const yc = y + 0.5;
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      if ((y0 <= yc && y1 > yc) || (y1 <= yc && y0 > yc)) xs.push(x0 + ((yc - y0) / (y1 - y0)) * (x1 - x0));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) put(fr, x, y, c);
    }
  }
}

/** Thick polyline through `pts` (tails and the like). */
export function line(fr, pts, c, w = 2) {
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2;
    for (let s = 0; s <= n; s++) {
      const x = x0 + ((x1 - x0) * s) / n;
      const y = y0 + ((y1 - y0) * s) / n;
      rect(fr, Math.round(x - (w - 1) / 2), Math.round(y - (w - 1) / 2), w, w, c);
    }
  }
}

/** Trace a 1-px outline of colour `c` around every opaque pixel. */
export function outline(fr, c) {
  const out = fr.map((r) => r.slice());
  for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) {
    if (fr[y][x]) continue;
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => fr[y + dy]?.[x + dx]);
    if (n) out[y][x] = c;
  }
  return out;
}

/** Move a frame `dx` px to the right (content is drawn with margin to spare). */
export function shiftX(fr, dx) {
  return fr.map((r) => [...Array(dx).fill(null), ...r.slice(0, F - dx)]);
}

export function mirror(fr) {
  return fr.map((r) => r.slice().reverse());
}

/**
 * Build one action block from per-view painters. `views.side` draws the
 * left-facing frame; the right-facing row is its mirror.
 */
export function block(views, frames) {
  const left = frames.map(views.side);
  return {
    up: frames.map(views.back),
    left,
    down: frames.map(views.front),
    right: left.map(mirror),
  };
}

/** Write blocks (one per action, in order) to public/assets/animals/<name>.png. */
export async function writeSheet(name, blocks) {
  const cols = blocks[0].left.length;
  const width = F * cols;
  const height = F * DIRS.length * blocks.length;
  const buf = Buffer.alloc(width * height * 4);
  blocks.forEach((b, bi) => {
    DIRS.forEach((dir, di) => {
      b[dir].forEach((fr, col) => {
        for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) {
          const c = fr[y][x];
          if (!c) continue;
          const o = (((bi * DIRS.length + di) * F + y) * width + col * F + x) * 4;
          buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; buf[o + 3] = c[3] ?? 255;
        }
      });
    });
  });
  const out = path.resolve(`public/assets/animals/${name}.png`);
  await sharp(buf, { raw: { width, height, channels: 4 } }).png().toFile(out);
  console.log(`wrote ${out} (${width}×${height})`);
}
