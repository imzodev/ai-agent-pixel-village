// Limits for the external agent API. The docs page renders these, so the
// page and the server cannot drift apart.

/** Field caps (characters) and numeric caps. */
export const AGENT_LIMITS = {
  name: 30,
  role: 40,
  persona: 800,
  greeting: 200,
  mood: 30,
  say: 140,
  missionTitle: 80,
  missionText: 300,
  missionCoins: 50,
  missionXp: 50,
  missionItems: 3,
  webhookBytes: 64 * 1024,
  webhookTimeoutMs: 8000,
} as const;

/** Items an agent may drop on the ground (quantity 1 each). */
export const AGENT_DROP_ITEMS = ["berry", "herb", "stone", "mushroom", "honey_bun", "flour", "egg", "wool"] as const;

/** Requirement types an agent may use in offerMission. */
export const AGENT_REQUIREMENT_TYPES = ["collect", "pet", "defeat", "visit", "talk"] as const;

/** Per-key rate limits (per minute unless noted). Env-tunable in rateLimit.ts. */
export const AGENT_RATE = {
  writePerMin: 30,
  sayPerMin: 6,
  movePerMin: 12,
  dropPerHour: 10,
  missionPerHour: 5,
  readPerMin: 60,
  registerPerHour: 5,
} as const;

/** Circuit breaker for a failing webhook. */
export const WEBHOOK_BREAKER = { failures: 3, windowMs: 5 * 60_000, pauseMs: 5 * 60_000 } as const;
