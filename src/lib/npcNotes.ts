// What an NPC remembers about each player: a short private note per
// (NPC, player) pair, rewritten in the background from their conversations.
// Only this player's note goes into this NPC's prompt, never anyone else's.
//
// After a conversation turn, once NOTE_EVERY new lines have piled up since
// the note was last written, one small LLM call folds what the player said
// into the note (never the NPC's own replies, which may be mistaken).
// It runs after the reply has been sent and never delays it; a failure just
// leaves the old note (the lines are folded in next time).

import { and, asc, count, eq, gt, min } from "drizzle-orm";
import { db } from "@/db";
import { conversations, npcPlayerNotes } from "@/db/schema";
import { chatWithFallback } from "@/lib/llm";
import type { NpcMemory } from "@/types/agent";

/** New conversation lines that trigger a rewrite of the note. */
const NOTE_EVERY = 6;
/** The note's length cap, in characters. */
export const NOTE_MAX_CHARS = 500;
/** At most this many new lines are folded in at once. */
const FOLD_MAX_LINES = 40;

const inFlight = new Set<string>();

/** This NPC's memory of this player: their note and how well they know each other. */
export async function memoryOf(npcId: number, characterId: number): Promise<NpcMemory> {
  const [[row], [stats]] = await Promise.all([
    db.select({ note: npcPlayerNotes.note }).from(npcPlayerNotes).where(and(eq(npcPlayerNotes.npcId, npcId), eq(npcPlayerNotes.characterId, characterId))).limit(1),
    db.select({ lines: count(), since: min(conversations.createdAt) }).from(conversations).where(and(eq(conversations.npcId, npcId), eq(conversations.characterId, characterId))),
  ]);
  return { note: row?.note ?? "", lines: Number(stats?.lines ?? 0), firstMetAt: stats?.since ?? null };
}

/**
 * Fold any new conversation lines into the note, in the background (call
 * without awaiting). Does nothing until NOTE_EVERY new lines have built up.
 */
export async function refreshNote(npc: { id: number; name: string; role: string }, character: { id: number; name: string }): Promise<void> {
  const key = `${npc.id}:${character.id}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);
  try {
    const [row] = await db.select().from(npcPlayerNotes).where(and(eq(npcPlayerNotes.npcId, npc.id), eq(npcPlayerNotes.characterId, character.id))).limit(1);
    const since = row?.lastLineId ?? 0;
    const fresh = await db
      .select({ id: conversations.id, role: conversations.role, text: conversations.text })
      .from(conversations)
      .where(and(eq(conversations.npcId, npc.id), eq(conversations.characterId, character.id), gt(conversations.id, since)))
      .orderBy(asc(conversations.id))
      .limit(FOLD_MAX_LINES);
    if (fresh.length < NOTE_EVERY) return;

    // Only the player's own lines: the NPC's past replies may hold mistakes
    // about the world, and a note must never make those stick.
    const said = fresh.filter((l) => l.role !== "npc" && !/^\(.*\)$/.test(l.text.trim())).map((l) => `- ${l.text}`);
    const lastLineId = fresh[fresh.length - 1].id;
    if (said.length === 0) {
      // Nothing they said (just waves): move past these lines, keep the note.
      if (row) await db.update(npcPlayerNotes).set({ lastLineId }).where(and(eq(npcPlayerNotes.npcId, npc.id), eq(npcPlayerNotes.characterId, character.id)));
      return;
    }
    const r = await chatWithFallback([
      {
        role: "system",
        content: `You are ${npc.name}, ${npc.role}. You keep a short private note about ${character.name}, a villager who talks to you. Rewrite the note with what's worth remembering about ${character.name} from what they just said to you: what they told you about themselves, what they asked about or want, what they plan or promised, how they treated you. Keep what still matters from the old note; drop small talk. Only write what they actually said; never guess or invent. Third person, plain sentences, at most ${NOTE_MAX_CHARS} characters. Reply with the note only.`,
      },
      { role: "user", content: `Old note: ${row?.note || "(none yet: you've only just met)"}\n\nWhat ${character.name} said to you since:\n${said.join("\n")}` },
    ], { temperature: 0.3, maxTokens: 220 });
    const note = r?.text.replace(/^["'\s]+|["'\s]+$/g, "").slice(0, NOTE_MAX_CHARS).trim();
    if (!note) return;
    await db
      .insert(npcPlayerNotes)
      .values({ npcId: npc.id, characterId: character.id, note, lastLineId, updatedAt: new Date() })
      .onConflictDoUpdate({ target: [npcPlayerNotes.npcId, npcPlayerNotes.characterId], set: { note, lastLineId, updatedAt: new Date() } });
  } catch (e) {
    console.error("[npc notes] refresh failed:", e instanceof Error ? e.message : e);
  } finally {
    inFlight.delete(key);
  }
}
