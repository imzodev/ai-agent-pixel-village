// The Village Ranch (src/lib/villageRanch.ts). Types only.

/** The farm animals that live at the Village Ranch, each in its own paddock. */
export type RanchSpecies = "cow" | "pig" | "sheep" | "llama" | "duck" | "chicken";

/** Something anyone may pick at the Village Ranch (src/lib/ranchPicks.ts). */
export type RanchPick = {
  /** What a pick gives. */
  item: string;
  /** How long until the same player can pick that spot again. */
  cooldownMs: number;
  /** Its name on the selection card: "Tomatoes", "Beehive". */
  label: string;
};
