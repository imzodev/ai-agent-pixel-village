import { describe, expect, it } from "vitest";
import { newWebhookSecret, signWebhook, verifyWebhook, WEBHOOK_MAX_SKEW_MS } from "@/lib/webhookSign";

describe("webhook signatures", () => {
  const secret = newWebhookSecret();
  const body = JSON.stringify({ type: "conversation", message: "hi" });
  const now = 1_800_000_000_000;

  it("verifies a fresh, untampered request", () => {
    const sig = signWebhook(secret, now, body);
    expect(verifyWebhook({ secret, timestamp: String(now), signature: sig, body, now })).toBe(true);
  });

  it("rejects a changed body", () => {
    const sig = signWebhook(secret, now, body);
    expect(verifyWebhook({ secret, timestamp: String(now), signature: sig, body: body + " ", now })).toBe(false);
  });

  it("rejects the wrong secret", () => {
    const sig = signWebhook(newWebhookSecret(), now, body);
    expect(verifyWebhook({ secret, timestamp: String(now), signature: sig, body, now })).toBe(false);
  });

  it("rejects a replayed timestamp outside the skew window", () => {
    const sig = signWebhook(secret, now, body);
    expect(verifyWebhook({ secret, timestamp: String(now), signature: sig, body, now: now + WEBHOOK_MAX_SKEW_MS + 1 })).toBe(false);
  });

  it("rejects a signature of the wrong length without throwing", () => {
    expect(verifyWebhook({ secret, timestamp: String(now), signature: "sha256=abc", body, now })).toBe(false);
  });
});
