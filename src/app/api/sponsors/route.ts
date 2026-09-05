import { desc, eq, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import Stripe from "stripe";
import { db } from "@/db";
import { buildings, characters, leads, missions, npcs, sponsors, type Appearance } from "@/db/schema";
import { handleApiError } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { buildingDoor } from "@/lib/worldmap";
import { logEvent } from "@/lib/game";

export const dynamic = "force-dynamic";

const PLANS: Record<string, { rentCents: number; leadFeeCents: number; label: string }> = {
  village: { rentCents: 4900, leadFeeCents: 150, label: "Village — $49/mo + $1.50/lead" },
  plaza: { rentCents: 14900, leadFeeCents: 100, label: "Plaza — $149/mo + $1.00/lead" },
};

function stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new Stripe(key) : null;
}

function baseUrl(req: Request) {
  return process.env.NEXT_PUBLIC_BASE_URL || new URL(req.url).origin;
}

const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : d);

/** Reserve a building. Creates the sponsor, spawns its agent, starts Stripe checkout if configured. */
export async function POST(req: Request) {
  try {
    await ensureSeeded();
    const b = await req.json().catch(() => ({}));
    const businessName = String(b.businessName ?? "").trim().slice(0, 60);
    const contactEmail = String(b.contactEmail ?? "").trim().slice(0, 120);
    if (!businessName || !contactEmail.includes("@")) return Response.json({ error: "Business name and a contact email are required." }, { status: 400 });
    const [building] = await db.select().from(buildings).where(eq(buildings.key, String(b.buildingKey)));
    if (!building || !building.reservable) return Response.json({ error: "That building can't be reserved." }, { status: 400 });
    if (building.sponsorId) {
      const [existing] = await db.select().from(sponsors).where(eq(sponsors.id, building.sponsorId));
      if (existing && existing.status === "active") return Response.json({ error: "That building already has a tenant." }, { status: 409 });
    }
    const plan = PLANS[String(b.plan)] ? String(b.plan) : "village";
    const agentName = String(b.agentName ?? "").trim().slice(0, 30) || `${businessName.split(" ")[0]} Rep`;
    const ownerToken = randomBytes(18).toString("hex");
    const s = stripe();
    const [sp] = await db
      .insert(sponsors)
      .values({
        businessName, contactEmail,
        website: String(b.website ?? "").trim().slice(0, 200) || null,
        brandColor: hex(b.brandColor, "#e76f51"),
        tagline: String(b.tagline ?? "").trim().slice(0, 80),
        pitch: String(b.pitch ?? "").trim().slice(0, 400) || `${businessName} is just around the corner and worth a visit.`,
        persona: String(b.persona ?? "").trim().slice(0, 600) || `${agentName} runs ${businessName} in the grove. Friendly, helpful, proud of the shop.`,
        agentName,
        discountCode: String(b.discountCode ?? "").trim().toUpperCase().slice(0, 24) || "GROVE10",
        discountText: String(b.discountText ?? "").trim().slice(0, 140) || `10% off at ${businessName}`,
        buildingId: building.id,
        plan, rentCents: PLANS[plan].rentCents, leadFeeCents: PLANS[plan].leadFeeCents,
        status: s ? "pending" : "active",
        ownerToken,
      })
      .returning();
    await db.update(buildings).set({ sponsorId: sp.id }).where(eq(buildings.id, building.id));

    // Spawn the agent at the building door.
    const door = buildingDoor(building);
    const appearance: Appearance = {
      body: b.appearance?.body === "female" ? "female" : "male",
      skin: hex(b.appearance?.skin, "#f1c9a5"),
      hair: typeof b.appearance?.hair === "string" ? b.appearance.hair : "plain",
      hairColor: hex(b.appearance?.hairColor, "#3b2a1a"),
      shirtColor: hex(b.appearance?.shirtColor, sp.brandColor),
      pantsColor: hex(b.appearance?.pantsColor, "#3a3a4a"),
    };
    // Retire any previous agent for this building
    await db.update(npcs).set({ active: false }).where(eq(npcs.buildingId, building.id));
    const [agent] = await db
      .insert(npcs)
      .values({
        key: `agent_${sp.id}`,
        name: agentName,
        role: `${businessName} ambassador`,
        persona: sp.persona,
        greeting: String(b.greeting ?? "").trim().slice(0, 200) || `Welcome to ${building.name}! I'm ${agentName}. Come in, come in.`,
        x: door.x + 20, y: door.y + 24, homeX: door.x + 20, homeY: door.y + 24,
        wanderRadius: 80,
        appearance,
        sponsorId: sp.id,
        buildingId: building.id,
        kind: "builtin",
        apiKey: randomBytes(16).toString("hex"),
        mood: "welcoming",
      })
      .returning();
    // A starter mission so the agent is useful from the first conversation.
    await db.insert(missions).values({
      key: `visit_${sp.id}`,
      npcId: agent.id,
      title: `Bring ${agentName} a wild herb`,
      description: `${agentName} at ${building.name} would love a fresh herb from the edge of the grove.`,
      offerLine: `If you bring me a fresh wild herb from the edge of the grove, I'll make it worth your while — and tell you a little about what we do here.`,
      completeLine: `Lovely! That's exactly what I needed. Here's a little something for the trouble.`,
      requirement: { type: "collect", itemKey: "herb", qty: 1 },
      reward: { coins: 8, xp: 15, items: [{ itemKey: "lantern", qty: 1 }] },
      sponsorId: sp.id,
      repeatable: false,
    });
    await logEvent("sponsor", `${businessName} moved into ${building.name}. ${agentName} hung up the sign.`, "building", building.id);

    let checkoutUrl: string | null = null;
    if (s) {
      const session = await s.checkout.sessions.create({
        mode: "subscription",
        customer_email: contactEmail,
        line_items: [{
          price_data: { currency: "usd", recurring: { interval: "month" }, unit_amount: sp.rentCents, product_data: { name: `thegrove — ${building.name} rent (${plan})`, description: `Sponsored NPC ${agentName} in ${building.name}. Per-lead fee billed monthly.` } },
          quantity: 1,
        }],
        metadata: { sponsorId: String(sp.id) },
        subscription_data: { metadata: { sponsorId: String(sp.id) } },
        success_url: `${baseUrl(req)}/sponsor/dashboard?token=${ownerToken}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl(req)}/sponsor?cancelled=1`,
      });
      checkoutUrl = session.url;
      await db.update(sponsors).set({ stripeCheckoutId: session.id }).where(eq(sponsors.id, sp.id));
    }
    return Response.json({ ok: true, ownerToken, checkoutUrl, sponsorId: sp.id, status: sp.status, paymentsConfigured: !!s });
  } catch (e) {
    return handleApiError(e);
  }
}

/** Sponsor dashboard data. GET /api/sponsors?token=...  (&session_id= to confirm a checkout) */
export async function GET(req: Request) {
  try {
    await ensureSeeded();
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) {
      // public: list buildings and availability + plans
      const bs = await db.select().from(buildings);
      const sps = await db.select({ id: sponsors.id, status: sponsors.status, businessName: sponsors.businessName }).from(sponsors);
      return Response.json({
        plans: PLANS,
        paymentsConfigured: !!process.env.STRIPE_SECRET_KEY,
        buildings: bs.filter((b) => b.reservable).map((b) => {
          const sp = sps.find((s) => s.id === b.sponsorId);
          return { key: b.key, name: b.name, kind: b.kind, color: b.color, taken: !!sp && sp.status === "active", tenant: sp?.status === "active" ? sp.businessName : null };
        }),
      });
    }
    const [sp] = await db.select().from(sponsors).where(eq(sponsors.ownerToken, token));
    if (!sp) return Response.json({ error: "Invalid token" }, { status: 404 });
    const sessionId = url.searchParams.get("session_id");
    const s = stripe();
    if (sessionId && s && sp.status === "pending") {
      const session = await s.checkout.sessions.retrieve(sessionId).catch(() => null);
      if (session && (session.payment_status === "paid" || session.status === "complete")) {
        await db.update(sponsors).set({ status: "active", stripeCustomerId: typeof session.customer === "string" ? session.customer : null, stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : null }).where(eq(sponsors.id, sp.id));
        sp.status = "active";
      }
    }
    const [building] = sp.buildingId ? await db.select().from(buildings).where(eq(buildings.id, sp.buildingId)) : [null];
    const [agent] = await db.select().from(npcs).where(eq(npcs.sponsorId, sp.id));
    const leadRows = await db.select({ lead: leads, playerName: characters.name, playerLevel: characters.level }).from(leads).innerJoin(characters, eq(characters.id, leads.characterId)).where(eq(leads.sponsorId, sp.id)).orderBy(desc(leads.id)).limit(200);
    const ms = await db.select().from(missions).where(eq(missions.sponsorId, sp.id));
    const [{ fees }] = await db.select({ fees: sql<number>`coalesce(sum(${leads.feeCents}), 0)::int` }).from(leads).where(eq(leads.sponsorId, sp.id));
    return Response.json({
      sponsor: { ...sp, ownerToken: undefined },
      building, agent: agent ? { id: agent.id, name: agent.name, role: agent.role, kind: agent.kind, apiKey: agent.apiKey, webhookUrl: agent.webhookUrl, x: agent.x, y: agent.y } : null,
      leads: leadRows.map((r) => ({ ...r.lead, playerName: r.playerName, playerLevel: r.playerLevel })),
      missions: ms,
      billing: { rentCents: sp.rentCents, leadFeeCents: sp.leadFeeCents, leadFeesCents: fees, totalCents: sp.rentCents + fees, plan: PLANS[sp.plan]?.label ?? sp.plan },
      paymentsConfigured: !!s,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

/** Update persona/pitch/code or point the agent at an external webhook. */
export async function PATCH(req: Request) {
  try {
    const b = await req.json().catch(() => ({}));
    const [sp] = await db.select().from(sponsors).where(eq(sponsors.ownerToken, String(b.token ?? "")));
    if (!sp) return Response.json({ error: "Invalid token" }, { status: 404 });
    const patch: Partial<typeof sponsors.$inferInsert> = {};
    for (const k of ["pitch", "persona", "tagline", "discountCode", "discountText", "website"] as const) {
      if (typeof b[k] === "string") patch[k] = b[k].trim().slice(0, 600);
    }
    if (typeof b.brandColor === "string") patch.brandColor = hex(b.brandColor, sp.brandColor);
    if (b.status === "cancelled") patch.status = "cancelled";
    await db.update(sponsors).set(patch).where(eq(sponsors.id, sp.id));
    const npcPatch: Partial<typeof npcs.$inferInsert> = {};
    if (patch.persona) npcPatch.persona = patch.persona;
    if (typeof b.webhookUrl === "string") npcPatch.webhookUrl = b.webhookUrl.trim() || null;
    if (typeof b.webhookUrl === "string") npcPatch.kind = b.webhookUrl.trim() ? "remote" : "builtin";
    if (typeof b.agentName === "string" && b.agentName.trim()) npcPatch.name = b.agentName.trim().slice(0, 30);
    if (Object.keys(npcPatch).length) await db.update(npcs).set(npcPatch).where(eq(npcs.sponsorId, sp.id));
    if (patch.status === "cancelled") {
      await db.update(npcs).set({ active: false }).where(eq(npcs.sponsorId, sp.id));
      if (sp.buildingId) await db.update(buildings).set({ sponsorId: null }).where(eq(buildings.id, sp.buildingId));
      const s = stripe();
      if (s && sp.stripeSubscriptionId) await s.subscriptions.cancel(sp.stripeSubscriptionId).catch(() => null);
    }
    return Response.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
