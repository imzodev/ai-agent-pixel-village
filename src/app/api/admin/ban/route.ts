// Admin only (x-admin-token, src/lib/adminAuth.ts): suspend or reinstate an account.
//   POST { username, unban? } → signs them out everywhere, removes their chat,
//   closes the reports about them; they can't sign in or be seen until reinstated.
import { isAdmin, notFound } from "@/lib/adminAuth";
import { setBanned } from "@/lib/moderationServer";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isAdmin(req)) return notFound();
  const body = await req.json().catch(() => ({}));
  const msg = await setBanned(String(body.username ?? ""), body.unban !== true);
  return msg ? Response.json({ ok: true, message: msg }) : Response.json({ error: "No such user." }, { status: 404 });
}
