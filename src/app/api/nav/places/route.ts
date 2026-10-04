// Admin only (x-admin-token, src/lib/adminAuth.ts): what an NPC knows and where it's going. GET ?npcKey=baker
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { npcTrips, npcs } from "@/db/schema";
import { isAdmin, notFound } from "@/lib/adminAuth";
import { knownPlaces, seedHomeKnowledge } from "@/lib/nav/places";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAdmin(req)) return notFound();
  const [n] = await db.select().from(npcs).where(eq(npcs.key, new URL(req.url).searchParams.get("npcKey") ?? ""));
  if (!n) return Response.json({ error: "No such NPC." }, { status: 404 });
  await seedHomeKnowledge(n.id, n.homeX, n.homeY);
  const [trip] = await db.select().from(npcTrips).where(eq(npcTrips.npcId, n.id));
  return Response.json({
    npc: n.name,
    known: (await knownPlaces(n.id)).map((p) => ({ key: p.key, name: p.name, kind: p.kind })),
    trip: trip ? { to: trip.destName, status: trip.status, progress: `${trip.idx}/${trip.tiles.length - 1} tiles` } : null,
  });
}
