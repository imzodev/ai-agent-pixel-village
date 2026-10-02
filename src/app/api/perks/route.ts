import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { characterPerks, characters } from "@/db/schema";
import { handleApiError, requireCharacter } from "@/lib/auth";
import { logEvent } from "@/lib/game";
import { PERKS, isPerkKey, perkPoints } from "@/lib/progression";

export const dynamic = "force-dynamic";

/** Pick a perk: { perk }. One point every 5 levels; each perk once. */
export async function POST(req: Request) {
  try {
    const me = await requireCharacter();
    const body = await req.json().catch(() => ({}));
    const perk = String(body.perk ?? "");
    if (!isPerkKey(perk)) return Response.json({ error: "No such perk." }, { status: 400 });
    // Locking the character row serializes picks, so a double click can't
    // spend the same point twice.
    const error = await db.transaction(async (tx) => {
      const [c] = await tx.select({ level: characters.level }).from(characters).where(eq(characters.id, me.id)).for("update");
      const have = await tx.select({ k: characterPerks.perkKey }).from(characterPerks).where(eq(characterPerks.characterId, me.id));
      if (have.some((h) => h.k === perk)) return "You already have that perk.";
      if (have.length >= perkPoints(c?.level ?? 1)) return "No perk points left. You get one every 5 levels.";
      await tx.insert(characterPerks).values({ characterId: me.id, perkKey: perk });
      if (perk === "tough") {
        await tx
          .update(characters)
          .set({ maxHp: sql`${characters.maxHp} + 20`, hp: sql`${characters.hp} + 20` })
          .where(eq(characters.id, me.id));
      }
      return null;
    });
    if (error) return Response.json({ error }, { status: 400 });
    const def = PERKS.find((p) => p.key === perk)!;
    await logEvent("level", `${me.name} became a ${def.name}!`, "character", me.id, me.x, me.y);
    return Response.json({ ok: true, message: `${def.icon} ${def.name}: ${def.description}` });
  } catch (e) {
    return handleApiError(e);
  }
}
