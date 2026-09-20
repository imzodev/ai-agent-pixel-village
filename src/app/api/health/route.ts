import { pool } from "@/db";
import { redisDegraded } from "@/lib/redis";

export const dynamic = "force-dynamic";

type Health = {
  ok: boolean;
  db: boolean;
  redis: { configured: boolean; degraded: boolean };
};

export async function GET() {
  const health: Health = {
    ok: true,
    db: false,
    redis: {
      configured: Boolean(process.env.UPSTASH_REDIS_REST_URL),
      degraded: redisDegraded(),
    },
  };

  // Ping the raw connection pool rather than going through Drizzle — this
  // is a connectivity check for the socket itself, and it keeps this
  // endpoint independent of the ORM's query builder.
  try {
    await pool.query("SELECT 1");
    health.db = true;
  } catch {
    health.db = false;
    health.ok = false;
  }

  // If Upstash is configured but the client failed to initialise, that's
  // a degraded state — the app still runs but cross-process pub/sub
  // doesn't work, so we mark the overall health false.
  if (health.redis.configured && health.redis.degraded) {
    health.ok = false;
  }

  return Response.json(health, { status: health.ok ? 200 : 503 });
}
