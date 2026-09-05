// scripts/fetch-lpc.mjs
// Downloads the Universal LPC Spritesheet layer PNGs the project needs and
// flattens them into public/lpc/ with the names src/game/lpc.ts expects.
// Source: https://github.com/sanderfrenken/Universal-LPC-Spritesheet-Character-Generator
// License: CC-BY-SA 3.0 / GPL 3.0 / OGA-BY 3.0 (see public/lpc/LICENSE.txt)

import { writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "..", "public", "lpc");
const SRC_BASE =
  "https://raw.githubusercontent.com/sanderfrenken/Universal-LPC-Spritesheet-Character-Generator/master";

const FILES = [
  // body (skin-tinted)
  ["body_male.png",   "spritesheets/body/bodies/male.png"],
  ["body_female.png", "spritesheets/body/bodies/female.png"],
  // head (skin-tinted)
  ["head_male.png",   "spritesheets/head/heads/human/male.png"],
  ["head_female.png", "spritesheets/head/heads/human/female.png"],
  // legs (pantsColor-recolored). Female variant is per-color in source; we
  // pick black as a neutral baseline — the recolor logic in lpc.ts tints by
  // luminance, so any color works.
  ["legs_male.png",   "spritesheets/legs/pants/male.png"],
  ["legs_female.png", "spritesheets/legs/pants/female/black.png"],
  // feet (no tint)
  ["feet_male.png",   "spritesheets/feet/boots/male.png"],
  ["feet_female.png", "spritesheets/feet/boots/female.png"],
  // torso (shirtColor-recolored)
  ["torso_male.png",   "spritesheets/torso/clothes/longsleeve/longsleeve/male/blue.png"],
  ["torso_female.png", "spritesheets/torso/clothes/longsleeve/longsleeve/female/blue.png"],
  // eyes (shared)
  ["eyes.png", "spritesheets/eyes/human/adult.png"],
  // hair (hairColor-recolored). Some styles split by male/female, others are
  // gender-neutral ("adult").
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
    await writeFile(resolve(OUT_DIR, dest), buf);
    ok++;
  } catch (err) {
    console.error(`    ✗ ${err.message}`);
    fail++;
  }
}

console.log(`\n${ok} downloaded, ${fail} failed → ${OUT_DIR}`);
process.exit(fail === 0 ? 0 : 1);