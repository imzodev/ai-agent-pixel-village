// What players build on their ranch (src/lib/ranchUpgrades.ts), drawn on
// the lot: a silo, a feeder trough, a little windmill, a cheese press, a
// loom and a pair of beehives. Pixel sprites at world scale, generated as
// palette rows; each sits at a fixed spot of the ranch template (pixels,
// bottom-left), clear of the pen, the coop, the barn and the paths.

import type { RanchBuildKey } from "@/types/ranchGrowth";

type Sprite = { rows: string[]; palette: Record<string, string> };

function grid(w: number, h: number): string[][] {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => "."));
}
const toRows = (g: string[][]) => g.map((r) => r.join(""));
function rect(g: string[][], x0: number, y0: number, w: number, h: number, c: string): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (g[y]?.[x] !== undefined) g[y][x] = c;
}

function silo(): Sprite {
  const g = grid(14, 32);
  for (let y = 0; y < 5; y++) { const half = [3, 5, 6, 7, 7][y]; rect(g, 7 - half, y, half * 2, 1, y < 2 ? "R" : "r"); }
  rect(g, 0, 5, 14, 27, "s");
  for (let y = 5; y < 32; y++) { g[y][0] = "k"; g[y][13] = "k"; g[y][1] = "S"; }
  for (const by of [11, 19, 27]) rect(g, 0, by, 14, 1, "b");
  rect(g, 5, 24, 4, 8, "d");
  return { rows: toRows(g), palette: { R: "#d06048", r: "#9a3a2c", s: "#c8c0b0", S: "#e8e0d0", b: "#6a6a74", k: "#2a1e18", d: "#6e4426" } };
}
function feeder(): Sprite {
  const g = grid(14, 7);
  rect(g, 0, 2, 14, 5, "w"); rect(g, 1, 2, 12, 2, "y"); rect(g, 0, 6, 14, 1, "k");
  g[1][3] = "y"; g[1][7] = "y"; g[0][5] = "y";
  return { rows: toRows(g), palette: { w: "#946036", y: "#e8c860", k: "#2a1e18" } };
}
function mill(): Sprite {
  const g = grid(22, 30);
  for (let y = 12; y < 30; y++) { const inset = Math.round((29 - y) / 6); rect(g, 6 + inset, y, 10 - inset * 2, 1, (y + inset) % 5 === 0 ? "G" : "g"); }
  rect(g, 9, 24, 4, 6, "d");
  for (let y = 8; y < 12; y++) rect(g, 11 - (y - 8) - 1, y, (y - 8) * 2 + 2, 1, "r");
  const cx = 11, cy = 9; // sails: an X of canvas on wooden arms
  for (let k = 1; k <= 9; k++) for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const x = cx + dx * k, y = cy + dy * k;
    if (g[y]?.[x] !== undefined && g[y][x] === ".") g[y][x] = k > 2 ? "w" : "a";
    const x2 = x + dx, y2 = y;
    if (k > 2 && g[y2]?.[x2] !== undefined && g[y2][x2] === ".") g[y2][x2] = "W";
  }
  g[cy][cx] = "k";
  return { rows: toRows(g), palette: { g: "#a8a8ae", G: "#8a8a92", r: "#7e2a28", d: "#6e4426", w: "#f4f0e4", W: "#d8d0c0", a: "#6e4426", k: "#2a1e18" } };
}
function press(): Sprite {
  const g = grid(14, 16);
  rect(g, 1, 2, 2, 14, "w"); rect(g, 11, 2, 2, 14, "w"); rect(g, 0, 1, 14, 2, "W");
  rect(g, 6, 3, 2, 6, "i"); rect(g, 4, 0, 6, 1, "i");
  rect(g, 3, 9, 8, 2, "W");
  rect(g, 3, 12, 8, 3, "c"); rect(g, 3, 12, 8, 1, "C");
  rect(g, 0, 15, 14, 1, "k");
  return { rows: toRows(g), palette: { w: "#946036", W: "#b8804a", i: "#5a5a68", c: "#e8c050", C: "#f8e08a", k: "#2a1e18" } };
}
function loom(): Sprite {
  const g = grid(20, 16);
  rect(g, 0, 0, 2, 16, "w"); rect(g, 18, 0, 2, 16, "w"); rect(g, 0, 0, 20, 2, "W"); rect(g, 0, 11, 20, 2, "W");
  const threads = ["r", "t", "b", "t"];
  for (let x = 3; x < 17; x++) for (let y = 2; y < 11; y++) g[y][x] = threads[x % threads.length];
  rect(g, 3, 6, 14, 2, "c");
  rect(g, 0, 15, 20, 1, "k");
  return { rows: toRows(g), palette: { w: "#6e4426", W: "#946036", r: "#c83a32", t: "#f4f0e4", b: "#5c90cc", c: "#d8c8a8", k: "#2a1e18" } };
}
function hives(): Sprite {
  const g = grid(26, 14);
  for (const x0 of [1, 14]) {
    rect(g, x0, 3, 11, 10, "h");
    for (const by of [5, 8, 11]) rect(g, x0, by, 11, 1, "H");
    rect(g, x0 - 1, 1, 13, 2, "r"); rect(g, x0 + 4, 10, 3, 2, "k");
  }
  for (const [x, y] of [[6, 0], [19, 0], [12, 4], [24, 2]]) g[y][x] = "b";
  rect(g, 0, 13, 26, 1, "k");
  return { rows: toRows(g), palette: { h: "#e8b040", H: "#b07a20", r: "#8a5a32", k: "#2a1e18", b: "#2a1e18" } };
}

export const RANCH_PROP_SPRITES: Readonly<Record<string, Sprite>> = {
  ranch_silo: silo(), ranch_feeder: feeder(), ranch_mill: mill(), ranch_press: press(), ranch_loom: loom(), ranch_hives: hives(),
};

/** Where each building stands on the ranch template: its texture and bottom-left (template px). */
export const RANCH_PROP_SPOTS: Readonly<Partial<Record<RanchBuildKey, { sprite: string; x: number; y: number }>>> = {
  silo: { sprite: "ranch_silo", x: 34, y: 207 },
  feeder: { sprite: "ranch_feeder", x: 52, y: 207 },
  mill: { sprite: "ranch_mill", x: 72, y: 207 },
  press: { sprite: "ranch_press", x: 241, y: 207 },
  loom: { sprite: "ranch_loom", x: 130, y: 79 },
  hives: { sprite: "ranch_hives", x: 318, y: 207 },
};
