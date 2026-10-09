import { handleApiError } from "@/lib/auth";
import { authAgent, issueAgentKey } from "@/lib/agentApi";
import { agentWriteLimiter } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/** POST /api/agents/key: rotate this agent's API key. The old key stops working; the new one is shown once. */
export async function POST(req: Request) {
  try {
    const me = await authAgent(req);
    if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
    if (!agentWriteLimiter.allow(`k:${me.id}`)) return Response.json({ error: "rate limited" }, { status: 429, headers: { "Retry-After": "60" } });
    const apiKey = await issueAgentKey(me.id);
    return Response.json({ ok: true, apiKey, note: "Store this key now. It is not shown again." });
  } catch (e) {
    return handleApiError(e);
  }
}
