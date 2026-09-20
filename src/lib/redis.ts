// Upstash Redis client with an in-memory fallback for local dev.
//
// Why this exists: Phase 1 introduces Redis-backed caching (snapshot TTL
// cache, lastSeenAt throttle). Phase 2 adds pub/sub for fan-out between
// the sim worker, the NOTIFY relay, and the WS server. The Upstash HTTP
// REST client is the right transport — no TCP pool, edge-friendly, sub-10ms
// per GET/SET — but the @upstash/redis package is a runtime dependency we
// don't want to require for local dev where there is no Redis instance.
//
// Behaviour:
// - If UPSTASH_REDIS_REST_URL is set at process start, use the Upstash
//   client (HTTP). Initialization is async, so callers use `initRedis()`
//   once at startup and the `redis` export afterwards.
// - Otherwise fall back to a tiny in-process Map with TTLs that satisfies
//   only the methods the rest of the codebase uses (get/set/exists/del/
//   incr/expire/keys/publish). The memory fallback's pub/sub delivers
//   within the same process only — fine for single-process local dev,
//   useless across the worker/relay/WS split. Production must use
//   Upstash.

import type { PubSubHandler, RedisLike, RedisString } from "@/types/redis";

// Re-exported so existing importers keep working.
export type { PubSubHandler, RedisLike };

class MemoryRedis implements RedisLike {
  private store = new Map<string, { value: string; expiresAt: number | null }>();
  private subs = new Map<string, Set<PubSubHandler>>();

  private isExpired(entry: { expiresAt: number | null }): boolean {
    return entry.expiresAt !== null && entry.expiresAt < Date.now();
  }

  private prune(): void {
    const now = Date.now();
    for (const [k, v] of this.store) {
      if (v.expiresAt !== null && v.expiresAt < now) this.store.delete(k);
    }
  }

  async get(key: string): Promise<RedisString> {
    this.prune();
    const entry = this.store.get(key);
    if (!entry) return null;
    if (this.isExpired(entry)) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, opts?: { ex?: number; px?: number }): Promise<"OK"> {
    let expiresAt: number | null = null;
    if (opts?.ex !== undefined) expiresAt = Date.now() + opts.ex * 1000;
    else if (opts?.px !== undefined) expiresAt = Date.now() + opts.px;
    this.store.set(key, { value, expiresAt });
    return "OK";
  }

  async exists(key: string): Promise<0 | 1> {
    this.prune();
    return this.store.has(key) ? 1 : 0;
  }

  async del(...keys: string[]): Promise<number> {
    let removed = 0;
    for (const k of keys) if (this.store.delete(k)) removed++;
    return removed;
  }

  async incr(key: string): Promise<number> {
    const current = await this.get(key);
    const next = (typeof current === "string" ? parseInt(current, 10) : 0) + 1;
    if (Number.isNaN(next)) throw new Error(`incr: not a number at ${key}`);
    const existing = this.store.get(key);
    await this.set(
      key,
      String(next),
      existing?.expiresAt
        ? { ex: Math.max(1, Math.floor((existing.expiresAt - Date.now()) / 1000)) }
        : undefined,
    );
    return next;
  }

  async expire(key: string, seconds: number): Promise<0 | 1> {
    const entry = this.store.get(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  async keys(pattern: string): Promise<string[]> {
    this.prune();
    const star = pattern.indexOf("*");
    if (star === -1) return this.store.has(pattern) ? [pattern] : [];
    const prefix = pattern.slice(0, star);
    const out: string[] = [];
    for (const k of this.store.keys()) if (k.startsWith(prefix)) out.push(k);
    return out;
  }

  async publish(channel: string, message: string): Promise<number> {
    const subs = this.subs.get(channel);
    if (!subs || subs.size === 0) return 0;
    for (const handler of subs) {
      try {
        handler(channel, message);
      } catch {
        // Swallow handler errors — one bad subscriber shouldn't kill the rest.
      }
    }
    return subs.size;
  }

  /**
   * In-process subscribe. NOT exposed on RedisLike because Upstash uses a
   * separate connection class. Callers use `subscribePubSub()` from this
   * module instead.
   */
  subscribe(channel: string, handler: PubSubHandler): () => void {
    let set = this.subs.get(channel);
    if (!set) {
      set = new Set();
      this.subs.set(channel, set);
    }
    set.add(handler);
    return () => {
      set!.delete(handler);
      if (set!.size === 0) this.subs.delete(channel);
    };
  }
}

let active: RedisLike = new MemoryRedis();
const memorySubs = new Map<string, Set<PubSubHandler>>();
let initialized = false;
let initFailed = false;

/**
 * Initialize the Redis client. Idempotent. Tries to swap the active
 * client for an Upstash HTTP client when UPSTASH_REDIS_REST_URL is set;
 * on any failure (missing package, bad credentials, network unreachable)
 * it logs a warning and falls back to the in-process memory client. The
 * app stays usable — just without cross-process cache sharing.
 */
export async function initRedis(): Promise<void> {
  if (initialized) return;
  initialized = true;
  if (!process.env.UPSTASH_REDIS_REST_URL) {
    console.log("[redis] no UPSTASH_REDIS_REST_URL — using in-memory cache (single-process only)");
    return;
  }
  try {
    // Lazy import so local dev (no @upstash/redis installed) doesn't blow up.
    const mod = (await import("@upstash/redis")) as unknown as {
      Redis: new (cfg: { url: string; token: string }) => RedisLike & {
        subscribe<T extends Record<string, unknown>>(
          channels: string | string[],
          handler: (msg: { channel: string; payload: T }) => void,
        ): Promise<() => Promise<void>>;
      };
    };
    active = new mod.Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN ?? "",
    });
    console.log(
      `[redis] Upstash client connected: ${process.env.UPSTASH_REDIS_REST_URL.replace(/\/+$/, "")}`,
    );
  } catch (err) {
    initFailed = true;
    active = new MemoryRedis();
    console.warn(
      "[redis] failed to initialize Upstash client, falling back to in-memory cache:",
      err instanceof Error ? err.message : err,
    );
  }
}

/** True when initRedis() tried Upstash but failed; useful for /api/health. */
export function redisDegraded(): boolean {
  return initFailed;
}

/** The active Redis client. Call `initRedis()` once at startup if Upstash is configured. */
export const redis: RedisLike = new Proxy({} as RedisLike, {
  get(_target, prop) {
    return (active as unknown as Record<string | symbol, unknown>)[prop as string];
  },
});

/**
 * Subscribe to a channel. Works against Upstash (HTTP subscribe) when
 * configured, otherwise in-process pub/sub via MemoryRedis.
 *
 * Returns an unsubscribe function. The Upstash variant is async — call
 * the returned function to stop receiving. The memory variant is sync.
 */
export async function subscribePubSub(
  channel: string,
  handler: PubSubHandler,
): Promise<() => Promise<void> | void> {
  if (process.env.UPSTASH_REDIS_REST_URL && !initFailed) {
    try {
      const mod = (await import("@upstash/redis")) as unknown as {
        Redis: new (cfg: { url: string; token: string }) => {
          subscribe: (
            channels: string | string[],
            handler: (msg: { channel: string; payload: string }) => void,
          ) => Promise<{
            unsubscribe: (channels?: string[]) => Promise<void>;
          }>;
        };
      };
      const client = new mod.Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN ?? "",
      });
      const subscriber = await client.subscribe(channel, (msg) => {
        if (typeof msg.payload === "string") handler(channel, msg.payload);
      });
      // The Upstash SDK returns a Subscriber with .unsubscribe(); wrap it
      // so callers get a uniform unsubscribe function regardless of
      // backend.
      return async () => {
        try {
          await subscriber.unsubscribe();
        } catch {
          // Best-effort.
        }
      };
    } catch (err) {
      console.warn("[redis] pub/sub subscribe failed, falling back to memory:", err);
    }
  }
  // Memory fallback
  let set = memorySubs.get(channel);
  if (!set) {
    set = new Set();
    memorySubs.set(channel, set);
  }
  set.add(handler);
  return () => {
    set!.delete(handler);
    if (set!.size === 0) memorySubs.delete(channel);
  };
}

/**
 * Publish to a channel. Always goes through `redis.publish`, which works
 * in both Upstash (cross-process) and memory (same-process) modes.
 */
export async function publish(channel: string, message: string): Promise<number> {
  return redis.publish(channel, message);
}