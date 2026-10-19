// Jobs, the pure part (the server is src/lib/jobsServer.ts): be hired by an
// NPC, do a shift a day, earn a wage, rise through three ranks. A day is a
// real UTC calendar day (like daily quests: a game day is only 24 minutes).
// Miss FIRE_AFTER_DAYS days in a row and you're let go. Every number is here.

import { NPC_DEFS, npcDef } from "./npcDefs";
import { SETTLEMENT_NPCS, TOWNS } from "./settlements";
import { FISH_DEFS } from "./fishing";
import { itemValue } from "./itemDefs";
import type { JobDef, JobKind, JobShift } from "@/types/jobs";

export type { JobDef, JobKind, JobLetter, JobOffer, JobProgress, JobShift, JobStatus, JobView, JobsResponse } from "@/types/jobs";

/** Jobs a player may hold at once (one per employer). */
export const MAX_JOBS = 3;
/** Missing this many days in a row gets you let go. */
export const FIRE_AFTER_DAYS = 3;
/** After quitting (or being let go), how long until that employer takes you back. */
export const REHIRE_MS = 24 * 3600_000;
/** Shifts done to reach each rank (Apprentice, Hand, Foreman). */
export const RANK_AT: readonly number[] = [0, 5, 15];
/** Pay and quota grow with rank. */
export const RANK_MULT: readonly number[] = [1, 1.25, 1.5];
/** The day's wage on top of the work itself. */
export const FLAT_WAGE: Readonly<Record<JobKind, number>> = { courier: 30, supplier: 30, guard: 40, escort: 60 };
/**
 * Suppliers: goods handed in pay this × full value — more than any buyer pays
 * at market (a specialist pays full value, before demand), so the job beats
 * selling; but under any shop's price, so buying goods to hand in never pays.
 */
export const SUPPLY_PREMIUM = 1.2;
/** Guards: coins per beast, on top of the wage. */
export const GUARD_PER_BEAST = 4;
/** Couriers: a letter pays LETTER_BASE + a coin per LETTER_TILES tiles from the post. */
export const LETTER_BASE = 6;
export const LETTER_TILES = 25;
/** Escorts: within this of the wagon counts as riding along, for ESCORT_SHARE of the way. */
export const ESCORT_PX = 12 * 16;
export const ESCORT_SHARE = 0.6;
/** A leg with guards riding along is ambushed this long after setting off, by AMBUSH_MIN–AMBUSH_MAX beasts. */
export const AMBUSH_AFTER_MS = 2 * 60_000;
export const AMBUSH_MIN = 2;
export const AMBUSH_MAX = 4;
/** Guards keep the roads within this many tiles of their town. */
export const GUARD_RADIUS = 80;

const tileOf = (npcKey: string): { tx: number; ty: number } => {
  const d = npcDef(npcKey);
  return d ? { tx: d.tilePos[0], ty: d.tilePos[1] } : { tx: 0, ty: 0 };
};
const guard = (employerKey: string, place: string, at: { tx: number; ty: number }, pitch: string, minLevel = 3): JobDef => ({
  key: `guard_${employerKey}`, kind: "guard", employerKey, titles: ["Watch Recruit", "Watchman", "Captain of the Watch"],
  shift: { kind: "guard", kills: 6, tx: at.tx, ty: at.ty, radius: GUARD_RADIUS, place }, minLevel, pitch,
});
const supplier = (employerKey: string, items: readonly string[], qty: number, titles: readonly [string, string, string], pitch: string): JobDef => ({
  key: `supply_${employerKey}`, kind: "supplier", employerKey, titles, shift: { kind: "supply", items, qty }, minLevel: 1, pitch,
});

export const JOB_DEFS: readonly JobDef[] = [
  {
    key: "courier_post", kind: "courier", employerKey: "village_hettie", titles: ["Post Runner", "Courier", "Postmaster's Right Hand"],
    shift: { kind: "letters", count: 3 }, minLevel: 1,
    pitch: "The Grove Post needs legs, dear! Three letters a day, to whoever they're addressed to. The farther they go, the more they pay.",
  },
  supplier("village_hollis", ["wheat"], 20, ["Field Hand", "Mill Hand", "Head Miller's Hand"], "Bring me 20 sheaves of wheat a day and I'll pay better than any market. The mill never sleeps."),
  supplier("hollowmere_maren", ["wood"], 12, ["Log Runner", "Timber Hand", "Master Sawyer"], "Twelve good logs a day keeps my saw singing. I pay for them, and for your trouble."),
  supplier("hollowmere_bjorn", ["stone"], 10, ["Quarry Runner", "Forge Hand", "Smith's Foreman"], "Ten stones a day from the pass, and you're on the forge's books. Steady work, steady coin."),
  supplier("village_della", ["milk", "wool"], 8, ["Dairy Hand", "Ranch Hand", "Head Dairyman"], "Milk or wool, eight a day, from your homestead's animals. The cheese press is always hungry."),
  supplier("village_fenwick", ["apple", "red_grape", "white_grape", "pear"], 10, ["Picker", "Cellar Hand", "Master Presser"], "Ten apples, grapes or pears a day for the press. Good fruit makes good cider!"),
  supplier("brightwater_marina", FISH_DEFS.map((f) => f.key), 6, ["Net Mender", "Deckhand", "Fleet Boss"], "Six fish a day, any kind, and you're one of my boats. The market never runs out of mouths."),
  guard("hollowmere_sorrel", "Hollowmere", tileOf("hollowmere_sorrel"), "The wolves and boars grow bold on the King's Road. Keep them off it — six a day — and Hollowmere pays you for it."),
  guard("brightwater_wynn", "Brightwater", tileOf("brightwater_wynn"), "The beasts from the caverns trouble our roads! Six a day, brave soul, and Brightwater shall reward you handsomely."),
  // Each continent town's bounty keeper hires a watch for its own land.
  ...SETTLEMENT_NPCS.filter((n) => n.job === "bounty").flatMap((n) => {
    const town = TOWNS.find((t) => t.key === n.town);
    return town ? [guard(n.key, town.name, { tx: town.sq.tx, ty: town.sq.ty }, `${town.name} needs a watch on its roads. Six beasts a day, and the town pays.`, 4)] : [];
  }),
  {
    key: "escort_caravan", kind: "escort", employerKey: "village_tamsin", titles: ["Outrider", "Caravan Guard", "Caravan Master"],
    shift: { kind: "escort" }, minLevel: 4,
    pitch: "The roads between towns aren't safe for a lone wagon. Ride along with me one leg a day, keep the beasts off, and I'll pay you well.",
  },
];

const byKey = new Map(JOB_DEFS.map((j) => [j.key, j]));
export const jobDef = (key: string): JobDef | undefined => byKey.get(key);
export const jobsOfEmployer = (npcKey: string): JobDef[] => JOB_DEFS.filter((j) => j.employerKey === npcKey);

// ── Days, ranks and pay ─────────────────────────────────────────────────
/** The UTC day of a moment, YYYY-MM-DD. */
export const dayKey = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
/** Whole days from day `a` to day `b`. */
export const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export function rankFor(shiftsDone: number): number {
  let r = 0;
  for (let i = 0; i < RANK_AT.length; i++) if (shiftsDone >= RANK_AT[i]) r = i;
  return r;
}
/** Shifts until the next rank, or null at the top. */
export function toNextRank(shiftsDone: number): number | null {
  const next = RANK_AT[rankFor(shiftsDone) + 1];
  return next == null ? null : next - shiftsDone;
}

/** How much a day's shift asks for at a rank (letters stay at their count; escorts are one leg). */
export function shiftNeed(s: JobShift, rank: number): number {
  if (s.kind === "supply") return Math.round(s.qty * RANK_MULT[rank]);
  if (s.kind === "guard") return Math.round(s.kills * RANK_MULT[rank]);
  if (s.kind === "letters") return s.count;
  return 1;
}

/** The day's wage at a rank, on top of the work. */
export const flatWage = (kind: JobKind, rank: number): number => Math.round(FLAT_WAGE[kind] * RANK_MULT[rank]);

/** A supplier's pay for goods handed in: SUPPLY_PREMIUM × full value. */
export const supplyPay = (itemKey: string, n: number): number => Math.round(Math.max(1, itemValue(itemKey)) * SUPPLY_PREMIUM * n);

/** A letter's pay: more the farther it goes, and the higher your rank. */
export function letterPay(from: { tx: number; ty: number }, to: { tx: number; ty: number }, rank: number): number {
  const tiles = Math.hypot(to.tx - from.tx, to.ty - from.ty);
  return Math.round((LETTER_BASE + tiles / LETTER_TILES) * RANK_MULT[rank]);
}

/** What a full shift pays, about (for the panel). */
export function shiftPay(def: JobDef, rank: number): number {
  const s = def.shift, need = shiftNeed(s, rank);
  const work = s.kind === "supply" ? supplyPay(s.items[0], need)
    : s.kind === "guard" ? GUARD_PER_BEAST * need
    : s.kind === "letters" ? need * letterPay({ tx: 0, ty: 0 }, { tx: 200, ty: 0 }, rank) : 0;
  return flatWage(def.kind, rank) + work;
}

/** Today's task in words. */
export function taskText(def: JobDef, rank: number): string {
  const s = def.shift, n = shiftNeed(s, rank);
  if (s.kind === "supply") return `Bring ${n} ${s.items.length > 3 ? "fish" : s.items.map((k) => k.replace(/_/g, " ")).join(" or ")} to ${npcDef(def.employerKey)?.name ?? "them"}`;
  if (s.kind === "guard") return `Defeat ${n} wild beasts within ${s.radius} tiles of ${s.place}`;
  if (s.kind === "letters") return `Pick up ${n} letters from ${npcDef(def.employerKey)?.name ?? "the post"} and deliver them`;
  return `Be by ${npcDef(def.employerKey)?.name ?? "the caravan"}'s wagon when it leaves town, stay close, beat the ambush and arrive with it`;
}

// ── Hired, kept and let go ─────────────────────────────────────────────
/** Let go? Missing FIRE_AFTER_DAYS days in a row (counted from the last shift, or from the hiring day). */
export function letGo(lastShiftDay: string | null, hiredDay: string, today: string): boolean {
  return lastShiftDay ? daysBetween(lastShiftDay, today) > FIRE_AFTER_DAYS : daysBetween(hiredDay, today) >= FIRE_AFTER_DAYS;
}

/** The streak after a shift done today. */
export function nextStreak(lastShiftDay: string | null, streak: number, today: string): number {
  if (lastShiftDay === today) return streak;
  return lastShiftDay && daysBetween(lastShiftDay, today) === 1 ? streak + 1 : 1;
}

/** Why this job can't be taken now ("" when it can). */
export function hireBlock(def: JobDef, o: { level: number; activeKeys: readonly string[]; endedAt: number | null; now: number }): string {
  if (o.activeKeys.includes(def.key)) return "You already work here.";
  if (o.level < def.minLevel) return `Come back at level ${def.minLevel}.`;
  if (o.activeKeys.length >= MAX_JOBS) return `You can hold ${MAX_JOBS} jobs at once. Quit one first.`;
  if (o.activeKeys.some((k) => jobDef(k)?.employerKey === def.employerKey)) return "You already work for them.";
  if (o.endedAt != null && o.now - o.endedAt < REHIRE_MS) return "They'll take you back tomorrow.";
  return "";
}

// ── Courier routes ─────────────────────────────────────────────────────
/** Who letters can go to at a rank: the grove and Hollowmere, then Brightwater, then the continent's towns. */
export function letterRecipients(employerKey: string, rank: number): string[] {
  const places = rank >= 1 ? ["village", "hollowmere", "brightwater"] : ["village", "hollowmere"];
  const named = NPC_DEFS.filter((n) => places.includes(n.key.split("_")[0]) && !SETTLEMENT_NPCS.some((s) => s.key === n.key)).map((n) => n.key);
  const towns = rank >= 2 ? SETTLEMENT_NPCS.filter((n) => n.job === "innkeeper" || n.job === "shopkeeper").map((n) => n.key) : [];
  return [...named, ...towns].filter((k) => k !== employerKey && k !== "village_tamsin"); // the caravan never stays put
}

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

/** Today's letters for one courier: `count` different recipients, the same all day. */
export function pickRecipients(characterId: number, day: string, employerKey: string, rank: number, count: number): string[] {
  const pool = letterRecipients(employerKey, rank).sort((a, b) => hash(`${characterId}:${day}:${a}`) - hash(`${characterId}:${day}:${b}`));
  return pool.slice(0, count);
}

// ── Guards and escorts ─────────────────────────────────────────────────
/** Does a beast felled at world px (x, y) count for this guard job? */
export function inGuardArea(s: JobShift, x: number, y: number): boolean {
  return s.kind === "guard" && Math.hypot(x / 16 - s.tx, y / 16 - s.ty) <= s.radius;
}

/** An escort is paid when they rode along for enough of the way and are there at the end. */
export const escortEarned = (near: number, total: number, atEnd: boolean): boolean => atEnd && total > 0 && near / total >= ESCORT_SHARE;
