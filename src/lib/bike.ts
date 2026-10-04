// Bicycles: twice-and-more walking pace for getting around the continent.
// Press V to get on or off (you need a bicycle in your bag). You can't fight
// or fish from the saddle, and you're knocked off when something hits you
// or when you go indoors. Pure data; the scene draws and moves the rider
// (src/game/WorldScene.ts) and the mounted flag rides along with your
// position to other players (src/lib/world-stream.ts).

import type { PixelArt } from "@/types/treasure";

export const BIKE_ITEM = "bicycle";
/** Riding speed as a multiple of walking (running is 1.75). */
export const BIKE_SPEED_MULT = 2.5;
/** Legs-on-pedals: the rider sits this many px higher. */
export const BIKE_LIFT_PX = 5;

const PALETTE = { k: "#262626", g: "#8a8a8a", h: "#d8d8d8", f: "#c0392b", b: "#4a4a52", s: "#3b2a1a", r: "#ff4040" };

/** Two frames per view (the wheels turn): side (facing right; mirrored for left), front, back. */
export const BIKE_ART: Readonly<Record<string, PixelArt>> = {
  side_0: { rows: ["....................", ".............bbbb...", "......sss.....b.....", ".......fffffffb.....", "...kkkff.....ffkk...", "..kk.kf.f...fkf.kk..", ".k..gf.kf..fk..f..k.", "kk..gf.kkffkk..f..kk", "k.ggfffffh.k.ggfgg.k", "kk..g..kkb.kk..g..kk", ".k..g..k....k..g..k.", "..kk.kk......kk.kk..", "...kkk........kkk..."], palette: PALETTE },
  side_1: { rows: ["....................", ".............bbbb...", "......sss.....b.....", ".......fffffffb.....", "...kkkff.....ffkk...", "..kk.kf.f...fkf.kk..", ".k...f.kf..fk..f..k.", "kk.g.f.kkfbkk.gfg.kk", "k...fffffh.k...f...k", "kk.g.g.kk..kk.g.g.kk", ".k.....k....k.....k.", "..kk.kk......kk.kk..", "...kkk........kkk..."], palette: PALETTE },
  front_0: { rows: ["..........", "k........k", "bbbbbbbbbb", "....ff....", "....ff....", "...fkkf...", "....hh....", "....kk....", "....gk....", "....kk....", "....kk....", "....gk....", "....kk...."], palette: PALETTE },
  front_1: { rows: ["..........", "k........k", "bbbbbbbbbb", "....ff....", "....ff....", "...fkkf...", "....hh....", "....kk....", "....kg....", "....kk....", "....kk....", "....kg....", "....kk...."], palette: PALETTE },
  back_0: { rows: ["..........", "k..ssss..k", "bbbbbbbbbb", "....ff....", "....ff....", "...fkkf...", "....rr....", "....kk....", "....gk....", "....kk....", "....kk....", "....gk....", "....kk...."], palette: PALETTE },
  back_1: { rows: ["..........", "k..ssss..k", "bbbbbbbbbb", "....ff....", "....ff....", "...fkkf...", "....rr....", "....kk....", "....kg....", "....kk....", "....kk....", "....kg....", "....kk...."], palette: PALETTE },
};
