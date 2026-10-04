// The guided first session: five short steps that teach farming,
// woodcutting, fighting and trading in about ten minutes. Pure data and
// rules, shared by the server (src/lib/tutorialServer.ts) and the HUD's
// quest tracker. Progress lives on the character (tutorial_step /
// tutorial_progress); TUTORIAL_DONE marks a finished or skipped tutorial.

import type { TutorialEventKind, TutorialStep } from "@/types/tutorial";
import { FOREST_TILES } from "./forest";

export type { TutorialEventKind, TutorialState, TutorialStep, TutorialTarget } from "@/types/tutorial";

/** Finished every step (earns the "Newcomer" achievement). */
export const TUTORIAL_DONE = 99;
/** Skipped: no more steps, no achievement. */
export const TUTORIAL_SKIPPED = 98;

const GROVE = { x: ((FOREST_TILES.tx0 + FOREST_TILES.tx1) / 2) * 16, y: 7 * 16 };
const SOUTH_MEADOW = { x: 576, y: 1680 };

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: "Say hello to Elder Oswin",
    hint: "The Elder knows everyone in the grove. Walk up to him and talk (E).",
    event: "talk", match: { npcKey: "village_oswin" }, qty: 1,
    target: { kind: "npc", npcKey: "village_oswin" },
    reward: { coins: 10, items: [{ itemKey: "radish_seeds", qty: 3 }] },
  },
  {
    title: "Claim free land and plant a seed",
    hint: "The fenced fields south of the village are free to claim. Claim one at its gate, then plant a radish seed in a plot.",
    event: "plant", qty: 1,
    target: { kind: "freeLand" },
    reward: { items: [{ itemKey: "axe", qty: 1 }] },
  },
  {
    title: "Chop 3 logs in the oak grove",
    hint: "Take the road west to Whisperwood. The oaks in the grove can be chopped with your new axe.",
    event: "collect", match: { itemKey: "wood" }, qty: 3,
    target: { kind: "point", ...GROVE },
    reward: { coins: 15 },
  },
  {
    title: "Drive off a slime",
    hint: "Slimes bounce around the meadows outside the village. Attack one (J).",
    event: "defeat", match: { enemyKind: "slime" }, qty: 1,
    target: { kind: "enemy", enemyKind: "slime", fallback: SOUTH_MEADOW },
    reward: { items: [{ itemKey: "wooden_sword", qty: 1 }] },
  },
  {
    title: "Sell something to a villager",
    hint: "Pip buys stones, mushrooms and crops. Talk to him and sell anything from your bag.",
    event: "sell", qty: 1,
    target: { kind: "npc", npcKey: "village_pip" },
    reward: { coins: 30, items: [{ itemKey: "bread", qty: 2 }], title: "Newcomer" },
  },
];

/** Does an event count toward a step? */
export function stepMatches(step: TutorialStep, kind: TutorialEventKind, detail: { npcKey?: string; itemKey?: string; enemyKind?: string }): boolean {
  if (step.event !== kind) return false;
  const m = step.match;
  if (!m) return true;
  return (!m.npcKey || m.npcKey === detail.npcKey) && (!m.itemKey || m.itemKey === detail.itemKey) && (!m.enemyKind || m.enemyKind === detail.enemyKind);
}
