// Traits, server side: read a character's origin and traits, choose them
// (once, changeable for the first day; the origin's kit is given only the
// first time), and earn one by finishing a story. Rules: src/lib/traits.ts.

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { characterTraits, characters } from "@/db/schema";
import { addCoins, addItem } from "@/lib/game";
import { HARDY_HP, allTraits, canChoose, choiceProblem, earnedTraitFor, isOriginKey, isTraitKey, originDef, traitDef } from "@/lib/traits";
import type { StoryEventKind } from "@/types/story";
import type { CharacterTraits, OriginKey, TraitKey, TraitsState } from "@/types/traits";

/** A character's origin and traits (one indexed read). */
export async function traitsOf(characterId: number): Promise<CharacterTraits & { chosenAt: number | null }> {
  const rows = await db.select().from(characterTraits).where(eq(characterTraits.characterId, characterId));
  const origin = rows.find((r) => r.kind === "origin" && isOriginKey(r.key));
  return {
    origin: (origin?.key as OriginKey | undefined) ?? null,
    picked: rows.filter((r) => r.kind === "pick" && isTraitKey(r.key)).map((r) => r.key as TraitKey),
    earned: rows.filter((r) => r.kind === "story" && isTraitKey(r.key)).map((r) => r.key as TraitKey),
    chosenAt: origin ? origin.at.getTime() : null,
  };
}

/** Every trait a character has, picked or earned (for the effects). */
export async function traitSet(characterId: number): Promise<Set<TraitKey>> {
  return allTraits(await traitsOf(characterId));
}

/** Does this character have the trait? */
export async function hasTrait(characterId: number, key: TraitKey): Promise<boolean> {
  const [r] = await db.select({ k: characterTraits.key }).from(characterTraits)
    .where(and(eq(characterTraits.characterId, characterId), eq(characterTraits.key, key)));
  return !!r;
}

export async function traitsState(characterId: number): Promise<TraitsState> {
  const t = await traitsOf(characterId);
  return { origin: t.origin, picked: t.picked, earned: t.earned, canChoose: canChoose(t.chosenAt, Date.now()) };
}

/**
 * Choose (or, on the first day, change) the origin and the picked traits.
 * The origin's kit comes with the first choice only. Hardy's HP follows the
 * pick both ways. Serialized on the character row.
 */
export async function chooseTraits(characterId: number, origin: unknown, picks: unknown): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const bad = choiceProblem(origin, picks);
  if (bad) return { ok: false, error: bad };
  const o = origin as OriginKey, p = picks as TraitKey[];
  const r = await db.transaction(async (tx) => {
    await tx.select({ id: characters.id }).from(characters).where(eq(characters.id, characterId)).for("update");
    const rows = await tx.select().from(characterTraits).where(eq(characterTraits.characterId, characterId));
    const prevOrigin = rows.find((x) => x.kind === "origin");
    if (!canChoose(prevOrigin ? prevOrigin.at.getTime() : null, Date.now())) return { error: "Who you are is settled now. Stories can still teach you new traits." };
    const earned = new Set(rows.filter((x) => x.kind === "story").map((x) => x.key));
    if (p.some((k) => earned.has(k))) return { error: "You've already earned that trait." };
    const hadHardy = rows.some((x) => x.key === "hardy" && x.kind === "pick");
    // Replace the origin and picks (earned traits stay); the origin keeps its first time.
    await tx.delete(characterTraits).where(and(eq(characterTraits.characterId, characterId), inArray(characterTraits.kind, ["origin", "pick"])));
    await tx.insert(characterTraits).values([
      { characterId, key: o, kind: "origin" as const, ...(prevOrigin ? { at: prevOrigin.at } : {}) },
      ...p.map((key) => ({ characterId, key, kind: "pick" as const })),
    ]);
    const hp = (p.includes("hardy") ? HARDY_HP : 0) - (hadHardy ? HARDY_HP : 0);
    if (hp) await tx.update(characters).set({ maxHp: sql`${characters.maxHp} + ${hp}`, hp: sql`greatest(1, ${characters.hp} + ${hp})` }).where(eq(characters.id, characterId));
    return { first: !prevOrigin };
  });
  if ("error" in r) return { ok: false, error: r.error! };
  const def = originDef(o);
  if (r.first) {
    if (def.kit.coins) await addCoins(characterId, def.kit.coins);
    for (const it of def.kit.items ?? []) await addItem(characterId, it.itemKey, it.qty);
  }
  return { ok: true, message: `${def.icon} ${def.name}, ${p.map((k) => traitDef(k).name.toLowerCase()).join(" and ")}.${r.first ? " Your kit is in your bag." : ""}` };
}

/** A finished story teaches a trait (from what its chapters asked most). Returns a notice, or null. */
export async function earnTraitFromStory(characterId: number, events: StoryEventKind[]): Promise<string | null> {
  const have = await traitSet(characterId);
  const key = earnedTraitFor(events, have);
  if (!key) return null;
  const added = await db.insert(characterTraits).values({ characterId, key, kind: "story" }).onConflictDoNothing().returning({ k: characterTraits.key });
  if (!added.length) return null;
  if (key === "hardy") await db.update(characters).set({ maxHp: sql`${characters.maxHp} + ${HARDY_HP}`, hp: sql`${characters.hp} + ${HARDY_HP}` }).where(eq(characters.id, characterId));
  const d = traitDef(key);
  return `${d.icon} Your story taught you something: you're ${d.name.toLowerCase()} now. ${d.description}`;
}
