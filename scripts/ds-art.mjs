// Shared helpers for the detailed (DS-era) art scripts: palette ramps,
// ordered dithering and a few drawing primitives on top of canvas-art's
// Canvas. Used by scripts/draw-houses.mjs (and mirrors the ramps of
// scripts/draw-wilds.mjs so buildings sit naturally on the terrain).

export const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

/** 4×4 Bayer matrix, normalised to (0, 1). */
export const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/** Ramp colour for a continuous tone t (0..1), dithered at (x, y). */
export function ramp(colors, t, x, y) {
  const f = Math.max(0, Math.min(0.9999, t)) * (colors.length - 1);
  const i = Math.floor(f);
  return colors[Math.min(colors.length - 1, i + (f - i > BAYER[((y & 3) << 2) | (x & 3)] ? 1 : 0))];
}

export const PAL = {
  ink: hex(0x2a1e18), inkSoft: hex(0x4a3a30),
  wood: [hex(0x4a2c18), hex(0x6e4426), hex(0x946036), hex(0xb8804a), hex(0xd8a468), hex(0xf0c890)],
  log: [hex(0x4e301a), hex(0x6e4628), hex(0x8e5e36), hex(0xae7a48), hex(0xcc9a62)],
  stone: [hex(0x4a4a54), hex(0x6a6a74), hex(0x8a8a92), hex(0xa8a8ae), hex(0xc6c6ca), hex(0xe2e2e4)],
  plaster: [hex(0xb8a888), hex(0xd4c4a0), hex(0xe8dcbc), hex(0xf6eed6), hex(0xfffaec)],
  brick: [hex(0x6a2a22), hex(0x8a3a2c), hex(0xa84c38), hex(0xc4644a), hex(0xd8846a)],
  board: [hex(0x7a8a92), hex(0x9cacb2), hex(0xbcccd0), hex(0xdce6e8), hex(0xf4f8f8)],
  roofRed: [hex(0x5a1e1e), hex(0x7e2a28), hex(0xa43a32), hex(0xc85044), hex(0xe4705a), hex(0xf4a088)],
  roofTeal: [hex(0x1e4a4e), hex(0x286266), hex(0x328082), hex(0x46a0a0), hex(0x6cc0bc), hex(0xa4e0d8)],
  roofBrown: [hex(0x3e2618), hex(0x5a3a22), hex(0x7a5030), hex(0x9a6a40), hex(0xbc8a58), hex(0xd8ac7c)],
  roofSlate: [hex(0x232a44), hex(0x2e3a5e), hex(0x3c4c7a), hex(0x52669a), hex(0x7088b8), hex(0xa0b4d8)],
  glass: [hex(0x2a4a7a), hex(0x3c6aa8), hex(0x5c90cc), hex(0x8cbce8), hex(0xd4ecfc)],
  glassLit: [hex(0x9a6a28), hex(0xd49a3a), hex(0xf4c45a), hex(0xffe08c), hex(0xfff6d0)],
  leaf: [hex(0x1c4a30), hex(0x2a6a3c), hex(0x3c8a46), hex(0x56a850), hex(0x7cc460), hex(0xb0e080)],
  white: hex(0xfcfcf4), red: hex(0xe84858), pink: hex(0xf8a8c8), yellow: hex(0xf8d850), violet: hex(0xb890f0),
  iron: hex(0x3c3c48), ironLt: hex(0x6a6a78), lamp: hex(0xffe48c), lampLt: hex(0xfff8d8),
  shadow: [0, 0, 0],
};

/** Fill a rectangle with a ramp, tone from `tone(x, y)` (dithered). */
export function shade(c, x0, y0, w, h, colors, tone) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) c.put(x, y, ramp(colors, tone(x, y), x, y));
}

/** Soft shadow: alpha falls off from `a` toward the rectangle's bottom. */
export function softShadow(c, x0, y0, w, h, a) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const ex = Math.min(x - x0, x0 + w - 1 - x) / 6;
    c.put(x, y, PAL.shadow, Math.round(a * (1 - (y - y0) / h) * Math.min(1, ex + 0.3)));
  }
}

/** 1 px outline around opaque pixels (alpha > 200) inside the canvas. */
export function outline(c, col) {
  const edge = [];
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    if (c.alpha(x, y) > 200) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => c.alpha(x + dx, y + dy) > 200)) edge.push([x, y]);
  }
  for (const [x, y] of edge) c.put(x, y, col);
}
