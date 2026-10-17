import { eq } from "drizzle-orm";
import { db } from "@/db";
import { lots, resourceNodes } from "@/db/schema";
import { handleApiError, requireCharacter } from "@/lib/auth";
import { getContainer } from "@/lib/container";
import { harvestAll, harvestCrop, plantAll, plantCrop, waterAll, waterCrop } from "@/lib/garden";
import { plantCount } from "@/lib/gardenRules";
import { plotsOfLot } from "@/lib/lots";
import { TEND_RANGE_SERVER_PX, atLot, canTend, insideLot } from "@/lib/lotReach";
import { getLivePlayerPosition, markWorldDirty } from "@/lib/world-stream";

export const dynamic = "force-dynamic";

/** Daily quests: what a harvest collected counts. */
function recordHarvestQuests(characterId: number, gained: { itemKey: string; qty: number }[] | undefined): void {
  for (const g of gained ?? []) {
    void getContainer().services.quest
      .recordEvent(characterId, { kind: "collect", payload: { itemKey: g.itemKey } }, g.qty)
      .catch((e) => console.error("[garden] daily quest event failed:", e));
  }
}

/**
 * Garden actions:
 *   plant   { lotKey, plot, seedKey }  — owner only
 *   water   { nodeId }                 — anyone, once per growth stage
 *   harvest { nodeId }                 — owner only, when ripe
 *   plant_all { lotKey, seedKey, count? } — every free plot it fits, while seeds last (or `count` of them, 1–99)
 *   harvest_all { lotKey, kind? }      — every ripe crop of yours in the lot (of one kind)
 *   water_all { lotKey, kind? }        — every crop there that can be watered (of one kind)
 * The "_all" actions need you in or right next to the lot (atLot, e.g. at its gate).
 * You must be close to the plot or crop (TEND_RANGE_SERVER_PX), unless it is in
 * your own lot and you are standing inside that lot (src/lib/lotReach.ts).
 */
export async function POST(req: Request) {
  try {
    const me = await requireCharacter();
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const p = getLivePlayerPosition(me.id) ?? me;
    const near = (x: number, y: number, ownLot?: { ownerId: number | null; tx: number; ty: number; tw: number; th: number } | null) =>
      canTend(Math.hypot(x - p.x, y - p.y), TEND_RANGE_SERVER_PX, !!ownLot && ownLot.ownerId === me.id && insideLot(ownLot, p.x, p.y));

    let result;
    if (action === "plant") {
      const lotKey = String(body.lotKey ?? "");
      const plot = Number(body.plot);
      const [lot] = await db.select().from(lots).where(eq(lots.key, lotKey));
      const target = lot ? (await plotsOfLot(lot)).find((pl) => pl.plot === plot) : undefined;
      if (target && !near(target.x, target.y, lot)) return Response.json({ error: "Walk over to the plot first." }, { status: 400 });
      result = await plantCrop(me.id, lotKey, plot, String(body.seedKey ?? ""));
    } else if (action === "water" || action === "harvest") {
      const nodeId = Number(body.nodeId);
      const [node] = await db.select({ x: resourceNodes.x, y: resourceNodes.y, lotId: resourceNodes.lotId, ownerId: resourceNodes.ownerId }).from(resourceNodes).where(eq(resourceNodes.id, nodeId));
      // Your own crops in your own lot are in reach from anywhere inside it.
      const [nodeLot] = node?.lotId != null && node.ownerId === me.id ? await db.select().from(lots).where(eq(lots.id, node.lotId)) : [];
      if (node && !near(node.x, node.y, nodeLot)) return Response.json({ error: "Walk over to it first." }, { status: 400 });
      result = action === "water" ? await waterCrop(nodeId) : await harvestCrop(me.id, nodeId);
      if (result.ok && action === "harvest") recordHarvestQuests(me.id, result.gained);
    } else if (action === "plant_all" || action === "harvest_all" || action === "water_all") {
      const [lot] = await db.select().from(lots).where(eq(lots.key, String(body.lotKey ?? "")));
      if (!lot) return Response.json({ error: "There's no garden here." }, { status: 400 });
      if (!atLot(lot, p.x, p.y)) return Response.json({ error: "Walk over to the lot first." }, { status: 400 });
      result = action === "plant_all" ? await plantAll(me.id, lot.key, String(body.seedKey ?? ""), plantCount(body.count))
        : action === "harvest_all" ? await harvestAll(me.id, lot.key, body.kind ? String(body.kind) : undefined)
        : await waterAll(lot.key, body.kind ? String(body.kind) : undefined);
      if (result.ok && action === "harvest_all") recordHarvestQuests(me.id, result.gained);
    } else {
      return Response.json({ error: "Unknown action." }, { status: 400 });
    }

    if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
    if (result.x !== undefined && result.y !== undefined) markWorldDirty(result.x, result.y);
    return Response.json(result);
  } catch (e) {
    return handleApiError(e);
  }
}
