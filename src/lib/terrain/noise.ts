// Deterministic noise shared by the terrain generators (src/lib/regions.ts,
// src/lib/continent.ts): integer hashing, smooth value noise and fractal
// sums. Pure — every process computes the same world.

/** Deterministic hash in [0, 1) for integer coordinates. */
export function hash(a: number, b: number, salt = 0): number {
  let h = Math.imul(a ^ 0x27d4eb2d, 0x165667b1) ^ Math.imul(b ^ 0x9e3779b9, 0x85ebca77) ^ Math.imul(salt + 1, 0xc2b2ae3d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** Smooth 2D value noise in [0, 1), feature size ≈ `scale` tiles. */
export function noise(x: number, y: number, scale: number, salt: number): number {
  const fx = x / scale, fy = y / scale;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const s = (t: number) => t * t * (3 - 2 * t);
  const u = s(fx - x0), v = s(fy - y0);
  const a = hash(x0, y0, salt), b = hash(x0 + 1, y0, salt), c = hash(x0, y0 + 1, salt), d = hash(x0 + 1, y0 + 1, salt);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

/** Fractal value noise in [0, 1): `octaves` layers, each half the size and weight. */
export function fbm(x: number, y: number, scale: number, octaves: number, salt: number): number {
  let sum = 0, amp = 1, norm = 0, s = scale;
  for (let o = 0; o < octaves; o++) {
    sum += noise(x, y, s, salt + o * 101) * amp;
    norm += amp;
    amp *= 0.5;
    s /= 2;
  }
  return sum / norm;
}
