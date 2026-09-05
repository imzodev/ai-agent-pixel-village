import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { characterMissions, characters, homeDecor, inventory, items, leads, missions, npcs } from "@/db/schema";
import { getCurrentCharacter, handleApiError } from "@/lib/auth";
import { missionProgressFor, requirementTarget } from "@/lib/game";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSeeded();
    const me = await getCurrentCharacter();
    if (!me) return Response.json({ me: null });
    const [inv, itemDefs, missionRows, decor, myLeads] = await Promise.all([
      db.select().from(inventory).where(eq(inventory.characterId, me.id)).orderBy(inventory.id),
      db.select().from(items),
      db.select({ cm: characterMissions, m: missions, npcName: npcs.name })
        .from(characterMissions)
        .innerJoin(missions, eq(missions.id, characterMissions.missionId))
        .innerJoin(npcs, eq(npcs.id, missions.npcId))
        .where(eq(characterMissions.characterId, me.id))
        .orderBy(desc(characterMissions.id)),
      db.select().from(homeDecor).where(eq(homeDecor.characterId, me.id)),
      db.select().from(leads).where(and(eq(leads.characterId, me.id), eq(leads.kind, "discount_claimed"))),
    ]);
    const defs = new Map(itemDefs.map((d) => [d.key, d]));
    const missionList = [];
    for (const { cm, m, npcName } of missionRows) {
      const progress = cm.status === "active" ? await missionProgressFor(me.id, m.requirement, cm.progress) : requirementTarget(m.requirement);
      missionList.push({ id: cm.id, missionId: m.id, title: m.title, description: m.description, status: cm.status, progress, target: requirementTarget(m.requirement), npcName, npcId: m.npcId, requirement: m.requirement, reward: m.reward, sponsored: !!m.sponsorId });
    }
    return Response.json({
      me,
      inventory: inv.map((i) => ({ ...i, def: defs.get(i.itemKey) ?? null })),
      missions: missionList,
      decor,
      codesClaimed: myLeads.length,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const me = await getCurrentCharacter();
    if (!me) return Response.json({ error: "Not signed in" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const patch: Partial<typeof characters.$inferInsert> = {};
    if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 24);
    if (body.homeTheme && typeof body.homeTheme.wall === "string" && typeof body.homeTheme.floor === "string") patch.homeTheme = { wall: body.homeTheme.wall, floor: body.homeTheme.floor };
    await db.update(characters).set(patch).where(eq(characters.id, me.id));
    return Response.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
