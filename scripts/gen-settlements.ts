// Generate the continent's towns, the roads joining them to the King's
// Road, and their people. Deterministic: same continent, same towns.
//
//   npx tsx --tsconfig tsconfig.json scripts/gen-settlements.ts
//
// Writes src/lib/settlementsData.json (towns, roads, NPCs) and replaces
// the `st_*` entries of public/buildings/buildings.json (each town's
// square, inn, waystone and houses, laid out like Hollowmere's). Every
// system — terrain, collision, NPCs, shops, inns, the map — reads those
// two files. Re-run after changing the continent or the town layout.

import fs from "node:fs";
import path from "node:path";
import { CONTINENT, biomeAt, elevation, inHeartland, terrainProbe } from "../src/lib/continent";
import { terrainAt, ROAD } from "../src/lib/regions";
import { TOWN_LAYOUT, townBox } from "../src/lib/settlements";
import { blockedFromChunk } from "../src/lib/chunkCollision";
import { hash } from "../src/lib/terrain/noise";
import type { Biome } from "../src/types/continent";
import type { SettlementNpcDef, SettlementsData, TownDef, TownFamily } from "../src/types/settlement";
import type { Appearance } from "../src/types/domain";

const ROOT = process.cwd();
const SEA = 0.3;

// ── Sites ────────────────────────────────────────────────────────────────
const FAMILY_OF: Partial<Record<Biome, TownFamily>> = {
  beach: "port", desert: "desert", badlands: "desert", snow: "snow", swamp: "swamp", darkwood: "darkwood", meadow: "hills", forest: "hills",
};
const ORDER: TownFamily[] = ["port", "desert", "snow", "swamp", "darkwood", "hills"];

function siteOk(sq: { tx: number; ty: number }, family: TownFamily): boolean {
  const b = townBox(sq);
  if (b.tx0 < CONTINENT.tx0 + 6 || b.tx1 > CONTINENT.tx1 - 6 || b.ty0 < CONTINENT.ty0 + 6 || b.ty1 > CONTINENT.ty1 - 6) return false;
  let wet = 0, n = 0;
  for (let ty = b.ty0 - 4; ty <= b.ty1 + 4; ty += 3) for (let tx = b.tx0 - 4; tx <= b.tx1 + 4; tx += 4) {
    if (inHeartland(tx, ty)) return false;
    if (elevation(tx, ty) < SEA + 0.03 || terrainProbe.level(tx, ty) > 0) return false;
    n++;
    if (terrainProbe.water(tx, ty)) wet++;
  }
  return wet / n <= (family === "swamp" ? 0.45 : 0.05);
}
function familyAt(sq: { tx: number; ty: number }): TownFamily | null {
  const c = { tx: sq.tx + 12, ty: sq.ty + 7 };
  const f = FAMILY_OF[biomeAt(c.tx, c.ty)] ?? null;
  if (!f) return null;
  if (f === "hills" || f === "desert") {
    // near the sea → a port instead
    for (let d = 40; d <= 70; d += 10) for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) if (elevation(c.tx + dx * 1.5, c.ty + dy) < SEA) return f === "hills" ? "port" : f;
  }
  return f;
}
const heartDistance = (tx: number, ty: number) => {
  let best = Infinity;
  for (let x = ROAD.tx0; x <= 120; x += 20) best = Math.min(best, Math.hypot(tx - x, (ty - 7) * 1.4));
  return best;
};

function pickSites(): { family: TownFamily; sq: { tx: number; ty: number } }[] {
  const cands: { family: TownFamily; sq: { tx: number; ty: number } }[] = [];
  for (let ty = CONTINENT.ty0 + 30; ty <= CONTINENT.ty1 - 40; ty += 9) for (let tx = CONTINENT.tx0 + 60; tx <= CONTINENT.tx1 - 80; tx += 12) {
    const sq = { tx, ty };
    const family = familyAt(sq);
    if (family && siteOk(sq, family) && heartDistance(tx + 12, ty + 7) > 110) cands.push({ family, sq });
  }
  const chosen: { family: TownFamily; sq: { tx: number; ty: number } }[] = [];
  for (const family of ORDER) {
    let best: (typeof cands)[number] | null = null, bestScore = -Infinity;
    for (const c of cands) {
      if (c.family !== family) continue;
      const spread = Math.min(heartDistance(c.sq.tx, c.sq.ty) * 0.6, ...chosen.map((o) => Math.hypot(o.sq.tx - c.sq.tx, (o.sq.ty - c.sq.ty) * 1.4)));
      const score = Math.min(spread, 260) - heartDistance(c.sq.tx, c.sq.ty) * 0.25 + hash(c.sq.tx, c.sq.ty, 601) * 10; // spread out, but not at the very edge
      if (score > bestScore) { bestScore = score; best = c; }
    }
    if (best) chosen.push(best);
    else console.warn(`no site for a ${family} town`);
  }
  return chosen;
}

// ── Names and people ─────────────────────────────────────────────────────
const SYLLABLES: Record<TownFamily, [string[], string[]]> = {
  port: [["Salt", "Gull", "Anchor", "Driftwood", "Tide", "Coral"], ["haven", "port", "cove", "mouth", "wick"]],
  desert: [["Sun", "Dust", "Ember", "Scorch", "Mirage", "Cactus"], ["rest", "well", "spring", "gulch", "stead"]],
  snow: [["Frost", "Rime", "Ice", "Snow", "Pine", "Winter"], ["hold", "lodge", "fall", "peak", "watch"]],
  swamp: [["Mire", "Bog", "Reed", "Fen", "Murk", "Toad"], ["stilts", "water", "hollow", "moor", "ford"]],
  darkwood: [["Gloam", "Raven", "Night", "Thorn", "Moss", "Shade"], ["wood", "glen", "crook", "briar", "dell"]],
  hills: [["Clover", "Lark", "Barley", "Honey", "Amber", "Willow"], ["dale", "field", "hill", "brook", "ton"]],
};
const FLAVOUR: Record<TownFamily, string> = {
  port: "a salty harbour town where fishing boats come and go",
  desert: "a dusty outpost around a deep well, baked by the sun",
  snow: "a snowbound lodge town of pine smoke and frosted windows",
  swamp: "a damp village on the edge of the fen, all reeds and fog",
  darkwood: "a quiet hamlet in the shadow of the darkwood",
  hills: "a cheerful farming town among rolling green hills",
};
const DANGER: Record<TownFamily, string> = {
  port: "the crabs on the shore and the storms off the sea",
  desert: "the sand scorpions that come out of the dunes",
  snow: "the frost wolves that hunt down from the peaks",
  swamp: "the bog lurkers in the pools",
  darkwood: "the shades that drift between the trees",
  hills: "the wolves and boars in the woods",
};
const FIRST = ["Ada", "Bram", "Cora", "Dell", "Edda", "Finn", "Gus", "Hana", "Ines", "Jory", "Kit", "Lena", "Milo", "Nell", "Otto", "Pia", "Quin", "Rosa", "Sven", "Tess", "Ulla", "Vic", "Wade", "Yara"];
const SKIN = ["#f1c9a5", "#e8c39e", "#d9a066", "#c68e5a", "#8d5524", "#ffdbac"];
const HAIR = ["plain", "bob", "spiked", "messy1", "long", "bangs", "afro", "buzzcut", "bedhead", "cowlick"];
const HAIR_COL = ["#2b1d14", "#5a3a1a", "#8c5a2b", "#c94f2a", "#dcdcdc", "#1a1a1a", "#e0c070"];
const SHIRT = ["#4a7c59", "#5b7db1", "#a43a32", "#7b5ea7", "#c97b30", "#2a6a7a", "#7a4a2a", "#3a3a4a"];
const PANTS = ["#3a3a4a", "#4a3a2a", "#2e2e3a", "#5a4632", "#3d3d3d"];
const pick = <T,>(arr: readonly T[], a: number, b: number, salt: number) => arr[Math.floor(hash(a, b, salt) * arr.length)];

function appearance(seed: number, salt: number): Appearance {
  return {
    body: hash(seed, salt, 1) < 0.5 ? "male" : "female",
    skin: pick(SKIN, seed, salt, 2), hair: pick(HAIR, seed, salt, 3), hairColor: pick(HAIR_COL, seed, salt, 4),
    shirtColor: pick(SHIRT, seed, salt, 5), pantsColor: pick(PANTS, seed, salt, 6),
  } as Appearance;
}

function people(t: TownDef, seed: number): SettlementNpcDef[] {
  const name = (k: number) => pick(FIRST, seed, k, 610);
  const inn = { tx: t.sq.tx + 11, ty: t.sq.ty - 1 };
  const base = (job: SettlementNpcDef["job"], k: number) => ({ town: t.key, job, appearance: appearance(seed, k), key: `${t.key}_${job}${job === "folk" ? k : ""}` });
  return [
    { ...base("innkeeper", 1), name: name(1), role: `Innkeeper of ${t.name}`, mood: "warm", wanderRadius: 30, tilePos: [inn.tx, inn.ty],
      persona: `${name(1)} keeps the inn in ${t.name}, ${FLAVOUR[t.family]}. Knows every traveller's tale, sells hot stew and bread, lets the weary rest by the fire, and worries about ${DANGER[t.family]}.`,
      greeting: `Welcome to ${t.name}, traveller! Sit down, warm up — the stew's on.` },
    { ...base("shopkeeper", 2), name: name(2), role: `Shopkeeper of ${t.name}`, mood: "brisk", wanderRadius: 40, tilePos: [t.sq.tx + 5, t.sq.ty + 4],
      persona: `${name(2)} runs the general store in ${t.name}. Sells seeds, tools and supplies for the road, and buys whatever the land around ${t.name} offers. Shrewd but fair.`,
      greeting: `Supplies for the road? You've come to the right place.` },
    { ...base("bounty", 3), name: name(3), role: `Bounty Master of ${t.name}`, mood: "stern", wanderRadius: 20, tilePos: [t.sq.tx - 4, t.sq.ty + 13],
      persona: `${name(3)} pins the bounties on ${t.name}'s notice board and pays out when the work's done. Gruff, honest, and tired of ${DANGER[t.family]}. Respects anyone who helps the town.`,
      greeting: `Looking for work? Check the board. ${t.name} pays for honest help.` },
    { ...base("folk", 4), name: name(4), role: `${t.name} Local`, mood: "chatty", wanderRadius: 80, tilePos: [t.sq.tx - 20, t.sq.ty + 7],
      persona: `${name(4)} has lived in ${t.name} all their life — ${FLAVOUR[t.family]}. Loves gossip, local lore and telling newcomers where not to wander.`,
      greeting: `Oh, a new face! Not many make it out to ${t.name}.` },
    { ...base("folk", 5), name: name(5), role: `${t.name} Local`, mood: "curious", wanderRadius: 80, tilePos: [t.sq.tx + 44, t.sq.ty + 7],
      persona: `${name(5)} is a ${t.family === "port" ? "fisher" : t.family === "desert" ? "well-digger" : t.family === "snow" ? "trapper" : t.family === "swamp" ? "reed-cutter" : t.family === "darkwood" ? "woodcutter" : "farmer"} in ${t.name}. Practical, a little suspicious of strangers, warms up quickly to anyone who lends a hand.`,
      greeting: `Hm. Traveller. You'll want the inn, it's by the square.` },
  ];
}

// ── Roads ────────────────────────────────────────────────────────────────
const G = 3; // coarse grid step (tiles)
const stampBlocked = (() => {
  const out = new Set<string>();
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "public/buildings/buildings.json"), "utf8"));
  for (const e of manifest.buildings) {
    const tpl = JSON.parse(fs.readFileSync(path.join(ROOT, "public", e.file), "utf8"));
    for (const i of blockedFromChunk(tpl)) out.add(`${e.tx + (i % 24)},${e.ty + Math.floor(i / 24)}`);
  }
  return out;
})();
/** Cost of a road through tile (tx, ty): Infinity where it can't go. */
function cost(tx: number, ty: number): number {
  if (tx < CONTINENT.tx0 + 2 || tx > CONTINENT.tx1 - 2 || ty < CONTINENT.ty0 + 2 || ty > CONTINENT.ty1 - 2) return Infinity;
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (stampBlocked.has(`${tx + dx},${ty + dy}`)) return Infinity;
  const c = terrainAt(tx, ty);
  if (c.ground.startsWith("deep_")) return Infinity;
  if (c.ground.startsWith("water_") || c.ground.startsWith("swamp_")) return 9; // bridge
  if (c.lower?.startsWith("tree_")) return 1.6; // cleared
  if (c.lower) return Infinity; // cliffs, rocks, props
  return c.upper?.startsWith("path_") ? 0.6 : 1;
}
/** Cheapest coarse path from `start` to any goal cell; returns tiles. */
function route(start: { tx: number; ty: number }, goal: (gx: number, gy: number) => boolean): [number, number][] | null {
  const key = (gx: number, gy: number) => `${gx},${gy}`;
  const sx = Math.round(start.tx / G), sy = Math.round(start.ty / G);
  const dist = new Map<string, number>([[key(sx, sy), 0]]);
  const prev = new Map<string, string>();
  const open: [number, number, number][] = [[0, sx, sy]];
  const done = new Set<string>();
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
    const [d, gx, gy] = open.splice(bi, 1)[0];
    const k = key(gx, gy);
    if (done.has(k)) continue;
    done.add(k);
    if (goal(gx, gy) && k !== key(sx, sy)) {
      const out: [number, number][] = [];
      let cur: string | undefined = k;
      while (cur) { const [x, y] = cur.split(",").map(Number); out.push([x * G, y * G]); cur = prev.get(cur); }
      return out.reverse();
    }
    if (done.size > 60000) return null;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = gx + dx, ny = gy + dy, nk = key(nx, ny);
      if (done.has(nk)) continue;
      let c = 0;
      for (let s = 1; s <= G; s++) c += cost(gx * G + dx * s, gy * G + dy * s);
      if (!Number.isFinite(c)) continue;
      const nd = d + c + (dx !== 0 ? 0.05 : 0); // a faint preference for north–south runs
      if (nd < (dist.get(nk) ?? Infinity)) { dist.set(nk, nd); prev.set(nk, k); open.push([nd, nx, ny]); }
    }
  }
  return null;
}
/** Coarse corners → every tile along the way (axis-aligned steps). */
function expand(coarse: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < coarse.length; i++) {
    const [x, y] = coarse[i];
    if (i === 0) { out.push([x, y]); continue; }
    const [px, py] = coarse[i - 1];
    for (let s = 1; s <= G; s++) out.push([px + Math.sign(x - px) * s, py + Math.sign(y - py) * s]);
  }
  return out;
}

// ── Main ─────────────────────────────────────────────────────────────────
const sites = pickSites();
const usedNames = new Set<string>();
const towns: TownDef[] = sites.map(({ family, sq }, i) => {
  const [a, b] = SYLLABLES[family];
  let name = "";
  for (let k = 0; name === "" || usedNames.has(name); k++) name = pick(a, sq.tx, sq.ty, 620 + k) + pick(b, sq.ty, sq.tx, 630 + k);
  usedNames.add(name);
  return { key: name.toLowerCase(), name, family, sq, box: townBox(sq) };
  void i;
});

const roadCells = new Set<string>();
const roads: [number, number][][] = [];
const onKingsRoad = (gx: number, gy: number) => gy * G >= ROAD.ty0 && gy * G <= ROAD.ty1 && gx * G >= ROAD.tx0 && gx * G <= ROAD.tx1;
for (const t of [...towns].sort((p, q) => heartDistance(p.sq.tx, p.sq.ty) - heartDistance(q.sq.tx, q.sq.ty))) {
  // leave from whichever end of the main street faces the King's Road
  const west = Math.abs(t.box.tx0 - (-400)) < Math.abs(t.box.tx1 - (-400));
  const start = { tx: west ? t.box.tx0 : t.box.tx1, ty: t.sq.ty + 6 };
  const inTown = (gx: number, gy: number) => gx * G >= t.box.tx0 && gx * G <= t.box.tx1 && gy * G >= t.box.ty0 && gy * G <= t.box.ty1;
  const coarse = route(start, (gx, gy) => !inTown(gx, gy) && (onKingsRoad(gx, gy) || roadCells.has(`${gx},${gy}`)));
  if (!coarse) { console.warn(`no road for ${t.name}`); continue; }
  for (const [x, y] of coarse) roadCells.add(`${x / G},${y / G}`);
  roads.push(expand(coarse));
  console.log(`${t.name.padEnd(14)} ${t.family.padEnd(8)} square (${t.sq.tx}, ${t.sq.ty}), road ${coarse.length * G} tiles`);
}

const npcs = towns.flatMap((t, i) => people(t, 9000 + i * 17));
const data: SettlementsData = { towns, roads, npcs };
fs.writeFileSync(path.join(ROOT, "src/lib/settlementsData.json"), JSON.stringify(data) + "\n");

// Buildings: drop the old st_* entries, add each town's.
const manifestPath = path.join(ROOT, "public/buildings/buildings.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.buildings = manifest.buildings.filter((b: { key: string }) => !b.key.startsWith("st_"));
const INN_NAMES = ["The Rusty Lantern", "The Sleepy Gull", "The Golden Cup", "The Hearth & Hound", "The Wandering Boot", "The Copper Kettle", "The Silver Stag"];
const HOUSE_NAMES = ["Cottage", "Cabin", "House", "Lodge", "Homestead", "Croft"];
towns.forEach((t, i) => {
  for (const slot of TOWN_LAYOUT) {
    const key = `st_${t.key}_${slot.suffix}`;
    const base = { key, file: slot.file, kind: slot.kind, color: "#a07850", menu: [], tx: t.sq.tx + slot.dx, ty: t.sq.ty + slot.dy };
    if (slot.kind === "inn") manifest.buildings.push({ ...base, name: INN_NAMES[i % INN_NAMES.length], description: `${t.name}'s inn: rest, stew and the latest rumours.`, reservable: false });
    else if (slot.kind === "scenery") manifest.buildings.push({ ...base, name: `${t.name} Square`, reservable: false });
    else if (slot.kind === "waystone") manifest.buildings.push({ ...base, name: `${t.name} Waystone`, description: `${t.name}: an old standing stone humming with blue light. Attune to it, then travel between waystones from your map.`, reservable: false });
    else manifest.buildings.push({ ...base, name: `${t.name} ${HOUSE_NAMES[(i + Number(slot.suffix.slice(1))) % HOUSE_NAMES.length]} ${slot.suffix.slice(1)}`, description: `A house in ${t.name}, ${FLAVOUR[t.family]}.`, reservable: true });
  }
});
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`wrote ${towns.length} towns, ${roads.length} roads, ${npcs.length} NPCs`);
