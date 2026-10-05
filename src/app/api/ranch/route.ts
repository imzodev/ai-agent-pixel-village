// Ranch plots. GET ?key=<ranch key> → the panel; POST { key, action }:
//   "buy" { species } — a chick / lamb / calf for your pen
//   "feed"            — feed hungry animals crops from your bag
//   "collect"         — gather eggs, wool and milk (happy animals: better ones)
//   "pet_all"         — pet everyone (affection, once a day each)
//   "build" { step }  — upgrade the coop / barn, build a silo, feeder, machine
//   "deposit"         — pour feed from your bag into the silo
//   "start" { recipe } / "workshop" — run a machine / collect its work and honey
// Only the owner tends a ranch, from near its gate. Growth: src/lib/ranchUpgrades.ts.
// Vineyards use this route too (their winery: build / start / workshop);
// the animal actions are the ranch's alone.

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { animals, characters, inventory, lots } from "@/db/schema";
import { handleApiError, requireCharacter } from "@/lib/auth";
import { getBuildingDoor, getBuildingsManifest } from "@/lib/buildingsServer";
import { getLivePlayerPosition, markWorldDirty } from "@/lib/world-stream";
import { addItem, progressMissions } from "@/lib/game";
import { getContainer } from "@/lib/container";
import {
  FED_BELOW, FEED_ITEMS, HUNGRY_AT, RANCH_REACH_PX, RANCH_SPECIES,
  afterCollect, afterFeed, isRanchSpecies, nextIn, nextName, penRect, readyCount,
} from "@/lib/ranch";
import { PET_AFFECTION, PET_COOLDOWN_MS, FED_AFFECTION, XP_PER_GOOD, capFor, clampAffection, collectGoods } from "@/lib/ranchUpgrades";
import { addFarmXp, build, collectWorkshop, deposit, growthView, loadGrowth, startJob } from "@/lib/ranchServer";
import type { RanchView } from "@/types/ranch";

export const dynamic = "force-dynamic";

async function ranchOf(key: string) {
  const [lot] = await db.select({ lot: lots, ownerName: characters.name }).from(lots).leftJoin(characters, eq(characters.id, lots.ownerId)).where(and(eq(lots.key, key), inArray(lots.kind, ["ranch", "vineyard"])));
  return lot ?? null;
}

async function view(key: string, meId: number): Promise<RanchView | null> {
  const r = await ranchOf(key);
  if (!r) return null;
  const now = Date.now();
  const entry = (await getBuildingsManifest()).buildings.find((b) => b.key === key);
  const [herd, bag, [me]] = await Promise.all([
    db.select().from(animals).where(eq(animals.ranchKey, key)).orderBy(animals.id),
    db.select({ itemKey: inventory.itemKey, qty: inventory.qty }).from(inventory).where(and(eq(inventory.characterId, meId), inArray(inventory.itemKey, [...FEED_ITEMS]))),
    db.select({ coins: characters.coins }).from(characters).where(eq(characters.id, meId)),
  ]);
  const feed = new Map<string, number>();
  for (const b of bag) feed.set(b.itemKey, (feed.get(b.itemKey) ?? 0) + b.qty);
  const mine = r.lot.ownerId === meId;
  const growth = await loadGrowth(key);
  const kind = r.lot.kind === "vineyard" ? "vineyard" : "ranch";
  return {
    key,
    kind,
    name: entry?.name ?? key,
    owner: r.lot.ownerId != null ? { id: r.lot.ownerId, name: r.ownerName ?? "someone" } : null,
    mine,
    animals: herd.map((a) => {
      const last = (a.lastProducedAt ?? a.lastFedAt).getTime();
      return {
        id: a.id, name: a.name, species: a.species, hunger: a.hunger, affection: a.affection,
        pettable: !a.lastPettedAt || now - a.lastPettedAt.getTime() >= PET_COOLDOWN_MS,
        ready: readyCount(last, a.hunger, now), nextInMs: nextIn(last, a.hunger, now),
      };
    }),
    shop: Object.values(RANCH_SPECIES).map((s) => ({ ...s, cap: capFor(s.species, growth), owned: herd.filter((a) => a.species === s.species).length })),
    feed: [...feed].filter(([, q]) => q > 0).map(([itemKey, qty]) => ({ itemKey, qty })),
    coins: me?.coins ?? 0,
    growth: mine ? await growthView(key, kind, meId, me?.coins ?? 0, now) : null,
  };
}

export async function GET(req: Request) {
  try {
    const me = await requireCharacter();
    const v = await view(new URL(req.url).searchParams.get("key") ?? "", me.id);
    return v ? Response.json(v) : Response.json({ error: "No such ranch." }, { status: 404 });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireCharacter();
    const body = await req.json().catch(() => ({}));
    const key = String(body.key ?? "");
    const r = await ranchOf(key);
    if (!r) return Response.json({ error: "No such ranch." }, { status: 404 });
    if (r.lot.ownerId !== me.id) return Response.json({ error: "This isn't your ranch." }, { status: 403 });
    const door = await getBuildingDoor(key);
    const p = getLivePlayerPosition(me.id) ?? me;
    if (!door || Math.hypot(door.x - p.x, door.y - p.y) > RANCH_REACH_PX) return Response.json({ error: r.lot.kind === "vineyard" ? "Head over to your vineyard first." : "Head over to your ranch first." }, { status: 400 });
    const now = Date.now();
    const herd = await db.select().from(animals).where(eq(animals.ranchKey, key));
    const kind = r.lot.kind === "vineyard" ? "vineyard" : "ranch";
    if (kind === "vineyard" && ["buy", "feed", "collect", "pet_all", "deposit"].includes(String(body.action))) return Response.json({ error: "There are no animals in a vineyard." }, { status: 400 });

    if (body.action === "buy") {
      const species = String(body.species ?? "");
      if (!isRanchSpecies(species)) return Response.json({ error: "You can't raise that here." }, { status: 400 });
      const def = RANCH_SPECIES[species];
      const mine = herd.filter((a) => a.species === species);
      const cap = capFor(species, await loadGrowth(key));
      if (mine.length >= cap) return Response.json({ error: `Your ${def.home} is full (${cap} max). Upgrade it to fit more.` }, { status: 400 });
      const [paid] = await db.update(characters).set({ coins: sql`${characters.coins} - ${def.price}` })
        .where(and(eq(characters.id, me.id), sql`${characters.coins} >= ${def.price}`)).returning({ id: characters.id });
      if (!paid) return Response.json({ error: `A ${def.young.toLowerCase()} costs ${def.price} coins.` }, { status: 400 });
      const entry = (await getBuildingsManifest()).buildings.find((b) => b.key === key)!;
      const pen = penRect(entry.tx, entry.ty);
      const name = nextName(species, herd.map((a) => a.name));
      await db.insert(animals).values({
        species, name, x: pen.x + Math.floor(pen.w / 32) * 16 + 8, y: pen.y + Math.floor(pen.h / 32) * 16 + 8,
        zone: pen, hunger: 0, ownerId: me.id, ranchKey: key, lastProducedAt: new Date(now), lastFedAt: new Date(now),
      });
      markWorldDirty(pen.x, pen.y);
      return Response.json({ ok: true, message: `${def.icon} Welcome, ${name}! Keep them fed and they'll give you ${def.produce}.`, view: await view(key, me.id) });
    }

    if (body.action === "feed") {
      const hungry = herd.filter((a) => a.hunger >= FED_BELOW).sort((a, b) => b.hunger - a.hunger);
      if (hungry.length === 0) return Response.json({ error: "Everyone's full. Come back later." }, { status: 400 });
      const bag = await db.select().from(inventory).where(and(eq(inventory.characterId, me.id), inArray(inventory.itemKey, [...FEED_ITEMS]), sql`${inventory.qty} > 0`)).orderBy(inventory.id);
      let fed = 0;
      for (const a of hungry) {
        const row = bag.find((b) => b.qty > 0);
        if (!row) break;
        row.qty -= 1;
        if (row.qty > 0) await db.update(inventory).set({ qty: row.qty }).where(eq(inventory.id, row.id));
        else await db.delete(inventory).where(eq(inventory.id, row.id));
        const last = (a.lastProducedAt ?? a.lastFedAt).getTime();
        await db.update(animals).set({
          hunger: 0, lastFedAt: new Date(now), lastProducedAt: new Date(afterFeed(last, a.hunger, now)), mood: "content",
          affection: clampAffection(a.affection + (a.hunger < HUNGRY_AT ? FED_AFFECTION : 0)),
        }).where(eq(animals.id, a.id));
        fed++;
      }
      if (fed === 0) return Response.json({ error: "You've no feed. Bring wheat or crops from your field." }, { status: 400 });
      return Response.json({ ok: true, message: `🌾 You fed ${fed} animal${fed === 1 ? "" : "s"}.${fed < hungry.length ? " You ran out of feed." : ""}`, view: await view(key, me.id) });
    }

    if (body.action === "collect") {
      const gained = new Map<string, number>();
      for (const a of herd) {
        if (!isRanchSpecies(a.species)) continue;
        const last = (a.lastProducedAt ?? a.lastFedAt).getTime();
        const n = readyCount(last, a.hunger, now);
        if (n === 0) continue;
        // Happy animals sometimes give better goods (golden eggs, fine wool, rich milk).
        for (const [item, q] of Object.entries(collectGoods(RANCH_SPECIES[a.species].produce, n, a.affection))) gained.set(item, (gained.get(item) ?? 0) + q);
        await db.update(animals).set({ lastProducedAt: new Date(afterCollect(last, n, now)) }).where(eq(animals.id, a.id));
      }
      if (gained.size === 0) return Response.json({ error: "Nothing to collect yet." }, { status: 400 });
      const quest = getContainer().services.quest;
      for (const [itemKey, qty] of gained) {
        await addItem(me.id, itemKey, qty);
        await progressMissions(me.id, (q) => q.type === "collect" && q.itemKey === itemKey, qty);
        void quest.recordEvent(me.id, { kind: "collect", payload: { itemKey } }, qty).catch(() => {});
      }
      const list = [...gained].map(([k, q]) => ({ itemKey: k, qty: q }));
      await addFarmXp(key, list.reduce((s, g) => s + g.qty, 0) * XP_PER_GOOD);
      return Response.json({ ok: true, message: `🧺 Collected ${list.map((g) => `${g.qty} ${g.itemKey}`).join(", ")}.`, gained: list, view: await view(key, me.id) });
    }
    if (body.action === "pet_all") {
      const due = herd.filter((a) => !a.lastPettedAt || now - a.lastPettedAt.getTime() >= PET_COOLDOWN_MS);
      if (!due.length) return Response.json({ error: "They've all had their fuss today. Come back tomorrow." }, { status: 400 });
      for (const a of due) await db.update(animals).set({ affection: clampAffection(a.affection + PET_AFFECTION), lastPettedAt: new Date(now), pets: a.pets + 1, mood: "delighted" }).where(eq(animals.id, a.id));
      return Response.json({ ok: true, message: `💕 You gave ${due.length} animal${due.length === 1 ? "" : "s"} a good fuss.`, view: await view(key, me.id) });
    }
    // Growth: building, the silo and the workshop (src/lib/ranchServer.ts).
    const grow = body.action === "build" ? await build(key, kind, me.id, String(body.step ?? ""), now)
      : body.action === "deposit" ? await deposit(key, me.id)
      : body.action === "start" ? await startJob(key, kind, me.id, String(body.recipe ?? ""), now)
      : body.action === "workshop" ? await collectWorkshop(key, me.id, now)
      : null;
    if (grow) {
      if (!grow.ok) return Response.json({ error: grow.error }, { status: 400 });
      if (body.action === "build") markWorldDirty(door.x, door.y); // neighbours see the new building
      return Response.json({ ok: true, message: grow.message, gained: grow.gained, view: await view(key, me.id) });
    }
    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return handleApiError(e);
  }
}
