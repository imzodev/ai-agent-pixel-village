import { eq } from "drizzle-orm";
import { db } from "@/db";
import { characters, users, type Appearance } from "@/db/schema";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { SPAWN } from "@/lib/worldmap";
import { addItem, logEvent } from "@/lib/game";

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
  if (username.length < 3 || !/^[a-z0-9_]+$/.test(username)) return Response.json({ error: "Username must be 3+ chars, letters/numbers/underscore." }, { status: 400 });
  if (password.length < 6) return Response.json({ error: "Password must be at least 6 characters." }, { status: 400 });

  if (action === "signup") {
    const name = String(body.name ?? "").trim().slice(0, 24) || username;
    const [existing] = await db.select().from(users).where(eq(users.username, username));
    if (existing) return Response.json({ error: "That username is taken." }, { status: 409 });
    const [user] = await db.insert(users).values({ username, passwordHash: hashPassword(password) }).returning();
    const [ch] = await db
      .insert(characters)
      .values({ userId: user.id, name, appearance: cleanAppearance(body.appearance), x: SPAWN.x + (Math.random() - 0.5) * 60, y: SPAWN.y })
      .returning();
    await addItem(ch.id, "berry", 2);
    await logEvent("arrival", `${name} arrived in the grove.`, "character", ch.id, ch.x, ch.y);
    await createSession(user.id);
    return Response.json({ ok: true, character: ch });
  }
  if (action === "login") {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    if (!user || !verifyPassword(password, user.passwordHash)) return Response.json({ error: "Wrong username or password." }, { status: 401 });
    await createSession(user.id);
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Unknown action" }, { status: 404 });
}
