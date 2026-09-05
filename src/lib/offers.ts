import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { characterMissions, conversations, inventory, missions, npcs, sponsors, type characters } from "@/db/schema";
import { missionProgressFor, requirementTarget } from "./game";
import type { Offer } from "./agent";

type Npc = typeof npcs.$inferSelect;
type Character = typeof characters.$inferSelect;

const FIRST_MEETING_GIFTS: Record<string, { itemKey: string; line: string }> = {
  herbalist: { itemKey: "herb", line: "Here — a sprig of mint, so you know what you're looking for." },
  baker: { itemKey: "honey_bun", line: "First visit? Then this honey bun is on the house." },
  orphan: { itemKey: "berry", line: "You can have one of my berries. I have lots. Well, some." },
};

export async function loadSponsor(npc: Npc) {
  if (!npc.sponsorId) return null;
  const [sp] = await db.select().from(sponsors).where(eq(sponsors.id, npc.sponsorId));
  return sp && sp.status === "active" ? sp : null;
}

export async function buildOffers(npc: Npc, character: Character): Promise<Offer[]> {
  const offers: Offer[] = [];
  const npcMissions = await db.select().from(missions).where(and(eq(missions.npcId, npc.id), eq(missions.active, true)));
  const mine = await db.select().from(characterMissions).where(eq(characterMissions.characterId, character.id));
  let offeredOne = false;
  for (const m of npcMissions) {
    const active = mine.find((cm) => cm.missionId === m.id && cm.status === "active");
    const completedBefore = mine.some((cm) => cm.missionId === m.id && cm.status === "completed");
    if (active) {
      const progress = await missionProgressFor(character.id, m.requirement, active.progress);
      if (progress >= requirementTarget(m.requirement)) {
        offers.push({ id: `turnin:${m.id}`, type: "turnin", missionId: m.id, label: `Turn in: ${m.title}`, line: m.completeLine });
      }
    } else if ((!completedBefore || m.repeatable) && !offeredOne) {
      offers.push({ id: `mission:${m.id}`, type: "mission", missionId: m.id, label: `Accept mission: ${m.title}`, line: m.offerLine });
      offeredOne = true;
    }
  }
  const sponsor = await loadSponsor(npc);
  if (sponsor) {
    const [has] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(inventory)
      .where(and(eq(inventory.characterId, character.id), eq(inventory.itemKey, "discount"), sql`${inventory.meta}->>'sponsorId' = ${String(sponsor.id)}`));
    if (!has || has.n === 0) {
      offers.push({ id: `discount:${sponsor.id}`, type: "discount", label: `Take the ${sponsor.businessName} code`, line: sponsor.pitch });
    }
  }
  const gift = FIRST_MEETING_GIFTS[npc.key];
  if (gift) {
    const [c] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(conversations)
      .where(and(eq(conversations.characterId, character.id), eq(conversations.npcId, npc.id), eq(conversations.text, `(Gave you ${gift.itemKey})`)));
    if (!c || c.n === 0) offers.push({ id: `gift:${gift.itemKey}`, type: "gift", itemKey: gift.itemKey, label: `Accept ${gift.itemKey.replace("_", " ")}`, line: gift.line });
  }
  return offers;
}
