// Animated animal spritesheets. Types only — no logic.
//
// Sheet layout convention: rows are directions (`dirRows` order), columns
// are animation frames. Each action occupies one "block" of
// `dirRows.length` rows; block N starts at row N * dirRows.length.
// See src/game/animalSprites.ts for the registry and
// scripts/build-animal-sheet.mjs for combining per-action sheets.

import type { Facing } from "@/types/world";

/** One animation of an animal (walk, eat, jump, poop, spin, …). */
export type AnimalActionDef = {
  /** Which block of direction rows holds this action. */
  block: number;
  /** Frames used from the start of each row. */
  frames: number;
  frameRate: number;
  /** Loop while the action lasts; false = play once, then hold the idle frame. */
  loop: boolean;
};

/** Everything the scene needs to render one species from its sheet. */
export type AnimalSpriteDef = {
  url: string;
  frameWidth: number;
  frameHeight: number;
  /** Frames per row in the sheet image. */
  columns: number;
  /** Direction of each row within a block, top to bottom. */
  dirRows: readonly Facing[];
  scale: number;
  /** Anchor (0..1 of the frame) that sits on the entity's world position. */
  originX: number;
  originY: number;
  /** Frame pixels from the anchor up to the top of the art (label placement). */
  labelHeight: number;
  /** Must include `walk`; its first frame per direction is the idle pose. */
  actions: Record<string, AnimalActionDef>;
  /** Server animal state → action to play while resting (e.g. graze → eat). */
  stateActions: Record<string, string>;
};
