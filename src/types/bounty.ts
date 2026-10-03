// Town bounty boards (src/lib/bounties.ts). Types only.

export type BountyKind = "hunt" | "gather" | "delivery" | "explore" | "wanted";

/** What a bounty asks for (per kind). Spots are world px. */
export type BountyData =
  | { kind: "hunt"; enemyKind: string; qty: number }
  | { kind: "gather"; itemKey: string; qty: number }
  | { kind: "delivery"; toTown: string }
  | { kind: "explore"; x: number; y: number; place: string }
  | { kind: "wanted"; enemyKind: string; name: string; x: number; y: number; enemyId?: number };

export type BountyReward = { coins: number; xp: number; rep: number };

/** A bounty as a board or your tracker shows it. */
export type BountyView = {
  id: number;
  town: string;
  townName: string;
  title: string;
  description: string;
  data: BountyData;
  reward: BountyReward;
  expiresAt: number;
  /** Your progress, when you've taken it. */
  mine: { progress: number; target: number; status: "active" | "done" } | null;
};
