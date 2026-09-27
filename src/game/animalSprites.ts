// Registry of animals rendered from spritesheets. Adding a species = one
// entry here + its sheet in public/assets/animals/. Adding an action =
// one more block in the sheet (scripts/build-animal-sheet.mjs) + an
// `actions` entry, optionally mapped from a server state in
// `stateActions`. Species not listed here use the procedural textures in
// src/game/textures.ts.

import type { Facing } from "@/types/world";
import type { AnimalSpriteDef } from "@/types/animalSprite";

export const ANIMAL_SPRITES: Record<string, AnimalSpriteDef> = {
  cow: {
    // Combined from cow_walk + cow_eat (block 0 = walk, block 1 = eat).
    url: "/assets/animals/cow.png",
    frameWidth: 128,
    frameHeight: 128,
    columns: 4,
    dirRows: ["up", "left", "down", "right"],
    scale: 0.6,
    originX: 0.5,
    originY: 0.69, // side-view hooves sit at y≈88 of 128
    labelHeight: 48,
    actions: {
      walk: { block: 0, frames: 4, frameRate: 7, loop: true },
      eat: { block: 1, frames: 4, frameRate: 4, loop: true },
    },
    stateActions: { graze: "eat" },
  },
  llama: {
    // Combined from llama_walk + llama_eat (block 0 = walk, block 1 = eat).
    url: "/assets/animals/llama.png",
    frameWidth: 128,
    frameHeight: 128,
    columns: 4,
    dirRows: ["up", "left", "down", "right"],
    scale: 0.6, // same relative scale as the cow
    originX: 0.5,
    originY: 0.71, // hooves sit at y≈91 of 128
    labelHeight: 62, // tall neck: head reaches y≈29
    actions: {
      walk: { block: 0, frames: 4, frameRate: 7, loop: true },
      eat: { block: 1, frames: 4, frameRate: 4, loop: true },
    },
    stateActions: { graze: "eat" },
  },
  pig: {
    // Combined from pig_walk + pig_eat (block 0 = walk, block 1 = eat).
    url: "/assets/animals/pig.png",
    frameWidth: 128,
    frameHeight: 128,
    columns: 4,
    dirRows: ["up", "left", "down", "right"],
    scale: 0.6, // same relative scale as the cow
    originX: 0.5,
    originY: 0.66, // side-view trotters sit at y≈84 of 128
    labelHeight: 40,
    actions: {
      walk: { block: 0, frames: 4, frameRate: 7, loop: true },
      eat: { block: 1, frames: 4, frameRate: 4, loop: true },
    },
    stateActions: { graze: "eat" },
  },
  sheep: {
    // Combined from sheep_walk + sheep_eat (block 0 = walk, block 1 = eat).
    url: "/assets/animals/sheep.png",
    frameWidth: 128,
    frameHeight: 128,
    columns: 4,
    dirRows: ["up", "left", "down", "right"],
    scale: 0.6, // same relative scale as the cow
    originX: 0.5,
    originY: 0.65, // side-view hooves sit at y≈83 of 128
    labelHeight: 43,
    actions: {
      walk: { block: 0, frames: 4, frameRate: 7, loop: true },
      eat: { block: 1, frames: 4, frameRate: 4, loop: true },
    },
    stateActions: { graze: "eat" },
  },
  chicken: {
    // Combined from chicken_walk + chicken_eat (block 0 = walk, block 1 = eat).
    // Unlike the cow, the chicken's eat row is a pecking loop, so it
    // simply repeats all 4 frames.
    url: "/assets/animals/chicken.png",
    frameWidth: 32,
    frameHeight: 32,
    columns: 4,
    dirRows: ["up", "left", "down", "right"],
    scale: 0.6, // same relative scale as the cow
    originX: 0.5,
    originY: 0.9, // feet sit at y≈29 of 32
    labelHeight: 27,
    actions: {
      walk: { block: 0, frames: 4, frameRate: 8, loop: true },
      eat: { block: 1, frames: 4, frameRate: 6, loop: true },
    },
    stateActions: { graze: "eat" },
  },
  duck: {
    // Original mallard drawn by scripts/draw-duck.mjs, in the LPC chicken's
    // format (block 0 = waddle, block 1 = dabble).
    url: "/assets/animals/duck.png",
    frameWidth: 32,
    frameHeight: 32,
    columns: 4,
    dirRows: ["up", "left", "down", "right"],
    scale: 0.8, // the art is smaller than the chicken's; this evens it out
    originX: 0.5,
    originY: 0.9, // feet sit at y≈29 of 32
    labelHeight: 21,
    actions: {
      walk: { block: 0, frames: 4, frameRate: 8, loop: true },
      eat: { block: 1, frames: 4, frameRate: 5, loop: true },
    },
    stateActions: { graze: "eat" },
  },
  rabbit: {
    // Original cottontail drawn by scripts/draw-rabbit.mjs (block 0 = hop,
    // block 1 = nibble).
    url: "/assets/animals/rabbit.png",
    frameWidth: 32,
    frameHeight: 32,
    columns: 4,
    dirRows: ["up", "left", "down", "right"],
    scale: 0.8, // same as the duck
    originX: 0.5,
    originY: 0.9, // feet sit at y≈29 of 32
    labelHeight: 24, // ears reach y≈5
    actions: {
      walk: { block: 0, frames: 4, frameRate: 9, loop: true },
      eat: { block: 1, frames: 4, frameRate: 4, loop: true },
    },
    stateActions: { graze: "eat" },
  },
  fox: {
    // 3x-scaled export, 3 cols × 4 rows of 48×64 (see ATTRIBUTION.md).
    url: "/assets/animals/fox-NESW.png",
    frameWidth: 48,
    frameHeight: 64,
    columns: 3,
    dirRows: ["up", "right", "down", "left"],
    scale: 1,
    originX: 0.5,
    originY: 1,
    labelHeight: 64,
    actions: {
      walk: { block: 0, frames: 3, frameRate: 7, loop: true },
    },
    stateActions: {},
  },
};

/** Texture key of a species' sheet. */
export function sheetKey(species: string): string {
  return `cr_${species}`;
}

/** Animation key for one species / action / direction. */
export function animKey(species: string, action: string, dir: Facing): string {
  return `cr_${species}_${action}_${dir}`;
}

/** Sheet frame index of frame `f` of `action` facing `dir`. */
export function frameIndex(def: AnimalSpriteDef, action: string, dir: Facing, f: number): number {
  const a = def.actions[action];
  const row = a.block * def.dirRows.length + def.dirRows.indexOf(dir);
  return row * def.columns + f;
}
