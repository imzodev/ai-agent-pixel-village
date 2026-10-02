// The collection book: pages built from the game's own data (fish, crops,
// creatures, places, folk), page rewards, and achievements that unlock
// nameplate titles. Pure; storage lives in src/lib/collectionServer.ts.

import type { AchievementDef, CollectionCounts, CollectionEntry, CollectionPageDef } from "@/types/collection";
import { FISH_DEFS } from "./fishing";
import { GARDEN_CROPS } from "./crops";
import { ENEMY_KINDS } from "./progression";
import { REGIONS } from "./regions";

export type { AchievementDef, CollectionBookView, CollectionCounts, CollectionEntry, CollectionKind, CollectionPageDef } from "@/types/collection";

const CROP_LOOK: Record<string, { name: string; icon: string }> = {
  radish: { name: "Radish", icon: "🔴" }, carrot: { name: "Carrot", icon: "🥕" }, tomato: { name: "Tomato", icon: "🍅" }, pumpkin: { name: "Pumpkin", icon: "🎃" },
};
const ENEMY_ICON: Record<string, string> = { slime: "🟢", bat: "🦇", thornling: "🌵", boar: "🐗", wisp: "👻", rootking: "🌳" };
const REGION_ICON: Record<string, string> = { meadow: "🌼", whisperwood: "🌲", hollowmere: "🏘️", greyspine: "⛰️", silverrun: "🌊", brightwater: "⚓", caverns: "💎" };

/** All pages; the folk page lists the given NPCs. */
export function collectionPages(folk: CollectionEntry[]): CollectionPageDef[] {
  return [
    { key: "fish", name: "Fish", icon: "🎣", kind: "fish", entries: FISH_DEFS.map((f) => ({ key: f.key, name: f.name, icon: f.icon })), reward: { coins: 150, title: "Master Angler" } },
    { key: "crops", name: "Crops", icon: "🌱", kind: "crop", entries: Object.values(GARDEN_CROPS).map((c) => ({ key: c.produceKey, ...(CROP_LOOK[c.produceKey] ?? { name: c.produceKey, icon: "🌱" }) })), reward: { coins: 60, title: "Green Thumb" } },
    { key: "creatures", name: "Creatures", icon: "⚔️", kind: "enemy", entries: Object.entries(ENEMY_KINDS).map(([k, d]) => ({ key: k, name: d.name, icon: ENEMY_ICON[k] ?? "👾" })), reward: { coins: 120, title: "Monster Scholar" } },
    { key: "places", name: "Places", icon: "🧭", kind: "region", entries: REGIONS.map((r) => ({ key: r.key, name: r.name.replace(/^the /, ""), icon: REGION_ICON[r.key] ?? "📍" })), reward: { coins: 100, title: "Wayfarer" } },
    { key: "folk", name: "Folk", icon: "👥", kind: "npc", entries: folk, reward: { coins: 80, title: "Friend of All" } },
  ];
}

/** A page is complete when every entry has been found at least once. */
export function pageComplete(page: CollectionPageDef, counts: CollectionCounts): boolean {
  const got = counts[page.kind] ?? {};
  return page.entries.length > 0 && page.entries.every((e) => (got[e.key] ?? 0) > 0);
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { key: "newcomer", name: "Newcomer", description: "Finish the Elder's welcome.", title: "Newcomer" },
  { key: "hooked", name: "Hooked", description: "Catch your first fish.", title: "Hooked" },
  { key: "angler", name: "Angler", description: "Catch 25 fish.", title: "Angler" },
  { key: "legend", name: "Legend Hunter", description: "Catch a legendary fish.", title: "Legend Hunter" },
  { key: "harvester", name: "Harvester", description: "Harvest 50 crops.", title: "Harvester" },
  { key: "explorer", name: "Explorer", description: "Set foot in every region.", title: "Explorer" },
  { key: "rootbreaker", name: "Rootbreaker", description: "Help drive back the Old Rootking.", title: "Rootbreaker" },
  { key: "veteran", name: "Veteran", description: "Reach level 10.", title: "Veteran" },
];

const sum = (o: Record<string, number> | undefined) => Object.values(o ?? {}).reduce((s, n) => s + n, 0);

/** Which achievements a player has earned. */
export function achievementsDone(counts: CollectionCounts, level: number, tutorialDone: boolean): Set<string> {
  const done = new Set<string>();
  const fish = counts.fish ?? {};
  if (tutorialDone) done.add("newcomer");
  if (sum(fish) >= 1) done.add("hooked");
  if (sum(fish) >= 25) done.add("angler");
  if (FISH_DEFS.some((f) => f.rarity === "legendary" && (fish[f.key] ?? 0) > 0)) done.add("legend");
  if (sum(counts.crop) >= 50) done.add("harvester");
  if (REGIONS.every((r) => (counts.region?.[r.key] ?? 0) > 0)) done.add("explorer");
  if ((counts.enemy?.rootking ?? 0) > 0) done.add("rootbreaker");
  if (level >= 10) done.add("veteran");
  return done;
}
