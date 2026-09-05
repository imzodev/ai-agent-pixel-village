import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { characterMissions, conversations, missions, npcs } from "@/db/schema";
import { handleApiError, requireCharacter } from "@/lib/auth";
import { buildOffers, loadSponsor } from "@/lib/offers";
import { addItem, emitLead, grantReward, logEvent, removeItem } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const character = await requireCharacter();
    const { id } = await ctx.params;
    const [npc] = await db.select().from(npcs).where(eq(npcs.id, Number(id)));
    if (!npc) return Response.json({ error: "Nobody there." }, { status: 404 });
    const body = await req.json().catch(() => ({}));
    const offerId = String(body.offerId ?? "");
    const offers = await buildOffers(npc, character);
    const offer = offers.find((o) => o.id === offerId);
    if (!offer) return Response.json({ error: "That offer is no longer on the table." }, { status: 400 });

    let text = "";
    const gained: { itemKey: string; qty: number; label?: string }[] = [];

    if (offer.type === "mission") {
      await db.insert(characterMissions).values({ characterId: character.id, missionId: offer.missionId });
      const [m] = await db.select().from(missions).where(eq(missions.id, offer.missionId));
      text = `${npc.name} nods. "${m.description}"`;
      await db.insert(conversations).values({ characterId: character.id, npcId: npc.id, role: "npc", text: `(You accepted: ${m.title})` });
    } else if (offer.type === "turnin") {
      const [m] = await db.select().from(missions).where(eq(missions.id, offer.missionId));
      const [cm] = await db
        .select()
        .from(characterMissions)
        .where(and(eq(characterMissions.characterId, character.id), eq(characterMissions.missionId, m.id), eq(characterMissions.status, "active")));
      if (!cm) return Response.json({ error: "Mission not active." }, { status: 400 });
      if (m.requirement.type === "collect") {
        const ok = await removeItem(character.id, m.requirement.itemKey, m.requirement.qty);
        if (!ok) return Response.json({ error: "You don't have the items anymore." }, { status: 400 });
      }
      await db.update(characterMissions).set({ status: "completed", completedAt: new Date() }).where(eq(characterMissions.id, cm.id));
      await grantReward(character.id, m.reward);
      for (const it of m.reward.items ?? []) gained.push(it);
      text = `${m.completeLine}`;
      await logEvent("mission", `${character.name} completed "${m.title}" for ${npc.name}.`, "npc", npc.id, npc.x, npc.y);
      if (m.sponsorId) await emitLead({ sponsorId: m.sponsorId, characterId: character.id, npcId: npc.id, kind: "mission_completed", note: m.title });
      await db.insert(conversations).values({ characterId: character.id, npcId: npc.id, role: "npc", text: `(Mission complete: ${m.title})` });
    } else if (offer.type === "discount") {
      const sponsor = await loadSponsor(npc);
      if (!sponsor) return Response.json({ error: "Sponsor inactive." }, { status: 400 });
      await addItem(character.id, "discount", 1, {
        sponsorId: sponsor.id,
        business: sponsor.businessName,
        code: sponsor.discountCode,
        text: sponsor.discountText,
        color: sponsor.brandColor,
        website: sponsor.website,
        from: npc.name,
      });
      const lead = await emitLead({ sponsorId: sponsor.id, characterId: character.id, npcId: npc.id, kind: "discount_claimed", code: sponsor.discountCode, note: `${character.name} took the code from ${npc.name}` });
      gained.push({ itemKey: "discount", qty: 1, label: `${sponsor.businessName} — ${sponsor.discountCode}` });
      text = `${npc.name} scribbles on a scrap of paper and presses it into your hand. "${sponsor.discountCode} — ${sponsor.discountText} Don't lose it, love."`;
      await logEvent("lead", `${character.name} took a ${sponsor.businessName} code from ${npc.name}.`, "npc", npc.id, npc.x, npc.y);
      await db.insert(conversations).values({ characterId: character.id, npcId: npc.id, role: "npc", text: `(Gave you code ${sponsor.discountCode}${lead ? "" : " — sponsor paused"})` });
    } else if (offer.type === "gift") {
      await addItem(character.id, offer.itemKey, 1);
      gained.push({ itemKey: offer.itemKey, qty: 1 });
      text = `${npc.name} hands it over with a smile.`;
      await db.insert(conversations).values({ characterId: character.id, npcId: npc.id, role: "npc", text: `(Gave you ${offer.itemKey})` });
    }
    return Response.json({ ok: true, text, gained, offers: await buildOffers(npc, character) });
  } catch (e) {
    return handleApiError(e);
  }
}
