// What players build in their vineyard's yard (src/lib/ranchUpgrades.ts):
// a fruit press, the wine cellar's door in its mound, wine racks and a jam
// kitchen. Pixel sprites at world scale; each stands at a fixed spot of the
// vineyard template's gravel yard, bottom right under the trees (pixels,
// bottom-left; scripts/draw-vineyard-lot.mjs).

import type { RanchBuildKey } from "@/types/ranchGrowth";

type Sprite = { rows: string[]; palette: Record<string, string> };

function grid(w: number, h: number): string[][] {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => "."));
}
const toRows = (g: string[][]) => g.map((r) => r.join(""));
function rect(g: string[][], x0: number, y0: number, w: number, h: number, c: string): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (g[y]?.[x] !== undefined) g[y][x] = c;
}

function fruitPress(): Sprite {
  const g = grid(18, 20);
  rect(g, 1, 3, 2, 17, "w"); rect(g, 15, 3, 2, 17, "w"); rect(g, 0, 2, 18, 2, "W");
  rect(g, 8, 0, 2, 9, "i"); rect(g, 5, 0, 8, 1, "i");
  rect(g, 4, 9, 10, 2, "W");
  rect(g, 3, 12, 12, 7, "b"); for (const y of [13, 17]) rect(g, 3, y, 12, 1, "i"); rect(g, 5, 12, 8, 1, "g");
  rect(g, 0, 19, 18, 1, "k");
  return { rows: toRows(g), palette: { w: "#6e4426", W: "#946036", i: "#5a5a68", b: "#8a5a32", g: "#6e2a5a", k: "#2a1e18" } };
}
function cellar(): Sprite {
  const g = grid(30, 20);
  for (let y = 0; y < 20; y++) { const half = Math.round(Math.sqrt(Math.max(0, 1 - ((19 - y) / 20) ** 2)) * 15); rect(g, 15 - half, y, half * 2, 1, (y * 3 + half) % 7 === 0 ? "G" : "m"); }
  rect(g, 9, 6, 12, 14, "s"); for (let y = 6; y < 20; y += 3) rect(g, 9, y, 12, 1, "S");
  for (let y = 8; y < 20; y++) { const w = y < 10 ? 6 - (10 - y) * 2 : 6; rect(g, 15 - w / 2, y, w, 1, "d"); }
  g[14][17] = "y";
  rect(g, 0, 19, 30, 1, "k");
  return { rows: toRows(g), palette: { m: "#4a8a3c", G: "#5a9a4a", s: "#8a8a92", S: "#6a6a74", d: "#4a2c18", y: "#f8d850", k: "#2a1e18" } };
}
function racks(): Sprite {
  const g = grid(24, 18);
  rect(g, 0, 0, 2, 18, "w"); rect(g, 22, 0, 2, 18, "w");
  for (const y of [0, 6, 12]) rect(g, 0, y, 24, 2, "W");
  for (const y of [2, 8, 14]) for (let x = 3; x < 21; x += 3) { g[y][x] = "n"; g[y + 1][x] = "b"; g[y + 2][x] = x % 2 ? "r" : "v"; g[y + 3][x] = x % 2 ? "r" : "v"; }
  rect(g, 0, 17, 24, 1, "k");
  return { rows: toRows(g), palette: { w: "#6e4426", W: "#946036", n: "#c9a24a", b: "#2a3a2a", r: "#6e1a3a", v: "#c8c870", k: "#2a1e18" } };
}
function jamKitchen(): Sprite {
  const g = grid(24, 16);
  rect(g, 0, 7, 24, 2, "W"); rect(g, 1, 9, 2, 7, "w"); rect(g, 21, 9, 2, 7, "w");
  rect(g, 3, 3, 6, 4, "p"); rect(g, 3, 3, 6, 1, "P"); rect(g, 4, 2, 4, 1, "i"); // a pot
  for (const x of [11, 15, 19]) { rect(g, x, 3, 3, 4, "j"); g[3][x] = "l"; g[3][x + 1] = "l"; g[3][x + 2] = "l"; } // jars
  rect(g, 4, 0, 1, 2, "s"); rect(g, 6, 0, 1, 1, "s"); // steam
  rect(g, 0, 15, 24, 1, "k");
  return { rows: toRows(g), palette: { W: "#b8804a", w: "#946036", p: "#3c3c48", P: "#6a6a78", i: "#2a2a32", j: "#c83a5a", l: "#e8e0d0", s: "#e8eef4", k: "#2a1e18" } };
}

export const VINEYARD_PROP_SPRITES: Readonly<Record<string, Sprite>> = {
  vy_fruit_press: fruitPress(), vy_cellar: cellar(), vy_racks: racks(), vy_jam: jamKitchen(),
};

/** Where each winery building stands in the vineyard's yard: texture and bottom-left (template px). */
export const VINEYARD_PROP_SPOTS: Readonly<Partial<Record<RanchBuildKey, { sprite: string; x: number; y: number }>>> = {
  fruit_press: { sprite: "vy_fruit_press", x: 212, y: 207 },
  cellar: { sprite: "vy_cellar", x: 236, y: 207 },
  racks: { sprite: "vy_racks", x: 272, y: 207 },
  jam: { sprite: "vy_jam", x: 306, y: 207 },
};
