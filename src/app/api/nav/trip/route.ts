// Admin only (x-admin-token, src/lib/adminAuth.ts): send an NPC on a trip. POST { npcKey, place, learn? }: `place` is a
// place key ("building:inn_hollowmere") or part of its name. An NPC only goes
// where it knows, unless `learn` teaches it the place first.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { npcs } from "@/db/schema";
import { isAdmin, notFound } from "@/lib/adminAuth";
import { allPlaces, knownPlaces, learnPlaces, seedHomeKnowledge } from "@/lib/nav/places";
import { startTrip } from "@/lib/nav/trips";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isAdmin(req)) return notFound();
  const body = await req.json().catch(() => ({}));
  const [n] = await db.select().from(npcs).where(eq(npcs.key, String(body.npcKey ?? "")));
  if (!n) return Response.json({ error: "No such NPC." }, { status: 404 });
  await seedHomeKnowledge(n.id, n.homeX, n.homeY);
  const want = String(body.place ?? "").toLowerCase();
  const place = (await allPlaces()).find((p) => p.key.toLowerCase() === want) ?? (await allPlaces()).find((p) => p.name.toLowerCase().includes(want));
  if (!place) return Response.json({ error: "No such place." }, { status: 404 });
  const known = (await knownPlaces(n.id)).some((p) => p.key === place.key);
  if (!known && !body.learn) return Response.json({ error: `${n.name} doesn't know ${place.name} yet (pass "learn": true to tell them).` }, { status: 400 });
  if (!known) await learnPlaces(n.id, [place.key], "told");
  const r = await startTrip(n.id, place);
  if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
  return Response.json({ ok: true, message: `${n.name} sets off for ${place.name} (${r.tiles} tiles) on the next beat.` });
}
