// Random encounters in the wilds (src/lib/encounters.ts). Types only.

export type EncounterKind = "beset" | "merchant" | "hunter" | "lost_child" | "ambush";

/** A kind of encounter: who's there, what they need, what helping pays. */
export type EncounterDef = {
  title: string;
  /** The stranger (none for an ambush). */
  stranger: { role: string; persona: string; greeting: string } | null;
  /** Hand over one of these (qty each), or null when the job is a fight. */
  need: { itemKeys: string[]; qty: number; label: string } | null;
  /** Shouted to nearby players when it starts. */
  call: string;
  thanks: string;
  reward: { coins: number; xp: number; rep: number };
};

/** An encounter as a nearby player sees it. */
export type EncounterView = {
  id: number;
  kind: EncounterKind;
  title: string;
  state: "active" | "resolved";
  x: number;
  y: number;
  npcId: number | null;
  need: string | null;
  /** You were among the helpers paid when it resolved. */
  rewardedMe: boolean;
};

/** A connected player as tickd sees them when rolling encounters. */
export type OnlinePlayer = { id: number; x: number; y: number };
