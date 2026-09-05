import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { animals, buildings, characters, enemies, leads, missions, npcs, resourceNodes, sponsors, worldEvents } from "@/db/schema";
import { handleApiError } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

const ago = (d: Date | null) => {
  if (!d) return "never";
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`;
};

async function eventsFor(type: string, id: number) {
  const rows = await db.select().from(worldEvents).where(and(eq(worldEvents.subjectType, type), eq(worldEvents.subjectId, id))).orderBy(desc(worldEvents.id)).limit(6);
  return rows.map((e) => ({ text: e.text, when: ago(e.createdAt) }));
}

/** GET /api/inspect?type=animal&id=3  or  ?q=what's that sheep doing */
export async function GET(req: Request) {
  try {
    await ensureSeeded();
    const url = new URL(req.url);
    let type = url.searchParams.get("type");
    let id = Number(url.searchParams.get("id"));
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const px = Number(url.searchParams.get("x") ?? 0), py = Number(url.searchParams.get("y") ?? 0);

    if (q && !type) {
      const dist = (x: number, y: number) => Math.hypot(x - px, y - py);
      const species = ["sheep", "cow", "chicken", "duck", "rabbit", "fox", "cat", "dog"].find((s) => q.includes(s));
      if (species) {
        const rows = await db.select().from(animals).where(eq(animals.species, species));
        const named = rows.find((r) => q.includes(r.name.toLowerCase()));
        const a = named ?? rows.sort((a, b) => dist(a.x, a.y) - dist(b.x, b.y))[0];
        if (a) { type = "animal"; id = a.id; }
      }
      if (!type) {
        const bs = await db.select().from(buildings);
        const b = bs.find((b) => q.includes(b.kind) || q.includes(b.name.toLowerCase()) || b.name.toLowerCase().split(" ").some((w) => w.length > 3 && q.includes(w)));
        if (b) { type = "building"; id = b.id; }
      }
      if (!type) {
        const ns = await db.select().from(npcs);
        const n = ns.find((n) => q.includes(n.name.toLowerCase()) || q.includes(n.role.toLowerCase()) || q.includes(n.key));
        if (n) { type = "npc"; id = n.id; }
      }
      if (!type && /weather|rain|time|hour|day|night/.test(q)) type = "world";
      if (!type) return Response.json({ title: "Hm.", lines: ["I'm not sure what you mean. Try 'what's that sheep doing?', 'tell me about the bakery', or 'who is Marigold?'"] });
    }

    if (type === "animal") {
      const [a] = await db.select().from(animals).where(eq(animals.id, id));
      if (!a) return Response.json({ error: "Gone." }, { status: 404 });
      const doing = a.state === "sleep" ? "sleeping" : a.state === "walk" ? "wandering" : a.state === "graze" ? "grazing" : "idling";
      return Response.json({
        title: `${a.name} the ${a.species}`,
        subtitle: `${doing} · ${a.mood}`,
        lines: [
          `Species: ${a.species}`, `Mood: ${a.mood}`, `Hunger: ${a.hunger}/100`, `Last fed: ${ago(a.lastFedAt)}`, `Last petted: ${ago(a.lastPettedAt)}`, `Total pets received: ${a.pets}`,
          `Home range: ${Math.round(a.zone.w / 32)}×${Math.round(a.zone.h / 32)} tiles`,
        ],
        events: await eventsFor("animal", a.id),
        target: { type: "animal", id: a.id, x: a.x, y: a.y },
      });
    }
    if (type === "building") {
      const [b] = await db.select().from(buildings).where(eq(buildings.id, id));
      if (!b) return Response.json({ error: "No such place" }, { status: 404 });
      const sp = b.sponsorId ? (await db.select().from(sponsors).where(eq(sponsors.id, b.sponsorId)))[0] : null;
      const residents = await db.select().from(npcs).where(eq(npcs.buildingId, b.id));
      const lines = [b.description, `Tenant: ${sp && sp.status === "active" ? `${sp.businessName} — “${sp.tagline}”` : b.reservable ? "available for a real business to reserve" : "the village"}`];
      if (b.menu.length) lines.push(`Menu: ${b.menu.join(", ")}`);
      if (residents.length) lines.push(`Residents: ${residents.map((r) => `${r.name} (${r.role})`).join(", ")}`);
      lines.push(`Visits: ${b.visits}`);
      if (sp && sp.status === "active") {
        const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(leads).where(eq(leads.sponsorId, sp.id));
        lines.push(`Codes handed out & chats this month: ${n}`);
        const ms = await db.select().from(missions).where(eq(missions.sponsorId, sp.id));
        if (ms.length) lines.push(`Missions on offer: ${ms.map((m) => m.title).join(", ")}`);
      }
      return Response.json({ title: b.name, subtitle: b.kind, lines, events: await eventsFor("building", b.id), target: { type: "building", id: b.id, key: b.key, reservable: b.reservable && !sp } });
    }
    if (type === "npc") {
      const [n] = await db.select().from(npcs).where(eq(npcs.id, id));
      if (!n) return Response.json({ error: "Nobody" }, { status: 404 });
      const sp = n.sponsorId ? (await db.select().from(sponsors).where(eq(sponsors.id, n.sponsorId)))[0] : null;
      const ms = await db.select().from(missions).where(eq(missions.npcId, n.id));
      return Response.json({
        title: n.name, subtitle: n.role,
        lines: [n.persona, `Mood: ${n.mood}`, `Kind: ${n.kind === "remote" ? "external AI agent (connected over HTTP)" : "village agent"}`, sp ? `Sponsored by ${sp.businessName} — this character hands out missions and also mentions the sponsor's offers in conversation.` : "Unsponsored — a pure character, no pitch.", ms.length ? `Missions: ${ms.map((m) => m.title).join(", ")}` : "No missions right now."],
        events: await eventsFor("npc", n.id),
        target: { type: "npc", id: n.id, x: n.x, y: n.y },
      });
    }
    if (type === "player") {
      const [c] = await db.select().from(characters).where(eq(characters.id, id));
      if (!c) return Response.json({ error: "?" }, { status: 404 });
      return Response.json({ title: c.name, subtitle: `Level ${c.level} villager`, lines: [`Coins: ${c.coins}`, `HP: ${c.hp}/${c.maxHp}`, `Last seen: ${ago(c.lastSeenAt)}`, `Arrived: ${ago(c.createdAt)}`], events: await eventsFor("character", c.id) });
    }
    if (type === "node") {
      const [n] = await db.select().from(resourceNodes).where(eq(resourceNodes.id, id));
      if (!n) return Response.json({ error: "?" }, { status: 404 });
      return Response.json({ title: n.kind.replace("_", " "), lines: [`Yields: ${n.itemKey}`, n.respawnAt ? `Regrowing — ready in ${Math.max(0, Math.ceil((n.respawnAt.getTime() - Date.now()) / 60000))} min` : `${n.qty} left to gather`] });
    }
    if (type === "enemy") {
      const [e] = await db.select().from(enemies).where(eq(enemies.id, id));
      if (!e) return Response.json({ error: "?" }, { status: 404 });
      return Response.json({ title: `Wild ${e.kind}`, lines: [`HP: ${e.hp}/${e.maxHp}`, `Appeared: ${ago(e.spawnedAt)}`, "Click it while standing close to attack."] });
    }
    if (type === "world") {
      const ev = await db.select().from(worldEvents).orderBy(desc(worldEvents.id)).limit(8);
      return Response.json({ title: "The grove", lines: ["A day here lasts 24 real minutes. Weather drifts on its own.", "Animals keep wandering while you're away — check the log."], events: ev.map((e) => ({ text: e.text, when: ago(e.createdAt) })) });
    }
    return Response.json({ error: "Unknown" }, { status: 400 });
  } catch (e) {
    return handleApiError(e);
  }
}
