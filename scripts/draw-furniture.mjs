#!/usr/bin/env node
// Furniture sprites: one 32×32 front view per placeable piece, for player
// homes (the Home panel) and workshop showrooms (src/game/furnitureArt.ts
// maps item → cell). Polished pieces use a darker, richer wood with a sheen.
//
//   node scripts/draw-furniture.mjs   → public/assets/furniture.png (6 × 4 cells)

import sharp from "sharp";
import { Canvas, rand } from "./canvas-art.mjs";

const S = 32;
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const INK = hex(0x2a1e18);
const OAK = [hex(0x5a3a22), hex(0x7a5232), hex(0x9a6a40), hex(0xbc8a58), hex(0xd8ac7c)];
const WALNUT = [hex(0x2e1a10), hex(0x4a2a18), hex(0x6a3c22), hex(0x8a5230), hex(0xb07048)];
const CLOTH = [hex(0x5a2a3a), hex(0x8a3a4e), hex(0xb05468), hex(0xd07a8a)];
const WOOL = [hex(0xb8b0a0), hex(0xd8d0c0), hex(0xf0ece0)];
const BRASS = hex(0xd8b048), SHEEN = hex(0xfff0d0);

/** A plank-shaded box: light top edge, dark right edge, wood grain. */
function box(c, x, y, w, h, wood, grain = true) {
  for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) {
    let t = 2 + (py === y ? 2 : 0) - (px === x + w - 1 ? 1 : 0) - (py === y + h - 1 ? 1 : 0);
    if (grain && (px * 3 + py * 7) % 11 === 0 && py !== y) t -= 1;
    c.put(px, py, wood[Math.max(0, Math.min(wood.length - 1, t))]);
  }
}
const leg = (c, x, y, h, wood) => { for (let k = 0; k < h; k++) { c.put(x, y + k, wood[2]); c.put(x + 1, y + k, wood[1]); } };

const PIECES = {
  chair(c, w) { box(c, 10, 6, 12, 3, w); leg(c, 10, 9, 8, w); leg(c, 20, 9, 8, w); box(c, 9, 17, 14, 3, w); leg(c, 10, 20, 9, w); leg(c, 20, 20, 9, w); for (let y = 10; y < 17; y += 3) box(c, 12, y, 8, 1, w, false); },
  stool(c, w) { box(c, 9, 15, 14, 3, w); leg(c, 10, 18, 11, w); leg(c, 20, 18, 11, w); leg(c, 15, 18, 10, w); box(c, 11, 24, 10, 1, w, false); },
  table(c, w) { box(c, 3, 12, 26, 4, w); box(c, 5, 16, 22, 2, w); leg(c, 5, 18, 11, w); leg(c, 25, 18, 11, w); },
  bookshelf(c, w) {
    box(c, 6, 2, 20, 28, w);
    const books = [hex(0xa43a32), hex(0x3c6aa8), hex(0x4f9a43), hex(0xc9a24a), hex(0x7b5ea7)];
    for (const sy of [4, 13, 22]) { for (let x = 8; x < 24; x += 2) { const col = books[(x + sy) % books.length]; const top = sy + 1 + ((x * sy) % 3); for (let y = top; y < sy + 8; y++) { c.put(x, y, col); } } box(c, 7, sy + 8, 18, 1, w, false); }
  },
  cabinet(c, w) { box(c, 5, 8, 22, 21, w); for (const x of [6, 16]) box(c, x, 10, 9, 17, w); c.put(14, 18, BRASS); c.put(17, 18, BRASS); box(c, 4, 7, 24, 2, w, false); },
  wardrobe(c, w) { box(c, 6, 1, 20, 29, w); box(c, 5, 0, 22, 2, w, false); for (const x of [7, 16]) box(c, x, 3, 9, 25, w); c.put(15, 15, BRASS); c.put(16, 15, BRASS); },
  rocking_chair(c, w) { box(c, 10, 4, 12, 3, w); for (let y = 7; y < 18; y += 3) box(c, 11, y, 10, 1, w, false); leg(c, 10, 7, 11, w); leg(c, 20, 7, 11, w); box(c, 9, 17, 14, 3, w); leg(c, 10, 20, 6, w); leg(c, 20, 20, 6, w); for (let x = 5; x < 28; x++) c.put(x, 27 + Math.round(((x - 16) / 11) ** 2 * -2 + 1), w[1]); },
  armchair(c) { box(c, 6, 6, 20, 12, CLOTH); box(c, 4, 14, 6, 10, CLOTH); box(c, 22, 14, 6, 10, CLOTH); box(c, 9, 17, 14, 7, CLOTH); box(c, 10, 17, 12, 2, WOOL, false); leg(c, 5, 24, 4, OAK); leg(c, 25, 24, 4, OAK); },
  sofa(c) { box(c, 2, 9, 28, 10, CLOTH); box(c, 1, 15, 4, 10, CLOTH); box(c, 27, 15, 4, 10, CLOTH); box(c, 5, 18, 22, 7, CLOTH); for (const x of [6, 16]) box(c, x, 18, 9, 2, WOOL, false); leg(c, 2, 25, 3, OAK); leg(c, 28, 25, 3, OAK); },
  bed(c) { box(c, 3, 8, 26, 4, OAK); box(c, 3, 12, 26, 14, WOOL); box(c, 3, 17, 26, 9, CLOTH); box(c, 5, 13, 9, 4, WOOL, false); leg(c, 3, 26, 3, OAK); leg(c, 27, 26, 3, OAK); },
  rug(c) { for (let y = 12; y < 26; y++) for (let x = 3; x < 29; x++) { const edge = y === 12 || y === 25 || x === 3 || x === 28; c.put(x, y, edge ? CLOTH[0] : ((x + y) % 6 < 3 ? CLOTH[2] : CLOTH[1])); } for (let x = 3; x < 29; x += 2) { c.put(x, 26, WOOL[1]); c.put(x, 11, WOOL[1]); } },
  lamp(c) { for (let y = 4; y < 14; y++) { const half = 3 + Math.floor((y - 4) / 2); for (let x = 16 - half; x <= 16 + half; x++) c.put(x, y, y < 6 ? hex(0xfff2c0) : hex(0xf8d880)); } leg(c, 15, 14, 12, OAK); box(c, 11, 26, 10, 3, OAK); },
  plant(c) { box(c, 11, 20, 10, 9, [hex(0x8a3a24), hex(0xa84c30), hex(0xc4644a), hex(0xd8846a), hex(0xe8a48a)]); for (const [x, y, r] of [[16, 12, 6], [11, 15, 4], [21, 15, 4], [16, 7, 4]]) c.ellipse(x, y, r, r, hex(0x3c8a46)); for (let k = 0; k < 14; k++) c.put(10 + Math.floor(rand(k, 3) * 12), 5 + Math.floor(rand(3, k) * 14), hex(0x7cc460)); },
  painting(c) { box(c, 4, 6, 24, 18, OAK); for (let y = 8; y < 22; y++) for (let x = 6; x < 26; x++) c.put(x, y, y < 15 ? hex(0x8cbce8) : y < 18 ? hex(0x4f9a43) : hex(0x3c7a3a)); c.ellipse(20, 11, 2, 2, hex(0xf8d850)); },
};

const ORDER = [
  ["chair"], ["stool"], ["table"], ["bookshelf"], ["cabinet"], ["wardrobe"],
  ["rocking_chair"], ["armchair"], ["sofa"], ["bed"], ["rug"], ["lamp"],
  ["plant"], ["painting"], ["polished_chair", "chair"], ["polished_table", "table"], ["polished_cabinet", "cabinet"], ["polished_wardrobe", "wardrobe"],
];
const COLS = 6, ROWS = Math.ceil(ORDER.length / COLS);
const sheet = new Canvas(COLS * S, ROWS * S);
ORDER.forEach(([key, base], i) => {
  const c = new Canvas(S, S);
  const polished = key.startsWith("polished_");
  PIECES[base ?? key](c, polished ? WALNUT : OAK);
  c.outline(INK);
  if (polished) { // varnish: two short glints near the top-left of the piece
    let x0 = S, y0 = S;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (c.alpha(x, y) > 200) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); }
    for (const [gx, gy, n] of [[x0 + 3, y0 + 3, 4], [x0 + 6, y0 + 3, 2]]) for (let k = 0; k < n; k++) if (c.alpha(gx + k, gy + n - 1 - k) > 200) c.put(gx + k, gy + n - 1 - k, SHEEN, 190);
  }
  for (let x = 6; x < 26; x++) c.put(x, 30, INK, 40); // a soft floor shadow
  const ox = (i % COLS) * S, oy = Math.floor(i / COLS) * S;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const a = c.alpha(x, y); if (a) { const p = (y * S + x) * 4; sheet.put(ox + x, oy + y, [c.px[p], c.px[p + 1], c.px[p + 2]], a); } }
});
await sharp(Buffer.from(sheet.px.buffer), { raw: { width: sheet.w, height: sheet.h, channels: 4 } }).png().toFile("public/assets/furniture.png");
console.log(`wrote public/assets/furniture.png (${ORDER.length} pieces, ${COLS}×${ROWS} cells of ${S}px):`, ORDER.map((o) => o[0]).join(" "));
