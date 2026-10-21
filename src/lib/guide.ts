// The player's guide (/guide), its facts: every table on the page is built
// here from the game's own data, so the guide can't drift from the game.
// Pure (no db); src/app/guide/page.tsx lays it out.

import { AMBUSH_AFTER_MS, AMBUSH_MAX, AMBUSH_MIN, ESCORT_PX, ESCORT_SHARE, JOB_DEFS, MAX_JOBS, FIRE_AFTER_DAYS, RANK_AT, shiftPay, taskText } from "./jobs";
import { STOP_LINGER_MS } from "./mind/caravan";
import { FISH_DEFS } from "./fishing";
import { TOWNS } from "./settlements";
import { ORCHARD_FRUITS } from "./orchard";
import { LAIR_BOSSES } from "./lairs";
import { PERKS } from "./progression";
import { REP_TIERS } from "./reputation";
import { RANCH_SPECIES } from "./ranch";
import { BUILD_STEPS } from "./ranchUpgrades";
import { PARCEL_USES, PARCEL_PRICE, STARTER } from "./homestead";
import { FURNITURE_ITEMS } from "./furniture";
import { itemDef } from "./itemDefs";
import { npcDef } from "./npcDefs";
import { TRAVEL_COST } from "./worldAtlas";
import { BILLBOARD_SPOTS, BILLBOARD_TIERS } from "./billboards";
import { MEMBERSHIP_PLANS, MEMBER_MONTHLY_GEMS, MEMBER_TALK_MULT } from "./membership";
import { REFERRAL_GEMS, REFERRAL_LEVEL } from "./referral";

export { MAX_JOBS, FIRE_AFTER_DAYS, RANK_AT, PARCEL_PRICE, TRAVEL_COST };
export const STARTER_PARCELS = STARTER.length;

/** The caravan escort's rules, in the guide's words (from the game's own numbers). */
export const ESCORT_FACTS = {
  nearTiles: ESCORT_PX / 16,
  sharePct: Math.round(ESCORT_SHARE * 100),
  ambushMin: AMBUSH_AFTER_MS / 60_000,
  ambushBeasts: `${AMBUSH_MIN}–${AMBUSH_MAX}`,
  stopMin: STOP_LINGER_MS / 60_000,
};

/** Billboards: where they stand and what renting one costs a month. */
export const BILLBOARD_FACTS = {
  spots: BILLBOARD_SPOTS.length,
  from: Math.min(...Object.values(BILLBOARD_TIERS).map((t) => t.priceCents)) / 100,
  to: Math.max(...Object.values(BILLBOARD_TIERS).map((t) => t.priceCents)) / 100,
};

/** Membership, in the guide's words. */
export const MEMBER_PRICE = `$${MEMBERSHIP_PLANS.monthly.priceCents / 100} a month or $${MEMBERSHIP_PLANS.yearly.priceCents / 100} a year`;
export const MEMBER_PERKS_TEXT = `💎 ${MEMBER_MONTHLY_GEMS} every month, a members-only outfit every month, a star on your nameplate and ${MEMBER_TALK_MULT}× more conversations with the villagers`;
export const REFERRAL_FACTS = { level: REFERRAL_LEVEL, gems: REFERRAL_GEMS };

const name = (key: string) => itemDef(key)?.name ?? key.replace(/_/g, " ");
const who = (key: string) => npcDef(key)?.name ?? key;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Jobs: who hires, what a day's work is, the ranks, about what a shift pays. The towns' watches are one row. */
export function jobRows(): string[][] {
  const townGuards = JOB_DEFS.filter((j) => j.kind === "guard" && !/^(village|hollowmere|brightwater)_/.test(j.employerKey)); // the continent towns' watches
  const rows = JOB_DEFS.filter((j) => !townGuards.includes(j)).map((j) => [
    `${{ courier: "✉️ Courier", supplier: "📦 Supplier", guard: "🛡️ Guard", escort: "🐎 Caravan escort" }[j.kind]}`,
    `${who(j.employerKey)} (${npcDef(j.employerKey)?.role ?? ""})`,
    taskText(j, 0),
    j.titles.join(" → "),
    `~${shiftPay(j, 0)}–${shiftPay(j, 2)} 🪙`,
  ]);
  if (townGuards.length) {
    const j = townGuards[0];
    rows.push(["🛡️ Guard", `The bounty keeper of each of the ${townGuards.length} towns`, "Defeat wild beasts near their town", j.titles.join(" → "), `~${shiftPay(j, 0)}–${shiftPay(j, 2)} 🪙`]);
  }
  return rows;
}

const TIME: Record<string, string> = { any: "any time", day: "day", night: "night", dusk: "dusk" };
/** Fish: where, when, how rare, what they fetch. */
export function fishRows(): string[][] {
  return FISH_DEFS.map((f) => [`${f.icon} ${f.name}`, cap(f.rarity), f.waters.map(cap).join(", "), `${cap(TIME[f.time] ?? f.time)}${f.weather ? `, in ${f.weather}` : ""}`, `${f.price} 🪙`]);
}

const FAMILY: Record<string, string> = { port: "⚓ Ports", desert: "🏜️ Desert outposts", snow: "❄️ Snowy holds", swamp: "🐸 Swamp villages", darkwood: "🌲 Darkwood hamlets", hills: "🌾 Hill towns" };
/** The continent's towns, by kind of land. */
export function townRows(): string[][] {
  const fams = [...new Set(TOWNS.map((t) => t.family))];
  return fams.map((f) => [FAMILY[f] ?? cap(f), TOWNS.filter((t) => t.family === f).map((t) => t.name).join(", ")]);
}

/** Fruit trees: where their saplings are sold, and the price. */
export function saplingRows(): string[][] {
  return [
    ["🍎 Apple", "Pip, in the grove", `${itemDef("apple_sapling")?.value ?? 45} 🪙`],
    ...ORCHARD_FRUITS.map((f) => [`${f.icon} ${f.name}`, cap(f.origin), `${f.saplingPrice} 🪙`]),
  ];
}

/** Lair bosses: where, how dangerous, what they leave. */
export function bossRows(): string[][] {
  return LAIR_BOSSES.map((b) => [cap(b.name), cap(b.lair), `Tier ${b.tier}`, `${b.xp} XP, ${b.coins} 🪙, ${name(b.trophy)}`, name(b.unique)]);
}

export const perkRows = (): string[][] => PERKS.map((p) => [`${p.icon} ${p.name}`, p.description]);

export const repRows = (): string[][] => REP_TIERS.map((t) => [t.name, `${t.min}+`, t.discount ? `${Math.round(t.discount * 100)}% off in its shops` : "—"]);

/** Farm animals: price, what they give, and the quality goods a happy animal sometimes gives. */
export function animalRows(): string[][] {
  const quality: Record<string, string> = { egg: "golden egg", wool: "fine wool", milk: "rich milk" };
  return Object.values(RANCH_SPECIES).map((s) => [`${s.icon} ${s.young}`, `${s.price} 🪙`, name(s.produce), quality[s.produce] ?? "—"]);
}

/** What a parcel can be. */
export const parcelRows = (): string[][] => Object.values(PARCEL_USES).filter((u) => u.use !== "wild").map((u) => [`${u.icon} ${u.name}`, u.blurb]);

/** What you build by your barn and in your workshop. */
export function buildRows(place: "barn" | "workshop"): string[][] {
  return BUILD_STEPS.filter((b) => b.place === place).map((b) => [b.name, b.description]);
}

/** Every piece of furniture, by name. */
export const furnitureNames = (): string[] => FURNITURE_ITEMS.map(name);

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** "Saturdays at 18:00 UTC", from the boss schedule setting (`day@hour`, default 6@18). */
export function rootkingWhen(schedule = process.env.BOSS_SCHEDULE ?? "6@18"): string {
  const [d, h] = schedule.split("@").map(Number);
  return Number.isFinite(d) && Number.isFinite(h) && DAYS[d] ? `${DAYS[d]}s at ${String(h).padStart(2, "0")}:00 UTC` : "once a week";
}
