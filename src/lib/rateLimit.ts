// Sliding-window rate limiter. In-memory, no DB. Resets on server restart —
// that's acceptable: the cap is budget insurance, not a security boundary.
// Open for extension: swap policy without touching callers.
import type { RateLimitConfig } from "./types";

export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();
  constructor(private readonly config: RateLimitConfig) {}

  /** Record an attempt and report whether it's allowed. */
  allow(key: string): boolean {
    const now = Date.now();
    const cutoff = now - this.config.windowMs;
    const arr = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    const allowed = arr.length < this.config.max;
    if (allowed) arr.push(now);
    this.hits.set(key, arr);
    return allowed;
  }

  /** Inspect remaining quota for a key (1 = next allowed). */
  remaining(key: string): number {
    const now = Date.now();
    const cutoff = now - this.config.windowMs;
    const arr = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    return Math.max(0, this.config.max - arr.length);
  }
}

// Per-character cap on LLM-powered NPC replies. Falls back to the scripted
// brain when the cap is hit — the player still gets an answer, the bill
// stays bounded. Override via NPC_LLM_RATE_PER_MIN.
export const npcLlmLimiter = new SlidingWindowLimiter({
  max: Number(process.env.NPC_LLM_RATE_PER_MIN ?? "3"),
  windowMs: 60_000,
});

// External agent API (src/app/api/agents). Keys are agent ids, or client IP
// for registration. Caps are env-tunable; see AGENT_RATE in agentLimits.ts.
const envInt = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};
export const agentWriteLimiter = new SlidingWindowLimiter({ max: envInt("AGENT_WRITE_PER_MIN", 30), windowMs: 60_000 });
export const agentSayLimiter = new SlidingWindowLimiter({ max: envInt("AGENT_SAY_PER_MIN", 6), windowMs: 60_000 });
export const agentMoveLimiter = new SlidingWindowLimiter({ max: envInt("AGENT_MOVE_PER_MIN", 12), windowMs: 60_000 });
export const agentDropLimiter = new SlidingWindowLimiter({ max: envInt("AGENT_DROP_PER_HOUR", 10), windowMs: 3_600_000 });
export const agentMissionLimiter = new SlidingWindowLimiter({ max: envInt("AGENT_MISSION_PER_HOUR", 5), windowMs: 3_600_000 });
export const agentReadLimiter = new SlidingWindowLimiter({ max: envInt("AGENT_READ_PER_MIN", 60), windowMs: 60_000 });
export const agentRegisterLimiter = new SlidingWindowLimiter({ max: envInt("AGENT_REGISTER_PER_HOUR", 5), windowMs: 3_600_000 });

// Sign-in and sign-up (src/app/api/auth): brute force and mass account creation.
// Per IP (when the proxy tells us the IP) and per username for failed logins.
export const loginIpLimiter = new SlidingWindowLimiter({ max: envInt("LOGIN_PER_IP_10MIN", 10), windowMs: 600_000 });
export const loginFailLimiter = new SlidingWindowLimiter({ max: envInt("LOGIN_FAILS_PER_USER_15MIN", 8), windowMs: 900_000 });
export const signupIpLimiter = new SlidingWindowLimiter({ max: envInt("SIGNUP_PER_IP_10MIN", 3), windowMs: 600_000 });

// Player chat (/api/act "chat"): one line every 2 s, 15 a minute.
export const chatBurstLimiter = new SlidingWindowLimiter({ max: 1, windowMs: 2_000 });
export const chatMinuteLimiter = new SlidingWindowLimiter({ max: 15, windowMs: 60_000 });

// Gathering, chopping and casting: about as fast as a person clicks, not a
// bot (src/app/api/act, src/app/api/fish). A short burst is fine; the average is
// one gather or chop per 0.7 s and one cast per 2 s.
export const gatherLimiter = new SlidingWindowLimiter({ max: 5, windowMs: 3_500 });
export const castLimiter = new SlidingWindowLimiter({ max: 1, windowMs: 2_000 });

// Reports (/api/report): a few an hour per player.
export const reportLimiter = new SlidingWindowLimiter({ max: 6, windowMs: 3_600_000 });

/** The client's IP as the reverse proxy reports it; null when there's no proxy header
 *  (then IP limits are skipped rather than lumping everyone into one bucket). */
export function clientIp(req: Request): string | null {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip")?.trim();
  return ip || null;
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
/**
 * The visitor's IP for a raw connection (WebSocket upgrades). Behind the
 * reverse proxy (Caddy on the same machine) every connection comes from
 * 127.0.0.1, so the proxy's X-Forwarded-For says who it really is. It's only
 * believed from the local proxy: a client connecting directly can't fake it.
 */
export function connectionIp(remoteAddress: string | undefined, forwardedFor: string | string[] | undefined): string {
  const remote = remoteAddress ?? "unknown";
  const fwd = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)?.split(",")[0].trim();
  return LOOPBACK.has(remote) && fwd ? fwd : remote;
}
