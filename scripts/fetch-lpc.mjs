// scripts/fetch-lpc.mjs
// Downloads the Universal LPC Spritesheet layer PNGs the project needs and
// saves each as ONE 576x512 sheet in public/lpc/:
//
//   rows 0-3 (y 0..255):   walk  — 9 frames × 4 directions (up/left/down/right)
//   rows 4-7 (y 256..511): slash — 6 frames × 4 directions (x 0..383)
//
// Source files come in two shapes:
//   - master templates (sanderfrenken mirror): 832 px wide, all animations
//     stacked; walk is rows 8-11 (y 512..767), slash rows 12-15 (y 768..1023);
//   - per-animation files (liberatedpixelcup mirror): walk.png (576x256)
//     and slash.png (384x256) side by side.
// src/game/lpc.ts composes these sheets (see SHEET_W / SHEET_H there).
//
// License: CC-BY-SA 3.0 / GPL 3.0 / OGA-BY 3.0 (see public/lpc/LICENSE.txt)

import { writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "..", "public", "lpc");

// Two LPC mirrors are available. The sanderfrenken mirror has the main
// base layers (body, head, hair, hat). The liberatedpixelcup mirror has
// extras like facial/glasses and torso/aprons that sanderfrenken lacks.
// Each entry can override `base` to pull from a different source.
const SANDER = "https://raw.githubusercontent.com/sanderfrenken/Universal-LPC-Spritesheet-Character-Generator/master";
const LIBERATED = "https://raw.githubusercontent.com/liberatedpixelcup/Universal-LPC-Spritesheet-Character-Generator/master";

const WALK = { left: 0, top: 8 * 64, width: 9 * 64, height: 4 * 64 };
const SLASH = { left: 0, top: 12 * 64, width: 6 * 64, height: 4 * 64 };

/**
 * [dest, src, base?] — `src` is either a master-template path (walk and
 * slash are cropped out of it) or { walk, slash } per-animation paths.
 * `base` is the source mirror; defaults to SANDER.
 */
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
  // Cosmetic layers: hats (sanderfrenken).
  ["hat_straw.png",     "spritesheets/hat/cloth/bandana/adult.png"],
  ["hat_crown.png",     "spritesheets/hat/formal/crown/adult.png"],
  ["hat_party.png",     "spritesheets/hat/holiday/elf/adult.png"],
  // Glasses + apron (liberatedpixelcup): per-animation files.
  ["glasses_round.png", { walk: "spritesheets/facial/glasses/round/adult/walk.png", slash: "spritesheets/facial/glasses/round/adult/slash.png" }, LIBERATED],
  ["outfit_apron.png", { walk: "spritesheets/torso/aprons/apron/male/walk/white.png", slash: "spritesheets/torso/aprons/apron/male/slash/white.png" }, LIBERATED],
  // Weapon (the Wooden Sword): the LPC dagger, in front of and behind the body.
  ["weapon_dagger.png", { walk: "spritesheets/weapon/sword/dagger/walk/dagger.png", slash: "spritesheets/weapon/sword/dagger/slash/dagger.png" }, LIBERATED],
  ["weapon_dagger_behind.png", { walk: "spritesheets/weapon/sword/dagger/behind/walk/dagger.png", slash: "spritesheets/weapon/sword/dagger/behind/slash/dagger.png" }, LIBERATED],
];

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Fit a region to exactly w×h (transparent padding / crop), as PNG. */
async function fit(buf, w, h) {
  const meta = await sharp(buf).metadata();
  if (meta.width === w && meta.height === h) return buf;
  return sharp(buf)
    .extract({ left: 0, top: 0, width: Math.min(w, meta.width), height: Math.min(h, meta.height) })
    .extend({ right: Math.max(0, w - meta.width), bottom: Math.max(0, h - meta.height), background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

await mkdir(OUT_DIR, { recursive: true });

let ok = 0, fail = 0;
for (const [dest, src, base] of FILES) {
  const root = base ?? SANDER;
  process.stdout.write(`  ${dest.padEnd(26)} ← ${typeof src === "string" ? src : src.walk}\n`);
  try {
    let walk, slash;
    if (typeof src === "string") {
      const master = await download(`${root}/${src}`);
      walk = await sharp(master).extract(WALK).png().toBuffer();
      slash = await sharp(master).extract(SLASH).png().toBuffer();
    } else {
      walk = await fit(await download(`${root}/${src.walk}`), WALK.width, WALK.height);
      slash = await fit(await download(`${root}/${src.slash}`), SLASH.width, SLASH.height);
    }
    const out = await sharp({ create: { width: 576, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: walk, left: 0, top: 0 }, { input: slash, left: 0, top: 256 }])
      .png()
      .toBuffer();
    await writeFile(resolve(OUT_DIR, dest), out);
    ok++;
  } catch (err) {
    console.error(`    ✗ ${err.message}`);
    fail++;
  }
}

console.log(`\n${ok} sheets written (walk + slash), ${fail} failed → ${OUT_DIR}`);
process.exit(fail === 0 ? 0 : 1);
