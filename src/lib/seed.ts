import { and, eq, inArray, isNull, ne, sql, notInArray } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@/db";
import {
  activities,
  animals,
  buildings,
  characterCollection,
  cosmeticItems,
  dailyQuests,
  enemies,
  items,
  missions,
  npcs,
  resourceNodes,
  sponsors,
  worldState,
  worldEvents,
  type Appearance,
  type MissionRequirement,
  type MissionReward,
} from "@/db/schema";
import { TILE, WILD_ZONES, tilePoint, tileRect } from "./worldmap";
import { isWalkableServer } from "./chunkCollisionServer";
import { getBuildingsManifest, getTemplate, upsertBuildingRow } from "./buildingsServer";
import { doorWorldPx, footprintOf } from "./buildingManifest";
import { getCropKind } from "@/lib/crops";
import { syncLotsFromManifest } from "./lots";
import { forestTrees } from "./forest";
import { REGION_NODES } from "./regions";
import { commonFieldWheat } from "./commonField";
import { FOX_DEN, paddock, ranchPickSpots } from "./villageRanch";
import { MISSION_DEFS } from "./missionDefs";
import { NPC_DEFS } from "./npcDefs";
import { LEGACY_NPC_KEYS } from "./npcKeys";
import { forageSpots } from "./forage";
import { resiteTreasureMaps } from "./treasureServer";
import { BOSS_KIND } from "./progression";
import { LAIR_BOSSES } from "./lairs";

export { ITEM_DEFS } from "./itemDefs";
import { ITEM_DEFS } from "./itemDefs";

export { NPC_DEFS };

// Animal roam zones in world-tile units (tileRect, ty grows downward).
// The village's farm animals live at the Village Ranch east of the village,
// each kind in its own paddock (src/lib/villageRanch.json); pets stay near
// the houses; wild species live in the WILD_ZONES outskirts ring.
const ANIMAL_DEFS: { species: string; names: string[]; zone: { x: number; y: number; w: number; h: number } }[] = [
  { species: "sheep", names: ["Clover", "Dumpling", "Mabel", "Bramble", "Woolsey", "Pippa"], zone: paddock("sheep") },
  { species: "cow", names: ["Buttercup", "Juniper", "Daisy", "Maple"], zone: paddock("cow") },
  { species: "pig", names: ["Truffle", "Hamlet", "Pudding", "Rosie"], zone: paddock("pig") },
  { species: "llama", names: ["Paco", "Luna", "Quinoa", "Pepe"], zone: paddock("llama") },
  { species: "chicken", names: ["Nugget", "Pecky", "Henrietta", "Biscuit", "Clucky", "Poppy", "Ginger", "Sunny", "Feathers", "Eggbert", "Penny", "Goldie"], zone: paddock("chicken") },
  { species: "duck", names: ["Puddle", "Waddles", "Quilliam", "Dabble", "Ripple", "Duckworth"], zone: paddock("duck") },
  { species: "rabbit", names: ["Thimble", "Moss"], zone: tileRect(6, -54, 30, 20) },
  // The fox's den: the meadow just east of the ranch fence, near enough to
  // reach the hen yard (round by the south gate) for its egg raids.
  { species: "fox", names: ["Ember"], zone: FOX_DEN },
  { species: "cat", names: ["Marmalade"], zone: tileRect(28, 18, 18, 9) },
  { species: "dog", names: ["Biscuit"], zone: tileRect(38, 30, 20, 14) },
  // Out west along the King's Road.
  { species: "sheep", names: ["Bracken", "Thistle"], zone: tileRect(-366, 22, 20, 8) },
  { species: "duck", names: ["Pebble", "Skipper", "Reed"], zone: tileRect(-646, 14, 22, 14) },
];

// Resource nodes scattered through the wild ring (world-tile units), all in
// unauthored chunks so they never collide with map art.
const NODE_DEFS: [string, string, number, number][] = [
  ["herb_patch", "herb", 8, 54], ["herb_patch", "herb", 26, 55], ["herb_patch", "herb", 48, 51],
  // East of the Common Field (the old spots were up on the mountain plateau).
  ["herb_patch", "herb", 78, -26], ["herb_patch", "herb", 84, -17],
  ["berry_bush", "berry", 14, 49], ["berry_bush", "berry", 64, 56], ["berry_bush", "berry", 130, -21],
  ["rock", "stone", 123, 12], ["rock", "stone", 135, 39], ["rock", "stone", -77, 6], ["rock", "stone", 52, 54],
  ["mushroom_ring", "mushroom", -76, -6], ["mushroom_ring", "mushroom", 130, 54],
  // The Common Field north-east of the village (src/lib/commonField.ts).
  ...commonFieldWheat().map(([tx, ty]): [string, string, number, number] => ["wheat_field", "wheat", tx, ty]),
  // The Village Ranch's garden and beehives: free for anyone to pick (src/lib/ranchPicks.ts).
  ...ranchPickSpots(),
  // The regions west of the village place their own nodes (props keep clear of them).
  ...REGION_NODES.map((n): [string, string, number, number] => [n.kind, n.itemKey, n.tx, n.ty]),
];


let seededPromise: Promise<void> | null = null;
let buildingsSynced = false;
let wildlifeSynced = false;
let npcSynced = false;

// Keep seeded NPCs in step with NPC_DEFS: their home spot (cabin-village
// positions) and role/persona/greeting. Runs once per process — edit
// NPC_DEFS and restart the dev server to re-apply. If the configured tile
// sits on a Collision tile, snap to the nearest walkable neighbour so NPCs
// stay reachable. An NPC stays where it is across restarts (it may be
// mid-trip or lingering somewhere it travelled to, src/lib/nav/trips.ts);
// only one standing somewhere no longer walkable, or whose home moved, is
// sent (back) home.
async function syncNpcLayout() {
  if (npcSynced) return;
  npcSynced = true;
  try {
    await renameLegacyNpcKeys();
    for (const n of NPC_DEFS) {
      const p = tilePoint(n.tilePos[0], n.tilePos[1]);
      let x = p.x;
      let y = p.y;
      if (!(await isWalkableServer(x, y))) {
        const snap = await nearestWalkable(n.tilePos[0], n.tilePos[1]);
        x = snap.x;
        y = snap.y;
      }
      const [cur] = await db.select({ x: npcs.x, y: npcs.y, homeX: npcs.homeX, homeY: npcs.homeY }).from(npcs).where(eq(npcs.key, n.key));
      const stranded = cur ? !(await isWalkableServer(cur.x, cur.y)) : false;
      // A home moved in NPC_DEFS (more than a few tiles): they live there now.
      const moved = cur ? Math.hypot(cur.homeX - x, cur.homeY - y) > 8 * 16 : false;
      await db.update(npcs)
        .set({
          homeX: x, homeY: y,
          // Back home only when where it stands is no longer walkable, or home moved.
          ...(stranded || moved ? { x, y, movePath: null, moveStartAt: null, moveSpeed: null, moveAfter: null } : {}),
          name: n.name, appearance: n.appearance,
          role: n.role, persona: n.persona, greeting: n.greeting,
          mood: n.mood, wanderRadius: n.wanderRadius,
          buildingId: null, sponsorId: null,
        })
        .where(eq(npcs.key, n.key));
    }
    // Ensure every NPC_DEFS entry has a row — catches new NPCs added since
    // the initial seed (seed() early-returns when worldState exists, so new
    // NPCs only land via this once-per-process upsert).
    for (const n of NPC_DEFS) {
      const p = tilePoint(n.tilePos[0], n.tilePos[1]);
      let x = p.x;
      let y = p.y;
      if (!(await isWalkableServer(x, y))) {
        const snap = await nearestWalkable(n.tilePos[0], n.tilePos[1]);
        x = snap.x;
        y = snap.y;
      }
      await db.insert(npcs).values({
        key: n.key, name: n.name, role: n.role,
        persona: n.persona, greeting: n.greeting,
        x, y, homeX: x, homeY: y,
        appearance: n.appearance, mood: n.mood, wanderRadius: n.wanderRadius,
        buildingId: null, sponsorId: null, active: true,
      }).onConflictDoNothing();
    }
  } catch (e) {
    npcSynced = false;
    console.warn("[seed] NPC layout sync failed:", e instanceof Error ? e.message : e);
  }
}

// Move saved data from old NPC keys to new ones (src/lib/npcKeys.ts): the
// npc row itself, the Folk page of the collection book and "talk to"
// daily quests. Everything else points at NPCs by id. Idempotent: once no
// old key is left this is a handful of no-op updates.
async function renameLegacyNpcKeys() {
  const olds = Object.keys(LEGACY_NPC_KEYS);
  const found = await db.select({ key: npcs.key }).from(npcs).where(inArray(npcs.key, olds));
  const left = await db.select({ key: characterCollection.key }).from(characterCollection)
    .where(and(eq(characterCollection.kind, "npc"), inArray(characterCollection.key, olds))).limit(1);
  const quests = await db.select({ id: dailyQuests.id }).from(dailyQuests)
    .where(inArray(sql`${dailyQuests.requirement}->>'npcKey'`, olds)).limit(1);
  if (!found.length && !left.length && !quests.length) return;
  await db.transaction(async (tx) => {
    for (const [from, to] of Object.entries(LEGACY_NPC_KEYS)) {
      const [stale] = await tx.select({ id: npcs.id }).from(npcs).where(eq(npcs.key, from));
      if (stale) {
        // A server that booted with the new defs before this ran may have
        // seeded a fresh row under the new key: retire it (hidden, history
        // kept) so the established row, with its conversations, keeps going.
        const [fresh] = await tx.select({ id: npcs.id }).from(npcs).where(eq(npcs.key, to));
        if (fresh) await tx.update(npcs).set({ key: `retired_${fresh.id}`, active: false }).where(eq(npcs.id, fresh.id));
        await tx.update(npcs).set({ key: to }).where(eq(npcs.id, stale.id));
      }
      await tx.execute(sql`
        insert into character_collection (character_id, kind, key, count, first_at)
        select character_id, 'npc', ${to}, count, first_at from character_collection where kind = 'npc' and key = ${from}
        on conflict (character_id, kind, key) do update
          set count = greatest(character_collection.count, excluded.count),
              first_at = least(character_collection.first_at, excluded.first_at)`);
      await tx.execute(sql`delete from character_collection where kind = 'npc' and key = ${from}`);
      await tx.execute(sql`
        update daily_quests set requirement = jsonb_set(requirement, '{npcKey}', to_jsonb(${to}::text))
        where requirement->>'npcKey' = ${from}`);
    }
  });
  console.log(`[seed] renamed ${found.length} NPC keys to <place>_<name>: ${found.map((r) => `${r.key} → ${LEGACY_NPC_KEYS[r.key]}`).join(", ")}`);
}

async function nearestWalkable(tx: number, ty: number): Promise<{ x: number; y: number }> {
  // Spiral search within a small radius; chicken-zones are big enough that
  // almost any random tile around a village core is reachable.
  for (let r = 1; r <= 8; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const p = tilePoint(tx + dx, ty + dy);
        if (await isWalkableServer(p.x, p.y)) return p;
      }
    }
  }
  // Fallback to the original position (should be unreachable for the rest
  // of this process since the chunk is fully walled — caller will see the
  // NPC but can't interact).
  return tilePoint(tx, ty);
}

// Adopt the chunk-world wildlife layout for an already-seeded DB: rebuild
// resource nodes at their new spots, clear enemies (they respawn from the new
// WILD_ZONES), and re-zone animals. Runs once per process — restart the dev
// server after changing the layout. NPCs are deliberately untouched.
async function syncWildlifeLayout() {
  if (wildlifeSynced) return;
  wildlifeSynced = true;
  try {
    // Wild nodes only: garden crops (owner_id set) belong to players.
    await db.delete(resourceNodes).where(isNull(resourceNodes.ownerId));
    const trees = forestTrees().map(([tx, ty]): [string, string, number, number] => ["oak_tree", "wood", tx, ty]);
    // The village's hand-placed nodes, the oak grove, and the forage
    // patches scattered over the continent (src/lib/forage.ts).
    const rows = [...NODE_DEFS, ...trees, ...forageSpots()].map(([kind, itemKey, tx, ty]) => {
      const p = tilePoint(tx, ty);
      const cfg = getCropKind(kind);
      // Crop kinds start fully grown (stage = stages-1). Non-crop kinds
      // use stages=2 (ready) from the config; missing config means a
      // legacy kind with no regrowth — start at the only stage (0).
      const stages = cfg?.stages ?? 1;
      return { kind, itemKey, x: p.x, y: p.y, qty: cfg?.yield ?? 1, stage: stages - 1 };
    });
    for (let i = 0; i < rows.length; i += 200) await db.insert(resourceNodes).values(rows.slice(i, i + 200));
    // Enemies respawn from the current zones; a risen world boss stays.
    await db.delete(enemies).where(notInArray(enemies.kind, [BOSS_KIND, ...LAIR_BOSSES.map((b) => b.kind)])); // bosses stay
    // Treasure maps whose X ended up in the sea get a new spot.
    const resited = await resiteTreasureMaps();
    if (resited) console.log(`[seed] moved ${resited} treasure maps off ground that's no longer open`);
    for (const def of ANIMAL_DEFS) {
      // Re-zone to the centre and drop any scheduled move: it was planned
      // from the old position, so clients would replay it from there.
      await db.update(animals)
        .set({
          zone: def.zone, x: def.zone.x + def.zone.w / 2, y: def.zone.y + def.zone.h / 2, targetX: null, targetY: null,
          movePath: null, moveStartAt: null, moveSpeed: null, moveAfter: null,
        })
        // By name too: a species can have several herds in different places.
        // Ranch animals (owned) keep their pens.
        .where(and(eq(animals.species, def.species), inArray(animals.name, def.names), isNull(animals.ownerId)));
      // Species / names added to ANIMAL_DEFS after the DB was seeded
      // (e.g. pigs) are created here so existing worlds get them too.
      const existing = await db.select({ name: animals.name }).from(animals).where(and(eq(animals.species, def.species), inArray(animals.name, def.names), isNull(animals.ownerId)));
      const have = new Set(existing.map((r) => r.name));
      for (const name of def.names) {
        if (have.has(name)) continue;
        await db.insert(animals).values({
          species: def.species, name,
          x: def.zone.x + def.zone.w / 2, y: def.zone.y + def.zone.h / 2,
          zone: def.zone, hunger: Math.floor(Math.random() * 40),
        });
      }
    }
  } catch (e) {
    wildlifeSynced = false;
    console.warn("[seed] wildlife layout sync failed:", e instanceof Error ? e.message : e);
  }
}

// Upsert manifest buildings into the DB and drop rows no longer in the
// manifest. Runs once per process (i.e. once per dev-server start): edit the
// manifest and restart to sync.
async function syncBuildingsFromManifest() {
  if (buildingsSynced) return;
  buildingsSynced = true;
  try {
    const manifest = await getBuildingsManifest();
    for (const entry of manifest.buildings) await upsertBuildingRow(entry);
    const keep = new Set(manifest.buildings.filter((b) => b.kind !== "scenery").map((b) => b.key));
    const rows = await db.select().from(buildings);
    for (const row of rows) {
      if (!keep.has(row.key)) await db.delete(buildings).where(eq(buildings.key, row.key));
    }
  } catch (e) {
    // A broken manifest must not take the world API down.
    buildingsSynced = false;
    console.warn("[seed] building manifest sync failed:", e instanceof Error ? e.message : e);
  }
}

/** Idempotent: creates the world if it does not exist. Safe to call on every request. */
export function ensureSeeded() {
  if (!seededPromise) seededPromise = seed().catch((e) => { seededPromise = null; throw e; });
  return seededPromise
    .then(() => syncBuildingsFromManifest())
    .then(() => syncLots())
    .then(() => syncWildlifeLayout())
    .then(() => syncNpcLayout())
    .then(() => syncItems())
    .then(() => syncMissions())
    .then(() => syncCosmetics())
    .then(() => seedActivities());
}

let lotsSynced = false;
async function syncLots() {
  if (lotsSynced) return;
  lotsSynced = true;
  try {
    await syncLotsFromManifest();
  } catch (e) {
    lotsSynced = false;
    console.warn("[seed] lot sync failed:", e instanceof Error ? e.message : e);
  }
}

/** The fishing dock's spot, just north of the homesteads' road. */
const FISHING_DOCK = { x: 1080, y: 900 };
/** Brightwater's fishing dock, on the Silverrun's west bank by the bridge. */
const RIVER_DOCK = tilePoint(-615, 2); // the end of the pier
/** Pixel rows of the land-lot strip (chunk row cy −4, ty 60..74). */
const LAND_STRIP_Y0 = 60 * 16, LAND_STRIP_Y1 = 75 * 16;

async function seedActivities() {
  // Existing worlds: a dock seeded inside the land-lot strip moves out.
  await db
    .update(activities)
    .set(FISHING_DOCK)
    .where(sql`${activities.kind} = 'fishing_dock' and ${activities.y} >= ${LAND_STRIP_Y0} and ${activities.y} < ${LAND_STRIP_Y1}`);
  // Brightwater's dock on the Silverrun (added to existing worlds too).
  const all = await db.select({ kind: activities.kind, x: activities.x, y: activities.y }).from(activities);
  const hasRiverDock = all.some((a) => a.kind === "fishing_dock" && Math.hypot(a.x - RIVER_DOCK.x, a.y - RIVER_DOCK.y) < 300);
  if (all.length > 0 && !hasRiverDock) {
    await db.insert(activities).values({ kind: "fishing_dock", status: "live", ...RIVER_DOCK, config: { capacity: 2, durationSec: 60, rewardCoins: 30, rewardXp: 15 } });
  }
  if (all.length > 0) return;
  // Fishing dock — 2-player co-op.
  await db.insert(activities).values({
    kind: "fishing_dock",
    status: "live",
    ...FISHING_DOCK,
    config: { capacity: 2, durationSec: 60, rewardCoins: 25, rewardXp: 12 },
  });
  await db.insert(activities).values({ kind: "fishing_dock", status: "live", ...RIVER_DOCK, config: { capacity: 2, durationSec: 60, rewardCoins: 30, rewardXp: 15 } });
}

async function syncItems() {
  try {
    for (const it of ITEM_DEFS) {
      const values = {
        key: it.key,
        name: it.name,
        kind: it.kind,
        icon: it.icon,
        description: it.description,
        value: it.value,
        equippable: "equippable" in it ? it.equippable : false,
        placeable: "placeable" in it ? it.placeable : false,
      };
      await db.insert(items).values(values).onConflictDoUpdate({
        target: items.key,
        set: { name: values.name, kind: values.kind, icon: values.icon, description: values.description, value: values.value, equippable: values.equippable, placeable: values.placeable },
      });
    }
  } catch (e) {
    console.warn("[seed] item sync failed:", e instanceof Error ? e.message : e);
  }
}

async function syncMissions() {
  try {
    const npcRows = await db.select({ id: npcs.id, key: npcs.key }).from(npcs);
    const npcIdByKey = new Map(npcRows.map((r) => [r.key, r.id]));
    for (const m of MISSION_DEFS) {
      const npcId = npcIdByKey.get(m.npc);
      if (!npcId) continue;
      const values = {
        key: m.key, npcId, title: m.title, description: m.description, offerLine: m.offerLine, completeLine: m.completeLine,
        requirement: m.requirement, reward: m.reward, sponsorId: null,
      };
      await db.insert(missions).values(values).onConflictDoUpdate({
        target: missions.key,
        set: { npcId, title: m.title, description: m.description, offerLine: m.offerLine, completeLine: m.completeLine, requirement: m.requirement, reward: m.reward },
      });
    }
  } catch (e) {
    console.warn("[seed] mission sync failed:", e instanceof Error ? e.message : e);
  }
}

async function syncCosmetics() {
  try {
    for (const it of COSMETIC_CATALOG) {
      // Schema declares timestamp (Date | null); the canonical catalog type
      // uses strings for portability across server/client boundaries. Parse
      // ISO strings to Dates here so Drizzle's typed insert is happy.
      const from = it.availableFrom ? new Date(it.availableFrom) : null;
      const until = it.availableUntil ? new Date(it.availableUntil) : null;
      const values = {
        key: it.key,
        name: it.name,
        slot: it.slot,
        assetRef: it.assetRef,
        tintColor: it.tintColor,
        rarity: it.rarity,
        coinPrice: it.coinPrice,
        gemPrice: it.gemPrice,
        sponsorGrantedOnly: it.sponsorGrantedOnly,
        sponsorId: it.sponsorId,
        availableFrom: from,
        availableUntil: until,
      };
      await db.insert(cosmeticItems).values(values).onConflictDoUpdate({
        target: cosmeticItems.key,
        set: {
          name: values.name,
          slot: values.slot,
          assetRef: values.assetRef,
          tintColor: values.tintColor,
          rarity: values.rarity,
          coinPrice: values.coinPrice,
          gemPrice: values.gemPrice,
          sponsorGrantedOnly: values.sponsorGrantedOnly,
          sponsorId: values.sponsorId,
          availableFrom: values.availableFrom,
          availableUntil: values.availableUntil,
        },
      });
    }
  } catch (e) {
    console.warn("[seed] cosmetic sync failed:", e instanceof Error ? e.message : e);
  }
}

const COSMETIC_CATALOG = await import("./cosmetics").then((m) => m.COSMETIC_CATALOG);

async function seed() {
  const [ws] = await db.select().from(worldState).where(eq(worldState.id, 1));
  if (ws) return;
  await db.transaction(async (tx) => {
    await tx.insert(worldState).values({ id: 1 }).onConflictDoNothing();
    for (const it of ITEM_DEFS) {
      await tx
        .insert(items)
        .values({
          key: it.key,
          name: it.name,
          kind: it.kind,
          icon: it.icon,
          description: it.description,
          value: it.value,
          equippable: "equippable" in it ? it.equippable : false,
          placeable: "placeable" in it ? it.placeable : false,
        })
        .onConflictDoNothing();
    }
    // Interactive buildings come from the manifest (public/buildings/
    // buildings.json); the Tiled template supplies footprint and door.
    const manifest = await getBuildingsManifest();
    for (const entry of manifest.buildings) {
      if (entry.kind === "scenery") continue; // stamped art only (town squares): no building row
      const template = await getTemplate(entry);
      const fp = footprintOf(template);
      await tx
        .insert(buildings)
        .values({
          key: entry.key,
          name: entry.name,
          kind: entry.kind,
          description: entry.description ?? "",
          color: entry.color ?? "#d9a066",
          tx: entry.tx,
          ty: entry.ty,
          tw: fp.tw,
          th: fp.th,
          menu: entry.menu ?? [],
          reservable: entry.reservable ?? true,
        })
        .onConflictDoUpdate({
          target: buildings.key,
          set: {
            name: entry.name,
            kind: entry.kind,
            description: entry.description ?? "",
            color: entry.color ?? "#d9a066",
            tx: entry.tx,
            ty: entry.ty,
            tw: fp.tw,
            th: fp.th,
            menu: entry.menu ?? [],
            reservable: entry.reservable ?? true,
          },
        });
    }
    const bRows = await tx.select().from(buildings);
    const bByKey = new Map(bRows.map((b) => [b.key, b]));

    // Sponsored buildings are intentionally disabled for now — keep the
    // schema in place but skip the demo sponsor insert so the bakery shows
    // up unreserved during initial development.
    void bByKey;

    const npcIds = new Map<string, number>();
    for (const n of NPC_DEFS) {
      const p = tilePoint(n.tilePos[0], n.tilePos[1]);
      const x = p.x;
      const y = p.y;
      const [row] = await tx
        .insert(npcs)
        .values({
          key: n.key,
          name: n.name,
          role: n.role,
          persona: n.persona,
          greeting: n.greeting,
          x, y, homeX: x, homeY: y,
          wanderRadius: n.wanderRadius,
          appearance: n.appearance,
          mood: n.mood,
          buildingId: null,
          sponsorId: null,
        })
        .onConflictDoNothing()
        .returning();
      if (row) npcIds.set(n.key, row.id);
    }
    for (const m of MISSION_DEFS) {
      const npcId = npcIds.get(m.npc);
      if (!npcId) continue;
      await tx
        .insert(missions)
        .values({
          key: m.key, npcId, title: m.title, description: m.description, offerLine: m.offerLine, completeLine: m.completeLine,
          requirement: m.requirement, reward: m.reward, repeatable: !!m.repeatable, sponsorId: null,
        })
        .onConflictDoNothing();
    }
    for (const a of ANIMAL_DEFS) {
      for (const name of a.names) {
        await tx.insert(animals).values({
          species: a.species, name,
          x: a.zone.x + Math.random() * a.zone.w, y: a.zone.y + Math.random() * a.zone.h,
          zone: a.zone, hunger: Math.floor(Math.random() * 40),
        });
      }
    }
    const nodeDefs: [string, string, number, number][] = NODE_DEFS;
    for (const [kind, itemKey, x, y] of nodeDefs) {
      const cfg = getCropKind(kind);
      const stages = cfg?.stages ?? 1;
      await tx.insert(resourceNodes).values({
        kind,
        itemKey,
        x,
        y,
        qty: cfg?.yield ?? 1,
        stage: stages - 1,
      });
    }
    await tx.insert(worldEvents).values({ kind: "world", text: "The grove wakes up for the first time." });
  });
  void WILD_ZONES;
  void sql;
}
