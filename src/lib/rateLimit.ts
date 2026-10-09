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
