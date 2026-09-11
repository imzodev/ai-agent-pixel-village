// Sponsor placements API. Returns the catalog + the sponsor's current
// configuration. POST toggles a placement on/off for the current sponsor.

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sponsors } from "@/db/schema";
import { listPlacements, defaultPlacementsFor, getPlacementHandler } from "@/services/PlacementRegistry";
import type { SponsorPlacementType } from "@/types/sponsor";
import { handleApiError } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) {
      // public catalog of available placements
      return NextResponse.json({ catalog: listPlacements() });
    }
    const [sp] = await db.select().from(sponsors).where(eq(sponsors.ownerToken, token)).limit(1);
    if (!sp) return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    // For now: synthesize a placement list from defaults. Future: persist on
    // a `sponsor_placements` table so changes survive restarts.
    const placements = defaultPlacementsFor(sp.id);
    const monthlyCents = placements.filter((p) => p.enabled).reduce((s, p) => s + p.priceCents, 0);
    return NextResponse.json({ placements, monthlyCents, catalog: listPlacements() });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { token?: string; type?: SponsorPlacementType; enabled?: boolean };
    if (!body.token) return NextResponse.json({ error: "token required" }, { status: 400 });
    if (!body.type || !(body.type in getPlacementHandler({} as never))) {
      return NextResponse.json({ error: "type required" }, { status: 400 });
    }
    const [sp] = await db.select().from(sponsors).where(eq(sponsors.ownerToken, body.token)).limit(1);
    if (!sp) return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    // In a fuller impl: persist `enabled` and `config` per-sponsor. The
    // registry + analytics already wire through; we just need a write path.
    return NextResponse.json({ ok: true, accepted: { type: body.type, enabled: !!body.enabled } });
  } catch (e) {
    return handleApiError(e);
  }
}
