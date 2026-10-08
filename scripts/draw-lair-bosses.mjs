#!/usr/bin/env node
// The lair bosses of the far lands (src/lib/lairs.ts), drawn in the world
// boss format (scripts/draw-rootking.mjs): 64×64 frames, 4 columns, rows up /
// left / down / right all showing the same front view (a boss stands its
// ground), a 4-frame idle. Each draws its own ground shadow.
//
//   node scripts/draw-lair-bosses.mjs [kind]   → public/assets/animals/<kind>.png

import { blank, ellipse, line, outline as trace, poly, put, rect, setFrameSize, writeSheet } from "./pixel-art.mjs";

const rgb = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const SHADOW = [0, 0, 0, 80];
const IDLE = [0, 1, 2, 3];
/** Every row shows the same front view (bosses don't turn). */
const sheet = async (name, draw) => {
  setFrameSize(64);
  const frames = IDLE.map(draw);
  await writeSheet(name, [{ up: frames, left: frames, down: frames, right: frames }]);
};

// ── Tier 5: Sand Wyrm — a segmented worm rearing out of the sand ─────────
async function sandWyrm() {
  const C = { ol: rgb(0x2a1a0c), body: rgb(0xc89a58), bodyDk: rgb(0x9a7038), ring: rgb(0x7a5428), belly: rgb(0xe8c890), maw: rgb(0x5a1a14), tooth: rgb(0xf8f0d8), sand: rgb(0xd8b878), sandDk: rgb(0xb8945a), eye: rgb(0xff6a2a) };
  await sheet("sand_wyrm", (i) => {
    const fr = blank();
    const sway = [0, 1, 0, -1][i], gape = [2, 3, 4, 3][i];
    ellipse(fr, 32, 56, 22, 6, C.sand, C.sandDk); // the pit's rim of sand
    // body segments rising, swaying
    for (let k = 0; k < 6; k++) {
      const y = 52 - k * 7, x = 32 + Math.round(Math.sin(k * 0.7 + sway * 0.4) * (2 + k * 0.6));
      ellipse(fr, x, y, 11 - k * 0.6, 5, C.body, C.bodyDk);
      line(fr, [[x - 9 + k * 0.5, y + 2], [x + 9 - k * 0.5, y + 2]], C.ring, 1);
      ellipse(fr, x, y + 1, 5, 2, C.belly);
    }
    const hx = 32 + Math.round(Math.sin(6 * 0.7 + sway * 0.4) * 5), hy = 10;
    ellipse(fr, hx, hy, 11, 8, C.body, C.bodyDk); // head
    ellipse(fr, hx, hy + 2, 6, gape, C.maw); // round maw
    for (let a = 0; a < 8; a++) { const t = (a / 8) * Math.PI * 2; put(fr, hx + Math.cos(t) * 6, hy + 2 + Math.sin(t) * gape, C.tooth); }
    for (const s of [-1, 1]) { line(fr, [[hx + s * 9, hy + 3], [hx + s * 13, hy + 9 + gape]], C.bodyDk, 2); put(fr, hx + s * 7, hy - 4, C.eye); } // mandibles, eyes
    const out = trace(fr, C.ol);
    ellipse(out, 32, 60, 20, 3, SHADOW);
    return out;
  });
}

// ── Tier 6: Frost Giant — a huge blue giant with an ice beard and crown ──
async function frostGiant() {
  const C = { ol: rgb(0x0e1626), skin: rgb(0x7aa0d0), skinDk: rgb(0x5478aa), fur: rgb(0xd8e4f0), furDk: rgb(0xa8b8cc), ice: rgb(0xc8f0ff), iceDk: rgb(0x80c8e8), eye: rgb(0x9af8ff), belt: rgb(0x5a4030) };
  await sheet("frost_giant", (i) => {
    const fr = blank();
    const breath = [0, 1, 1, 0][i], arm = [0, 1, 2, 1][i];
    for (const s of [-1, 1]) rect(fr, 32 + s * 7 - 4, 48, 8, 12, C.skinDk); // legs
    ellipse(fr, 32, 38 - breath, 15, 14, C.fur, C.furDk); // fur cloak
    ellipse(fr, 32, 36 - breath, 11, 11, C.skin, C.skinDk); // chest
    rect(fr, 22, 45, 20, 3, C.belt);
    for (const s of [-1, 1]) { line(fr, [[32 + s * 13, 30], [32 + s * (18 + arm), 46]], C.skin, 5); ellipse(fr, 32 + s * (18 + arm), 48, 4, 4, C.skinDk); } // arms, fists
    ellipse(fr, 32, 16 - breath, 9, 9, C.skin, C.skinDk); // head
    poly(fr, [[24, 19 - breath], [40, 19 - breath], [36, 31], [32, 34], [28, 31]], C.ice); // ice beard
    line(fr, [[30, 22 - breath], [32, 32]], C.iceDk, 1);
    for (const x of [24, 28, 32, 36, 40]) poly(fr, [[x - 2, 9 - breath], [x + 2, 9 - breath], [x, 2 - breath - (x === 32 ? 3 : 0)]], C.ice); // crown of icicles
    put(fr, 28, 15 - breath, C.eye); put(fr, 36, 15 - breath, C.eye);
    const out = trace(fr, C.ol);
    ellipse(out, 32, 61, 18, 3, SHADOW);
    return out;
  });
}

// ── Tier 7: Fire Drake — a red dragon, wings spread, fire in its maw ─────
async function fireDrake() {
  const C = { ol: rgb(0x1a0806), scale: rgb(0xb8382a), scaleDk: rgb(0x7a2016), wing: rgb(0xd86a3a), wingDk: rgb(0x8a3018), belly: rgb(0xf0b060), horn: rgb(0xf0e0c0), eye: rgb(0xfff060), fire: rgb(0xffa020), fire2: rgb(0xfff0a0) };
  await sheet("fire_drake", (i) => {
    const fr = blank();
    const flap = [0, -4, -2, 2][i];
    for (const s of [-1, 1]) poly(fr, [[32 + s * 8, 28], [32 + s * 30, 10 + flap], [32 + s * 28, 30 + flap], [32 + s * 20, 36]], s < 0 ? C.wing : C.wingDk); // wings
    for (const s of [-1, 1]) for (let k = 1; k <= 3; k++) line(fr, [[32 + s * 9, 28], [32 + s * (12 + k * 6), 12 + flap + k * 5]], C.wingDk, 1); // wing bones
    line(fr, [[38, 52], [50, 56], [56, 52]], C.scaleDk, 3); // tail
    for (const s of [-1, 1]) rect(fr, 32 + s * 7 - 3, 46, 6, 12, C.scaleDk); // legs
    ellipse(fr, 32, 38, 12, 13, C.scale, C.scaleDk);
    ellipse(fr, 32, 41, 7, 9, C.belly);
    line(fr, [[32, 28], [32, 18]], C.scale, 7); // neck
    ellipse(fr, 32, 14, 8, 7, C.scale, C.scaleDk); // head
    for (const s of [-1, 1]) line(fr, [[32 + s * 5, 9], [32 + s * 9, 2]], C.horn, 2);
    put(fr, 29, 13, C.eye); put(fr, 35, 13, C.eye);
    const out = trace(fr, C.ol);
    // smoke and embers from the maw
    for (let k = 0; k < 3 + i; k++) put(out, 32 + ((k * 5) % 7) - 3, 20 + k, k % 2 ? C.fire : C.fire2);
    ellipse(out, 32, 61, 22, 3, SHADOW);
    return out;
  });
}

// ── Tier 8: the Hollow — a gaunt shadow of twisted wood with one eye ─────
async function theHollow() {
  const C = { ol: rgb(0x08060c), bark: rgb(0x2e2238), barkDk: rgb(0x1a1222), barkLt: rgb(0x4a3a58), eye: rgb(0xb8ff6a), eyeHi: rgb(0xf0ffd0), wisp: rgb(0x8a6ac8), moss: rgb(0x3a4a2a) };
  await sheet("the_hollow", (i) => {
    const fr = blank();
    const lean = [0, 1, 0, -1][i], pulse = [3, 4, 5, 4][i];
    for (const [dx, len] of [[-14, 8], [-6, 5], [6, 5], [14, 8]]) line(fr, [[32 + dx * 0.5, 54], [32 + dx + Math.sign(dx) * len * 0.3, 60]], C.barkDk, 3); // roots
    poly(fr, [[24, 56], [40, 56], [37 + lean, 24], [27 + lean, 24]], C.bark); // trunk-body
    for (let k = 0; k < 4; k++) line(fr, [[28 + k * 3, 54], [29 + k * 3 + lean, 26]], C.barkDk, 1);
    for (const s of [-1, 1]) line(fr, [[32 + s * 6 + lean, 30], [32 + s * 16, 38], [32 + s * 22, 52 - pulse]], C.barkLt, 3); // long arms, claw fingers
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) line(fr, [[32 + s * 22, 52 - pulse], [32 + s * (21 + k * 2), 58 - pulse]], C.barkLt, 1);
    // the crown: bare twisted branches
    for (const [x, y] of [[20, 6], [26, 2], [32, 4], [38, 1], [44, 7]]) line(fr, [[32 + lean, 24], [32 + lean + (x - 32) * 0.5, 14], [x + lean, y]], C.barkDk, 2);
    ellipse(fr, 32 + lean, 30, 7, 6, C.barkDk); // the hollow
    ellipse(fr, 32 + lean, 30, pulse, pulse - 1, C.eye); // one eye
    put(fr, 31 + lean, 29, C.eyeHi);
    for (let k = 0; k < 6; k++) put(fr, 26 + k * 2, 50 + (k % 2), C.moss);
    const out = trace(fr, C.ol);
    for (let k = 0; k < 4; k++) put(out, 18 + ((k * 13 + i * 3) % 28), 12 + ((k * 7 + i * 5) % 30), C.wisp); // drifting wisps
    ellipse(out, 32, 61, 18, 3, SHADOW);
    return out;
  });
}

const ALL = { sand_wyrm: sandWyrm, frost_giant: frostGiant, fire_drake: fireDrake, the_hollow: theHollow };
const only = process.argv[2];
for (const [k, draw] of Object.entries(ALL)) if (!only || only === k) await draw();
