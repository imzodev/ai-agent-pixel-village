// Which NPCs have a mind, and how often they think (env-tunable).
//
//   MIND_NPCS=village_marigold,hollowmere_bjorn   NPC keys ("" = none); each
//                                needs a profile (src/lib/mind/profiles.ts)
//   MIND_INTERVAL_MS=60000       how often each one thinks (asks Jev)
//   MIND_INCOME_SCALE=1          multiplies every mind's income and purse
//                                target (profiles.ts `income`)

import { profileFor } from "./profiles";

export const MIND_INTERVAL_MS = Math.max(15_000, Number(process.env.MIND_INTERVAL_MS ?? 60_000));
const incomeScale = Number(process.env.MIND_INCOME_SCALE ?? 1);
/** A typo shouldn't switch income off: anything but a number ≥ 0 counts as 1. */
export const MIND_INCOME_SCALE = Number.isFinite(incomeScale) && incomeScale >= 0 ? incomeScale : 1;

/** Listed in MIND_NPCS *and* given a profile (src/lib/mind/profiles.ts);
 *  a listed NPC without a profile is ignored, never half-minded. */
export function mindNpcKeys(): string[] {
  return (process.env.MIND_NPCS ?? "village_marigold").split(",").map((s) => s.trim()).filter((k) => k && profileFor(k));
}

export function isMindNpc(key: string): boolean {
  return mindNpcKeys().includes(key);
}
