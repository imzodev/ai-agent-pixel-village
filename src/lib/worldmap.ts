// Shared world geometry. Used by the server (simulation, collision) and the
// Phaser client (rendering). Keep this dependency-free.

export const TILE = 32;
export const MAP_W = 64; // tiles
export const MAP_H = 44;
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

export type Rect = { x: number; y: number; w: number; h: number };

export type BuildingDef = {
  key: string;
  name: string;
  kind: string;
  description: string;
  color: string;
  tx: number;
  ty: number;
  tw: number;
  th: number;
  menu: string[];
  reservable: boolean;
};

export const BUILDINGS: BuildingDef[] = [
  {
    key: "bakery",
    name: "Hearthstone Bakery",
    kind: "bakery",
    description: "Warm bread, warmer gossip. The oven has not gone cold in forty years.",
    color: "#e9b384",
    tx: 20,
    ty: 10,
    tw: 6,
    th: 5,
    menu: ["Sourdough loaf", "Honey buns", "Weekend cinnamon knots"],
    reservable: true,
  },
  {
    key: "inn",
    name: "The Sleepy Fox Inn",
    kind: "inn",
    description: "Rooms upstairs, stew downstairs, stories everywhere.",
    color: "#c97b63",
    tx: 36,
    ty: 9,
    tw: 8,
    th: 6,
    menu: ["Root stew", "Cider", "A bed for the night"],
    reservable: true,
  },
  {
    key: "store",
    name: "Bramble General Store",
    kind: "store",
    description: "If it exists, it is somewhere on these shelves.",
    color: "#8fb98b",
    tx: 46,
    ty: 20,
    tw: 6,
    th: 5,
    menu: ["Seeds", "Rope", "Lanterns", "Mystery jar"],
    reservable: true,
  },
  {
    key: "apothecary",
    name: "Moss & Mortar Apothecary",
    kind: "apothecary",
    description: "Dried herbs hang from every beam. Smells like rain and mint.",
    color: "#a7c4bc",
    tx: 12,
    ty: 21,
    tw: 5,
    th: 5,
    menu: ["Calming tea", "Salve", "Odd tinctures"],
    reservable: true,
  },
  {
    key: "workshop",
    name: "Tinker's Workshop",
    kind: "workshop",
    description: "Clanking, whirring, and the occasional small explosion.",
    color: "#b8a1d9",
    tx: 22,
    ty: 30,
    tw: 6,
    th: 5,
    menu: ["Repairs", "Gadgets", "Custom furniture"],
    reservable: true,
  },
  {
    key: "townhall",
    name: "Village Hall",
    kind: "townhall",
    description: "Where the elder holds court and the notice board lives.",
    color: "#e7d8c9",
    tx: 28,
    ty: 4,
    tw: 8,
    th: 5,
    menu: ["Notice board", "Village records"],
    reservable: false,
  },
  {
    key: "homes",
    name: "Cottage Row",
    kind: "home",
    description: "Where villagers live. Walk in to visit your own cottage.",
    color: "#f2c6a0",
    tx: 38,
    ty: 30,
    tw: 7,
    th: 5,
    menu: [],
    reservable: false,
  },
  {
    key: "cafe",
    name: "Lantern Cafe",
    kind: "cafe",
    description: "Small tables, strong coffee, a cat asleep on the windowsill.",
    color: "#f4a261",
    tx: 8,
    ty: 8,
    tw: 5,
    th: 4,
    menu: ["Espresso", "Oat latte", "Lemon tart"],
    reservable: true,
  },
];

export const PLAZA: Rect = { x: 26 * TILE, y: 17 * TILE, w: 12 * TILE, h: 9 * TILE };
export const POND: Rect = { x: 50 * TILE, y: 32 * TILE, w: 8 * TILE, h: 6 * TILE };

export const SPAWN = { x: PLAZA.x + PLAZA.w / 2, y: PLAZA.y + PLAZA.h / 2 + 40 };

// Deterministic PRNG so server and client agree on tree layout
export function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type TreeDef = { x: number; y: number; variant: number };

let _trees: TreeDef[] | null = null;
export function getTrees(): TreeDef[] {
  if (_trees) return _trees;
  const rnd = mulberry32(1337);
  const trees: TreeDef[] = [];
  const blockers = [...buildingRects(), PLAZA, POND];
  const tryAdd = (x: number, y: number) => {
    const r = { x: x - 12, y: y - 12, w: 24, h: 24 };
    if (x < 24 || y < 40 || x > WORLD_W - 24 || y > WORLD_H - 16) return;
    for (const b of blockers) if (intersects(r, inflate(b, 40))) return;
    for (const t of trees) if (Math.hypot(t.x - x, t.y - y) < 34) return;
    trees.push({ x: Math.round(x), y: Math.round(y), variant: Math.floor(rnd() * 3) });
  };
  // Border forest
  for (let i = 0; i < 260; i++) {
    const side = rnd();
    let x: number, y: number;
    if (side < 0.25) {
      x = rnd() * WORLD_W;
      y = 40 + rnd() * 90;
    } else if (side < 0.5) {
      x = rnd() * WORLD_W;
      y = WORLD_H - 20 - rnd() * 110;
    } else if (side < 0.75) {
      x = 24 + rnd() * 100;
      y = rnd() * WORLD_H;
    } else {
      x = WORLD_W - 24 - rnd() * 100;
      y = rnd() * WORLD_H;
    }
    tryAdd(x, y);
  }
  // Small groves
  const groves = [
    [10 * TILE, 33 * TILE],
    [56 * TILE, 6 * TILE],
    [32 * TILE, 38 * TILE],
    [6 * TILE, 16 * TILE],
    [58 * TILE, 26 * TILE],
  ];
  for (const [gx, gy] of groves) {
    for (let i = 0; i < 9; i++) tryAdd(gx + (rnd() - 0.5) * 180, gy + (rnd() - 0.5) * 140);
  }
  _trees = trees;
  return trees;
}

export function buildingRects(): (Rect & { key: string })[] {
  return BUILDINGS.map((b) => ({
    key: b.key,
    x: b.tx * TILE,
    y: b.ty * TILE,
    w: b.tw * TILE,
    h: b.th * TILE,
  }));
}

export function buildingDoor(b: { tx: number; ty: number; tw: number; th: number }) {
  return { x: (b.tx + b.tw / 2) * TILE, y: (b.ty + b.th) * TILE + 12 };
}

export function intersects(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
export function inflate(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 };
}
export function pointIn(px: number, py: number, r: Rect) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

let _blockers: Rect[] | null = null;
/** Solid rectangles (buildings, pond, tree trunks) in world pixels. */
export function getBlockers(): Rect[] {
  if (_blockers) return _blockers;
  const list: Rect[] = [...buildingRects(), POND];
  for (const t of getTrees()) list.push({ x: t.x - 10, y: t.y - 6, w: 20, h: 14 });
  _blockers = list;
  return list;
}

/** Is a character (feet point) allowed at (x, y)? */
export function isWalkable(x: number, y: number) {
  if (x < 8 || y < 8 || x > WORLD_W - 8 || y > WORLD_H - 8) return false;
  const foot = { x: x - 8, y: y - 6, w: 16, h: 10 };
  for (const b of getBlockers()) if (intersects(foot, b)) return false;
  return true;
}

/** Zones where wildlife appears (outside the village core). */
export const WILD_ZONES: Rect[] = [
  { x: 4 * TILE, y: 36 * TILE, w: 20 * TILE, h: 6 * TILE },
  { x: 52 * TILE, y: 2 * TILE, w: 10 * TILE, h: 12 * TILE },
  { x: 2 * TILE, y: 26 * TILE, w: 8 * TILE, h: 10 * TILE },
];

/** Game clock: 1 game day = dayLengthMinutes real minutes. Returns 0..24 hours. */
export function gameHour(epochStartMs: number, dayLengthMinutes: number, nowMs = Date.now()) {
  const dayMs = dayLengthMinutes * 60_000;
  const t = ((nowMs - epochStartMs) % dayMs) / dayMs;
  return (t * 24 + 7) % 24; // world starts at 7am
}
