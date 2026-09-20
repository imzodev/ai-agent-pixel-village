import { pool } from "@/db";
import { redisDegraded } from "@/lib/redis";
import { wsConnectionCount } from "@/lib/world-stream";
import { isDraining } from "@/lib/lifecycle";
import { localShardId, parseShardRegions } from "@/lib/shards";
import type { Health } from "@/types/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const draining = isDraining();
  const health: Health = {
    ok: true,
    db: false,
    redis: {
      configured: Boolean(process.env.UPSTASH_REDIS_REST_URL),
      degraded: redisDegraded(),
    },
    ws: {
      connections: wsConnectionCount(),
      shard: localShardId(),
      shardCount: parseShardRegions(process.env.WS_SHARD_REGIONS).length,
      draining,
      accepting: !draining,
    },
  };

  // Connectivity check on the raw socket so this endpoint stays
  // independent of the ORM query builder.
  try {
    await pool.query("SELECT 1");
    health.db = true;
  } catch {
    health.db = false;
    health.ok = false;
  }

  // Redis is OPTIONAL (off the hot path), so a degraded client is reported
  // but does NOT fail health — the app runs fine without it.
  //
  // Draining fails health so an LB removes the instance while in-flight
  // requests/WS connections finish.
  if (draining) health.ok = false;

  return Response.json(health, { status: health.ok ? 200 : 503 });
}
