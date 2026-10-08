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
  cat: {
    // Original orange tabby drawn by scripts/draw-cat.mjs (block 0 = walk,
    // block 1 = groom). Cats don't graze: their rest state grooms instead.
    url: "/assets/animals/cat.png",
    frameWidth: 32,
    frameHeight: 32,
    columns: 4,
    dirRows: ["up", "left", "down", "right"],
    scale: 0.8, // same as the duck and rabbit
    originX: 0.5,
    originY: 0.87, // paws sit at y≈28 of 32
    labelHeight: 21,
    actions: {
      walk: { block: 0, frames: 4, frameRate: 8, loop: true },
      groom: { block: 1, frames: 4, frameRate: 4, loop: true },
    },
    stateActions: { graze: "groom" },
  },
  dog: {
    // Original brown dog drawn by scripts/draw-dog.mjs (block 0 = walk,
    // block 1 = sit: pants and wags). Dogs don't graze: they sit instead.
    url: "/assets/animals/dog.png",
    frameWidth: 32,
    frameHeight: 32,
    columns: 4,
    dirRows: ["up", "left", "down", "right"],
    scale: 0.8, // same as the other hand-drawn animals
    originX: 0.5,
    originY: 0.88, // paws sit at y≈28 of 32
    labelHeight: 21,
    actions: {
      walk: { block: 0, frames: 4, frameRate: 8, loop: true },
      sit: { block: 1, frames: 4, frameRate: 5, loop: true },
    },
    stateActions: { graze: "sit" },
  },
  slime: {
    // Enemy. Original art drawn by scripts/draw-slime.mjs: block 0 = hop
    // (squash → stretch → airborne → splat), block 1 = idle jiggle.
    url: "/assets/animals/slime.png",
    frameWidth: 32,
    frameHeight: 32,
    columns: 4,
    dirRows: ["up", "left", "down", "right"],
    scale: 0.8,
    originX: 0.5,
    originY: 0.875, // base line at y≈28 of 32
    labelHeight: 14,
    actions: {
      walk: { block: 0, frames: 4, frameRate: 8, loop: true },
      idle: { block: 1, frames: 4, frameRate: 5, loop: true },
    },
    stateActions: { walk: "idle" },
  },
  thornling: {
    // Enemy. Original art drawn by scripts/draw-thornling.mjs: block 0 =
    // waddle on its roots, block 1 = idle sway with rustling leaves.
    url: "/assets/animals/thornling.png",
    frameWidth: 32,
    frameHeight: 32,
    columns: 4,
    dirRows: ["up", "left", "down", "right"],
    scale: 0.8,
    originX: 0.5,
    originY: 0.94, // root tips at y≈30 of 32
    labelHeight: 26, // thorn tips reach y≈4
    actions: {
      walk: { block: 0, frames: 4, frameRate: 8, loop: true },
      idle: { block: 1, frames: 4, frameRate: 4, loop: true },
    },
    stateActions: { walk: "idle" },
  },
  bat: {
    // Enemy. Original art drawn by scripts/draw-bat.mjs: one wing-flap
    // block. It flaps fast while flying and slower while hovering (enemy
    // rest state is "walk"), so a bat never freezes in mid-air.
    url: "/assets/animals/bat.png",
    frameWidth: 32,
    frameHeight: 32,
    columns: 4,
    dirRows: ["up", "left", "down", "right"],
    scale: 0.8,
    originX: 0.5,
    originY: 0.88, // ground shadow sits at y≈28 of 32
    labelHeight: 25, // raised wingtips reach y≈3
    actions: {
      walk: { block: 0, frames: 4, frameRate: 12, loop: true },
      hover: { block: 0, frames: 4, frameRate: 7, loop: true },
    },
    stateActions: { walk: "hover" },
  },
  boar: {
    // Enemy (tier 2). Original art drawn by scripts/draw-boar.mjs: block 0
    // = trot, block 1 = idle rooting with a tail flick.
    url: "/assets/animals/boar.png",
    frameWidth: 48,
    frameHeight: 48,
    columns: 4,
    dirRows: ["up", "left", "down", "right"],
    scale: 0.6, // 48 px frames, drawn at the size the 32 px boar was (0.9)
    originX: 0.5,
    originY: 0.9, // hooves at y≈43 of 48
    labelHeight: 22,
    actions: {
      walk: { block: 0, frames: 4, frameRate: 9, loop: true },
      idle: { block: 1, frames: 4, frameRate: 4, loop: true },
    },
    stateActions: { walk: "idle" },
  },
  wolf: {
    // Enemy (tier 2, hunts players in Whisperwood). Original art drawn by
    // scripts/draw-wolf.mjs at 48 px: block 0 = trot (6 frames), block 1 =
    // idle breathing, block 2 = attack (crouch, lunge and snap), played
    // once when it bites (WorldScene.playEnemyAttack).
    url: "/assets/animals/wolf.png",
    frameWidth: 48,
    frameHeight: 48,
    columns: 6,
    dirRows: ["up", "left", "down", "right"],
    scale: 0.8,
    originX: 0.5,
    originY: 0.93, // paws at y≈44 of 48
    labelHeight: 36, // ear tips reach y≈8
    actions: {
      walk: { block: 0, frames: 6, frameRate: 12, loop: true },
      idle: { block: 1, frames: 4, frameRate: 4, loop: true },
      attack: { block: 2, frames: 6, frameRate: 14, loop: false },
    },
    stateActions: { walk: "idle", hunt: "idle" },
  },
  frostwolf: {
    // Enemy (tier 3, the snowfields). scripts/draw-wolf.mjs frostwolf: the
    // wolf's sheet in pale, icy colours (same frames and actions).
    url: "/assets/animals/frostwolf.png",
    frameWidth: 48, frameHeight: 48, columns: 6, dirRows: ["up", "left", "down", "right"],
    scale: 0.85, originX: 0.5, originY: 0.93, labelHeight: 36,
    actions: {
      walk: { block: 0, frames: 6, frameRate: 12, loop: true },
      idle: { block: 1, frames: 4, frameRate: 4, loop: true },
      attack: { block: 2, frames: 6, frameRate: 14, loop: false },
    },
    stateActions: { walk: "idle", hunt: "idle" },
  },
  scorpion: {
    // Enemy (tier 2, deserts and badlands). scripts/draw-scorpion.mjs:
    // block 0 = scuttle, 1 = idle (stinger sways), 2 = strike.
    url: "/assets/animals/scorpion.png",
    frameWidth: 48, frameHeight: 48, columns: 4, dirRows: ["up", "left", "down", "right"],
    scale: 0.65, originX: 0.5, originY: 0.88, labelHeight: 23,
    actions: {
      walk: { block: 0, frames: 4, frameRate: 12, loop: true },
      idle: { block: 1, frames: 4, frameRate: 4, loop: true },
      attack: { block: 2, frames: 4, frameRate: 12, loop: false },
    },
    stateActions: { walk: "idle" },
  },
  lurker: {
    // Enemy (tier 3, swamps). scripts/draw-lurker.mjs: block 0 = hop,
    // 1 = idle (throat pulses), 2 = lunge.
    url: "/assets/animals/lurker.png",
    frameWidth: 32, frameHeight: 32, columns: 4, dirRows: ["up", "left", "down", "right"],
    scale: 1, originX: 0.5, originY: 0.88, labelHeight: 20,
    actions: {
      walk: { block: 0, frames: 4, frameRate: 8, loop: true },
      idle: { block: 1, frames: 4, frameRate: 4, loop: true },
      attack: { block: 2, frames: 4, frameRate: 10, loop: false },
    },
    stateActions: { walk: "idle" },
  },
  shade: {
    // Enemy (tier 3, darkwood; day and night). scripts/draw-wisp.mjs shade.
    url: "/assets/animals/shade.png",
    frameWidth: 32, frameHeight: 32, columns: 4, dirRows: ["up", "left", "down", "right"],
    scale: 0.9, originX: 0.5, originY: 0.92, labelHeight: 26,
    actions: {
      walk: { block: 0, frames: 4, frameRate: 10, loop: true },
      hover: { block: 0, frames: 4, frameRate: 6, loop: true },
    },
    stateActions: { walk: "hover" },
  },
  wisp: {
    // Enemy (tier 3, night only). Original art drawn by scripts/draw-wisp.mjs:
    // one float/flicker block, faster while moving.
    url: "/assets/animals/wisp.png",
    frameWidth: 32,
    frameHeight: 32,
    columns: 4,
    dirRows: ["up", "left", "down", "right"],
    scale: 0.85,
    originX: 0.5,
    originY: 0.92, // shadow at y≈29 of 32
    labelHeight: 26,
    actions: {
      walk: { block: 0, frames: 4, frameRate: 10, loop: true },
      hover: { block: 0, frames: 4, frameRate: 6, loop: true },
    },
    stateActions: { walk: "hover" },
  },
  dune_stalker: {
    // Enemy (tier 5, deserts). scripts/draw-far-foes.mjs.
    url: "/assets/animals/dune_stalker.png",
    frameWidth: 32, frameHeight: 32, columns: 4, dirRows: ["up", "left", "down", "right"],
    scale: 1, originX: 0.5, originY: 0.88, labelHeight: 18,
    actions: {
      walk: { block: 0, frames: 4, frameRate: 12, loop: true },
      idle: { block: 1, frames: 4, frameRate: 4, loop: true },
      attack: { block: 2, frames: 4, frameRate: 12, loop: false },
    },
    stateActions: { walk: "idle", hunt: "idle" },
  },
  bog_hag: {
    // Enemy (tier 5, swamps): casts hexes. scripts/draw-far-foes.mjs.
    url: "/assets/animals/bog_hag.png",
    frameWidth: 32, frameHeight: 32, columns: 4, dirRows: ["up", "left", "down", "right"],
    scale: 1, originX: 0.5, originY: 0.92, labelHeight: 28,
    actions: {
      walk: { block: 0, frames: 4, frameRate: 6, loop: true },
      idle: { block: 1, frames: 4, frameRate: 4, loop: true },
      attack: { block: 2, frames: 4, frameRate: 8, loop: false },
    },
    stateActions: { walk: "idle" },
  },
  ice_troll: {
    // Enemy (tier 6, snow). scripts/draw-far-foes.mjs (48 px).
    url: "/assets/animals/ice_troll.png",
    frameWidth: 48, frameHeight: 48, columns: 4, dirRows: ["up", "left", "down", "right"],
    scale: 1.1, originX: 0.5, originY: 0.97, labelHeight: 44,
    actions: {
      walk: { block: 0, frames: 4, frameRate: 6, loop: true },
      idle: { block: 1, frames: 4, frameRate: 4, loop: true },
      attack: { block: 2, frames: 4, frameRate: 8, loop: false },
    },
    stateActions: { walk: "idle" },
  },
  gloam_stag: {
    // Enemy (tier 6, darkwood). scripts/draw-far-foes.mjs (48 px).
    url: "/assets/animals/gloam_stag.png",
    frameWidth: 48, frameHeight: 48, columns: 4, dirRows: ["up", "left", "down", "right"],
    scale: 1, originX: 0.5, originY: 0.97, labelHeight: 44,
    actions: {
      walk: { block: 0, frames: 4, frameRate: 10, loop: true },
      idle: { block: 1, frames: 4, frameRate: 4, loop: true },
      attack: { block: 2, frames: 4, frameRate: 10, loop: false },
    },
    stateActions: { walk: "idle" },
  },
  basalt_golem: {
    // Enemy (tier 7, peaks and mesas). scripts/draw-far-foes.mjs (48 px).
    url: "/assets/animals/basalt_golem.png",
    frameWidth: 48, frameHeight: 48, columns: 4, dirRows: ["up", "left", "down", "right"],
    scale: 1.15, originX: 0.5, originY: 0.97, labelHeight: 46,
    actions: {
      walk: { block: 0, frames: 4, frameRate: 5, loop: true },
      idle: { block: 1, frames: 4, frameRate: 4, loop: true },
      attack: { block: 2, frames: 4, frameRate: 7, loop: false },
    },
    stateActions: { walk: "idle" },
  },
  wyvern: {
    // Enemy (tier 7, badlands; flies, draws its own shadow). scripts/draw-far-foes.mjs (48 px).
    url: "/assets/animals/wyvern.png",
    frameWidth: 48, frameHeight: 48, columns: 4, dirRows: ["up", "left", "down", "right"],
    scale: 1.1, originX: 0.5, originY: 0.94, labelHeight: 40,
    actions: {
      walk: { block: 0, frames: 4, frameRate: 10, loop: true },
      idle: { block: 1, frames: 4, frameRate: 4, loop: true },
      attack: { block: 2, frames: 4, frameRate: 10, loop: false },
    },
    stateActions: { walk: "idle", hunt: "idle" },
  },
  rime_wraith: {
    // Enemy (tier 8, snowpeaks at night; hovers, own shadow). scripts/draw-far-foes.mjs.
    url: "/assets/animals/rime_wraith.png",
    frameWidth: 32, frameHeight: 32, columns: 4, dirRows: ["up", "left", "down", "right"],
    scale: 1.1, originX: 0.5, originY: 0.95, labelHeight: 28,
    actions: {
      walk: { block: 0, frames: 4, frameRate: 6, loop: true },
      idle: { block: 1, frames: 4, frameRate: 4, loop: true },
      attack: { block: 2, frames: 4, frameRate: 8, loop: false },
    },
    stateActions: { walk: "idle" },
  },
  elder_treant: {
    // Enemy (tier 8, deep forest). scripts/draw-far-foes.mjs (48 px).
    url: "/assets/animals/elder_treant.png",
    frameWidth: 48, frameHeight: 48, columns: 4, dirRows: ["up", "left", "down", "right"],
    scale: 1.3, originX: 0.5, originY: 0.97, labelHeight: 46,
    actions: {
      walk: { block: 0, frames: 4, frameRate: 4, loop: true },
      idle: { block: 1, frames: 4, frameRate: 4, loop: true },
      attack: { block: 2, frames: 4, frameRate: 7, loop: false },
    },
    stateActions: { walk: "idle" },
  },
  sand_wyrm: {
    // Lair boss (the Glass Pit; src/lib/lairs.ts). scripts/draw-lair-bosses.mjs: 64×64, the same front view in every row.
    url: "/assets/animals/sand_wyrm.png",
    frameWidth: 64, frameHeight: 64, columns: 4, dirRows: ["up", "left", "down", "right"],
    scale: 1.5, originX: 0.5, originY: 0.97, labelHeight: 60,
    actions: { walk: { block: 0, frames: 4, frameRate: 4, loop: true } },
    stateActions: {},
  },
  frost_giant: {
    // Lair boss (the Rime Hall; src/lib/lairs.ts). scripts/draw-lair-bosses.mjs: 64×64, the same front view in every row.
    url: "/assets/animals/frost_giant.png",
    frameWidth: 64, frameHeight: 64, columns: 4, dirRows: ["up", "left", "down", "right"],
    scale: 1.5, originX: 0.5, originY: 0.97, labelHeight: 60,
    actions: { walk: { block: 0, frames: 4, frameRate: 4, loop: true } },
    stateActions: {},
  },
  fire_drake: {
    // Lair boss (the Cinder Roost; src/lib/lairs.ts). scripts/draw-lair-bosses.mjs: 64×64, the same front view in every row.
    url: "/assets/animals/fire_drake.png",
    frameWidth: 64, frameHeight: 64, columns: 4, dirRows: ["up", "left", "down", "right"],
    scale: 1.5, originX: 0.5, originY: 0.97, labelHeight: 60,
    actions: { walk: { block: 0, frames: 4, frameRate: 4, loop: true } },
    stateActions: {},
  },
  the_hollow: {
    // Lair boss (the Hollow Grove; src/lib/lairs.ts). scripts/draw-lair-bosses.mjs: 64×64, the same front view in every row.
    url: "/assets/animals/the_hollow.png",
    frameWidth: 64, frameHeight: 64, columns: 4, dirRows: ["up", "left", "down", "right"],
    scale: 1.5, originX: 0.5, originY: 0.97, labelHeight: 60,
    actions: { walk: { block: 0, frames: 4, frameRate: 4, loop: true } },
    stateActions: {},
  },
  rootking: {
    // World boss. Original art drawn by scripts/draw-rootking.mjs: 64×64
    // frames, the same front view in every row (it stands its ground).
    url: "/assets/animals/rootking.png",
    frameWidth: 64,
    frameHeight: 64,
    columns: 4,
    dirRows: ["up", "left", "down", "right"],
    scale: 1.4,
    originX: 0.5,
    originY: 0.97, // shadow at y≈62 of 64
    labelHeight: 56,
    actions: {
      walk: { block: 0, frames: 4, frameRate: 4, loop: true },
    },
    stateActions: {},
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
