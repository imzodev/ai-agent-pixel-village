import { desc, eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@/db";
import { characters, conversations, groundItems, missions, npcs, sponsors, worldChat, type Appearance, type MissionRequirement, type MissionReward } from "@/db/schema";
import { handleApiError } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { SPAWN, isWalkable } from "@/lib/worldmap";
import { logEvent } from "@/lib/game";

export const dynamic = "force-dynamic";

/**
 * External AI agents connect here over plain HTTP.
 *
 * POST /api/agents            { name, role, persona, greeting, appearance?, webhookUrl?, sponsorToken? }
 *                             -> { agentId, apiKey }   (agent appears in the world as an NPC)
 * GET  /api/agents            Authorization: Bearer <apiKey>  -> my state + nearby players + recent conversation
 * PUT  /api/agents            Authorization: Bearer <apiKey>  { action: "move"|"say"|"offerMission"|"dropItem"|"setWebhook"|"leave", ... }
 *
 * When a player talks to a remote agent, the server POSTs the conversation to `webhookUrl`
 * and expects {"text": "...", "offers": ["<offer id>"]} back within 8s (falls back to the scripted brain).
 */

async function authed(req: Request) {
  const key = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim() || new URL(req.url).searchParams.get("apiKey") || "";
  if (!key) return null;
  const [n] = await db.select().from(npcs).where(eq(npcs.apiKey, key));
  return n ?? null;
}

const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : d);

export async function POST(req: Request) {
  try {
    await ensureSeeded();
    const b = await req.json().catch(() => ({}));
    const name = String(b.name ?? "").trim().slice(0, 30);
    if (!name) return Response.json({ error: "name required" }, { status: 400 });
    let sponsorId: number | null = null;
    let x = SPAWN.x + (Math.random() - 0.5) * 120, y = SPAWN.y + 40;
    if (b.sponsorToken) {
      const [sp] = await db.select().from(sponsors).where(eq(sponsors.ownerToken, String(b.sponsorToken)));
      if (sp) {
        sponsorId = sp.id;
        // replace the sponsor's auto-spawned agent with this remote one
        const [old] = await db.select().from(npcs).where(eq(npcs.sponsorId, sp.id));
        if (old) { x = old.homeX; y = old.homeY; await db.update(npcs).set({ active: false }).where(eq(npcs.id, old.id)); }
      }
    }
    const appearance: Appearance = {
      body: b.appearance?.body === "female" ? "female" : "male",
      skin: hex(b.appearance?.skin, "#e8c39e"), hair: typeof b.appearance?.hair === "string" ? b.appearance.hair : "messy1",
      hairColor: hex(b.appearance?.hairColor, "#4a3020"), shirtColor: hex(b.appearance?.shirtColor, "#5b7db1"), pantsColor: hex(b.appearance?.pantsColor, "#333344"),
    };
    const apiKey = randomBytes(20).toString("hex");
    const [agent] = await db.insert(npcs).values({
      key: `remote_${randomBytes(4).toString("hex")}`,
      name, role: String(b.role ?? "Visitor").slice(0, 40),
      persona: String(b.persona ?? `${name} is a traveler passing through the grove.`).slice(0, 800),
      greeting: String(b.greeting ?? `Hello there! I'm ${name}.`).slice(0, 200),
      x, y, homeX: x, homeY: y, wanderRadius: 150, appearance, sponsorId,
      buildingId: null, kind: "remote", apiKey,
      webhookUrl: typeof b.webhookUrl === "string" && b.webhookUrl.startsWith("http") ? b.webhookUrl : null,
      mood: String(b.mood ?? "curious").slice(0, 30),
    }).returning();
    if (sponsorId) {
      // move sponsored missions over to the new agent
      const [old] = await db.select().from(npcs).where(eq(npcs.sponsorId, sponsorId)).orderBy(desc(npcs.id)).offset(1);
      if (old) await db.update(missions).set({ npcId: agent.id }).where(eq(missions.npcId, old.id));
    }
    await logEvent("agent", `${name} connected to the grove.`, "npc", agent.id, x, y);
    return Response.json({ ok: true, agentId: agent.id, apiKey, hint: "Send Authorization: Bearer <apiKey> to GET/PUT /api/agents" });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function GET(req: Request) {
  try {
    const me = await authed(req);
    if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
    await db.update(npcs).set({ lastSeenAt: new Date() }).where(eq(npcs.id, me.id));
    const players = await db.select({ id: characters.id, name: characters.name, x: characters.x, y: characters.y, level: characters.level, lastSeenAt: characters.lastSeenAt }).from(characters);
    const nearby = players.filter((p) => Date.now() - p.lastSeenAt.getTime() < 60_000 && Math.hypot(p.x - me.x, p.y - me.y) < 300);
    const recent = await db.select().from(conversations).where(eq(conversations.npcId, me.id)).orderBy(desc(conversations.id)).limit(20);
    const myMissions = await db.select().from(missions).where(eq(missions.npcId, me.id));
    return Response.json({ agent: { id: me.id, name: me.name, x: me.x, y: me.y, mood: me.mood, webhookUrl: me.webhookUrl, sponsorId: me.sponsorId }, nearbyPlayers: nearby, recentConversation: recent.reverse(), missions: myMissions });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: Request) {
  try {
    const me = await authed(req);
    if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
    const b = await req.json().catch(() => ({}));
    const action = String(b.action ?? "");
    if (action === "move") {
      const x = Number(b.x), y = Number(b.y);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !isWalkable(x, y)) return Response.json({ error: "not walkable" }, { status: 400 });
      await db.update(npcs).set({ targetX: x, targetY: y, x: Math.hypot(x - me.x, y - me.y) > 400 ? x : me.x, y: Math.hypot(x - me.x, y - me.y) > 400 ? y : me.y, lastSeenAt: new Date() }).where(eq(npcs.id, me.id));
      return Response.json({ ok: true });
    }
    if (action === "say") {
      const text = String(b.text ?? "").trim().slice(0, 140);
      if (!text) return Response.json({ error: "text required" }, { status: 400 });
      await db.insert(worldChat).values({ speakerType: "npc", speakerId: me.id, text });
      return Response.json({ ok: true });
    }
    if (action === "setMood") {
      await db.update(npcs).set({ mood: String(b.mood ?? "curious").slice(0, 30) }).where(eq(npcs.id, me.id));
      return Response.json({ ok: true });
    }
    if (action === "setWebhook") {
      const url = typeof b.webhookUrl === "string" && b.webhookUrl.startsWith("http") ? b.webhookUrl : null;
      await db.update(npcs).set({ webhookUrl: url }).where(eq(npcs.id, me.id));
      return Response.json({ ok: true });
    }
    if (action === "offerMission") {
      const requirement = b.requirement as MissionRequirement;
      const reward = (b.reward ?? { coins: 5 }) as MissionReward;
      if (!requirement || !["collect", "pet", "defeat", "visit", "talk"].includes(requirement.type)) return Response.json({ error: "invalid requirement" }, { status: 400 });
      const [m] = await db.insert(missions).values({
        key: `agent_${me.id}_${randomBytes(3).toString("hex")}`, npcId: me.id,
        title: String(b.title ?? "A small favor").slice(0, 80), description: String(b.description ?? "").slice(0, 300),
        offerLine: String(b.offerLine ?? "Could you help me with something?").slice(0, 300), completeLine: String(b.completeLine ?? "Thank you!").slice(0, 300),
        requirement, reward: { coins: Math.min(50, Number(reward.coins ?? 0)), xp: Math.min(50, Number(reward.xp ?? 10)), items: Array.isArray(reward.items) ? reward.items.slice(0, 3) : [] },
        sponsorId: me.sponsorId, repeatable: !!b.repeatable,
      }).returning();
      return Response.json({ ok: true, missionId: m.id });
    }
    if (action === "dropItem") {
      const itemKey = String(b.itemKey ?? "");
      if (!["berry", "herb", "stone", "mushroom", "honey_bun", "flour", "egg", "wool"].includes(itemKey)) return Response.json({ error: "agents may only drop basic items" }, { status: 400 });
      await db.insert(groundItems).values({ itemKey, qty: 1, x: me.x + (Math.random() - 0.5) * 40, y: me.y + 20 });
      return Response.json({ ok: true });
    }
    if (action === "leave") {
      await db.update(npcs).set({ active: false }).where(eq(npcs.id, me.id));
      await logEvent("agent", `${me.name} left the grove.`, "npc", me.id);
      return Response.json({ ok: true });
    }
    return Response.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return handleApiError(e);
  }
}
