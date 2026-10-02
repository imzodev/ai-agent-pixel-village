// Phaser scene entity shapes. Types only — no logic.
//
// These are the client-side sprite wrappers held by WorldScene's maps.
// Kept here so the scene module stays logic-only and the shapes can be
// reused by future scenes/systems.

import type Phaser from "phaser";
import type { Facing } from "@/types/world";
import type { EquippedCosmetics } from "@/types/cosmetic";
import type { Move } from "@/types/motion";
import type { AnimalSpriteDef } from "@/types/animalSprite";
import type { Appearance } from "@/db/schema";

export type CharEnt = {
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  badge?: Phaser.GameObjects.Text;
  tx: number;
  ty: number;
  /** Server-scheduled move (NPCs). When set, position = positionAt(move, serverNow). */
  move?: Move | null;
  facing: Facing;
  speed: number;
  texKey: string | null;
  appKey: string;
  /** Currently equipped cosmetics for this character. Drives the LPC layer
   *  order (glasses over eyes, outfit over torso, hat over hair). */
  equipped?: EquippedCosmetics;
  /** Held weapon item key with LPC art (e.g. "wooden_sword"), if any. */
  weapon?: string;
  /** Base look, kept so a tool swing (the axe) can compose its own sheet. */
  app?: Appearance;
  /** Scene time (ms) until which a one-shot action (the slash) owns the
   *  sprite's animation; walk/idle updates wait until it has finished. */
  actingUntil?: number;
  bubble?: { c: Phaser.GameObjects.Container; until: number };
  glow?: Phaser.GameObjects.Arc;
  /** Soft drop shadow under the feet. */
  shadow?: Phaser.GameObjects.Image;
  /** Nameplate title shown above the name, and the text object. */
  title?: string | null;
  titleText?: Phaser.GameObjects.Text;
  /** A short-lived emote bubble ("!", "♪", "…"). */
  emote?: { t: Phaser.GameObjects.Text; until: number };
};

export type CritterEnt = {
  sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
  kind: string;
  /** Spritesheet definition when this species is animated (cow, fox, …). */
  def?: AnimalSpriteDef;
  /** Height of the art above the anchor, in world px (label / hp bar placement). */
  top: number;
  /** Last one-shot animation played, keyed `${anim}@${move.startAt}`. */
  oneShot?: string;
  tx: number;
  ty: number;
  /** Server-scheduled move. When set, position = positionAt(move, serverNow). */
  move?: Move | null;
  facing: string;
  state: string;
  speed: number;
  label?: Phaser.GameObjects.Text;
  zz?: Phaser.GameObjects.Text;
  hpBar?: Phaser.GameObjects.Graphics;
  hp: number;
  maxHp: number;
  phase: number;
  /** Soft drop shadow (ground-walkers only; flyers draw their own). */
  shadow?: Phaser.GameObjects.Image;
};
