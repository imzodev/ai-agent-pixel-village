// Redis client + presence types. Types only — no logic.

export type RedisString = string | number | null;

export type PubSubHandler = (channel: string, message: string) => void;

export interface RedisLike {
  get(key: string): Promise<RedisString>;
  set(key: string, value: string, opts?: { ex?: number; px?: number }): Promise<"OK">;
  exists(key: string): Promise<0 | 1>;
  del(...keys: string[]): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<0 | 1>;
  keys(pattern: string): Promise<string[]>;
  /** Publish a message on a channel. Returns the number of subscribers reached. */
  publish(channel: string, message: string): Promise<number>;
}

/** A player's live presence mirror in Redis. */
export type PresenceRecord = {
  id: number;
  x?: number;
  y?: number;
  facing?: string;
  at: number;
};
