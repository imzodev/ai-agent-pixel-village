// Combat and level progression data + pure rules, shared by the server
// (sim worker, act route, shops) and the HUD. No DB imports.
//
// The loop: fight → XP + drops → craft better gear (src/lib/recipes.ts)
// → deeper zones → levels unlock seeds, recipes, land and perks.

import type { EnemyKindDef, EnemyZone, LevelUnlock, PerkDef, PerkKey, WeaponDef } from "@/types/progression";
import { chunkRect } from "./worldmap";

export type { EnemyKindDef, EnemyZone, LevelUnlock, PerkDef, PerkKey, WeaponDef } from "@/types/progression";

export const ENEMY_KINDS: Record<string, EnemyKindDef> = {
  slime: { name: "Slime", tier: 1, hp: 6, xp: 8, damage: 1, drops: [{ itemKey: "slime_gel", chance: 1, qty: 1 }] },
  bat: { name: "Bat", tier: 1, hp: 5, xp: 8, damage: 1, drops: [{ itemKey: "bat_wing", chance: 0.6, qty: 1 }] },
  thornling: { name: "Thornling", tier: 2, hp: 12, xp: 15, damage: 2, drops: [{ itemKey: "thorn", chance: 0.8, qty: 2 }] },
  boar: { name: "Bramble Boar", tier: 2, hp: 22, xp: 25, damage: 3, drops: [{ itemKey: "boar_hide", chance: 0.7, qty: 1 }] },
  wisp: { name: "Shade Wisp", tier: 3, hp: 30, xp: 40, damage: 4, nightOnly: true, drops: [{ itemKey: "wisp_essence", chance: 0.75, qty: 1 }] },
  // World boss: rewards are shared by everyone who fought it (BOSS_REWARD).
  rootking: { name: "Old Rootking", tier: "boss", hp: 600, xp: 300, damage: 5, drops: [] },
};

/** The world boss: when and where it rises, and what fighters earn. */
export const BOSS_KIND = "rootking";
/** A clearing in the north woods. */
export const BOSS_SPOT = { x: 576, y: -720 };
/** How long it stays before sinking back into the earth. */
export const BOSS_WINDOW_MS = 60 * 60_000;
/** Share of its HP you must deal to earn the reward. */
export const BOSS_SHARE_MIN = 0.03;
export const BOSS_REWARD = { xp: 300, coins: 60, itemKey: "rootking_heartwood" } as const;

/**
 * Start of the boss window containing `now`, or null outside it. The
 * schedule is "<weekday 0-6, 0 = Sunday>@<hour 0-23>" in UTC
 * (default Saturday 18:00); `force` keeps a window always open (testing).
 */
export function bossWindowStart(now: number, schedule = "6@18", force = false): number | null {
  if (force) return Math.floor(now / BOSS_WINDOW_MS) * BOSS_WINDOW_MS;
  const m = /^(\d)@(\d{1,2})$/.exec(schedule.trim());
  const dow = m ? Number(m[1]) : 6;
  const hour = m ? Number(m[2]) : 18;
  const d = new Date(now);
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour) - ((d.getUTCDay() - dow + 7) % 7) * 86_400_000;
  return now >= start && now < start + BOSS_WINDOW_MS ? start : null;
}

/** Fighters who earn the boss reward: dealt at least BOSS_SHARE_MIN of its HP. */
export function bossRewardees(damage: Record<string, number>, maxHp: number): number[] {
  return Object.entries(damage).filter(([, d]) => d >= maxHp * BOSS_SHARE_MIN).map(([id]) => Number(id));
}

/** Enemy kind config; unknown (legacy) kinds behave like a slime. */
export function enemyKind(kind: string): EnemyKindDef {
  return ENEMY_KINDS[kind] ?? ENEMY_KINDS.slime;
}

/** True when this kind attacks players standing next to it. */
export function isAggressive(kind: string): boolean {
  const t = enemyKind(kind).tier;
  return t === "boss" || t >= 2;
}

// Wild areas, nearest (safest) to furthest. Geometry matches the old
// WILD_ZONES ring, plus the oak forest west of town (src/lib/forest.ts),
// which only fills with wisps at night so daytime woodcutting stays safe.
export const ENEMY_ZONES: EnemyZone[] = [
  { name: "north woods", rect: chunkRect(0, 4, 3, 2), kinds: { slime: 3, bat: 2 } },
  { name: "south meadow", rect: chunkRect(0, -6, 3, 2), kinds: { slime: 3, bat: 2 } },
  { name: "east field", rect: chunkRect(5, 2, 2, 5), kinds: { slime: 3, thornling: 2 } },
  { name: "west woods", rect: chunkRect(-4, 2, 2, 5), kinds: { thornling: 2, boar: 2 } },
  { name: "oak forest", rect: chunkRect(-8, 1, 3, 3), kinds: { wisp: 1 } },
];

/** Kinds that may spawn in `zone` right now (night-only kinds by night only). */
export function spawnableKinds(zone: EnemyZone, night: boolean): [string, number][] {
  return Object.entries(zone.kinds).filter(([k]) => night || !enemyKind(k).nightOnly);
}

/** Weighted pick of a kind for `zone`, or null when nothing can spawn there now. */
export function pickEnemyKind(zone: EnemyZone, night: boolean, rand = Math.random): string | null {
  const opts = spawnableKinds(zone, night);
  const total = opts.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return null;
  let r = rand() * total;
  for (const [k, w] of opts) {
    r -= w;
    if (r < 0) return k;
  }
  return opts[opts.length - 1][0];
}

/** Items dropped by a defeated enemy (each drop rolls independently). */
export function rollDrops(kind: string, rand = Math.random): { itemKey: string; qty: number }[] {
  return enemyKind(kind).drops.filter((d) => rand() < d.chance).map((d) => ({ itemKey: d.itemKey, qty: d.qty }));
}

/** Held weapons and tools. The best equipped weapon counts in a fight. */
export const WEAPONS: Record<string, WeaponDef> = {
  wooden_sword: { damage: 2 },
  stone_sword: { damage: 4 },
  thorn_blade: { damage: 6 },
  wisp_blade: { damage: 9 },
  axe: { damage: 0, chopBonus: 0 },
  sharp_axe: { damage: 0, chopBonus: 1 },
};

/** Items that let you chop trees (any of them in the bag). */
export const AXE_ITEMS: readonly string[] = ["axe", "sharp_axe"];

/** Damage bonus of the best weapon among `equipped` item keys. */
export function weaponBonus(equipped: readonly string[]): number {
  return equipped.reduce((best, k) => Math.max(best, WEAPONS[k]?.damage ?? 0), 0);
}

/** Extra wood per chop from the best axe in the bag. */
export function chopBonus(bag: readonly string[]): number {
  return bag.reduce((best, k) => Math.max(best, WEAPONS[k]?.chopBonus ?? 0), 0);
}

/** One hit on an enemy: 2–4 base (`roll` in [0, 1)), weapon, level and perk. */
export function playerDamage(o: { level: number; weapon: number; fighter: boolean; roll: number }): number {
  return 2 + Math.floor(o.roll * 3) + o.weapon + Math.floor(o.level / 2) + (o.fighter ? 2 : 0);
}

/** Damage an enemy deals to a player (Tough shaves 1 off, never below 1). */
export function enemyHit(kind: string, tough: boolean): number {
  return Math.max(1, enemyKind(kind).damage - (tough ? 1 : 0));
}

/** Level for an XP total (unchanged curve: L5 at 400 XP, L10 at 2025). */
export function levelForXp(xp: number): number {
  return 1 + Math.floor(Math.sqrt(xp / 25));
}

/** XP needed to reach `level`. */
export function xpForLevel(level: number): number {
  return 25 * (level - 1) ** 2;
}

/** Max HP at a level (+20 with the Tough perk). */
export function maxHpFor(level: number, tough: boolean): number {
  return 20 + (level - 1) * 5 + (tough ? 20 : 0);
}

/** Perk points earned by `level` (one every 5 levels). */
export const PERK_EVERY = 5;
export function perkPoints(level: number): number {
  return Math.floor(level / PERK_EVERY);
}

/** Land lots a player may own at `level`. */
export function landLotLimit(level: number): number {
  return level >= 10 ? 2 : 1;
}

/** What each level unlocks. `minLevel` on shop stock and recipes must match. */
export const LEVEL_UNLOCKS: LevelUnlock[] = [
  { level: 2, text: "Carrot seeds at Pip's" },
  { level: 3, text: "Tomato seeds · Stone Sword recipe" },
  { level: 5, text: "Pumpkin seeds · Thorn Blade & Sharp Axe recipes · a perk" },
  { level: 8, text: "Wisp Blade recipe" },
  { level: 10, text: "A second land lot · a perk" },
  { level: 15, text: "A perk" },
  { level: 20, text: "A perk" },
];

/** Unlocks gained going from level `from` (exclusive) to `to` (inclusive). */
export function unlocksBetween(from: number, to: number): LevelUnlock[] {
  return LEVEL_UNLOCKS.filter((u) => u.level > from && u.level <= to);
}

/** The next unlock above `level`, if any. */
export function nextUnlock(level: number): LevelUnlock | null {
  return LEVEL_UNLOCKS.find((u) => u.level > level) ?? null;
}

export const PERKS: PerkDef[] = [
  { key: "green_thumb", name: "Green Thumb", icon: "🌱", description: "Your crops grow 15% faster." },
  { key: "lumberjack", name: "Lumberjack", icon: "🪓", description: "+1 wood per chop." },
  { key: "fighter", name: "Fighter", icon: "⚔️", description: "+2 damage per hit." },
  { key: "tough", name: "Tough", icon: "🛡️", description: "+20 max HP and enemies hit you for 1 less." },
  { key: "forager", name: "Forager", icon: "🍄", description: "Twice the chance to find seeds while foraging." },
  { key: "haggler", name: "Haggler", icon: "🪙", description: "NPCs pay you 20% more." },
];

export function isPerkKey(k: string): k is PerkKey {
  return PERKS.some((p) => p.key === k);
}

/** Green Thumb: share of each crop stage's time that remains. */
export const GREEN_THUMB_MULT = 0.85;
/** Haggler: sell-price multiplier. */
export const HAGGLER_MULT = 1.2;
