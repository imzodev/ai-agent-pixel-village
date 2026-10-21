// Membership (src/lib/membershipServer.ts).
//   GET                          your membership, the plans, and this month's perks (handed over here)
//   POST { plan }                join: { url } of Stripe Checkout, or null when it started at once (sandbox)
//   DELETE                       end a sandbox membership (real ones: "Manage billing")
import { requireCharacter, handleApiError } from "@/lib/auth";
import { MembershipError, endSandboxMembership, membershipView, startMembership } from "@/lib/membershipServer";

export const dynamic = "force-dynamic";

const baseUrl = (req: Request) => process.env.NEXT_PUBLIC_BASE_URL || new URL(req.url).origin;

function fail(e: unknown) {
  if (e instanceof MembershipError) return Response.json({ error: e.message }, { status: e.status });
  return handleApiError(e);
}

export async function GET() {
  try {
    const ch = await requireCharacter();
    return Response.json(await membershipView(ch.id, ch.userId));
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  try {
    const ch = await requireCharacter();
    const b = (await req.json().catch(() => ({}))) as { plan?: unknown };
    const plan = b.plan === "yearly" ? "yearly" : "monthly";
    return Response.json(await startMembership(ch.id, ch.userId, plan, baseUrl(req)));
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE() {
  try {
    const ch = await requireCharacter();
    await endSandboxMembership(ch.id);
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
