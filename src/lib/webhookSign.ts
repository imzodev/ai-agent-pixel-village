// Signed webhooks. The server signs each call with a per-agent secret so the
// agent can prove the request came from thegroove and is not a replay.
//
//   x-thegroove-timestamp: <unix ms>
//   x-thegroove-signature: sha256=<hex HMAC-SHA256 of `${timestamp}.${body}`>
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Accept a timestamp only this close to now (ms). Limits replay. */
export const WEBHOOK_MAX_SKEW_MS = 5 * 60_000;

export function newWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("hex")}`;
}

export function signWebhook(secret: string, timestamp: number, body: string): string {
  return "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/** Verify a received signature. Used by tests and by agent SDK examples. */
export function verifyWebhook(opts: { secret: string; timestamp: string; signature: string; body: string; now?: number }): boolean {
  const ts = Number(opts.timestamp);
  const now = opts.now ?? Date.now();
  if (!Number.isFinite(ts) || Math.abs(now - ts) > WEBHOOK_MAX_SKEW_MS) return false;
  const expected = Buffer.from(signWebhook(opts.secret, ts, opts.body));
  const got = Buffer.from(opts.signature);
  return expected.length === got.length && timingSafeEqual(expected, got);
}
