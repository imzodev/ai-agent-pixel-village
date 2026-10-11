// Moments: proud milestones a player can share (src/lib/momentsServer.ts,
// cards in src/lib/cards/momentCard.ts, pages at /m/[id]). Types only.

import type { Appearance } from "./domain";
import type { EquippedCosmetics } from "./cosmetic";

export type MomentKind = "lair_boss" | "rootking" | "level" | "title" | "relic_set" | "treasure" | "dear_friend";

/** Art shown beside the character on the card: a creature's sprite or an item's icon. */
export type MomentArt = { kind: "enemy"; key: string } | { kind: "npc"; key: string } | { kind: "level"; level: number };

/** What a card says, written when the moment happens (names as they were then). */
export type MomentData = {
  /** Big line on the card: "Frost Giant felled". */
  headline: string;
  /** Small line under it: "in the Rime Hall · danger tier 6". */
  sub: string;
  /** First-person post text: "I just took down the Frost Giant on thegroove". */
  share: string;
  art?: MomentArt;
  /** A rare extra: "and claimed the Glacier Blade". */
  extra?: string;
};

/** A moment as stored. */
export type Moment = {
  id: string;
  characterId: number;
  kind: MomentKind;
  data: MomentData;
  createdAt: Date;
  seenAt: Date | null;
};

/** A moment with whose it is, for its public page and card. */
export type MomentView = Moment & { characterName: string; username: string | null };

/** A moment as the client gets it (unseen ones in /api/me). */
export type MomentNotice = { id: string; kind: MomentKind; data: MomentData; createdAt: string };

/** How a character looks on a card: their appearance, what they wear and hold. */
export type CardLook = { name: string; level: number; title: string | null; appearance: Appearance; cosmetics: EquippedCosmetics; weapon?: string };
