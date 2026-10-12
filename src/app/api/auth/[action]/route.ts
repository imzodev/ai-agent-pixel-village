import { eq } from "drizzle-orm";
import { db } from "@/db";
import { characters, inventory, users, type Appearance } from "@/db/schema";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { SPAWN } from "@/lib/worldmap";
import { addItem, logEvent } from "@/lib/game";
import { pickShardForPosition } from "@/lib/shards";
import { nameProblem } from "@/lib/moderation";
import { clientIp, loginFailLimiter, loginIpLimiter, signupIpLimiter } from "@/lib/rateLimit";
import { cookies } from "next/headers";
import { track, markActive } from "@/lib/track";
import { REF_COOKIE } from "@/lib/site";

export const dynamic = "force-dynamic";

const HAIRS = ["plain", "bob", "spiked", "messy1", "long", "bangs", "afro", "buzzcut", "bedhead", "cowlick"];

function cleanAppearance(a: Partial<Appearance> | undefined): Appearance {
  const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : d);
  return {
    body: a?.body === "female" ? "female" : "male",
    skin: hex(a?.skin, "#f1c9a5"),
    hair: HAIRS.includes(a?.hair ?? "") ? (a!.hair as string) : "plain",
    hairColor: hex(a?.hairColor, "#5a3a1a"),
    shirtColor: hex(a?.shirtColor, "#4a7c59"),
    pantsColor: hex(a?.pantsColor, "#3a3a4a"),
  };
}

export async function POST(req: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  await ensureSeeded();
  if (action === "logout") {
    await destroySession();
    return Response.json({ ok: true });
  }
  const body = await req.json().catch(() => ({}));
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (username.length < 3 || username.length > 24 || !/^[a-z0-9_]+$/.test(username)) return Response.json({ error: "Username must be 3–24 chars, letters/numbers/underscore." }, { status: 400 });
  const ip = clientIp(req);
  const slowDown = () => Response.json({ error: "Too many tries. Please wait a few minutes and try again." }, { status: 429 });

  if (action === "signup") {
    if (ip && !signupIpLimiter.allow(ip)) return slowDown();
    if (password.length < 8) return Response.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    const name = String(body.name ?? "").trim().replace(/\s+/g, " ").slice(0, 24) || username;
    // Names show in the world, on public profiles and on share cards.
    const bad = nameProblem(username) ?? nameProblem(name);
    if (bad) return Response.json({ error: bad }, { status: 400 });
    const [existing] = await db.select().from(users).where(eq(users.username, username));
    if (existing) return Response.json({ error: "That username is taken." }, { status: 409 });
    const [user] = await db.insert(users).values({ username, passwordHash: hashPassword(password) }).returning();
    const [ch] = await db
      .insert(characters)
      .values({ userId: user.id, name, appearance: cleanAppearance(body.appearance), x: SPAWN.x + (Math.random() - 0.5) * 60, y: SPAWN.y })
      .returning();
    await addItem(ch.id, "berry", 2);
    // A starter sword in hand: the tutorial sends you past slimes and night-time wisps.
    const sword = await addItem(ch.id, "wooden_sword", 1);
    await db.update(inventory).set({ equipped: true }).where(eq(inventory.id, sword));
    await logEvent("arrival", `${name} arrived in the grove.`, "character", ch.id, ch.x, ch.y);
    await createSession(user.id, pickShardForPosition(ch.x, ch.y));
    // Did they arrive through a shared moment or profile? (set by RefMark)
    const ref = (await cookies()).get(REF_COOKIE)?.value;
    track("signup", ch.id, ref ? { ref: ref.slice(0, 40) } : {});
    markActive(ch.id);
    return Response.json({ ok: true, character: ch });
  }
  if (action === "login") {
    if ((ip && !loginIpLimiter.allow(ip)) || loginFailLimiter.remaining(username) === 0) return slowDown();
    const [user] = await db.select().from(users).where(eq(users.username, username));
    if (!user || !verifyPassword(password, user.passwordHash)) {
      loginFailLimiter.allow(username); // counts failures only
      return Response.json({ error: "Wrong username or password." }, { status: 401 });
    }
    if (user.bannedAt) return Response.json({ error: "This account has been suspended." }, { status: 403 });
    // Pick a shard based on the user's last known position. Single-process
    // deployments have one region and always return "0", which the LB
    // ignores. Multi-process deployments route by this cookie.
    const [ch] = await db.select({ id: characters.id, x: characters.x, y: characters.y }).from(characters).where(eq(characters.userId, user.id)).limit(1);
    if (ch) track("login", ch.id);
    await createSession(user.id, ch ? pickShardForPosition(ch.x, ch.y) : "0");
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Unknown action" }, { status: 404 });
}
