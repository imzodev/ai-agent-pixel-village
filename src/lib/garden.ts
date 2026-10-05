// Home gardens: planting, watering and harvesting crops in a lot's plots.
//
// A planted crop is a resource_nodes row with owner_id / lot_id / plot set.
// It starts at stage 1 and tickResources (src/lib/sim.ts) advances it one
// stage every CROP_KINDS[kind].regrowthMs until it is ripe. Rules:
//   - only the lot's owner plants and harvests;
//   - anyone may water (neighbours can help), once per stage: watering
//     halves the time left in the current stage;
//   - nothing dies — an unwatered crop simply grows at normal speed;
//   - harvesting yields the produce and frees the plot.

import { and, eq, gte, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { characters, lots, resourceNodes } from "@/db/schema";
import { CROP_KINDS, GARDEN_CROPS } from "./crops";
import { addItem, countItem, progressMissions, recalcLevel, removeItem } from "./game";
import { plotsOfLot } from "./lots";
import { isRipe, rollHarvestSeeds, wateredAdvanceAt, waterCheck } from "./gardenRules";
import type { GardenResult } from "@/types/garden";
import { perksOf } from "./combat";
import { tutorialEvent } from "./tutorialServer";
import { recordCollection } from "./collectionServer";
import { GREEN_THUMB_MULT } from "./progression";
import { afterPerennialHarvest, plantRule, vineyardSlot } from "./vineyard";
import { addFarmXp, loadGrowth } from "./ranchServer";
import { XP_PER_GOOD, farmLevel } from "./ranchUpgrades";
import { getBuildingsManifest, getTemplate } from "./buildingsServer";
import { gardenCellsOf } from "./buildingManifest";

/** The garden cells of a lot's template (which plot is where). */
async function lotCells(lot: { buildingKey: string | null }) {
  const entry = lot.buildingKey ? (await getBuildingsManifest()).buildings.find((b) => b.key === lot.buildingKey) : undefined;
  return entry ? gardenCellsOf(await getTemplate(entry)) : [];
}

export { isRipe, wateredAdvanceAt, waterCheck };

/** XP for planting and harvesting. */
const PLANT_XP = 1;
const HARVEST_XP = 5;

// ── Actions ────────────────────────────────────────────────────────────

/** Plant `seedKey` in plot `plot` of lot `lotKey`. Owner only. */
export async function plantCrop(characterId: number, lotKey: string, plot: number, seedKey: string): Promise<GardenResult> {
  const crop = GARDEN_CROPS[seedKey];
  const cfg = crop ? CROP_KINDS[crop.kind] : undefined;
  if (!crop || !cfg) return { ok: false, error: "Those aren't seeds you can plant." };
  const [lot] = await db.select().from(lots).where(eq(lots.key, lotKey));
  if (!lot) return { ok: false, error: "There's no garden here." };
  if (lot.ownerId !== characterId) return { ok: false, error: "This isn't your garden." };
  const target = (await plotsOfLot(lot)).find((p) => p.plot === plot);
  if (!target) return { ok: false, error: "There's no plot there." };
  // Vines on trellises, trees in the orchard, vegetables in fields (src/lib/vineyard.ts).
  const vineyard = lot.kind === "vineyard";
  const cell = vineyard ? (await lotCells(lot)).find((c) => c.plot === plot) : undefined;
  const why = plantRule(crop, lot.kind, cell ? vineyardSlot(cell) : null, vineyard ? farmLevel((await loadGrowth(lot.key)).farmXp) : 1);
  if (why) return { ok: false, error: why };
  if ((await countItem(characterId, seedKey)) < 1) return { ok: false, error: "You don't have any of those seeds." };
  // Green Thumb shortens every stage of the owner's crops.
  const stageMs = Math.round(cfg.regrowthMs * ((await perksOf(characterId)).has("green_thumb") ? GREEN_THUMB_MULT : 1));

  const inserted = await db
    .insert(resourceNodes)
    .values({
      kind: crop.kind,
      itemKey: crop.produceKey,
      x: target.x,
      y: target.y,
      qty: cfg.yield,
      stage: 1,
      nextAdvanceAt: new Date(Date.now() + stageMs),
      ownerId: characterId,
      lotId: lot.id,
      plot,
    })
    .onConflictDoNothing({ target: [resourceNodes.lotId, resourceNodes.plot] })
    .returning({ id: resourceNodes.id });
  if (inserted.length === 0) return { ok: false, error: "Something is already growing there." };
  await removeItem(characterId, seedKey, 1);
  await db.update(characters).set({ xp: sql`${characters.xp} + ${PLANT_XP}` }).where(eq(characters.id, characterId));
  const name = crop.produceKey;
  const step = await tutorialEvent(characterId, "plant");
  return { ok: true, message: `Planted ${name} seeds. Water them to help them grow faster!`, x: target.x, y: target.y, notices: step ? [step] : [] };
}

/** Water a garden crop. Anyone can help, once per growth stage. */
export async function waterCrop(nodeId: number): Promise<GardenResult> {
  const [node] = await db.select().from(resourceNodes).where(eq(resourceNodes.id, nodeId));
  if (!node || node.lotId == null) return { ok: false, error: "There's nothing to water here." };
  const cfg = CROP_KINDS[node.kind];
  if (!cfg) return { ok: false, error: "There's nothing to water here." };
  const why = waterCheck(node, cfg.stages);
  if (why) return { ok: false, error: why };
  const next = wateredAdvanceAt(Date.now(), node.nextAdvanceAt!.getTime());
  // Conditional update: two players watering at once can't double-dip.
  const done = await db
    .update(resourceNodes)
    .set({ nextAdvanceAt: new Date(next), wateredStage: node.stage })
    .where(and(eq(resourceNodes.id, node.id), eq(resourceNodes.stage, node.stage), or(isNull(resourceNodes.wateredStage), ne(resourceNodes.wateredStage, node.stage))))
    .returning({ id: resourceNodes.id });
  if (done.length === 0) return { ok: false, error: "Already watered. Check back when it grows." };
  return { ok: true, message: "Watered! It'll grow faster this stage.", x: node.x, y: node.y };
}

/** Harvest a ripe crop from your own garden; frees the plot. */
export async function harvestCrop(characterId: number, nodeId: number): Promise<GardenResult> {
  const [node] = await db.select().from(resourceNodes).where(eq(resourceNodes.id, nodeId));
  if (!node || node.lotId == null) return { ok: false, error: "There's nothing to harvest here." };
  if (node.ownerId !== characterId) return { ok: false, error: "That's someone else's garden." };
  const cfg = CROP_KINDS[node.kind];
  if (!cfg || !isRipe(node.stage, cfg.stages)) return { ok: false, error: "It isn't ready yet." };
  // Vines and fruit trees stay and fruit again; everything else is pulled.
  // Both are conditional so a double click can't harvest twice.
  const regrow = cfg.perennial ? afterPerennialHarvest(cfg.stages, cfg.perennial, Date.now()) : null;
  const gone = regrow
    ? await db.update(resourceNodes)
      .set({ stage: regrow.stage, nextAdvanceAt: new Date(regrow.nextAdvanceAt), wateredStage: null })
      .where(and(eq(resourceNodes.id, node.id), gte(resourceNodes.stage, cfg.stages - 1)))
      .returning({ id: resourceNodes.id })
    : await db
      .delete(resourceNodes)
      .where(and(eq(resourceNodes.id, node.id), gte(resourceNodes.stage, cfg.stages - 1)))
      .returning({ id: resourceNodes.id });
  if (gone.length === 0) return { ok: false, error: "It's already been harvested." };
  // A vineyard grows with every harvest.
  if (cfg.perennial && node.lotId != null) {
    const [lot] = await db.select({ key: lots.key, kind: lots.kind }).from(lots).where(eq(lots.id, node.lotId));
    if (lot?.kind === "vineyard") await addFarmXp(lot.key, node.qty * XP_PER_GOOD);
  }
  await addItem(characterId, node.itemKey, node.qty);
  const gained = [{ itemKey: node.itemKey, qty: node.qty }];
  // Sometimes the harvest leaves seeds to replant (not perennials: they stay).
  const seedKey = cfg.perennial ? undefined : Object.values(GARDEN_CROPS).find((c) => c.kind === node.kind)?.seedKey;
  const seeds = seedKey ? rollHarvestSeeds() : 0;
  if (seedKey && seeds > 0) {
    await addItem(characterId, seedKey, seeds);
    gained.push({ itemKey: seedKey, qty: seeds });
  }
  await progressMissions(characterId, (r) => r.type === "collect" && r.itemKey === node.itemKey, node.qty);
  await db.update(characters).set({ xp: sql`${characters.xp} + ${HARVEST_XP}` }).where(eq(characters.id, characterId));
  await recalcLevel(characterId);
  const isNew = await recordCollection(characterId, "crop", node.itemKey, node.qty);
  return {
    ok: true,
    message: `Harvested ${node.qty} ${node.itemKey}${node.qty > 1 ? "s" : ""}!${seeds > 0 ? ` …and saved ${seeds} seed${seeds > 1 ? "s" : ""} to replant.` : ""}`,
    notices: isNew ? [`📖 New in your book: ${node.itemKey}!`] : [],
    gained,
    x: node.x,
    y: node.y,
  };
}
