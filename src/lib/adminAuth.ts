// Admin / debug endpoints (sending an NPC on a trip, planning routes,
// later inspecting an NPC's mind) are protected by a shared secret: the
// request must carry `x-admin-token` matching ADMIN_TOKEN. With no token
// configured (or a short one) they don't exist at all — in development too.

import crypto from "node:crypto";

/** Tokens shorter than this are refused (configure a long random one). */
const MIN_TOKEN_LEN = 24;

/** Is this request from an admin? Constant-time comparison. */
export function isAdmin(req: Request): boolean {
  const want = process.env.ADMIN_TOKEN ?? "";
  if (want.length < MIN_TOKEN_LEN) return false;
  const got = req.headers.get("x-admin-token") ?? "";
  const a = crypto.createHash("sha256").update(got).digest();
  const b = crypto.createHash("sha256").update(want).digest();
  return crypto.timingSafeEqual(a, b);
}

/** A 404 for anyone else (the endpoint shouldn't even look like it exists). */
export const notFound = (): Response => Response.json({ error: "Not found." }, { status: 404 });
