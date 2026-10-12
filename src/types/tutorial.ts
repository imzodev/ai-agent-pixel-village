// The guided first session (src/lib/tutorial.ts). Types only.

export type TutorialEventKind = "talk" | "plant" | "collect" | "defeat" | "sell";

/** Where a step's guide arrow points. */
export type TutorialTarget =
  | { kind: "npc"; npcKey: string }
  /** Your field, else a free one, else (all taken) the Common Field. */
  | { kind: "freeLand" }
  /** Your lot of this kind (key prefix, e.g. "ranch_"), else the nearest free one. */
  | { kind: "freeLot"; prefix: string }
  | { kind: "point"; x: number; y: number }
  | { kind: "enemy"; enemyKind: string; fallback: { x: number; y: number } };

export type TutorialStep = {
  title: string;
  /** What the Elder says about this step (shown in the tracker). */
  hint: string;
  event: TutorialEventKind;
  /** Narrows the event (e.g. talk to this NPC, collect this item). */
  match?: { npcKey?: string; itemKey?: string; enemyKind?: string };
  /** Another way to complete it (e.g. gather wheat when every field is taken). */
  alt?: { event: TutorialEventKind; match?: { npcKey?: string; itemKey?: string; enemyKind?: string } };
  qty: number;
  target: TutorialTarget;
  reward: { coins?: number; xp?: number; items?: { itemKey: string; qty: number }[]; title?: string };
};

/** Tutorial state as the client sees it (from /api/me). */
export type TutorialState = { step: number; progress: number; done: boolean };
