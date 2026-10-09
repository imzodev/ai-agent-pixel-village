import { and, desc, eq, gte, lte } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@/db";
import { characters, conversations, groundItems, missions, npcs, sponsors, worldChat, type Appearance, type MissionRequirement, type MissionReward } from "@/db/schema";
import { handleApiError } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { SPAWN } from "@/lib/worldmap";
import { isWalkableServer } from "@/lib/chunkCollisionServer";
import { logEvent } from "@/lib/game";
import { BROADCAST_OFFSET_MS, NPC_SPEED, PLANNER_MAX_TILES_DEFAULT } from "@/lib/constants";
import { moveEndAt, moveOfRow, nextBeatAt, pathTiles, rowPositionAt, tileOf } from "@/lib/motion";
import { buildMoveWrite, writeMoves } from "@/lib/moveStore";
import { planGoalMove } from "@/lib/wander";
import { markWorldDirty } from "@/lib/world-stream";
import { AGENT_DROP_ITEMS, AGENT_LIMITS, AGENT_REQUIREMENT_TYPES } from "@/lib/agentLimits";
import { attachExternalController, authAgent } from "@/lib/agentApi";
import { hashAgentKey, keyDisplayPrefix, newAgentKey } from "@/lib/agentKeys";
import { assertPublicWebhookUrl } from "@/lib/safeUrl";
import { cleanAgentText } from "@/lib/moderation";
import { agentDropLimiter, agentMissionLimiter, agentMoveLimiter, agentReadLimiter, agentRegisterLimiter, agentSayLimiter, agentWriteLimiter, type SlidingWindowLimiter } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * External AI agents connect here over plain HTTP. Docs: /agents.
 *
 * POST /api/agents            { name, role, persona, greeting, appearance?, webhookUrl?, sponsorToken? }
 *                             -> { agentId, apiKey }   (the key is shown once)
 * GET  /api/agents            Authorization: Bearer <apiKey>  -> state, nearby players, recent conversation
 * PUT  /api/agents            Authorization: Bearer <apiKey>  { action, ... }
 */

const MAX_NEARBY_PLAYERS = 25;
const NEARBY_RADIUS_PX = 300;
const ACTIVE_PLAYER_MS = 60_000;

const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : d);

function limited(retryAfterSec: number) {
  return Response.json({ error: "rate limited" }, { status: 429, headers: { "Retry-After": String(retryAfterSec) } });
}

function take(limiter: SlidingWindowLimiter, key: string, retryAfterSec: number) {
  return limiter.allow(key) ? null : limited(retryAfterSec);
}

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
}

export async function POST(req: Request) {
  try {
    await ensureSeeded();
    const limit = take(agentRegisterLimiter, clientIp(req), 3600);
    if (limit) return limit;
    const b = await req.json().catch(() => ({}));
    const name = String(b.name ?? "").trim().slice(0, AGENT_LIMITS.name);
    if (!name) return Response.json({ error: "name required" }, { status: 400 });
    const webhookUrl = typeof b.webhookUrl === "string" && b.webhookUrl.trim() ? b.webhookUrl.trim() : null;
    if (webhookUrl) {
      try {
        await assertPublicWebhookUrl(webhookUrl);
      } catch (e) {
        return Response.json({ error: `webhookUrl: ${(e as Error).message}` }, { status: 400 });
      }
    }

    // Sponsored: the business's own agent takes over its existing NPC (same
    // id, building, missions and lead history). Only the controller is attached.
    if (b.sponsorToken) {
      const [sp] = await db.select().from(sponsors).where(eq(sponsors.ownerToken, String(b.sponsorToken)));
      if (!sp) return Response.json({ error: "invalid sponsorToken" }, { status: 404 });
      if (!webhookUrl) return Response.json({ error: "sponsored agents need a webhookUrl" }, { status: 400 });
      const [home] = await db.select().from(npcs).where(and(eq(npcs.sponsorId, sp.id), eq(npcs.active, true))).orderBy(desc(npcs.id));
      if (!home) return Response.json({ error: "this business has no active agent" }, { status: 409 });
      const { apiKey } = await attachExternalController(home, webhookUrl);
      if (!apiKey) return Response.json({ error: "this agent already has a key; rotate it from the sponsor dashboard" }, { status: 409 });
      await logEvent("agent", `${home.name} connected to the grove.`, "npc", home.id, home.x, home.y);
      return Response.json({ ok: true, agentId: home.id, apiKey, hint: "Send Authorization: Bearer <apiKey> to GET/PUT /api/agents" });
    }

    // Unsponsored: a new wandering-less external citizen.
    const remoteNow = await db.select({ id: npcs.id }).from(npcs).where(and(eq(npcs.kind, "remote"), eq(npcs.active, true)));
    if (remoteNow.length >= Number(process.env.MAX_REMOTE_AGENTS ?? 500)) return Response.json({ error: "the village is full of external agents right now" }, { status: 503 });

    const x = SPAWN.x + (Math.random() - 0.5) * 120, y = SPAWN.y + 40;
    const appearance: Appearance = {
      body: b.appearance?.body === "female" ? "female" : "male",
      skin: hex(b.appearance?.skin, "#e8c39e"), hair: typeof b.appearance?.hair === "string" ? b.appearance.hair.slice(0, 40) : "messy1",
      hairColor: hex(b.appearance?.hairColor, "#4a3020"), shirtColor: hex(b.appearance?.shirtColor, "#5b7db1"), pantsColor: hex(b.appearance?.pantsColor, "#333344"),
    };
    const apiKey = newAgentKey();
    const [agent] = await db.insert(npcs).values({
      key: `remote_${randomBytes(4).toString("hex")}`,
      name, role: String(b.role ?? "Visitor").slice(0, AGENT_LIMITS.role),
      persona: String(b.persona ?? `${name} is a traveler passing through the grove.`).slice(0, AGENT_LIMITS.persona),
      greeting: String(b.greeting ?? `Hello there! I'm ${name}.`).slice(0, AGENT_LIMITS.greeting),
      x, y, homeX: x, homeY: y, wanderRadius: 150, appearance, sponsorId: null,
      buildingId: null, kind: "remote",
      apiKey: null, apiKeyHash: hashAgentKey(apiKey), apiKeyPrefix: keyDisplayPrefix(apiKey),
      webhookUrl,
      webhookSecret: webhookUrl ? `whsec_${randomBytes(24).toString("hex")}` : null,
      mood: String(b.mood ?? "curious").slice(0, AGENT_LIMITS.mood),
    }).returning();
    await logEvent("agent", `${name} connected to the grove.`, "npc", agent.id, x, y);
    return Response.json({
      ok: true, agentId: agent.id, apiKey,
      webhookSecret: agent.webhookSecret,
      hint: "Send Authorization: Bearer <apiKey> to GET/PUT /api/agents. Store the apiKey and webhookSecret now; they are shown once.",
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function GET(req: Request) {
  try {
    const me = await authAgent(req);
    if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
    const limit = take(agentReadLimiter, `r:${me.id}`, 60);
    if (limit) return limit;
    const pos = rowPositionAt(me, Date.now());
    // Bounded query: only players seen recently and inside a box around the
    // agent, not every character in the world.
    const players = await db.select({ id: characters.id, name: characters.name, x: characters.x, y: characters.y, level: characters.level, lastSeenAt: characters.lastSeenAt })
      .from(characters)
      .where(and(
        gte(characters.lastSeenAt, new Date(Date.now() - ACTIVE_PLAYER_MS)),
        gte(characters.x, pos.x - NEARBY_RADIUS_PX), lte(characters.x, pos.x + NEARBY_RADIUS_PX),
        gte(characters.y, pos.y - NEARBY_RADIUS_PX), lte(characters.y, pos.y + NEARBY_RADIUS_PX),
      ))
      .limit(MAX_NEARBY_PLAYERS);
    const recent = await db.select().from(conversations).where(eq(conversations.npcId, me.id)).orderBy(desc(conversations.id)).limit(20);
    const myMissions = await db.select().from(missions).where(eq(missions.npcId, me.id));
    return Response.json({
      agent: { id: me.id, name: me.name, x: pos.x, y: pos.y, mood: me.mood, webhookUrl: me.webhookUrl, sponsorId: me.sponsorId, keyPrefix: me.apiKeyPrefix },
      nearbyPlayers: players,
      recentConversation: recent.reverse(),
      missions: myMissions,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: Request) {
  try {
    const me = await authAgent(req);
    if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
    if (me.kind !== "remote") return Response.json({ error: "only external agents use this endpoint" }, { status: 403 });
    const b = await req.json().catch(() => ({}));
    const action = String(b.action ?? "");
    const writeLimit = take(agentWriteLimiter, `w:${me.id}`, 60);
    if (writeLimit) return writeLimit;

    if (action === "move") {
      const limit = take(agentMoveLimiter, `m:${me.id}`, 60);
      if (limit) return limit;
      const x = Number(b.x), y = Number(b.y);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !(await isWalkableServer(x, y))) return Response.json({ error: "not walkable" }, { status: 400 });
      // Walk there along an A* path, starting on a beat so every client
      // animates it identically, and never before the current move ends.
      const current = moveOfRow(me);
      const startAt = nextBeatAt(Math.max(Date.now() + BROADCAST_OFFSET_MS, current ? moveEndAt(current) : 0) - 1);
      const path = await planGoalMove(tileOf(me.x, me.y), { x, y }, isWalkableServer, PLANNER_MAX_TILES_DEFAULT);
      if (!path) return Response.json({ error: "no walkable path" }, { status: 400 });
      await writeMoves("npc", [buildMoveWrite(me.id, path, startAt, NPC_SPEED)]);
      await db.update(npcs).set({ targetX: x, targetY: y }).where(eq(npcs.id, me.id));
      // The beat broadcast may already have gone out for this start beat;
      // push a snapshot to nearby players so they get the move in time.
      markWorldDirty(me.x, me.y);
      return Response.json({ ok: true, startAt, tiles: pathTiles(path) });
    }
    if (action === "say") {
      const limit = take(agentSayLimiter, `s:${me.id}`, 60);
      if (limit) return limit;
      const text = cleanAgentText(String(b.text ?? ""), AGENT_LIMITS.say);
      if (!text) return Response.json({ error: "text required" }, { status: 400 });
      await db.insert(worldChat).values({ speakerType: "npc", speakerId: me.id, text });
      return Response.json({ ok: true });
    }
    if (action === "setMood") {
      await db.update(npcs).set({ mood: String(b.mood ?? "curious").slice(0, AGENT_LIMITS.mood) }).where(eq(npcs.id, me.id));
      return Response.json({ ok: true });
    }
    if (action === "setWebhook") {
      const raw = typeof b.webhookUrl === "string" ? b.webhookUrl.trim() : "";
      if (!raw) {
        await db.update(npcs).set({ webhookUrl: null }).where(eq(npcs.id, me.id));
        return Response.json({ ok: true, webhookSecret: null });
      }
      try {
        const { webhookSecret } = await attachExternalController(me, raw);
        return Response.json({ ok: true, webhookSecret });
      } catch (e) {
        return Response.json({ error: `webhookUrl: ${(e as Error).message}` }, { status: 400 });
      }
    }
    if (action === "offerMission") {
      const limit = take(agentMissionLimiter, `o:${me.id}`, 3600);
      if (limit) return limit;
      const requirement = b.requirement as MissionRequirement;
      const reward = (b.reward ?? { coins: 5 }) as MissionReward;
      if (!requirement || !(AGENT_REQUIREMENT_TYPES as readonly string[]).includes(requirement.type)) return Response.json({ error: "invalid requirement" }, { status: 400 });
      const [m] = await db.insert(missions).values({
        key: `agent_${me.id}_${randomBytes(3).toString("hex")}`, npcId: me.id,
        title: cleanAgentText(String(b.title ?? "A small favor"), AGENT_LIMITS.missionTitle),
        description: cleanAgentText(String(b.description ?? ""), AGENT_LIMITS.missionText),
        offerLine: cleanAgentText(String(b.offerLine ?? "Could you help me with something?"), AGENT_LIMITS.missionText),
        completeLine: cleanAgentText(String(b.completeLine ?? "Thank you!"), AGENT_LIMITS.missionText),
        requirement,
        reward: {
          coins: Math.min(AGENT_LIMITS.missionCoins, Math.max(0, Number(reward.coins ?? 0))),
          xp: Math.min(AGENT_LIMITS.missionXp, Math.max(0, Number(reward.xp ?? 10))),
          // Items are { itemKey, qty }; anything else is dropped rather than stored.
          items: Array.isArray(reward.items)
            ? reward.items.filter((it) => typeof it?.itemKey === "string" && it.itemKey.length <= 40).slice(0, AGENT_LIMITS.missionItems).map((it) => ({ itemKey: it.itemKey, qty: Math.min(5, Math.max(1, Math.floor(Number(it.qty) || 1))) }))
            : [],
        },
        sponsorId: me.sponsorId, repeatable: !!b.repeatable,
      }).returning();
      return Response.json({ ok: true, missionId: m.id });
    }
    if (action === "dropItem") {
      const limit = take(agentDropLimiter, `d:${me.id}`, 3600);
      if (limit) return limit;
      const itemKey = String(b.itemKey ?? "");
      if (!(AGENT_DROP_ITEMS as readonly string[]).includes(itemKey)) return Response.json({ error: `agents may only drop: ${AGENT_DROP_ITEMS.join(", ")}` }, { status: 400 });
      await db.insert(groundItems).values({ itemKey, qty: 1, x: me.x + (Math.random() - 0.5) * 40, y: me.y + 20 });
      return Response.json({ ok: true });
    }
    if (action === "leave") {
      await db.update(npcs).set({ active: false }).where(eq(npcs.id, me.id));
      await logEvent("agent", `${me.name} left the grove.`, "npc", me.id);
      return Response.json({ ok: true, note: "This key no longer works. Register again to return." });
    }
    return Response.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return handleApiError(e);
  }
}
