import { eq, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@/db";
import {
  animals,
  buildings,
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
import { SPAWN, TILE, WILD_ZONES, tileRect, tilePoint } from "./worldmap";
import { getBuildingsManifest, getTemplate } from "./buildingsServer";
import { doorWorldPx, footprintOf } from "./buildingManifest";

export const ITEM_DEFS = [
  { key: "herb", name: "Wild Herb", kind: "material", icon: "🌿", description: "Fragrant and slightly minty.", value: 2 },
  { key: "berry", name: "Grove Berry", kind: "consumable", icon: "🫐", description: "Restores 4 HP.", value: 3 },
  { key: "stone", name: "River Stone", kind: "material", icon: "🪨", description: "Smooth and cool.", value: 1 },
  { key: "mushroom", name: "Speckled Mushroom", kind: "material", icon: "🍄", description: "Probably edible.", value: 4 },
  { key: "flour", name: "Bag of Flour", kind: "material", icon: "🌾", description: "Milled fresh.", value: 3 },
  { key: "egg", name: "Fresh Egg", kind: "material", icon: "🥚", description: "Still warm.", value: 2 },
  { key: "wool", name: "Tuft of Wool", kind: "material", icon: "🧶", description: "Soft and springy.", value: 3 },
  { key: "slime_gel", name: "Slime Gel", kind: "material", icon: "🟢", description: "Wobbly.", value: 2 },
  { key: "honey_bun", name: "Honey Bun", kind: "consumable", icon: "🥐", description: "Restores 8 HP. Sticky fingers guaranteed.", value: 6 },
  { key: "recipe_cinnamon", name: "Recipe: Cinnamon Knots", kind: "recipe", icon: "📜", description: "A handwritten recipe card from the bakery.", value: 10 },
  { key: "recipe_tea", name: "Recipe: Calming Tea", kind: "recipe", icon: "📜", description: "Three herbs, hot water, patience.", value: 10 },
  { key: "wooden_sword", name: "Wooden Sword", kind: "tool", icon: "🗡️", description: "+2 attack. Splinters included.", value: 15, equippable: true },
  { key: "straw_hat", name: "Straw Hat", kind: "hat", icon: "👒", description: "Keeps the sun off.", value: 8, equippable: true },
  { key: "lantern", name: "Brass Lantern", kind: "tool", icon: "🏮", description: "Glows softly at night.", value: 12, equippable: true },
  { key: "chair", name: "Oak Chair", kind: "furniture", icon: "🪑", description: "Sturdy. Place it at home.", value: 10, placeable: true },
  { key: "table", name: "Round Table", kind: "furniture", icon: "🟤", description: "Fits four friends.", value: 14, placeable: true },
  { key: "plant", name: "Potted Fern", kind: "furniture", icon: "🪴", description: "Purifies the air, allegedly.", value: 8, placeable: true },
  { key: "rug", name: "Woven Rug", kind: "furniture", icon: "🟥", description: "Ties the room together.", value: 12, placeable: true },
  { key: "bed", name: "Cozy Bed", kind: "furniture", icon: "🛏️", description: "For resting between adventures.", value: 20, placeable: true },
  { key: "lamp", name: "Paper Lamp", kind: "furniture", icon: "💡", description: "Warm glow.", value: 9, placeable: true },
  { key: "bookshelf", name: "Bookshelf", kind: "furniture", icon: "📚", description: "Mostly cookbooks.", value: 16, placeable: true },
  { key: "painting", name: "Landscape Painting", kind: "furniture", icon: "🖼️", description: "The grove at dusk.", value: 15, placeable: true },
  { key: "discount", name: "Discount Code", kind: "discount", icon: "🎟️", description: "A real code from a real sponsor.", value: 0 },
  { key: "fox_charm", name: "Fox Charm", kind: "trophy", icon: "🦊", description: "The fox trusts you now.", value: 25 },
  { key: "elder_seal", name: "Elder's Seal", kind: "trophy", icon: "🔏", description: "Proof you helped the village.", value: 30 },
] as const;

const NPC_DEFS: {
  key: string;
  name: string;
  role: string;
  persona: string;
  greeting: string;
  building?: string;
  offset?: [number, number];
  pos?: [number, number];
  wanderRadius: number;
  appearance: Appearance;
  mood: string;
  sponsored?: boolean;
}[] = [
  {
    key: "baker",
    name: "Marigold",
    role: "Baker",
    persona:
      "Marigold runs Hearthstone Bakery. Warm, flour-dusted, talks with her hands, calls everyone 'love'. Proud of her sourdough and her weekend cinnamon knots. Gives recipe cards to anyone who helps her gather ingredients.",
    greeting: "Oh, hello love! Mind the flour. You look like someone who could use a warm bun.",
    building: "bakery",
    wanderRadius: 90,
    appearance: { body: "female", skin: "#f1c9a5", hair: "bob", hairColor: "#c94f2a", shirtColor: "#f7e7d3", pantsColor: "#7a4a2a" },
    mood: "cheerful",
    sponsored: true,
  },
  {
    key: "innkeeper",
    name: "Bram",
    role: "Innkeeper",
    persona:
      "Bram keeps The Sleepy Fox Inn. Big laugh, bigger beard, remembers every guest's name. Loves a good story and a bowl of root stew.",
    greeting: "Welcome, traveler! Stew's on. Sit, sit — tell me where you've been.",
    building: "inn",
    wanderRadius: 80,
    appearance: { body: "male", skin: "#d9a066", hair: "messy1", hairColor: "#3b2a1a", shirtColor: "#7a3e2e", pantsColor: "#2e2e3a" },
    mood: "jolly",
  },
  {
    key: "shopkeeper",
    name: "Pip",
    role: "Shopkeeper",
    persona:
      "Pip runs the Bramble General Store. Quick, curious, always counting something. Trades in odds and ends and is delighted by rocks.",
    greeting: "Ah! A customer! Or a browser. Both welcome. Do you have any interesting rocks?",
    building: "store",
    wanderRadius: 70,
    appearance: { body: "male", skin: "#f1c9a5", hair: "spiked", hairColor: "#e8c14a", shirtColor: "#4a7c59", pantsColor: "#3a3a3a" },
    mood: "curious",
  },
  {
    key: "herbalist",
    name: "Wren",
    role: "Wandering Herbalist",
    persona:
      "Wren is a soft-spoken wandering herbalist who never stays in one place. Knows every plant in the grove by name. Trades knowledge for herbs.",
    greeting: "Shh — do you hear that? The mint is blooming. Bring me herbs and I'll teach you something.",
    pos: [14 * TILE, 28 * TILE],
    wanderRadius: 260,
    appearance: { body: "female", skin: "#c68e5a", hair: "long", hairColor: "#2f4f3f", shirtColor: "#6b8f71", pantsColor: "#5a4632" },
    mood: "serene",
  },
  {
    key: "elder",
    name: "Elder Oswin",
    role: "Village Elder",
    persona:
      "Elder Oswin has lived in the grove longer than anyone. Slow, kind, endlessly patient, remembers when the plaza was a meadow. Gives small tasks that bind the village together.",
    greeting: "Ah, a new face. Or an old one I've forgotten — forgive me. Sit with me a moment.",
    building: "townhall",
    wanderRadius: 60,
    appearance: { body: "male", skin: "#e8c39e", hair: "buzzcut", hairColor: "#dcdcdc", shirtColor: "#8a7f9e", pantsColor: "#4a4a5a" },
    mood: "calm",
  },
  {
    key: "orphan",
    name: "Tobin",
    role: "Village Kid",
    persona:
      "Tobin is a small kid who lives at the inn and mostly just wants someone to talk to. Full of questions, collects feathers, afraid of the fox but also wants to be its friend.",
    greeting: "Hi! Hi. Do you want to see my feather collection? It's mostly one feather.",
    pos: [30 * TILE, 27 * TILE],
    wanderRadius: 200,
    appearance: { body: "male", skin: "#f1c9a5", hair: "cowlick", hairColor: "#6b4226", shirtColor: "#e9c46a", pantsColor: "#264653" },
    mood: "lonely",
  },
  {
    key: "tinker",
    name: "Greta",
    role: "Tinker",
    persona:
      "Greta runs the workshop. Goggles on forehead, soot on cheeks, finishes your sentences. Builds furniture from whatever you bring her.",
    greeting: "Don't touch that, it's — okay, it's fine, it only sparks a little. What do you need built?",
    building: "workshop",
    wanderRadius: 80,
    appearance: { body: "female", skin: "#d9a066", hair: "bangs", hairColor: "#222222", shirtColor: "#a07a4a", pantsColor: "#3d3d3d" },
    mood: "focused",
  },
];

// Animal roam zones in world-tile units (tileRect, ty grows downward).
// Village species stay near the houses (chunks 1..2, south of them);
// wild species live in the WILD_ZONES outskirts ring.
const ANIMAL_DEFS: { species: string; names: string[]; zone: { x: number; y: number; w: number; h: number } }[] = [
  { species: "sheep", names: ["Clover", "Dumpling", "Mabel"], zone: tileRect(6, 48, 24, 21) },
  { species: "cow", names: ["Buttercup", "Juniper"], zone: tileRect(126, -12, 24, 21) },
  { species: "chicken", names: ["Nugget", "Pecky", "Henrietta", "Biscuit"], zone: tileRect(24, 33, 20, 12) },
  { species: "duck", names: ["Puddle", "Waddles", "Quilliam"], zone: tileRect(0, 49, 22, 20) },
  { species: "rabbit", names: ["Thimble", "Moss"], zone: tileRect(6, -54, 30, 20) },
  { species: "fox", names: ["Ember"], zone: tileRect(36, -59, 30, 24) },
  { species: "cat", names: ["Marmalade"], zone: tileRect(28, 18, 18, 9) },
  { species: "dog", names: ["Biscuit"], zone: tileRect(38, 30, 20, 14) },
];

// Resource nodes scattered through the wild ring (world-tile units), all in
// unauthored chunks so they never collide with map art.
const NODE_DEFS: [string, string, number, number][] = [
  ["herb_patch", "herb", 8, 54], ["herb_patch", "herb", 28, 62], ["herb_patch", "herb", 48, 51],
  ["herb_patch", "herb", 22, -55], ["herb_patch", "herb", 44, -57],
  ["berry_bush", "berry", 14, 49], ["berry_bush", "berry", 64, 56], ["berry_bush", "berry", 130, -21],
  ["rock", "stone", 123, 12], ["rock", "stone", 135, 39], ["rock", "stone", -77, 6], ["rock", "stone", 56, 71],
  ["mushroom_ring", "mushroom", -76, -15], ["mushroom_ring", "mushroom", 130, 54],
];

const MISSION_DEFS: {
  key: string;
  npc: string;
  title: string;
  description: string;
  offerLine: string;
  completeLine: string;
  requirement: MissionRequirement;
  reward: MissionReward;
  repeatable?: boolean;
  sponsored?: boolean;
}[] = [
  {
    key: "baker_eggs",
    npc: "baker",
    title: "Three Eggs for Marigold",
    description: "Marigold needs 3 fresh eggs for the weekend cinnamon knots. The chickens near the apothecary drop them.",
    offerLine: "Tell you what, love — bring me three fresh eggs and I'll teach you my cinnamon knot recipe. The chickens by the apothecary are generous if you're kind to them.",
    completeLine: "Three perfect eggs! Here — my cinnamon knot recipe, written in my own hand. Don't tell my sister.",
    requirement: { type: "collect", itemKey: "egg", qty: 3 },
    reward: { coins: 15, xp: 20, items: [{ itemKey: "recipe_cinnamon", qty: 1 }, { itemKey: "honey_bun", qty: 2 }] },
    sponsored: true,
  },
  {
    key: "herbalist_herbs",
    npc: "herbalist",
    title: "Gather Wild Herbs",
    description: "Wren wants 3 wild herbs from the herb patches at the edges of the grove.",
    offerLine: "Bring me three herbs — the good ones grow where the trees thin out — and I'll teach you a recipe for calming tea.",
    completeLine: "Perfect. Smell that? That's the good stuff. Here's the tea recipe. Steep it slow.",
    requirement: { type: "collect", itemKey: "herb", qty: 3 },
    reward: { coins: 10, xp: 20, items: [{ itemKey: "recipe_tea", qty: 1 }] },
  },
  {
    key: "elder_pet",
    npc: "elder",
    title: "Say Hello to the Sheep",
    description: "Elder Oswin thinks the sheep have been lonely. Pet 2 of them.",
    offerLine: "The sheep out west have seemed glum. Would you go and say hello? Pet two of them for me — my knees aren't what they were.",
    completeLine: "You went? Wonderful. I can hear them bleating happier already. Take this seal — it marks you as a friend of the village.",
    requirement: { type: "pet", species: "sheep", qty: 2 },
    reward: { coins: 8, xp: 25, items: [{ itemKey: "elder_seal", qty: 1 }] },
  },
  {
    key: "orphan_talk",
    npc: "orphan",
    title: "Visit the Inn with Tobin",
    description: "Tobin wants you to go see Bram at the inn and tell him Tobin says hi.",
    offerLine: "Can you go tell Bram I said hi? He's at the inn. He makes a funny face when you say my name.",
    completeLine: "Did he make the face?? He always makes the face. Here, you can have my second-best feather.",
    requirement: { type: "talk", npcKey: "innkeeper" },
    reward: { coins: 3, xp: 15, items: [{ itemKey: "straw_hat", qty: 1 }] },
  },
  {
    key: "innkeeper_slimes",
    npc: "innkeeper",
    title: "Slimes in the Cellar Field",
    description: "Slimes keep creeping toward the inn from the wild edges. Defeat 3.",
    offerLine: "Those slimes out past the trees have been getting bold. Knock three of them back and there's stew and a proper sword in it for you.",
    completeLine: "Ha! Knew you had it in you. Here — take this sword, it's better than the stick you've been using.",
    requirement: { type: "defeat", enemyKind: "slime", qty: 3 },
    reward: { coins: 20, xp: 40, items: [{ itemKey: "wooden_sword", qty: 1 }, { itemKey: "honey_bun", qty: 1 }] },
  },
  {
    key: "shopkeeper_stones",
    npc: "shopkeeper",
    title: "Interesting Rocks",
    description: "Pip will trade furniture for 4 river stones from the rocks near the pond.",
    offerLine: "Bring me four river stones from near the pond and I'll give you a chair. A good chair. Possibly the best chair.",
    completeLine: "Look at the SHEEN on these. Deal's a deal — one chair, as promised. And a fern, because I like you.",
    requirement: { type: "collect", itemKey: "stone", qty: 4 },
    reward: { coins: 5, xp: 20, items: [{ itemKey: "chair", qty: 1 }, { itemKey: "plant", qty: 1 }] },
    repeatable: true,
  },
  {
    key: "tinker_gel",
    npc: "tinker",
    title: "Gel for the Gears",
    description: "Greta needs 2 slime gel to grease her contraption. She'll build you a table.",
    offerLine: "Slime gel! Best lubricant in the grove. Bring me two blobs of it and I'll build you a table. Round. Very round.",
    completeLine: "Perfect viscosity. Here's your table — and a rug, I had it lying around.",
    requirement: { type: "collect", itemKey: "slime_gel", qty: 2 },
    reward: { coins: 6, xp: 20, items: [{ itemKey: "table", qty: 1 }, { itemKey: "rug", qty: 1 }] },
    repeatable: true,
  },
];

let seededPromise: Promise<void> | null = null;
let buildingsSynced = false;
let wildlifeSynced = false;

// Adopt the chunk-world wildlife layout for an already-seeded DB: rebuild
// resource nodes at their new spots, clear enemies (they respawn from the new
// WILD_ZONES), and re-zone animals. Runs once per process — restart the dev
// server after changing the layout. NPCs are deliberately untouched.
async function syncWildlifeLayout() {
  if (wildlifeSynced) return;
  wildlifeSynced = true;
  try {
    await db.delete(resourceNodes);
    for (const [kind, itemKey, tx, ty] of NODE_DEFS) {
      const p = tilePoint(tx, ty);
      await db.insert(resourceNodes).values({ kind, itemKey, x: p.x, y: p.y, qty: 3 });
    }
    await db.delete(enemies);
    for (const def of ANIMAL_DEFS) {
      await db.update(animals)
        .set({ zone: def.zone, x: def.zone.x + def.zone.w / 2, y: def.zone.y + def.zone.h / 2, targetX: null, targetY: null })
        .where(eq(animals.species, def.species));
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
    for (const entry of manifest.buildings) {
      const template = await getTemplate(entry);
      const fp = footprintOf(template);
      const values = {
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
      };
      await db.insert(buildings).values(values).onConflictDoUpdate({ target: buildings.key, set: values });
    }
    const keep = new Set(manifest.buildings.map((b) => b.key));
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
    .then(() => syncWildlifeLayout());
}

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
      let x: number, y: number, buildingId: number | null = null;
      const manifestEntry = manifest.buildings.find((m) => m.key === n.building);
      const dbBuilding = n.building ? bByKey.get(n.building) : undefined;
      if (dbBuilding && manifestEntry) {
        const d = doorWorldPx(manifestEntry, await getTemplate(manifestEntry));
        x = d.x + (n.offset?.[0] ?? 0) + 20;
        y = d.y + (n.offset?.[1] ?? 0) + 24;
        buildingId = dbBuilding.id;
      } else {
        [x, y] = n.pos ?? [SPAWN.x, SPAWN.y];
      }
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
          buildingId,
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
    for (const [kind, itemKey, x, y] of nodeDefs) await tx.insert(resourceNodes).values({ kind, itemKey, x, y, qty: 3 });
    await tx.insert(worldEvents).values({ kind: "world", text: "The grove wakes up for the first time." });
  });
  void WILD_ZONES;
  void sql;
}
