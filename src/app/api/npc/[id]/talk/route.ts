import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, npcs, worldChat, worldState } from "@/db/schema";
import { handleApiError, requireCharacter } from "@/lib/auth";
import { generateReply } from "@/lib/agent";
import { npcLlmLimiter } from "@/lib/rateLimit";
import { buildOffers, loadSponsor } from "@/lib/offers";
import { emitLead, progressMissions } from "@/lib/game";
import { gameHour } from "@/lib/worldmap";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const character = await requireCharacter();
    const { id } = await ctx.params;
    const history = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.characterId, character.id), eq(conversations.npcId, Number(id))))
      .orderBy(asc(conversations.id))
      .limit(40);
    return Response.json({ history });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await ensureSeeded();
    const character = await requireCharacter();
    const { id } = await ctx.params;
    const [npc] = await db.select().from(npcs).where(eq(npcs.id, Number(id)));
    if (!npc || !npc.active) return Response.json({ error: "Nobody there." }, { status: 404 });
    if (Math.hypot(npc.x - character.x, npc.y - character.y) > 160) {
      return Response.json({ error: "Walk a little closer first." }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const message = String(body.message ?? "").trim().slice(0, 400);

    const history = await db
      .select({ role: conversations.role, text: conversations.text })
      .from(conversations)
      .where(and(eq(conversations.characterId, character.id), eq(conversations.npcId, npc.id)))
      .orderBy(asc(conversations.id))
      .limit(30);

    const offers = await buildOffers(npc, character);
    const sponsor = await loadSponsor(npc);
    const [ws] = await db.select().from(worldState).where(eq(worldState.id, 1));
    const hour = gameHour(ws.epochStart.getTime(), ws.dayLengthMinutes);

    // Soft rate limit on LLM-powered replies per character. The player
    // still gets an answer (scripted) once the cap is hit — this protects
    // the bill, not the gameplay.
    const forceScripted = npc.kind !== "remote" && !npcLlmLimiter.allow(character.id.toString());

    const reply = await generateReply({ npc, sponsor, character, message, history, offers, hour, weather: ws.weather, forceScripted });

    if (message) {
      await db.insert(conversations).values({ characterId: character.id, npcId: npc.id, role: "player", text: message });
    } else if (history.length === 0) {
      await db.insert(conversations).values({ characterId: character.id, npcId: npc.id, role: "player", text: "(waves hello)" });
    }
    await db.insert(conversations).values({ characterId: character.id, npcId: npc.id, role: "npc", text: reply.text });
    await db.insert(worldChat).values({ speakerType: "npc", speakerId: npc.id, text: reply.text.slice(0, 140) });

    // Talking counts for "talk to X" missions.
    await progressMissions(character.id, (r) => r.type === "talk" && r.npcKey === npc.key);
    // First conversation with a sponsored agent is a (free) conversation lead.
    if (sponsor && history.length === 0) {
      await emitLead({ sponsorId: sponsor.id, characterId: character.id, npcId: npc.id, kind: "conversation", note: `${character.name} met ${npc.name}` });
    }
    // Sell offers are player-driven actions, not NPC-driven narrative, so
    // they're always shown regardless of whether the brain mentioned them.
    // Everything else (turnin, mission, gift, discount) is gated on the
    // brain's choice so the panel reflects only what the NPC "said".
    const shown = offers.filter((o) => o.type === "sell" || reply.offerIds.includes(o.id));
    return Response.json({ text: reply.text, offers: shown, source: reply.source, npc: { id: npc.id, name: npc.name, role: npc.role, sponsored: !!sponsor, sponsor: sponsor ? { businessName: sponsor.businessName, brandColor: sponsor.brandColor } : null } });
  } catch (e) {
    return handleApiError(e);
  }
}
