// The look of each relic set, as pixel rows. One source for the world
// sprites (src/game/textures.ts) and the collection book's icons
// (src/components/RelicIcon.tsx).

import type { PixelArt, RelicSetKey } from "@/types/treasure";

export const RELIC_ART: Readonly<Record<RelicSetKey, PixelArt>> = {
  // A coin half-sunk by the road.
  coins: { rows: ["...kkkk...", "..kyYYyk..", ".kyYyyYyk.", ".kYyYYyYk.", ".kYyYYyYk.", ".kyYyyYyk.", "ddkyYYykdd", ".dddddddd."], palette: { k: "#7a5212", y: "#d9a520", Y: "#ffe27a", d: "#6b4a2b" } },
  // A bone in the sand.
  fossils: { rows: ["kk......kk", "kwk....kwk", ".kwkkkkwk.", ".kWwwwwWk.", ".kwkkkkwk.", "kwk....kwk", "sskssssks.", ".ssssssss."], palette: { k: "#6e6250", w: "#e8dfc8", W: "#fffaf0", s: "#c9a86a" } },
  // A dropped card.
  cards: { rows: [".kkkkkkk.", ".kcccccck", ".kcrrrrck", ".kcrccrck", ".kcrrrrck", ".kcccccck", ".kcrccrck", ".kkkkkkk.", "..ddddd.."], palette: { k: "#4a2e16", c: "#f6ead0", r: "#c0281f", d: "rgba(0,0,0,0.25)" } },
  // A rune stone.
  carvings: { rows: ["...kkkk...", "..kGGGGk..", ".kGGbGGGk.", ".kGbbbGgk.", ".kGGbGGgk.", ".kGGbGGgk.", ".kGbGbGgk.", ".kGGGGggk.", "kkkkkkkkkk", ".dddddddd."], palette: { k: "#3a3d44", G: "#9aa0a8", g: "#7b8089", b: "#5fd0ff", d: "rgba(0,0,0,0.3)" } },
};
