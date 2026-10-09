// Shared logic for the external agent HTTP API (v1 now, v2 in Phase 2).
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { npcs, type npcs as npcsTable } from "@/db/schema";
import { assertPublicWebhookUrl } from "@/lib/safeUrl";
import { hashAgentKey, keyDisplayPrefix, newAgentKey } from "@/lib/agentKeys";
import { newWebhookSecret } from "@/lib/webhookSign";

export type AgentRow = typeof npcsTable.$inferSelect;

/** Bearer token from the Authorization header, or null. The query-string form is gone. */
export function bearerKey(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : null;
}

/**
 * Resolve the agent for this request. Looks up the key by hash; a legacy
 * plaintext key is accepted once and its hash is backfilled. Inactive agents
 * are refused. Updates lastSeenAt so liveness is real.
 */
export async function authAgent(req: Request): Promise<AgentRow | null> {
  const key = bearerKey(req);
  if (!key) return null;
  const hash = hashAgentKey(key);
  let [n] = await db.select().from(npcs).where(eq(npcs.apiKeyHash, hash));
  if (!n) {
    [n] = await db.select().from(npcs).where(eq(npcs.apiKey, key));
    if (n) await db.update(npcs).set({ apiKeyHash: hash, apiKeyPrefix: keyDisplayPrefix(key) }).where(eq(npcs.id, n.id));
  }
  if (!n || !n.active) return null;
  await db.update(npcs).set({ lastSeenAt: new Date() }).where(eq(npcs.id, n.id));
  return n;
}

/** A fresh key for an NPC. Stores only the hash; the caller shows `apiKey` once. */
export async function issueAgentKey(npcId: number): Promise<string> {
  const apiKey = newAgentKey();
  await db.update(npcs).set({
    apiKey: null,
    apiKeyHash: hashAgentKey(apiKey),
    apiKeyPrefix: keyDisplayPrefix(apiKey),
  }).where(eq(npcs.id, npcId));
  return apiKey;
}

/**
 * Make an NPC an external (remote) agent: validate the webhook URL, mark it
 * remote, and make sure it has a key and a webhook secret. Returns the new key
 * and secret only when they were created now (shown once).
 */
export async function attachExternalController(
  npc: Pick<AgentRow, "id" | "kind" | "apiKey" | "apiKeyHash" | "webhookSecret">,
  webhookUrl: string,
): Promise<{ apiKey: string | null; webhookSecret: string | null }> {
  await assertPublicWebhookUrl(webhookUrl);
  const set: Partial<typeof npcs.$inferInsert> = { kind: "remote", webhookUrl };
  let apiKey: string | null = null;
  // A remote agent that already has a key keeps it. Any other NPC (for
  // example a sponsor's builtin NPC, whose placeholder key was never shown)
  // gets a real key now.
  const keyGiven = npc.kind === "remote" && (!!npc.apiKeyHash || !!npc.apiKey);
  if (!keyGiven) apiKey = newAgentKey();
  if (apiKey) {
    set.apiKey = null;
    set.apiKeyHash = hashAgentKey(apiKey);
    set.apiKeyPrefix = keyDisplayPrefix(apiKey);
  }
  let webhookSecret: string | null = null;
  if (!npc.webhookSecret) {
    webhookSecret = newWebhookSecret();
    set.webhookSecret = webhookSecret;
  }
  await db.update(npcs).set(set).where(eq(npcs.id, npc.id));
  return { apiKey, webhookSecret };
}
