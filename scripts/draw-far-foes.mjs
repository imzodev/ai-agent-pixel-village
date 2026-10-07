#!/usr/bin/env node
// The far lands' foes (danger tiers 5–8), procedurally drawn in the shared
// sheet format (scripts/pixel-art.mjs): rows = directions up / left / down /
// right, block 0 = walk, 1 = idle, 2 = attack, 4 frames each.
//
//   tier 5  dune_stalker (desert lizard-beast)   bog_hag (swamp witch)
//   tier 6  ice_troll (snow brute, 48 px)        gloam_stag (darkwood stag, 48 px)
//   tier 7  basalt_golem (peaks, 48 px)          wyvern (badlands, flying, 48 px)
//   tier 8  rime_wraith (snowpeak ghost)         elder_treant (deep forest, 48 px)
//
//   node scripts/draw-far-foes.mjs [kind]   → public/assets/animals/<kind>.png

import { blank, block, ellipse, line, outline as trace, poly, put, rect, setFrameSize, writeSheet } from "./pixel-art.mjs";

const rgb = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const WALK = [0, 1, 2, 3].map((i) => ({ step: [0, 1, 0, -1][i], bob: [0, 1, 0, 1][i], idle: 0, atk: 0 }));
const IDLE = [0, 1, 2, 3].map((i) => ({ step: 0, bob: [0, 0, 1, 1][i], idle: [0, 1, 2, 1][i], atk: 0 }));
const ATTACK = [0, 1, 2, 3].map((i) => ({ step: 0, bob: 0, idle: 0, atk: [1, 2, 3, 1][i] }));
const sheet = async (name, size, views) => { setFrameSize(size); await writeSheet(name, [block(views, WALK), block(views, IDLE), block(views, ATTACK)]); };

// ── Tier 5: Dune Stalker — a low, striped sand lizard with a raised crest ──
async function duneStalker() {
  const C = { ol: rgb(0x2a1c10), body: rgb(0xc8a060), dark: rgb(0x8a6838), stripe: rgb(0x6a4a28), belly: rgb(0xe8d0a0), eye: rgb(0xff5a2a), crest: rgb(0xb04a2a) };
  const o = (fr) => trace(fr, C.ol);
  const side = ({ step, bob, atk }) => {
    const fr = blank(), y = 20 - bob;
    line(fr, [[24, y], [29, y - 2 + step], [31, y - 4]], C.dark, 2); // tail
    for (const [x, d] of [[10, step], [20, -step]]) rect(fr, x + d, y + 3, 2, 5, C.dark);
    ellipse(fr, 16, y, 10, 4, C.body, C.dark);
    ellipse(fr, 15, y + 2, 7, 1.5, C.belly);
    for (const x of [12, 16, 20]) rect(fr, x, y - 3, 2, 5, C.stripe);
    for (let x = 11; x <= 21; x += 2) put(fr, x, y - 5, C.crest);
    ellipse(fr, 5 - atk, y - 1, 4, 3, C.body); // head, snapping forward
    rect(fr, 1 - atk, y, 4, 1 + Math.min(atk, 2), C.ol);
    put(fr, 4 - atk, y - 2, C.eye);
    return o(fr);
  };
  const front = ({ step, bob, atk }, face) => {
    const fr = blank(), y = 20 - bob;
    for (const s of [-1, 1]) rect(fr, 16 + s * 7 - 1, y + 2 + (s * step > 0 ? 1 : 0), 3, 5, C.dark);
    ellipse(fr, 16, y, 8, 5, C.body, C.dark);
    for (let k = -2; k <= 2; k++) put(fr, 16 + k * 2, y - 5, C.crest);
    if (face) {
      ellipse(fr, 16, y + 3 + atk * 0.5, 4, 3, C.body);
      put(fr, 14, y + 2, C.eye); put(fr, 18, y + 2, C.eye);
      if (atk) rect(fr, 14, y + 5, 5, Math.min(atk, 2), C.ol);
    } else for (const x of [12, 16, 20]) rect(fr, x, y - 3, 1, 6, C.stripe);
    return o(fr);
  };
  await sheet("dune_stalker", 32, { side, front: (f) => front(f, true), back: (f) => front(f, false) });
}

// ── Tier 5: Bog Hag — a hunched swamp witch with a lantern-green hex ──────
async function bogHag() {
  const C = { ol: rgb(0x14160e), robe: rgb(0x3a4a2a), robeLo: rgb(0x26321c), skin: rgb(0x8aa070), hair: rgb(0x9a9a8a), eye: rgb(0xd8ff5a), hex: rgb(0x9aff6a), staff: rgb(0x5a3a22) };
  const o = (fr) => trace(fr, C.ol);
  const body = (fr, bob, sway) => {
    poly(fr, [[10, 29], [22, 29], [20, 14 - bob], [12, 14 - bob]], C.robe);
    rect(fr, 11, 26, 10, 3, C.robeLo);
    ellipse(fr, 16 + sway, 11 - bob, 4, 4, C.skin);
    line(fr, [[12 + sway, 8 - bob], [11 + sway, 16 - bob]], C.hair, 2);
    line(fr, [[20 + sway, 8 - bob], [21 + sway, 16 - bob]], C.hair, 2);
    poly(fr, [[10 + sway, 9 - bob], [22 + sway, 9 - bob], [16 + sway, 1 - bob]], C.robeLo); // pointed hood
  };
  const side = ({ bob, idle, atk }) => {
    const fr = blank();
    body(fr, bob, -1);
    line(fr, [[7, 29], [7, 9 - bob]], C.staff, 2);
    put(fr, 13, 11 - bob, C.eye);
    let out = o(fr);
    if (atk) ellipse(out, 6 - atk, 8 - bob, 1 + atk, 1 + atk, C.hex); // the hex gathers at the staff
    if (idle === 2) put(out, 7, 7 - bob, C.hex);
    return out;
  };
  const front = ({ bob, atk }, face) => {
    const fr = blank();
    body(fr, bob, 0);
    line(fr, [[24, 29], [24, 9 - bob]], C.staff, 2);
    if (face) { put(fr, 14, 11 - bob, C.eye); put(fr, 18, 11 - bob, C.eye); }
    const out = o(fr);
    if (atk) ellipse(out, 24, 7 - bob, 1 + atk, 1 + atk, C.hex);
    return out;
  };
  await sheet("bog_hag", 32, { side, front: (f) => front(f, true), back: (f) => front(f, false) });
}

// ── Tier 6: Ice Troll — a hulking blue brute with a frosted club ──────────
async function iceTroll() {
  const C = { ol: rgb(0x10182a), skin: rgb(0x7a9ac0), skinLo: rgb(0x52709a), belly: rgb(0xb0c8e0), fur: rgb(0xe8f0f8), tusk: rgb(0xf8f0d8), eye: rgb(0x60e0ff), club: rgb(0x6a5040), frost: rgb(0xd8f4ff) };
  const o = (fr) => trace(fr, C.ol);
  const side = ({ step, bob, atk }) => {
    const fr = blank(), y = 30 - bob;
    for (const [x, d] of [[18, step], [26, -step]]) rect(fr, x + d * 2, y + 6, 6, 9, C.skinLo);
    ellipse(fr, 22, y, 12, 11, C.skin, C.skinLo);
    ellipse(fr, 19, y + 3, 7, 6, C.belly);
    for (let x = 14; x <= 30; x += 2) put(fr, x, y - 10, C.fur); // frosty back fur
    ellipse(fr, 12, y - 8, 7, 6, C.skin); // head forward
    put(fr, 9, y - 10, C.eye); rect(fr, 6, y - 6, 2, 3, C.tusk);
    // club arm: raised high on the wind-up, crashing down on the hit
    const a = atk === 0 ? [[14, y], [6, y + 6]] : atk === 1 ? [[16, y - 4], [14, y - 18]] : atk === 2 ? [[14, y - 4], [6, y - 16]] : [[12, y], [2, y + 8]];
    line(fr, a, C.skin, 4);
    const [cx, cy] = a[1];
    ellipse(fr, cx, cy, 4, 4, C.club);
    let out = o(fr);
    put(out, cx - 1, cy - 2, C.frost); put(out, cx + 1, cy - 3, C.frost);
    return out;
  };
  const front = ({ step, bob, atk }, face) => {
    const fr = blank(), y = 30 - bob;
    for (const s of [-1, 1]) rect(fr, 24 + s * 7 - 3, y + 6 + (s * step > 0 ? 1 : 0), 6, 9, C.skinLo);
    ellipse(fr, 24, y, 13, 11, C.skin, C.skinLo);
    if (face) {
      ellipse(fr, 24, y + 3, 7, 6, C.belly);
      ellipse(fr, 24, y - 11, 7, 6, C.skin);
      put(fr, 21, y - 12, C.eye); put(fr, 27, y - 12, C.eye);
      rect(fr, 20, y - 8, 2, 3, C.tusk); rect(fr, 27, y - 8, 2, 3, C.tusk);
    } else { ellipse(fr, 24, y - 11, 7, 6, C.skinLo); for (let x = 14; x <= 34; x += 2) put(fr, x, y - 9, C.fur); }
    const lift = atk === 1 ? -14 : atk === 2 ? -10 : 0;
    line(fr, [[35, y - 2], [40, y + 4 + lift]], C.skin, 4);
    ellipse(fr, 41, y + 8 + lift, 4, 4, C.club);
    return o(fr);
  };
  await sheet("ice_troll", 48, { side, front: (f) => front(f, true), back: (f) => front(f, false) });
}

// ── Tier 6: Gloam Stag — a dark stag with glowing violet antlers ──────────
async function gloamStag() {
  const C = { ol: rgb(0x120c18), coat: rgb(0x3a3048), coatLo: rgb(0x262034), belly: rgb(0x5a4a68), antler: rgb(0xb88aff), glow: rgb(0xe8d4ff), eye: rgb(0xc8a0ff), hoof: rgb(0x14101a) };
  const o = (fr) => trace(fr, C.ol);
  const antlers = (fr, x, y, dir) => {
    line(fr, [[x, y], [x + 3 * dir, y - 8], [x + 7 * dir, y - 12]], C.antler, 2);
    line(fr, [[x + 3 * dir, y - 8], [x - 1 * dir, y - 13]], C.antler, 1);
    line(fr, [[x + 5 * dir, y - 10], [x + 9 * dir, y - 9]], C.antler, 1);
  };
  const side = ({ step, bob, atk }) => {
    const fr = blank(), y = 28 - bob;
    for (const [x, d] of [[16, step], [30, -step]]) { rect(fr, x + d * 2, y + 4, 3, 11, C.coatLo); rect(fr, x + d * 2, y + 14, 3, 2, C.hoof); }
    ellipse(fr, 23, y, 11, 7, C.coat, C.coatLo);
    ellipse(fr, 22, y + 3, 7, 3, C.belly);
    const hx = 11 - atk * 2, hy = y - 8 + atk * 3; // head lowers to charge
    line(fr, [[16, y - 3], [hx + 2, hy + 2]], C.coat, 5);
    ellipse(fr, hx, hy, 5, 4, C.coat);
    put(fr, hx - 1, hy - 1, C.eye);
    antlers(fr, hx + 1, hy - 3, -1);
    antlers(fr, hx + 3, hy - 3, 1);
    const out = o(fr);
    put(out, hx - 6, hy - 15, C.glow); put(out, hx + 10, hy - 14, C.glow);
    return out;
  };
  const front = ({ step, bob, atk }, face) => {
    const fr = blank(), y = 28 - bob;
    for (const s of [-1, 1]) { rect(fr, 24 + s * 6 - 1, y + 4 + (s * step > 0 ? 1 : 0), 3, 12, C.coatLo); }
    ellipse(fr, 24, y, 9, 8, C.coat, C.coatLo);
    const hy = y - 10 + atk * 2;
    if (face) { ellipse(fr, 24, hy, 5, 6, C.coat); put(fr, 22, hy - 1, C.eye); put(fr, 26, hy - 1, C.eye); }
    else ellipse(fr, 24, hy, 5, 5, C.coatLo);
    antlers(fr, 21, hy - 4, -1); antlers(fr, 27, hy - 4, 1);
    return o(fr);
  };
  await sheet("gloam_stag", 48, { side, front: (f) => front(f, true), back: (f) => front(f, false) });
}

// ── Tier 7: Basalt Golem — a slab of dark rock with magma seams ───────────
async function basaltGolem() {
  const C = { ol: rgb(0x0e0c0c), rock: rgb(0x4a4646), rockLo: rgb(0x2e2a2a), rockHi: rgb(0x6a6464), magma: rgb(0xff7a2a), core: rgb(0xffd060) };
  const o = (fr) => trace(fr, C.ol);
  const seams = (fr, pts) => { for (const [x, y] of pts) put(fr, x, y, C.magma); };
  const side = ({ step, bob, atk }) => {
    const fr = blank(), y = 30 - bob;
    for (const [x, d] of [[16, step], [28, -step]]) rect(fr, x + d, y + 6, 7, 10, C.rockLo);
    poly(fr, [[12, y + 8], [36, y + 8], [34, y - 12], [14, y - 14]], C.rock);
    rect(fr, 16, y - 21, 12, 8, C.rockHi); // head block
    put(fr, 18, y - 18, C.core);
    const armY = atk === 1 ? y - 22 : atk === 2 ? y - 18 : atk === 3 ? y + 10 : y + 2;
    rect(fr, 8, Math.min(armY, y - 6), 7, Math.abs(armY - (y - 6)) + 7, C.rockLo);
    const out = o(fr);
    seams(out, [[20, y - 6], [21, y - 5], [22, y - 3], [26, y - 9], [27, y - 8], [24, y + 2], [25, y + 3]]);
    if (atk === 3) for (let x = 2; x < 20; x += 3) put(out, x, y + 15, C.magma); // ground cracks
    return out;
  };
  const front = ({ step, bob, atk }, face) => {
    const fr = blank(), y = 30 - bob;
    for (const s of [-1, 1]) rect(fr, 24 + s * 7 - 3, y + 6 + (s * step > 0 ? 1 : 0), 7, 10, C.rockLo);
    poly(fr, [[11, y + 8], [37, y + 8], [35, y - 13], [13, y - 13]], C.rock);
    rect(fr, 18, y - 21, 12, 8, C.rockHi);
    const lift = atk === 1 || atk === 2 ? -12 : 0;
    for (const s of [-1, 1]) rect(fr, 24 + s * 15 - 3, y - 8 + lift, 6, 14, C.rockLo);
    const out = o(fr);
    if (face) { put(out, 21, y - 18, C.core); put(out, 26, y - 18, C.core); }
    seams(out, [[24, y - 8], [24, y - 6], [23, y - 4], [25, y - 2], [20, y + 2], [29, y]]);
    return out;
  };
  await sheet("basalt_golem", 48, { side, front: (f) => front(f, true), back: (f) => front(f, false) });
}

// ── Tier 7: Wyvern — a rust-red flyer with leathery wings (flies: no ground) ──
async function wyvern() {
  const C = { ol: rgb(0x1a0a08), scale: rgb(0xa8402a), scaleLo: rgb(0x702818), wing: rgb(0xd0704a), wingLo: rgb(0x8a3a22), belly: rgb(0xe8b070), eye: rgb(0xffe050), fire: rgb(0xffa030), fire2: rgb(0xfff0a0) };
  const shadow = [0, 0, 0, 70];
  const o = (fr) => trace(fr, C.ol);
  const flap = (s) => [0, -6, -2, 4][s & 3];
  const side = ({ bob, idle, atk, step }) => {
    const fr = blank(), y = 20 + bob, w = flap(step + idle + atk);
    poly(fr, [[20, y - 2], [36, y - 14 + w], [32, y + 2]], C.wing); // far wing
    line(fr, [[30, y + 2], [40, y + 6], [44, y + 3]], C.scaleLo, 2); // tail
    ellipse(fr, 26, y + 2, 9, 5, C.scale, C.scaleLo);
    ellipse(fr, 25, y + 4, 6, 2, C.belly);
    line(fr, [[18, y], [12, y - 4]], C.scale, 4); // neck
    ellipse(fr, 10, y - 5, 4, 3, C.scale);
    put(fr, 9, y - 6, C.eye);
    poly(fr, [[22, y - 1], [14, y - 16 + w], [30, y]], C.wingLo); // near wing
    const out = o(fr);
    if (atk) for (let k = 0; k < atk * 3; k++) put(out, 5 - k, y - 5 + ((k * 7) % 3) - 1, k % 2 ? C.fire : C.fire2); // breath
    ellipse(out, 25, 44, 7, 2, shadow);
    return out;
  };
  const front = ({ bob, idle, atk, step }, face) => {
    const fr = blank(), y = 20 + bob, w = flap(step + idle + atk);
    for (const s of [-1, 1]) poly(fr, [[24 + s * 4, y - 2], [24 + s * 20, y - 12 + w], [24 + s * 16, y + 4]], s < 0 ? C.wing : C.wingLo);
    ellipse(fr, 24, y + 2, 7, 7, C.scale, C.scaleLo);
    if (face) { ellipse(fr, 24, y - 7, 4, 4, C.scale); put(fr, 22, y - 8, C.eye); put(fr, 26, y - 8, C.eye); ellipse(fr, 24, y + 3, 4, 4, C.belly); }
    else line(fr, [[24, y + 8], [24, y + 16]], C.scaleLo, 2);
    const out = o(fr);
    if (atk && face) ellipse(out, 24, y - 2 + atk, 2 + atk, 1 + atk, C.fire);
    ellipse(out, 24, 44, 8, 2, shadow);
    return out;
  };
  await sheet("wyvern", 48, { side, front: (f) => front(f, true), back: (f) => front(f, false) });
}

// ── Tier 8: Rime Wraith — a tattered, icy ghost (night only, hovers) ──────
async function rimeWraith() {
  const C = { ol: rgb(0x10202e), cloak: rgb(0xb8d4ea), cloakLo: rgb(0x7e9ab8), void: rgb(0x0a1420), eye: rgb(0x8af0ff), ice: rgb(0xf0fbff) };
  const shadow = [0, 0, 0, 60];
  const o = (fr) => trace(fr, C.ol);
  const ghost = ({ bob, idle, atk }, face, side) => {
    const fr = blank(), y = 12 + (bob || (idle & 1));
    poly(fr, [[16, y - 9], [24 + (side ? 2 : 0), y + 4], [22, y + 15], [19, y + 12], [16, y + 16], [13, y + 12], [10, y + 15], [8, y + 4]], C.cloak);
    for (let k = 0; k < 4; k++) put(fr, 10 + k * 4, y + 13 + (k & 1), C.cloakLo);
    ellipse(fr, 16 + (side ? -2 : 0), y - 3, 5, 5, face ? C.void : C.cloakLo);
    if (face) { put(fr, 14 - (side ? 2 : 0), y - 4, C.eye); if (!side) put(fr, 18, y - 4, C.eye); }
    if (atk) line(fr, [[side ? 8 : 22, y + 2], [side ? 3 - atk : 26 + atk, y - 1]], C.cloakLo, 2); // claw reaching out
    const out = o(fr);
    if (atk) ellipse(out, side ? 2 - atk : 28 + atk, y - 2, 1 + atk * 0.6, 1 + atk * 0.6, C.ice);
    ellipse(out, 16, 30, 6, 1.5, shadow);
    return out;
  };
  await sheet("rime_wraith", 32, { side: (f) => ghost(f, true, true), front: (f) => ghost(f, true, false), back: (f) => ghost(f, false, false) });
}

// ── Tier 8: Elder Treant — an ancient walking oak, moss-bearded ───────────
async function elderTreant() {
  const C = { ol: rgb(0x120e08), bark: rgb(0x5e4228), barkLo: rgb(0x3e2a18), barkHi: rgb(0x7e5c3a), leaf: rgb(0x3c7a32), leafLo: rgb(0x285a24), leafHi: rgb(0x5aa048), moss: rgb(0x8ab04a), eye: rgb(0xb8ff6a) };
  const o = (fr) => trace(fr, C.ol);
  const canopy = (fr, cx, y) => {
    for (const [dx, dy, r] of [[0, -6, 11], [-9, 0, 8], [9, 0, 8], [-4, -12, 7], [6, -12, 7]]) ellipse(fr, cx + dx, y + dy, r, r * 0.8, C.leaf, C.leafLo);
    for (const [dx, dy] of [[-6, -10], [3, -14], [8, -4], [-10, -2], [0, -6]]) put(fr, cx + dx, y + dy, C.leafHi);
  };
  const side = ({ step, bob, atk }) => {
    const fr = blank(), y = 30 - bob;
    for (const [x, d] of [[18, step], [28, -step]]) poly(fr, [[x + d * 2, y + 4], [x + 6 + d * 2, y + 4], [x + 8 + d * 3, y + 17], [x - 2 + d, y + 17]], C.barkLo); // root legs
    rect(fr, 17, y - 10, 14, 16, C.bark);
    for (let k = 0; k < 4; k++) line(fr, [[19 + k * 3, y - 9], [19 + k * 3, y + 5]], C.barkLo, 1);
    canopy(fr, 24, y - 16);
    // branch arm: drawn back, then sweeping forward
    const arm = atk === 1 ? [[18, y - 6], [10, y - 20]] : atk === 2 ? [[18, y - 6], [6, y - 12]] : atk === 3 ? [[18, y - 4], [2, y + 4]] : [[18, y - 4], [12, y + 6]];
    line(fr, arm, C.barkHi, 3);
    const out = o(fr);
    put(out, 19, y - 6, C.eye);
    for (let k = 0; k < 4; k++) put(out, 18 + k, y + 1 + (k & 1), C.moss);
    return out;
  };
  const front = ({ step, bob, atk }, face) => {
    const fr = blank(), y = 30 - bob;
    for (const s of [-1, 1]) poly(fr, [[24 + s * 3, y + 4], [24 + s * 9, y + 4], [24 + s * 12, y + 17 + (s * step > 0 ? 1 : 0)], [24 + s * 2, y + 17]], C.barkLo);
    rect(fr, 16, y - 10, 16, 16, C.bark);
    canopy(fr, 24, y - 16);
    const lift = atk === 1 || atk === 2 ? -10 : 0;
    for (const s of [-1, 1]) line(fr, [[24 + s * 8, y - 6], [24 + s * 16, y + 4 + lift]], C.barkHi, 3);
    const out = o(fr);
    if (face) { put(out, 21, y - 5, C.eye); put(out, 27, y - 5, C.eye); for (let k = 0; k < 7; k++) put(out, 21 + k, y + 1 + (k % 3), C.moss); }
    return out;
  };
  await sheet("elder_treant", 48, { side, front: (f) => front(f, true), back: (f) => front(f, false) });
}

const ALL = { dune_stalker: duneStalker, bog_hag: bogHag, ice_troll: iceTroll, gloam_stag: gloamStag, basalt_golem: basaltGolem, wyvern, rime_wraith: rimeWraith, elder_treant: elderTreant };
const only = process.argv[2];
for (const [k, draw] of Object.entries(ALL)) if (!only || only === k) await draw();
