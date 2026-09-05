import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Minimal PNG parser: reads IHDR chunk for width/height.
async function pngSize(path) {
  const buf = await readFile(path);
  if (buf[0] !== 0x89 || buf[1] !== 0x50) throw new Error("not a PNG: " + path);
  // IHDR: bytes 16..23 are width(4) + height(4), big-endian
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  return { w, h };
}

const files = [
  "body_male.png", "body_female.png",
  "head_male.png", "head_female.png",
  "legs_male.png", "legs_female.png",
  "feet_male.png", "feet_female.png",
  "torso_male.png", "torso_female.png",
  "eyes.png",
  "hair_plain.png", "hair_spiked.png", "hair_long.png",
];

for (const f of files) {
  const { w, h } = await pngSize(resolve("public/lpc", f));
  // LPC walk cycle is 576x256 (9 frames × 64px × 4 dirs × 64px).
  // Character-generator templates tend to be the same shape but with different content (e.g. static poses).
  const frames = w / 64;
  const dirs = h / 64;
  console.log(`${f.padEnd(20)} ${w}x${h}  (${frames} cols × ${dirs} rows of 64px)`);
}