// Local type stub for @upstash/redis. The package itself is an optional
// runtime dependency — when UPSTASH_REDIS_REST_URL is unset we never
// import it. When it IS set, the package should be installed in the
// deployment environment (via `pnpm install @upstash/redis`). This stub
// lets `npm run typecheck` succeed in environments that don't have the
// package installed yet (e.g. fresh local dev clone, CI before install).
declare module "@upstash/redis" {
  export class Redis {
    constructor(config: { url: string; token: string });
    get(key: string): Promise<string | number | null>;
    set(key: string, value: string, opts?: { ex?: number; px?: number }): Promise<"OK">;
    exists(key: string): Promise<0 | 1>;
    del(...keys: string[]): Promise<number>;
    incr(key: string): Promise<number>;
    expire(key: string, seconds: number): Promise<0 | 1>;
    keys(pattern: string): Promise<string[]>;
    publish(channel: string, message: string): Promise<number>;
    subscribe(
      channels: string | string[],
      handler: (msg: { channel: string; payload: string }) => void,
    ): Promise<() => Promise<void>>;
  }
}