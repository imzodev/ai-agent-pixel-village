// Password recovery, server side. A reset is asked for by email; the answer
// is always the same (so nobody can learn which emails have accounts), and if
// saved characters use that address, one email lists each with its own link.
// A link is a random token whose hash is stored; it works once, for
// RESET_TTL_MS, and using it signs out every other session.

import { isResetToken, newResetToken, tokenHash } from "@/lib/resetToken";
import { and, eq, gt, isNotNull, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { characters, passwordResets, sessions, users } from "@/db/schema";
import { createSession, hashPassword } from "@/lib/auth";
import { sendMail } from "@/lib/adapters/mail";
import { pickShardForPosition } from "@/lib/shards";
import { RESET_MAX_ACCOUNTS, RESET_TTL_MS, emailProblem, normalizeEmail, resetEmail } from "@/lib/passwordReset";
import { resetEmailLimiter } from "@/lib/rateLimit";
import type { ResetLink } from "@/types/mail";

/** Send reset links for the saved characters on this email, if any. Never says whether there were. */
export async function requestReset(rawEmail: unknown, baseUrl: string): Promise<void> {
  const email = normalizeEmail(rawEmail);
  if (!email || emailProblem(email) || !resetEmailLimiter.allow(email)) return;
  await db.delete(passwordResets).where(lt(passwordResets.expiresAt, new Date())); // tidy up old links
  const accounts = await db.select({ id: users.id, username: users.username }).from(users)
    .where(and(eq(users.email, email), isNotNull(users.passwordHash), isNull(users.bannedAt))).limit(RESET_MAX_ACCOUNTS);
  if (!accounts.length) return;
  const links: ResetLink[] = [];
  for (const a of accounts) {
    const token = newResetToken();
    await db.insert(passwordResets).values({ tokenHash: tokenHash(token), userId: a.id, expiresAt: new Date(Date.now() + RESET_TTL_MS) });
    links.push({ username: a.username, url: `${baseUrl}/reset?token=${token}` });
  }
  await sendMail(resetEmail(email, links));
}

/** Set a new password with a reset link's token, and sign in with it (every other session ends). */
export async function resetPassword(token: unknown, password: string): Promise<{ ok: true; username: string } | { ok: false; error: string }> {
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  const t = String(token ?? "");
  if (!isResetToken(t)) return { ok: false, error: "This link isn't right. Ask for a new one." };
  // Used once: whoever deletes the row gets to use it.
  const [used] = await db.delete(passwordResets)
    .where(and(eq(passwordResets.tokenHash, tokenHash(t)), gt(passwordResets.expiresAt, new Date())))
    .returning({ userId: passwordResets.userId });
  if (!used) return { ok: false, error: "This link has expired or was already used. Ask for a new one." };
  const [u] = await db.update(users).set({ passwordHash: hashPassword(password) })
    .where(and(eq(users.id, used.userId), isNull(users.bannedAt))).returning({ username: users.username });
  if (!u) return { ok: false, error: "This account can't be signed into." };
  await db.delete(sessions).where(eq(sessions.userId, used.userId));
  await db.delete(passwordResets).where(eq(passwordResets.userId, used.userId));
  const [ch] = await db.select({ x: characters.x, y: characters.y }).from(characters).where(eq(characters.userId, used.userId)).limit(1);
  await createSession(used.userId, ch ? pickShardForPosition(ch.x, ch.y) : "0");
  return { ok: true, username: u.username };
}

/** Add, change or (blank) remove the email on an account. */
export async function setEmail(userId: number, rawEmail: unknown): Promise<{ ok: true; email: string | null } | { ok: false; error: string }> {
  const email = normalizeEmail(rawEmail);
  if (email) {
    const bad = emailProblem(email);
    if (bad) return { ok: false, error: bad };
  }
  await db.update(users).set({ email }).where(eq(users.id, userId));
  return { ok: true, email };
}
