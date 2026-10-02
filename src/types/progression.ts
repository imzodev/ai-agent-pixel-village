// Combat and level progression: enemy kinds, spawn zones, weapons, level
// unlocks and perks. Types only — the data lives in src/lib/progression.ts.

/** An item an enemy can drop on defeat. */
export type EnemyDrop = { itemKey: string; chance: number; qty: number };

export type EnemyKindDef = {
  name: string;
  /** 1 = near town (passive), 2+ = attacks players next to it, boss = world boss. */
  tier: 1 | 2 | 3 | "boss";
  hp: number;
  /** XP for the kill (the boss shares its own reward). */
  xp: number;
  /** HP it takes from a player per hit. */
  damage: number;
  drops: EnemyDrop[];
  /** Only spawns (and only stays) at night. */
  nightOnly?: boolean;
  /** Runs at players who come close, instead of only biting at arm's length. */
  hunts?: boolean;
};

/** A wild area where enemies spawn, with the kinds that live there. */
export type EnemyZone = {
  name: string;
  rect: { x: number; y: number; w: number; h: number };
  /** Relative spawn weights of the kinds found here. */
  kinds: Record<string, number>;
  /** Underground: night-only kinds spawn (and stay) at any hour. */
  alwaysDark?: boolean;
  /** Enemies kept alive here (default 4). */
  target?: number;
};

/** Combat (or chopping) bonus of a held item. */
export type WeaponDef = {
  /** Extra damage per hit while equipped. */
  damage: number;
  /** Extra wood per chop while in the bag (axes). */
  chopBonus?: number;
};

/** Something a level unlocks (shown on level up and in the HUD). */
export type LevelUnlock = { level: number; text: string };

export type PerkKey = "green_thumb" | "lumberjack" | "fighter" | "tough" | "forager" | "haggler";

export type PerkDef = { key: PerkKey; name: string; icon: string; description: string };
