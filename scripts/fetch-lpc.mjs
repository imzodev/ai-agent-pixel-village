// scripts/fetch-lpc.mjs
// Downloads the Universal LPC Spritesheet layer PNGs the project needs and
// saves each as ONE 832x768 sheet in public/lpc/:
//
//   rows 0-3  (y 0..255):   walk  — 9 frames × 4 directions (up/left/down/right)
//   rows 4-7  (y 256..511): slash — 6 frames × 4 directions (x 0..383)
//   rows 8-11 (y 512..767): shoot — 13 frames × 4 directions (drawing a bow)
//
// Source files come in two shapes:
//   - master templates (sanderfrenken mirror): 832 px wide, all animations
//     stacked; walk is rows 8-11 (y 512..767), slash rows 12-15 (y 768..1023),
//     shoot rows 16-19 (y 1024..1279);
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
const SHOOT = { left: 0, top: 16 * 64, width: 13 * 64, height: 4 * 64 };
const SHEET = { width: 13 * 64, height: 12 * 64 };
const BOW = "spritesheets/weapon/ranged/bow";

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
  ["glasses_round.png", { walk: "spritesheets/facial/glasses/round/adult/walk.png", slash: "spritesheets/facial/glasses/round/adult/slash.png", shoot: "spritesheets/facial/glasses/round/adult/shoot.png" }, LIBERATED],
  ["outfit_apron.png", { walk: "spritesheets/torso/aprons/apron/male/walk/white.png", slash: "spritesheets/torso/aprons/apron/male/slash/white.png", shoot: "spritesheets/torso/aprons/apron/male/shoot/white.png" }, LIBERATED],
  // Weapon (the Wooden Sword): the LPC dagger, in front of and behind the body.
  ["weapon_dagger.png", { walk: "spritesheets/weapon/sword/dagger/walk/dagger.png", slash: "spritesheets/weapon/sword/dagger/slash/dagger.png" }, LIBERATED],
  ["weapon_dagger_behind.png", { walk: "spritesheets/weapon/sword/dagger/behind/walk/dagger.png", slash: "spritesheets/weapon/sword/dagger/behind/slash/dagger.png" }, LIBERATED],
  // Bows: carried while walking (128 px frames, cropped to 64), drawn and
  // loosed in the shoot rows; the nocked arrow rides on the front layer.
  ["weapon_bow.png", { walk: `${BOW}/normal/walk/foreground/light.png`, walk128: true, shoot: [`${BOW}/normal/universal/shoot/foreground.png`, `${BOW}/arrow/shoot/arrow.png`] }, LIBERATED],
  ["weapon_bow_behind.png", { walk: `${BOW}/normal/walk/background.png`, walk128: true, shoot: `${BOW}/normal/universal/shoot/background.png` }, LIBERATED],
];

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/** An oversized sheet (128 px frames) as 64 px frames: each frame's centre. */
async function from128(buf, cols, rows) {
  const parts = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    parts.push({ input: await sharp(buf).extract({ left: c * 128 + 32, top: r * 128 + 32, width: 64, height: 64 }).png().toBuffer(), left: c * 64, top: r * 64 });
  }
  return sharp({ create: { width: cols * 64, height: rows * 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(parts).png().toBuffer();
}
/** Several same-size layers stacked into one. */
async function stack(bufs, w, h) {
  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(await Promise.all(bufs.map(async (b) => ({ input: await fit(b, w, h), left: 0, top: 0 })))).png().toBuffer();
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
    let walk, slash, shoot;
    if (typeof src === "string") {
      const master = await download(`${root}/${src}`);
      walk = await sharp(master).extract(WALK).png().toBuffer();
      slash = await sharp(master).extract(SLASH).png().toBuffer();
      const meta = await sharp(master).metadata();
      shoot = meta.height >= SHOOT.top + SHOOT.height ? await sharp(master).extract(SHOOT).png().toBuffer() : null;
    } else {
      const w = await download(`${root}/${src.walk}`);
      walk = src.walk128 ? await from128(w, 9, 4) : await fit(w, WALK.width, WALK.height);
      slash = src.slash ? await fit(await download(`${root}/${src.slash}`), SLASH.width, SLASH.height) : null;
      const shoots = src.shoot ? (Array.isArray(src.shoot) ? src.shoot : [src.shoot]) : [];
      shoot = shoots.length ? await stack(await Promise.all(shoots.map((p) => download(`${root}/${p}`))), SHOOT.width, SHOOT.height) : null;
    }
    const parts = [{ input: walk, left: 0, top: 0 }];
    if (slash) parts.push({ input: slash, left: 0, top: 256 });
    if (shoot) parts.push({ input: shoot, left: 0, top: 512 });
    const out = await sharp({ create: { ...SHEET, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(parts)
      .png()
      .toBuffer();
    await writeFile(resolve(OUT_DIR, dest), out);
    ok++;
  } catch (err) {
    console.error(`    ✗ ${err.message}`);
    fail++;
  }
}

console.log(`\n${ok} sheets written (walk + slash + shoot), ${fail} failed → ${OUT_DIR}`);

// Derived layers: the held axe is drawn from the dagger sheet above.
try {
  await import("./draw-axe.mjs");
} catch (err) {
  console.error(`    ✗ axe layers: ${err.message}`);
  fail++;
}
process.exit(fail === 0 ? 0 : 1);
