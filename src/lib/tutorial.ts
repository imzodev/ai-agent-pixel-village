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
    reward: { coins: 15, xp: 15, items: [{ itemKey: "radish_seeds", qty: 3 }] },
  },
  {
    title: "Grow something",
    hint: "The fenced fields south of the village are free to claim: claim one at its gate and plant a radish seed. If they're all taken, gather wheat in the Common Field just north of the village instead.",
    event: "plant", qty: 1,
    // Fields are limited; the Common Field never runs out.
    alt: { event: "collect", match: { itemKey: "wheat" } },
    target: { kind: "freeLand" },
    reward: { coins: 15, xp: 20, items: [{ itemKey: "axe", qty: 1 }] },
  },
  {
    title: "Chop 3 logs in the oak grove",
    hint: "Follow the road west out of the village to the oak grove, and chop the oaks with your new axe. Keep your sword handy: wisps drift through the grove at night.",
    event: "collect", match: { itemKey: "wood" }, qty: 3,
    target: { kind: "point", ...GROVE },
    reward: { coins: 25, xp: 20 },
  },
  {
    title: "Drive off a slime",
    hint: "Slimes bounce around the meadows outside the village. Attack one with your sword (J).",
    event: "defeat", match: { enemyKind: "slime" }, qty: 1,
    target: { kind: "enemy", enemyKind: "slime", fallback: SOUTH_MEADOW },
    reward: { coins: 30, xp: 25, items: [{ itemKey: "berry", qty: 3 }] },
  },
  {
    title: "Sell something to a villager",
    hint: "Pip buys stones, mushrooms and crops. Walk up to him, choose Sell and sell anything from your bag.",
    event: "sell", qty: 1,
    target: { kind: "npc", npcKey: "village_pip" },
    reward: { coins: 50, xp: 30, items: [{ itemKey: "bread", qty: 2 }], title: "Newcomer" },
  },
];

/** Does an event count toward a step? */
export function stepMatches(step: TutorialStep, kind: TutorialEventKind, detail: { npcKey?: string; itemKey?: string; enemyKind?: string }): boolean {
  const fits = (event: TutorialEventKind, m: TutorialStep["match"]) =>
    event === kind && (!m || ((!m.npcKey || m.npcKey === detail.npcKey) && (!m.itemKey || m.itemKey === detail.itemKey) && (!m.enemyKind || m.enemyKind === detail.enemyKind)));
  return fits(step.event, step.match) || (!!step.alt && fits(step.alt.event, step.alt.match));
}

/** All the XP the tutorial gives. */
export const TUTORIAL_XP = TUTORIAL_STEPS.reduce((n, s) => n + (s.reward.xp ?? 0), 0);
