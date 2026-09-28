// Pure garden rules (no DB), shared by src/lib/garden.ts and the client.

/** True when a crop at `stage` of a kind with `stages` stages is ready. */
export function isRipe(stage: number, stages: number): boolean {
  return stage >= stages - 1;
}

/** When the current stage ends after watering: half the time left. */
export function wateredAdvanceAt(now: number, nextAdvanceAt: number): number {
  return now + Math.max(0, Math.floor((nextAdvanceAt - now) / 2));
}

/** Whether a crop can be watered right now, and why not. */
export function waterCheck(node: { stage: number; wateredStage: number | null; nextAdvanceAt: Date | null }, stages: number): string | null {
  if (isRipe(node.stage, stages)) return "It's ready to harvest — no need to water.";
  if (node.wateredStage === node.stage) return "Already watered. Check back when it grows.";
  if (!node.nextAdvanceAt) return "It's not growing right now.";
  return null;
}
