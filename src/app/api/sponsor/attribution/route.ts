// Sponsor attribution dashboard endpoint. Returns weekly event totals and
// the most recent events for a sponsor, gated by the owner token.

import { NextResponse } from "next/server";
import { getContainer } from "@/lib/container";
import { db } from "@/db";
import { sponsors } from "@/db/schema";
import { eq } from "drizzle-orm";
import { handleApiError } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });
    const [sp] = await db.select().from(sponsors).where(eq(sponsors.ownerToken, token)).limit(1);
    if (!sp) return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    const c = getContainer();
    const [summary, recent] = await Promise.all([
      c.services.sponsorAttribution.weeklySummary(sp.id),
      c.services.sponsorAttribution.recentForSponsor(sp.id, 50),
    ]);
    return NextResponse.json({ sponsorId: sp.id, businessName: sp.businessName, ...summary, recent });
  } catch (e) {
    return handleApiError(e);
  }
}
