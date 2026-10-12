// Launch safety: the text filters, when money can change hands, the LLM
// budget, and the sign-in limits.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanPlayerChat, nameProblem, normalizeForMatch } from "@/lib/moderation";
import { checkoutOpen, paymentsLive, sandboxAllowed } from "@/lib/payments";
import { makeDailyBudget } from "@/lib/llm/budget";
import { SlidingWindowLimiter, clientIp, connectionIp } from "@/lib/rateLimit";
import { isBot } from "@/lib/bots";

afterEach(() => vi.unstubAllEnvs());

describe("player text", () => {
  it("cleans chat: no links, bad words masked, innocent words kept", () => {
    expect(cleanPlayerChat("visit https://scam.example/x or www.free.gg now")).toBe("visit or now");
    expect(cleanPlayerChat("buy gold at cheapgold.ru")).toBe("buy gold at");
    expect(cleanPlayerChat("you shit")).toBe("you ****");
    expect(cleanPlayerChat("grape juice is spicy, Hancock")).toBe("grape juice is spicy, Hancock");
    expect(cleanPlayerChat("x".repeat(300))).toHaveLength(140);
    expect(cleanPlayerChat("   ")).toBe("");
  });

  it("refuses slurs, profanity and staff names, even disguised; allows ordinary names", () => {
    for (const bad of ["Fuuuuuck", "n1gg3r", "xXFuckXx", "ShitLord", "shit_lord", "adm1n", "TheGrooveTeam", "Moderator", "f.a.g"]) expect(nameProblem(bad), bad).not.toBeNull();
    for (const ok of ["Grapevine", "Spicy Sue", "Hancock", "Dickens", "Marigold", "Peacock", "Ishita", "Rapeseed", "Cassandra"]) expect(nameProblem(ok), ok).toBeNull();
    expect(normalizeForMatch("H3ll0  W0rld!!")).toBe("helloworldii");
    expect(normalizeForMatch("fuuuuuck")).toBe("fuuck");
  });
});

describe("payments", () => {
  it("never sells for free in production", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    expect([paymentsLive(), sandboxAllowed(), checkoutOpen()]).toEqual([false, false, false]);
  });
  it("uses the sandbox only in development without a key", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("NODE_ENV", "development");
    expect([paymentsLive(), sandboxAllowed(), checkoutOpen()]).toEqual([false, true, true]);
  });
  it("opens real payments once a key is set, and never the sandbox", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_x");
    vi.stubEnv("NODE_ENV", "development");
    expect([paymentsLive(), sandboxAllowed(), checkoutOpen()]).toEqual([true, false, true]);
  });
});

describe("the LLM's daily budget", () => {
  it("stops at the cap and starts over the next UTC day", () => {
    const b = makeDailyBudget(3);
    const day1 = Date.UTC(2026, 9, 11, 10), day2 = Date.UTC(2026, 9, 12, 0, 1);
    expect([b.take(day1), b.take(day1), b.take(day1), b.take(day1)]).toEqual([true, true, true, false]);
    expect(b.take(day2)).toBe(true);
    expect(makeDailyBudget(0).take(day1)).toBe(true); // 0 = no cap
  });
});

describe("sign-in limits", () => {
  it("allows a few tries, then makes them wait", () => {
    const l = new SlidingWindowLimiter({ max: 3, windowMs: 60_000 });
    expect([l.allow("1.2.3.4"), l.allow("1.2.3.4"), l.allow("1.2.3.4"), l.allow("1.2.3.4")]).toEqual([true, true, true, false]);
    expect(l.allow("5.6.7.8")).toBe(true); // someone else is unaffected
  });
  it("reads the client IP from the proxy, and doesn't guess without one", () => {
    expect(clientIp(new Request("http://x/", { headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" } }))).toBe("9.9.9.9");
    expect(clientIp(new Request("http://x/"))).toBeNull();
  });
  it("sees the real visitor behind the proxy, and can't be fooled by a direct connection", () => {
    expect(connectionIp("127.0.0.1", "203.0.113.9, 10.0.0.1")).toBe("203.0.113.9");
    expect(connectionIp("::ffff:127.0.0.1", "203.0.113.9")).toBe("203.0.113.9");
    expect(connectionIp("198.51.100.4", "203.0.113.9")).toBe("198.51.100.4"); // direct: header ignored
    expect(connectionIp("127.0.0.1", undefined)).toBe("127.0.0.1");
  });
  it("doesn't count link-preview bots as visitors", () => {
    expect(isBot("Twitterbot/1.0")).toBe(true);
    expect(isBot("facebookexternalhit/1.1")).toBe(true);
    expect(isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1")).toBe(false);
  });
});
