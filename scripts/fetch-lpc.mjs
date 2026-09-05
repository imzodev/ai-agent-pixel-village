// scripts/fetch-lpc.mjs
// Downloads the Universal LPC Spritesheet layer PNGs the project needs,
// CROPS each one to the 576x256 walking region, and saves to public/lpc/.
//
// Source files (from the sanderfrenken character-generator mirror of the
// Universal-LPC-Spritesheet-Character-Generator) are larger master templates
// (832x2944 for body/head/eyes; 832x1344 for the rest). They contain multiple
// animations stacked vertically. Walking animation lives at rows 8-11
// (0-indexed, each row is 64px), columns 0-8. That's a 576x256 region.
//
// The crop produces sprites the right shape for src/game/lpc.ts:59:
//   canvas.width = 576; canvas.height = 256; (FRAME = 64, 9 cols × 4 rows)
//
// License: CC-BY-SA 3.0 / GPL 3.0 / OGA-BY 3.0 (see public/lpc/LICENSE.txt)

import { writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "..", "public", "lpc");
const SRC_BASE =
  "https://raw.githubusercontent.com/sanderfrenken/Universal-LPC-Spritesheet-Character-Generator/master";

const CROP = { left: 0, top: 8 * 64, width: 9 * 64, height: 4 * 64 };

const FILES = [
  ["body_male.png",   "spritesheets/body/bodies/male.png"],
  ["body_female.png", "spritesheets/body/bodies/female.png"],
  ["head_male.png",   "spritesheets/head/heads/human/male.png"],
  ["head_female.png", "spritesheets/head/heads/human/female.png"],
  ["legs_male.png",   "spritesheets/legs/pants/male.png"],
  ["legs_female.png", "spritesheets/legs/pants/female/black.png"],
  ["feet_male.png",   "spritesheets/feet/boots/male.png"],
  ["feet_female.png", "spritesheets/feet/boots/female.png"],
  ["torso_male.png",   "spritesheets/torso/clothes/longsleeve/longsleeve/male/blue.png"],
  ["torso_female.png", "spritesheets/torso/clothes/longsleeve/longsleeve/female/blue.png"],
  ["eyes.png", "spritesheets/eyes/human/adult.png"],
  ["hair_plain.png",   "spritesheets/hair/plain/male.png"],
  ["hair_bob.png",     "spritesheets/hair/bob/adult.png"],
  ["hair_spiked.png",  "spritesheets/hair/spiked/male.png"],
  ["hair_messy1.png",  "spritesheets/hair/messy1/male.png"],
  ["hair_long.png",    "spritesheets/hair/long/male.png"],
  ["hair_bangs.png",   "spritesheets/hair/bangs/male.png"],
  ["hair_afro.png",    "spritesheets/hair/afro/male.png"],
  ["hair_buzzcut.png", "spritesheets/hair/buzzcut/adult.png"],
  ["hair_bedhead.png", "spritesheets/hair/bedhead/male.png"],
  ["hair_cowlick.png", "spritesheets/hair/cowlick/adult.png"],
];

await mkdir(OUT_DIR, { recursive: true });

let ok = 0, fail = 0;
for (const [dest, src] of FILES) {
  const url = `${SRC_BASE}/${src}`;
  process.stdout.write(`  ${dest.padEnd(20)} ← ${src}\n`);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const cropped = await sharp(buf)
      .extract(CROP)
      .png()
      .toBuffer();
    await writeFile(resolve(OUT_DIR, dest), cropped);
    ok++;
  } catch (err) {
    console.error(`    ✗ ${err.message}`);
    fail++;
  }
}

console.log(`\n${ok} downloaded+cropped, ${fail} failed → ${OUT_DIR}`);
process.exit(fail === 0 ? 0 : 1);