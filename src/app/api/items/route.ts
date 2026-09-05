import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { characters, groundItems, homeDecor, inventory, items } from "@/db/schema";
import { handleApiError, requireCharacter } from "@/lib/auth";
import { addItem, logEvent, progressMissions } from "@/lib/game";

export const dynamic = "force-dynamic";

/** Inventory actions: pickup | drop | equip | use | place | unplace */
export async function POST(req: Request) {
  try {
    const me = await requireCharacter();
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    if (action === "pickup") {
      const [g] = await db.select().from(groundItems).where(eq(groundItems.id, Number(body.groundItemId)));
      if (!g) return Response.json({ error: "Already gone." }, { status: 404 });
      if (Math.hypot(g.x - me.x, g.y - me.y) > 90) return Response.json({ error: "Too far away." }, { status: 400 });
      await db.delete(groundItems).where(eq(groundItems.id, g.id));
      await addItem(me.id, g.itemKey, g.qty, g.meta);
      await progressMissions(me.id, (r) => r.type === "collect" && r.itemKey === g.itemKey, g.qty);
      return Response.json({ ok: true, message: `Picked up ${g.itemKey.replace("_", " ")}.` });
    }

    const [row] = await db.select().from(inventory).where(and(eq(inventory.id, Number(body.inventoryId)), eq(inventory.characterId, me.id)));
    if (!row) return Response.json({ error: "Not in your bag." }, { status: 404 });
    const [def] = await db.select().from(items).where(eq(items.key, row.itemKey));

    if (action === "drop") {
      const qty = Math.max(1, Math.min(row.qty, Number(body.qty ?? 1)));
      if (qty >= row.qty) await db.delete(inventory).where(eq(inventory.id, row.id));
      else await db.update(inventory).set({ qty: row.qty - qty }).where(eq(inventory.id, row.id));
      await db.insert(groundItems).values({ itemKey: row.itemKey, qty, x: me.x + (Math.random() - 0.5) * 30, y: me.y + 18, meta: row.meta, droppedBy: me.id });
      return Response.json({ ok: true, message: `Dropped ${def?.name ?? row.itemKey}.` });
    }
    if (action === "equip") {
      if (!def?.equippable) return Response.json({ error: "Can't equip that." }, { status: 400 });
      if (row.equipped) {
        await db.update(inventory).set({ equipped: false }).where(eq(inventory.id, row.id));
        return Response.json({ ok: true, message: `Unequipped ${def.name}.` });
      }
      // one item per kind slot
      const same = await db.select().from(inventory).innerJoin(items, eq(items.key, inventory.itemKey)).where(and(eq(inventory.characterId, me.id), eq(inventory.equipped, true), eq(items.kind, def.kind)));
      for (const s of same) await db.update(inventory).set({ equipped: false }).where(eq(inventory.id, s.inventory.id));
      await db.update(inventory).set({ equipped: true }).where(eq(inventory.id, row.id));
      return Response.json({ ok: true, message: `Equipped ${def.name}.` });
    }
    if (action === "use") {
      if (def?.kind !== "consumable") return Response.json({ error: "Can't use that." }, { status: 400 });
      const heal = row.itemKey === "honey_bun" ? 8 : 4;
      const hp = Math.min(me.maxHp, me.hp + heal);
      await db.update(characters).set({ hp }).where(eq(characters.id, me.id));
      if (row.qty > 1) await db.update(inventory).set({ qty: row.qty - 1 }).where(eq(inventory.id, row.id));
      else await db.delete(inventory).where(eq(inventory.id, row.id));
      return Response.json({ ok: true, message: `Ate ${def.name}. +${hp - me.hp} HP.` });
    }
    if (action === "place") {
      if (!def?.placeable) return Response.json({ error: "Can't place that." }, { status: 400 });
      const gx = Math.max(0, Math.min(9, Number(body.gx))), gy = Math.max(0, Math.min(7, Number(body.gy)));
      const [occupied] = await db.select().from(homeDecor).where(and(eq(homeDecor.characterId, me.id), eq(homeDecor.gx, gx), eq(homeDecor.gy, gy)));
      if (occupied) return Response.json({ error: "Something's already there." }, { status: 400 });
      if (row.qty > 1) await db.update(inventory).set({ qty: row.qty - 1 }).where(eq(inventory.id, row.id));
      else await db.delete(inventory).where(eq(inventory.id, row.id));
      await db.insert(homeDecor).values({ characterId: me.id, itemKey: row.itemKey, gx, gy });
      return Response.json({ ok: true, message: `Placed ${def.name}.` });
    }
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return handleApiError(e);
  }
}

/** Home decor: move or pick back up */
export async function PATCH(req: Request) {
  try {
    const me = await requireCharacter();
    const body = await req.json().catch(() => ({}));
    const [d] = await db.select().from(homeDecor).where(and(eq(homeDecor.id, Number(body.decorId)), eq(homeDecor.characterId, me.id)));
    if (!d) return Response.json({ error: "Not found" }, { status: 404 });
    if (body.action === "unplace") {
      await db.delete(homeDecor).where(eq(homeDecor.id, d.id));
      await addItem(me.id, d.itemKey, 1);
      return Response.json({ ok: true, message: "Back in your bag." });
    }
    const gx = Math.max(0, Math.min(9, Number(body.gx))), gy = Math.max(0, Math.min(7, Number(body.gy)));
    const [occupied] = await db.select().from(homeDecor).where(and(eq(homeDecor.characterId, me.id), eq(homeDecor.gx, gx), eq(homeDecor.gy, gy)));
    if (occupied && occupied.id !== d.id) return Response.json({ error: "Occupied." }, { status: 400 });
    await db.update(homeDecor).set({ gx, gy }).where(eq(homeDecor.id, d.id));
    await logEvent("home", `${me.name} rearranged their cottage.`, "character", me.id);
    return Response.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
