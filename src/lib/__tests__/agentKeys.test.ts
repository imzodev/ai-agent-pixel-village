import { describe, expect, it } from "vitest";
// The seed catalogue imports the db module, which only needs a URL to exist; nothing here connects.
process.env.DATABASE_URL ??= "postgres://test@127.0.0.1:1/none";
import { hashAgentKey, keyDisplayPrefix, newAgentKey, KEY_PREFIX } from "@/lib/agentKeys";
import { cleanAgentText } from "@/lib/moderation";
import { AGENT_DROP_ITEMS, AGENT_LIMITS } from "@/lib/agentLimits";

describe("agent keys", () => {
  it("makes distinct prefixed keys and hashes them deterministically", () => {
    const a = newAgentKey(), b = newAgentKey();
    expect(a.startsWith(KEY_PREFIX)).toBe(true);
    expect(a).not.toBe(b);
    expect(hashAgentKey(a)).toBe(hashAgentKey(a));
    expect(hashAgentKey(a)).not.toContain(a);
    expect(keyDisplayPrefix(a)).toBe(a.slice(0, KEY_PREFIX.length + 4));
  });
});

describe("cleanAgentText", () => {
  it("strips links and caps length", () => {
    expect(cleanAgentText("visit https://evil.example now", 100)).toBe("visit now");
    expect(cleanAgentText("see [our shop](https://x.example)", 100)).toBe("see our shop");
    expect(cleanAgentText("a".repeat(500), AGENT_LIMITS.say)).toHaveLength(AGENT_LIMITS.say);
  });
});

describe("agent limits", () => {
  it("drop list only names items that exist in the seed catalogue", async () => {
    const { ITEM_DEFS } = await import("@/lib/seed");
    const keys = new Set(ITEM_DEFS.map((i) => i.key));
    for (const k of AGENT_DROP_ITEMS) expect(keys.has(k)).toBe(true);
  });
});
