// Free-size pixel canvas for hand-coded building art (scripts/draw-*.mjs
// buildings). Unlike scripts/pixel-art.mjs (fixed 32×32 animal frames),
// a Canvas can be any size, supports alpha, and can be sliced into 16×16
// tiles for scripts/bake-building.mjs → bakeCanvases().

export class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = new Uint8ClampedArray(w * h * 4);
  }

  /** Set a pixel. `a` < 255 blends over what's there. */
  put(x, y, c, a = 255) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const p = this.px;
    if (a >= 255 || p[i + 3] === 0) {
      p[i] = c[0]; p[i + 1] = c[1]; p[i + 2] = c[2]; p[i + 3] = a;
      return;
    }
    const t = a / 255;
    p[i] = p[i] * (1 - t) + c[0] * t;
    p[i + 1] = p[i + 1] * (1 - t) + c[1] * t;
    p[i + 2] = p[i + 2] * (1 - t) + c[2] * t;
    p[i + 3] = Math.max(p[i + 3], a);
  }

  alpha(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.px[(y * this.w + x) * 4 + 3];
  }

  rect(x, y, w, h, c, a = 255) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.put(i, j, c, a);
  }

  hline(x0, x1, y, c) { for (let x = x0; x <= x1; x++) this.put(x, y, c); }
  vline(x, y0, y1, c) { for (let y = y0; y <= y1; y++) this.put(x, y, c); }

  ellipse(cx, cy, rx, ry, c, a = 255) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) this.put(x, y, c, a);
      }
    }
  }

  /** Filled polygon (even-odd scanline), points as [[x, y], …]. */
  poly(pts, c) {
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
        for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.put(x, y, c);
      }
    }
  }

  /** 1-px line (Bresenham). */
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.put(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /** Trace a 1-px outline of colour `c` around every opaque (a > 127) pixel. */
  outline(c) {
    const edge = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.alpha(x, y) > 127) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => this.alpha(x + dx, y + dy) > 127)) edge.push([x, y]);
    }
    for (const [x, y] of edge) this.put(x, y, c);
    return this;
  }

  /** Draw `other` over this canvas (alpha compositing). */
  over(other) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const i = (y * this.w + x) * 4;
      const a = other.px[i + 3];
      if (a) this.put(x, y, [other.px[i], other.px[i + 1], other.px[i + 2]], a);
    }
    return this;
  }

  /** New canvas keeping only rows [y0, y1). */
  rows(y0, y1) {
    const out = new Canvas(this.w, this.h);
    out.px.set(this.px.subarray(y0 * this.w * 4, y1 * this.w * 4), y0 * this.w * 4);
    return out;
  }

  /** 16×16 RGBA tile at tile (tx, ty), or null when fully transparent. */
  tile(tx, ty, T = 16) {
    const out = Buffer.alloc(T * T * 4);
    let any = false;
    for (let y = 0; y < T; y++) {
      const src = ((ty * T + y) * this.w + tx * T) * 4;
      out.set(this.px.subarray(src, src + T * 4), y * T * 4);
    }
    for (let i = 3; i < out.length; i += 4) if (out[i]) { any = true; break; }
    return any ? out : null;
  }
}

/** Deterministic pseudo-random in [0, 1) from integers (for texture noise). */
export function rand(...n) {
  let h = 0x811c9dc5;
  for (const v of n) { h ^= v & 0xffff; h = Math.imul(h, 0x01000193); h ^= v >>> 16; h = Math.imul(h, 0x01000193); }
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}
