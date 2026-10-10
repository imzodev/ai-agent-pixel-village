import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, npcs, worldChat, worldState } from "@/db/schema";
import { handleApiError, requireCharacter } from "@/lib/auth";
import { generateReply } from "@/lib/agent";
import { npcLlmLimiter } from "@/lib/rateLimit";
import { buildOffers, loadSponsor } from "@/lib/offers";
import { emitLead, progressMissions } from "@/lib/game";
import { gameHour } from "@/lib/worldmap";
import { rowPositionAt } from "@/lib/motion";
import { holdNpc } from "@/lib/moveStore";
import { NPC_TALK_HOLD_MS } from "@/lib/constants";
import { getLivePlayerPosition, markWorldDirty } from "@/lib/world-stream";
import { ensureSeeded } from "@/lib/seed";
import { getContainer } from "@/lib/container";
import { fire as recordSponsorEvent } from "@/services/attributionHooks";
import { tutorialEvent } from "@/lib/tutorialServer";
import { recordCollection } from "@/lib/collectionServer";

import { mindNoteFor } from "@/lib/mind/mindServer";
import type { BrainOutput } from "@/types/agent";
import type { TalkErrorEvent, TalkReply, TalkTextEvent } from "@/types/talk";

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
    // The NPC may be mid-step and the character row can be ~10 s stale:
    // compare where both are right now.
    const npcPos = rowPositionAt(npc, Date.now());
    const me = getLivePlayerPosition(character.id) ?? character;
    if (Math.hypot(npcPos.x - me.x, npcPos.y - me.y) > 160) {
      return Response.json({ error: "Walk a little closer first." }, { status: 400 });
    }
    // Keep the NPC standing still while the conversation lasts.
    const hold = await holdNpc(npc.id, Date.now(), NPC_TALK_HOLD_MS);
    if (hold?.stopped) markWorldDirty(hold.x, hold.y);
    const body = await req.json().catch(() => ({}));
    const message = String(body.message ?? "").trim().slice(0, 400);

    // Everything the reply needs, looked up together (none depends on another).
    const [history, offers, sponsor, [ws], mindNote] = await Promise.all([
      db
        .select({ role: conversations.role, text: conversations.text })
        .from(conversations)
        .where(and(eq(conversations.characterId, character.id), eq(conversations.npcId, npc.id)))
        .orderBy(asc(conversations.id))
        .limit(30),
      buildOffers(npc, character),
      loadSponsor(npc),
      db.select().from(worldState).where(eq(worldState.id, 1)),
      mindNoteFor(npc, character.id, character.name),
    ]);
    const hour = gameHour(ws.epochStart.getTime(), ws.dayLengthMinutes);

    // Soft rate limit on LLM-powered replies per character. The player
    // still gets an answer (scripted) once the cap is hit — this protects
    // the bill, not the gameplay.
    const forceScripted = npc.kind !== "remote" && !npcLlmLimiter.allow(character.id.toString());
    const input = { npc, sponsor, character, message, history, offers, hour, weather: ws.weather, forceScripted, mindNote };

    // After the reply: save it and count the conversation, then the answer body.
    const finish = async (reply: BrainOutput): Promise<TalkReply> => {
      if (message) {
        await db.insert(conversations).values({ characterId: character.id, npcId: npc.id, role: "player", text: message });
      } else if (history.length === 0) {
        await db.insert(conversations).values({ characterId: character.id, npcId: npc.id, role: "player", text: "(waves hello)" });
      }
      await db.insert(conversations).values({ characterId: character.id, npcId: npc.id, role: "npc", text: reply.text });
      await db.insert(worldChat).values({ speakerType: "npc", speakerId: npc.id, text: reply.text.slice(0, 140) });

      // Talking counts for "talk to X" missions, the tutorial, and the book.
      await progressMissions(character.id, (r) => r.type === "talk" && r.npcKey === npc.key);
      const notices: string[] = [];
      const step = await tutorialEvent(character.id, "talk", { npcKey: npc.key });
      if (step) notices.push(step);
      if (await recordCollection(character.id, "npc", npc.key)) notices.push(`📖 You met ${npc.name}.`);
      // Daily quest: talk event.
      const c = getContainer();
      await c.services.quest.recordEvent(character.id, { kind: "talk", payload: { npcKey: npc.key } });
      // Sponsor attribution: approach + dialogue_start + grant brand hat on first visit.
      if (sponsor) {
        await recordSponsorEvent({ attribution: c.services.sponsorAttribution }, {
          sponsorId: sponsor.id,
          characterId: character.id,
          type: history.length === 0 ? "approach" : "dialogue_start",
        });
        if (history.length === 0) {
          const hatKey = `hat_brand_${sponsor.id}`;
          await c.services.cosmetic.grantSponsorHat(character.id, sponsor.id, hatKey, character.userId);
        }
      }
      // First conversation with a sponsored agent is a (free) conversation lead.
      if (sponsor && history.length === 0) {
        await emitLead({ sponsorId: sponsor.id, characterId: character.id, npcId: npc.id, kind: "conversation", note: `${character.name} met ${npc.name}` });
      }
      // Sell offers are player-driven actions, not NPC-driven narrative, so
      // they're always shown regardless of whether the brain mentioned them.
      // Everything else (turnin, mission, gift, discount) is gated on the
      // brain's choice so the panel reflects only what the NPC "said".
      const shown = offers.filter((o) => o.type === "sell" || o.type === "order" || o.type === "deliver" || reply.offerIds.includes(o.id));
      return { text: reply.text, offers: shown, source: reply.source, notices, npc: { id: npc.id, name: npc.name, role: npc.role, sponsored: !!sponsor, sponsor: sponsor ? { businessName: sponsor.businessName, brandColor: sponsor.brandColor } : null } };
    };

    if (!(req.headers.get("accept") ?? "").includes("text/event-stream")) {
      return Response.json(await finish(await generateReply(input)));
    }

    // Streamed: the reply text as MiniMax (or whichever provider) writes it,
    // then the finished answer once it's saved.
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        // A player who closed the panel has gone; keep going (the reply is
        // still saved), just stop writing to them.
        const send = (event: string, data: TalkTextEvent | TalkReply | TalkErrorEvent) => {
          try { controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { /* client gone */ }
        };
        try {
          const reply = await generateReply(input, (text) => send("text", { text }));
          send("done", await finish(reply));
        } catch (e) {
          console.error("talk stream failed", e);
          send("error", { error: "They lost their train of thought. Try again." });
        } finally {
          try { controller.close(); } catch { /* already closed */ }
        }
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        // Don't let a reverse proxy (nginx) hold the stream back.
        "x-accel-buffering": "no",
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
