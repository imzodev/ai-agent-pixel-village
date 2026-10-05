// A carpenter's workshop lot (scripts/draw-workshop-lot.mjs), what's drawn
// on it by the game: the stations players build (saw bench, lathe,
// upholstery bench, varnish shelf) in the yard, and the furniture they put on
// show on the porch (src/game/furnitureArt.ts). Pixel sprites at world scale;
// spots in template pixels (stations: bottom-left; showroom: bottom-centre).

import type { RanchBuildKey } from "@/types/ranchGrowth";

type Sprite = { rows: string[]; palette: Record<string, string> };

function grid(w: number, h: number): string[][] {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => "."));
}
const toRows = (g: string[][]) => g.map((r) => r.join(""));
function rect(g: string[][], x0: number, y0: number, w: number, h: number, c: string): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (g[y]?.[x] !== undefined) g[y][x] = c;
}
const WOOD = { w: "#7a5232", W: "#b07a48", k: "#2a1e18" };

function sawBench(): Sprite {
  const g = grid(28, 16);
  for (let k = 0; k < 8; k++) { g[8 + k][2 + Math.floor(k / 2)] = "w"; g[8 + k][9 - Math.floor(k / 2)] = "w"; g[8 + k][18 + Math.floor(k / 2)] = "w"; g[8 + k][25 - Math.floor(k / 2)] = "w"; }
  rect(g, 1, 6, 26, 2, "W");
  rect(g, 3, 2, 22, 4, "l"); rect(g, 3, 2, 22, 1, "L"); rect(g, 24, 2, 2, 4, "r");
  for (let k = 0; k < 9; k++) { g[1 + Math.floor(k / 3)][12 + k] = "s"; } rect(g, 10, 0, 3, 3, "h");
  rect(g, 0, 15, 28, 1, "k");
  return { rows: toRows(g), palette: { ...WOOD, l: "#8a5a32", L: "#a87444", r: "#d8b37c", s: "#c8ccd4", h: "#5e3c20" } };
}
function lathe(): Sprite {
  const g = grid(28, 18);
  rect(g, 1, 6, 4, 12, "w"); rect(g, 23, 6, 4, 12, "w"); rect(g, 0, 4, 28, 3, "W");
  rect(g, 5, 9, 18, 3, "t"); rect(g, 7, 8, 2, 5, "T"); rect(g, 13, 8, 3, 5, "T"); rect(g, 19, 8, 2, 5, "T");
  rect(g, 2, 0, 3, 4, "i"); rect(g, 23, 1, 3, 3, "i");
  rect(g, 0, 17, 28, 1, "k");
  return { rows: toRows(g), palette: { ...WOOD, t: "#d8ac7c", T: "#bc8a58", i: "#5a5a68" } };
}
function upholstery(): Sprite {
  const g = grid(28, 16);
  rect(g, 1, 8, 26, 4, "W"); rect(g, 2, 12, 2, 4, "w"); rect(g, 24, 12, 2, 4, "w");
  rect(g, 3, 5, 12, 3, "c"); rect(g, 3, 5, 12, 1, "C");
  for (let y = 0; y < 8; y++) for (let x = 17; x < 25; x++) if ((x - 21) ** 2 + (y - 4) ** 2 <= 14) g[y][x] = (x + y) % 3 ? "b" : "B"; // a roll of cloth
  rect(g, 0, 15, 28, 1, "k");
  return { rows: toRows(g), palette: { ...WOOD, c: "#b05468", C: "#d07a8a", b: "#f0ece0", B: "#d8d0c0" } };
}
function varnish(): Sprite {
  const g = grid(22, 22);
  rect(g, 0, 0, 2, 22, "w"); rect(g, 20, 0, 2, 22, "w");
  for (const y of [6, 13, 20]) rect(g, 0, y, 22, 2, "W");
  for (const [x, y, c] of [[3, 2, "a"], [8, 2, "b"], [13, 3, "a"], [4, 9, "b"], [10, 9, "a"], [15, 9, "b"], [6, 16, "a"], [12, 16, "b"]] as const) { rect(g, x, y, 4, 4, c); g[y][x + 1] = "l"; }
  rect(g, 17, 15, 1, 5, "h"); rect(g, 16, 14, 3, 1, "s"); // a brush
  rect(g, 0, 21, 22, 1, "k");
  return { rows: toRows(g), palette: { ...WOOD, a: "#8a3a24", b: "#c9a24a", l: "#f8e8c0", h: "#6e4426", s: "#e8d8b0" } };
}

export const WORKSHOP_PROP_SPRITES: Readonly<Record<string, Sprite>> = {
  ws_saw: sawBench(), ws_lathe: lathe(), ws_upholstery: upholstery(), ws_varnish: varnish(),
};

/** Where each station stands in the yard: texture and bottom-left (template px). */
export const WORKSHOP_PROP_SPOTS: Readonly<Partial<Record<RanchBuildKey, { sprite: string; x: number; y: number }>>> = {
  saw: { sprite: "ws_saw", x: 82, y: 207 },
  lathe: { sprite: "ws_lathe", x: 118, y: 207 },
  upholstery: { sprite: "ws_upholstery", x: 222, y: 207 },
  varnish: { sprite: "ws_varnish", x: 282, y: 207 },
};

/** The showroom's display spots on the porch, bottom-centre (template px). */
export const SHOWROOM_SPOTS: readonly { x: number; y: number }[] = [
  { x: 244, y: 118 }, { x: 284, y: 118 }, { x: 324, y: 118 },
  { x: 244, y: 164 }, { x: 284, y: 164 }, { x: 324, y: 164 },
];
export const SHOWROOM_SIZE = SHOWROOM_SPOTS.length;
