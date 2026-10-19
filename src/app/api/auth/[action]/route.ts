import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { characters, inventory, users, type Appearance } from "@/db/schema";
import { createSession, destroySession, getCurrentUser, hashPassword, QUICK_SESSION_DAYS, verifyPassword } from "@/lib/auth";
import { quickUsername, USERNAME_RE } from "@/lib/quickPlay";
import { randomAppearance, randomVillagerName } from "@/game/lpc";
import { ensureSeeded } from "@/lib/seed";
import { SPAWN } from "@/lib/worldmap";
import { addItem, logEvent } from "@/lib/game";
import { pickShardForPosition } from "@/lib/shards";
import { nameProblem } from "@/lib/moderation";
import { clientIp, loginFailLimiter, loginIpLimiter, signupIpLimiter } from "@/lib/rateLimit";
import { cookies } from "next/headers";
import { track, markActive } from "@/lib/track";
import { REF_COOKIE, SRC_COOKIE } from "@/lib/site";
import { decodeAcquisition } from "@/lib/acquisition";
import type { Acquisition } from "@/types/analytics";

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

/** A new character with its starter kit, logged in. Shared by signup and "Play now". */
async function createCharacter(userId: number, name: string, appearance: Appearance, sessionDays?: number) {
  const [ch] = await db
    .insert(characters)
    .values({ userId, name, appearance, x: SPAWN.x + (Math.random() - 0.5) * 60, y: SPAWN.y })
    .returning();
  await addItem(ch.id, "berry", 2);
  // A starter sword in hand: the tutorial sends you past slimes and night-time wisps.
  const sword = await addItem(ch.id, "wooden_sword", 1);
  await db.update(inventory).set({ equipped: true }).where(eq(inventory.id, sword));
  await logEvent("arrival", `${name} arrived in the grove.`, "character", ch.id, ch.x, ch.y);
  await createSession(userId, pickShardForPosition(ch.x, ch.y), sessionDays);
  // Did they arrive through a shared moment or profile? (set by RefMark) And from where (SourceMark)?
  const jar = await cookies();
  const ref = jar.get(REF_COOKIE)?.value;
  const from = decodeAcquisition(jar.get(SRC_COOKIE)?.value);
  return { ch, ref: ref ? ref.slice(0, 40) : undefined, from };
}

/** A signup's source for the stats (none when unknown). */
const sourceMeta = (from: Acquisition | null): Record<string, string> => (from ? { src: from.src, ...(from.campaign ? { campaign: from.campaign } : {}) } : {});

const cleanName = (raw: unknown): string => String(raw ?? "").trim().replace(/\s+/g, " ").slice(0, 24);
const badUsername = () => Response.json({ error: "Username must be 3–24 chars, letters/numbers/underscore." }, { status: 400 });
const shortPassword = () => Response.json({ error: "Password must be at least 8 characters." }, { status: 400 });

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
  const ip = clientIp(req);
  const slowDown = () => Response.json({ error: "Too many tries. Please wait a few minutes and try again." }, { status: 429 });

  if (action === "quick") {
    // "Play now": just a name (or none: a villager name is picked), a random
    // look, an automatic username and no password until they save it.
    if (ip && !signupIpLimiter.allow(ip)) return slowDown();
    const name = cleanName(body.name) || randomVillagerName();
    const bad = nameProblem(name);
    if (bad) return Response.json({ error: bad }, { status: 400 });
    let user: typeof users.$inferSelect | undefined;
    for (let i = 0; i < 5 && !user; i++) {
      [user] = await db.insert(users).values({ username: quickUsername(name) }).onConflictDoNothing().returning();
    }
    if (!user) return Response.json({ error: "Couldn't make your character, please try again." }, { status: 500 });
    const { ch, ref, from } = await createCharacter(user.id, name, randomAppearance(), QUICK_SESSION_DAYS);
    track("signup", ch.id, { quick: true, ...(ref ? { ref } : {}), ...sourceMeta(from) });
    markActive(ch.id);
    return Response.json({ ok: true, character: ch });
  }

  if (action === "claim") {
    // Save a "Play now" character: pick a username and password.
    const me = await getCurrentUser();
    if (!me) return Response.json({ error: "Not signed in." }, { status: 401 });
    if (me.passwordHash) return Response.json({ error: "This character is already saved." }, { status: 409 });
    if (!USERNAME_RE.test(username)) return badUsername();
    if (password.length < 8) return shortPassword();
    const bad = nameProblem(username);
    if (bad) return Response.json({ error: bad }, { status: 400 });
    if (username !== me.username) {
      const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
      if (taken) return Response.json({ error: "That username is taken." }, { status: 409 });
    }
    try {
      await db.update(users).set({ username, passwordHash: hashPassword(password) }).where(and(eq(users.id, me.id), isNull(users.passwordHash)));
    } catch {
      return Response.json({ error: "That username is taken." }, { status: 409 }); // lost a race for it
    }
    const [ch] = await db.select({ id: characters.id }).from(characters).where(eq(characters.userId, me.id)).limit(1);
    if (ch) track("character_saved", ch.id);
    return Response.json({ ok: true, username });
  }

  if (!USERNAME_RE.test(username)) return badUsername();

  if (action === "signup") {
    if (ip && !signupIpLimiter.allow(ip)) return slowDown();
    if (password.length < 8) return shortPassword();
    const name = cleanName(body.name) || username;
    // Names show in the world, on public profiles and on share cards.
    const bad = nameProblem(username) ?? nameProblem(name);
    if (bad) return Response.json({ error: bad }, { status: 400 });
    const [existing] = await db.select().from(users).where(eq(users.username, username));
    if (existing) return Response.json({ error: "That username is taken." }, { status: 409 });
    const [user] = await db.insert(users).values({ username, passwordHash: hashPassword(password) }).returning();
    const { ch, ref, from } = await createCharacter(user.id, name, cleanAppearance(body.appearance));
    track("signup", ch.id, { ...(ref ? { ref } : {}), ...sourceMeta(from) });
    markActive(ch.id);
    return Response.json({ ok: true, character: ch });
  }
  if (action === "login") {
    if ((ip && !loginIpLimiter.allow(ip)) || loginFailLimiter.remaining(username) === 0) return slowDown();
    const [user] = await db.select().from(users).where(eq(users.username, username));
    if (user && !user.passwordHash) {
      return Response.json({ error: "This character was made with Play now and has no password yet. Open the game where you played it and save it (☰ menu → Save character)." }, { status: 401 });
    }
    if (!user || !verifyPassword(password, user.passwordHash!)) {
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
