// NPCs answering what a player says out loud (rules: src/lib/npcReact.ts).
// The chat action calls reactToChat in the background after the player's
// line is up: whoever was named (or the nearest NPC, if it cares to) answers
// in a bubble a moment later, and it goes into what they remember of that
// player, so a later talk can come back to it.

import { and, between, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversations, npcs, worldChat } from "@/db/schema";
import { chatWithFallback } from "@/lib/llm";
import { rowPositionAt } from "@/lib/motion";
import { markWorldDirty } from "@/lib/world-stream";
import { knowledgeFor } from "@/lib/npcKnowledge";
import { memoryOf, refreshNote } from "@/lib/npcNotes";
import { gossipFor } from "@/lib/npcTalkServer";
import { REACT_NAMED_PX, cleanReply, planReplies, reactPrompt } from "./npcReact";

const LLM_TIMEOUT_MS = 9000;
/** A second NPC chiming in waits a beat after the first. */
const SECOND_DELAY_MS = 1500;

const g = globalThis as typeof globalThis & { __npcReact?: Map<number, number> };
const lastReply = (g.__npcReact ??= new Map<number, number>());

/** Let the NPCs near (x, y) answer `text`, said out loud by `player`. Never throws. */
export async function reactToChat(player: { id: number; name: string }, text: string, at: { x: number; y: number }, now = Date.now()): Promise<void> {
  try {
    const r = REACT_NAMED_PX;
    const rows = await db.select().from(npcs).where(and(
      eq(npcs.active, true), sql`${npcs.kind} <> 'remote'`,
      between(npcs.x, at.x - r * 2, at.x + r * 2), between(npcs.y, at.y - r * 2, at.y + r * 2),
    ));
    const near = rows.map((n) => { const p = rowPositionAt(n, now); return { row: n, cand: { id: n.id, key: n.key, name: n.name, dist: Math.hypot(p.x - at.x, p.y - at.y) } }; })
      .filter((x) => x.cand.dist <= r);
    const plan = planReplies(text, near.map((x) => x.cand), lastReply, now, Math.random());
    if (!plan.length) return;
    for (const p of plan) lastReply.set(p.npc.id, now); // claimed, even if it lets it pass
    let before: { name: string; text: string } | null = null;
    for (const [i, p] of plan.entries()) {
      const npc = near.find((x) => x.cand.id === p.npc.id)!.row;
      const [memory, gossip] = await Promise.all([memoryOf(npc.id, player.id).catch(() => null), gossipFor(npc.id, player.id).catch(() => [] as string[])]);
      const prompt = reactPrompt(npc, player.name, text, p.addressed, { knowledge: knowledgeFor(npc.key), note: memory?.note || undefined, gossip, before });
      const res = await Promise.race([
        chatWithFallback([{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }], { temperature: 0.9, maxTokens: 400 }).catch(() => null),
        new Promise<null>((res) => setTimeout(() => res(null), LLM_TIMEOUT_MS)),
      ]);
      const reply = cleanReply(res?.text, p.addressed);
      if (!reply) continue;
      if (i > 0) await new Promise((res) => setTimeout(res, SECOND_DELAY_MS));
      await db.insert(worldChat).values({ speakerType: "npc", speakerId: npc.id, text: reply.slice(0, 140) });
      markWorldDirty(at.x, at.y);
      // They remember it, like a talk: "(said out loud)" so the note knows it wasn't one-to-one.
      await db.insert(conversations).values([
        { characterId: player.id, npcId: npc.id, role: "player", text: `(said out loud nearby) ${text}` },
        { characterId: player.id, npcId: npc.id, role: "npc", text: reply },
      ]);
      void refreshNote(npc, player).catch(() => {});
      before = { name: npc.name, text: reply };
    }
  } catch (e) {
    console.warn("[react] chat reply failed:", e instanceof Error ? e.message : e);
  }
}
