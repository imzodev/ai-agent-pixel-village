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
  bubble?: { c: Phaser.GameObjects.Container; until: number };
  glow?: Phaser.GameObjects.Arc;
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
};
