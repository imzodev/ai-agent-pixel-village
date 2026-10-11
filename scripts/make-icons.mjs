#!/usr/bin/env node
// The site's icons, all drawn from the pixel tree in public/favicon.svg:
// favicon.ico (16/32/48, what browsers ask for by default), the Apple touch
// icon (180, opaque), the web-app icons (192 and 512) and a maskable 512 with
// the tree inside Android's safe zone. Referenced from src/app/layout.tsx and
// public/manifest.webmanifest.
//
//   node scripts/make-icons.mjs

import fs from "node:fs";
import sharp from "sharp";

const SVG = fs.readFileSync("public/favicon.svg");
const BG = "#1a2238";

/** The tree on its navy square, `size` px, crisp (rendered big, scaled down by whole steps). */
async function square(size, { pad = 0 } = {}) {
  const inner = size - 2 * pad;
  const art = await sharp(SVG, { density: 72 * Math.ceil((inner * 4) / 16) }).resize(inner, inner, { kernel: "nearest" }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: BG } }).composite([{ input: art, left: pad, top: pad }]).png().toBuffer();
}

/** An .ico holding PNG images (supported by every current browser). */
function ico(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + i * 16;
    header.writeUInt8(size >= 256 ? 0 : size, e); header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt8(0, e + 2); header.writeUInt8(0, e + 3);
    header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8); header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

const sizes = [16, 32, 48];
fs.writeFileSync("public/favicon.ico", ico(await Promise.all(sizes.map(async (size) => ({ size, data: await square(size) })))));
fs.writeFileSync("public/apple-touch-icon.png", await square(180, { pad: 18 }));
fs.writeFileSync("public/icon-192.png", await square(192));
fs.writeFileSync("public/icon-512.png", await square(512));
// Maskable: Android crops to a circle or squircle; keep the tree in the middle 80%.
fs.writeFileSync("public/icon-maskable-512.png", await square(512, { pad: 64 }));
console.log("wrote favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png, icon-maskable-512.png");
