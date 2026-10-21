// Whistle's sheepfold in the village plaza: a little fenced fold with a sign
// (the week's champions), where walking up opens the game. Its spot is chosen
// once by scripts/gen-sheepfold.ts (foldData.json, pinned) on clear ground.
// The fence's tiles block, on the server and the client (setDynamicBlocks).

import FOLD_SPOT from "./foldData.json";

/** The fold's size in tiles: the sign's row on top, then the fenced pen. */
export const FOLD_W = 6;
export const FOLD_H = 5;
export const FOLD_SIGN_ROWS = 1;

export const FOLD: { tx: number; ty: number } = FOLD_SPOT;

/** The fenced tiles (everything below the sign's row). */
export function foldBlocks(): { tx: number; ty: number }[] {
  const out: { tx: number; ty: number }[] = [];
  for (let y = FOLD.ty + FOLD_SIGN_ROWS; y < FOLD.ty + FOLD_H; y++) for (let x = FOLD.tx; x < FOLD.tx + FOLD_W; x++) out.push({ tx: x, ty: y });
  return out;
}

/** Where you stand to play: in front of the gate (bottom middle), in pixels. */
export const foldPoint = (): { x: number; y: number } => ({ x: (FOLD.tx + FOLD_W / 2) * 16, y: (FOLD.ty + FOLD_H) * 16 + 8 });
