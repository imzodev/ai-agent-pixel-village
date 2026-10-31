#!/usr/bin/env node
// Della's Loom's spot in the village (src/lib/arcade/spots.ts): outside the
// Village Ranch's west fence, a floor loom with a striped cloth half woven, the
// shuttle on the warp, and a basket of spools in the game's colours, under a sign.
//
//   node scripts/draw-loom-stall.mjs
//
// Writes public/assets/loomstall.png (src/game/arcadeArt.ts): 96×64 (6×4
// tiles). The sign's face is 86×12 at (5, 2); the game writes on it.

import fs from "node:fs";
import sharp from "sharp";
import { Canvas } from "./canvas-art.mjs";
import { PAL, hex, ramp, softShadow } from "./ds-art.mjs";

const W = 96, H = 64;
const c = new Canvas(W, H);
// The spools (src/components/loom/draw.ts SPOOL_COLORS): cream, madder, woad, weld.
const YARN = [hex(0xefe3c8), hex(0xb8402f), hex(0x2f5f9e), hex(0xcdbf32)];
const WARP = hex(0xe8dcc4);

softShadow(c, 6, 55, 84, 7, 70);

// The loom (middle and right): two uprights, the top beam, the breast beam, treadles.
const lx = 34, rx = 80, top = 22, beam = 46;
for (const x of [lx, rx]) for (let y = top; y < 58; y++) for (let xx = x; xx < x + 3; xx++) c.put(xx, y, ramp(PAL.wood, 0.35 + (xx - x) * 0.18, xx, y));
c.rect(lx - 1, top, rx - lx + 5, 3, PAL.wood[2]);
c.rect(lx - 1, beam, rx - lx + 5, 3, PAL.wood[2]);
c.rect(lx + 6, 55, rx - lx - 8, 2, PAL.wood[1]);
// The warp from the top beam down to the cloth.
for (let x = lx + 4; x < rx; x += 2) c.vline(x, top + 3, beam - 10, WARP);
// The cloth: stripes of the day's colours, a figure repeating along each.
const figure = [1, 2, 0, 3];
for (let r = 0; r < 8; r++) {
  const y = beam - 1 - r;
  for (let x = lx + 4; x < rx; x++) c.put(x, y, YARN[figure[(Math.floor((x - lx) / 4) + r) % figure.length]]);
}
// The shuttle resting on the warp.
c.rect(lx + 18, beam - 12, 12, 3, hex(0xc08a4a)); c.rect(lx + 22, beam - 11, 4, 1, PAL.ink);

// A basket of spools (left).
const bx = 8, by = 44;
c.rect(bx, by, 20, 12, hex(0x9a7a3a));
for (let x = bx; x < bx + 20; x += 3) c.vline(x, by, by + 11, hex(0x7a5a2a));
c.rect(bx, by, 20, 2, hex(0xc8a45a));
YARN.forEach((col, i) => { c.ellipse(bx + 3 + i * 5, by - 2 - (i % 2), 3, 3, col); c.put(bx + 3 + i * 5, by - 2 - (i % 2), PAL.ink); });

// The sign on two posts.
for (const x of [10, W - 13]) for (let y = 12; y < 26; y++) for (let xx = x; xx < x + 3; xx++) c.put(xx, y, ramp(PAL.log, 0.3 + (xx - x) * 0.2, xx, y));
for (let y = 1; y < 15; y++) for (let x = 5; x < W - 5; x++) {
  const edge = y === 1 || y === 14 || x === 5 || x === W - 6;
  c.put(x, y, edge ? PAL.wood[1] : ramp(PAL.wood, 0.62 + ((x + y * 3) % 7 === 0 ? -0.06 : 0), x, y));
}
c.outline(PAL.ink);

fs.mkdirSync("public/assets", { recursive: true });
await sharp(Buffer.from(c.px), { raw: { width: W, height: H, channels: 4 } }).png().toFile("public/assets/loomstall.png");
console.log("wrote public/assets/loomstall.png");
