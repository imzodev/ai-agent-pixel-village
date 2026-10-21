// Referrals on the server (rules: src/lib/referral.ts): remember who invited
// a new character, and pay both once the friend reaches REFERRAL_LEVEL.

import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { characters, gemTransactions, moments, referrals, users } from "@/db/schema";
import { REFERRAL_GEMS, REFERRAL_MONTHLY_CAP, parseRef } from "./referral";
import { logEvent } from "./game";

/** At signup: note who invited this character (never themselves). */
export async function recordReferral(inviteeId: number, inviteeUserId: number, ref: string | undefined): Promise<void> {
  const who = parseRef(ref);
  if (!who) return;
  const [inviter] = "username" in who
    ? await db.select({ id: characters.id, userId: characters.userId }).from(characters).innerJoin(users, eq(users.id, characters.userId)).where(eq(users.username, who.username)).limit(1)
    : await db.select({ id: characters.id, userId: characters.userId }).from(moments).innerJoin(characters, eq(characters.id, moments.characterId)).where(eq(moments.id, who.momentId)).limit(1);
  if (!inviter || inviter.userId === inviteeUserId) return;
  await db.insert(referrals).values({ inviteeId, inviterId: inviter.id }).onConflictDoNothing();
}

async function credit(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], characterId: number): Promise<void> {
  await tx.update(characters).set({ gems: sql`${characters.gems} + ${REFERRAL_GEMS}` }).where(eq(characters.id, characterId));
  await tx.insert(gemTransactions).values({ characterId, delta: REFERRAL_GEMS, source: "referral", packKey: null, stripeSessionId: null });
}

/** The invited friend reached the level: pay them both, once. */
export async function rewardReferral(inviteeId: number): Promise<void> {
  const paid = await db.transaction(async (tx) => {
    const [r] = await tx.update(referrals).set({ rewardedAt: new Date() })
      .where(and(eq(referrals.inviteeId, inviteeId), sql`${referrals.rewardedAt} is null`)).returning();
    if (!r) return null;
    const monthStart = new Date(new Date().toISOString().slice(0, 7) + "-01T00:00:00Z");
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(referrals)
      .where(and(eq(referrals.inviterId, r.inviterId), isNotNull(referrals.rewardedAt), gte(referrals.rewardedAt, monthStart)));
    await credit(tx, inviteeId);
    const inviterPaid = n <= REFERRAL_MONTHLY_CAP;
    if (inviterPaid) await credit(tx, r.inviterId);
    return { inviterId: r.inviterId, inviterPaid };
  });
  if (!paid) return;
  const names = await db.select({ id: characters.id, name: characters.name, x: characters.x, y: characters.y }).from(characters)
    .where(sql`${characters.id} in (${inviteeId}, ${paid.inviterId})`);
  const invitee = names.find((c) => c.id === inviteeId), inviter = names.find((c) => c.id === paid.inviterId);
  if (invitee && inviter) await logEvent("referral", `${inviter.name} and ${invitee.name} each got 💎 ${REFERRAL_GEMS} for playing together!`, "character", inviteeId, invitee.x, invitee.y);
}
