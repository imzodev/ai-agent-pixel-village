import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { animals, buildings, characters, enemies, groundItems, inventory, npcs, resourceNodes, sponsors, worldChat, worldEvents, worldState } from "@/db/schema";
import { getCurrentCharacter, handleApiError } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { tickWorld } from "@/lib/sim";
import { gameHour, isWalkable } from "@/lib/worldmap";

export const dynamic = "force-dynamic";

async function snapshot(meId: number | null) {
  const [ws] = await db.select().from(worldState).where(eq(worldState.id, 1));
  const since = new Date(Date.now() - 45_000);
  const [players, npcRows, animalRows, buildingRows, sponsorRows, ground, nodes, enemyRows, chat, events] = await Promise.all([
    db.select({ id: characters.id, name: characters.name, x: characters.x, y: characters.y, facing: characters.facing, appearance: characters.appearance, level: characters.level, hp: characters.hp, maxHp: characters.maxHp, coins: characters.coins, xp: characters.xp })
      .from(characters).where(gt(characters.lastSeenAt, since)),
    db.select().from(npcs).where(eq(npcs.active, true)),
    db.select().from(animals),
    db.select().from(buildings),
    db.select({ id: sponsors.id, businessName: sponsors.businessName, brandColor: sponsors.brandColor, tagline: sponsors.tagline, status: sponsors.status }).from(sponsors).where(eq(sponsors.status, "active")),
    db.select().from(groundItems),
    db.select().from(resourceNodes),
    db.select().from(enemies),
    db.select().from(worldChat).where(gt(worldChat.createdAt, new Date(Date.now() - 12_000))).orderBy(desc(worldChat.id)).limit(30),
    db.select().from(worldEvents).orderBy(desc(worldEvents.id)).limit(10),
  ]);
  const spById = new Map(sponsorRows.map((s) => [s.id, s]));
  let equipped: { itemKey: string }[] = [];
  if (meId) {
    equipped = await db.select({ itemKey: inventory.itemKey }).from(inventory).where(sql`${inventory.characterId} = ${meId} and ${inventory.equipped} = true`);
  }
  const playerIds = players.map((p) => p.id);
  const equippedAll = playerIds.length
    ? await db.select({ characterId: inventory.characterId, itemKey: inventory.itemKey }).from(inventory).where(and(inArray(inventory.characterId, playerIds), eq(inventory.equipped, true)))
    : [];
  return {
    now: Date.now(),
    hour: gameHour(ws.epochStart.getTime(), ws.dayLengthMinutes),
    weather: ws.weather,
    dayLengthMinutes: ws.dayLengthMinutes,
    epochStart: ws.epochStart.getTime(),
    me: meId ? { ...players.find((p) => p.id === meId), equipped: equipped.map((e) => e.itemKey) } : null,
    players: players.map((p) => ({ ...p, equipped: equippedAll.filter((e) => e.characterId === p.id).map((e) => e.itemKey) })),
    npcs: npcRows.map((n) => ({
      id: n.id, key: n.key, name: n.name, role: n.role, x: n.x, y: n.y, targetX: n.targetX, targetY: n.targetY, facing: n.facing, appearance: n.appearance, mood: n.mood, kind: n.kind,
      sponsor: n.sponsorId && spById.get(n.sponsorId) ? { businessName: spById.get(n.sponsorId)!.businessName, brandColor: spById.get(n.sponsorId)!.brandColor } : null,
    })),
    animals: animalRows.map((a) => ({ id: a.id, species: a.species, name: a.name, x: a.x, y: a.y, targetX: a.targetX, targetY: a.targetY, facing: a.facing, state: a.state, mood: a.mood })),
    buildings: buildingRows.map((b) => ({
      id: b.id, key: b.key, name: b.name, kind: b.kind, color: b.color, tx: b.tx, ty: b.ty, tw: b.tw, th: b.th, reservable: b.reservable,
      sponsor: b.sponsorId && spById.get(b.sponsorId) ? { businessName: spById.get(b.sponsorId)!.businessName, brandColor: spById.get(b.sponsorId)!.brandColor, tagline: spById.get(b.sponsorId)!.tagline } : null,
    })),
    groundItems: ground,
    nodes: nodes.map((n) => ({ id: n.id, kind: n.kind, x: n.x, y: n.y, qty: n.qty, ready: !n.respawnAt })),
    enemies: enemyRows.map((e) => ({ id: e.id, kind: e.kind, x: e.x, y: e.y, targetX: e.targetX, targetY: e.targetY, hp: e.hp, maxHp: e.maxHp })),
    chat: chat.map((c) => ({ id: c.id, speakerType: c.speakerType, speakerId: c.speakerId, text: c.text, at: c.createdAt.getTime() })),
    events: events.map((e) => ({ id: e.id, kind: e.kind, text: e.text, at: e.createdAt.getTime() })),
  };
}

export async function GET() {
  try {
    await ensureSeeded();
    await tickWorld();
    const me = await getCurrentCharacter();
    return Response.json(await snapshot(me?.id ?? null));
  } catch (e) {
    return handleApiError(e);
  }
}

/** Heartbeat: update my position, then return the snapshot. */
export async function POST(req: Request) {
  try {
    await ensureSeeded();
    const me = await getCurrentCharacter();
    if (me) {
      const body = await req.json().catch(() => ({}));
      const x = Number(body.x), y = Number(body.y);
      const facing = ["up", "down", "left", "right"].includes(body.facing) ? body.facing : me.facing;
      const patch: Partial<typeof characters.$inferInsert> = { lastSeenAt: new Date(), facing };
      if (Number.isFinite(x) && Number.isFinite(y) && isWalkable(x, y) && Math.hypot(x - me.x, y - me.y) < 600) {
        patch.x = x; patch.y = y;
      }
      await db.update(characters).set(patch).where(eq(characters.id, me.id));
    }
    await tickWorld();
    return Response.json(await snapshot(me?.id ?? null));
  } catch (e) {
    return handleApiError(e);
  }
}
