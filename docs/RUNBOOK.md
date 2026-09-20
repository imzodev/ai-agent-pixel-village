# Runbook

The HTTP `health` and `metrics` endpoints were removed at the user's request. The underlying registries are still kept (metrics in `src/lib/metrics.ts`, lifecycle flags in `src/lib/lifecycle.ts`) so a future endpoint can expose them. This runbook therefore uses what is actually available today: the lifecycle state, the metrics module via a future endpoint, the Postgres connection state, and the WS logs.

## High p99 latency on the WS path (snapshot refresh)

1. The WS server refreshes a snapshot every `WS_REFRESH_MS` (default 5 s). Each refresh hits the in-process cache; a miss triggers `buildRawSnapshot`, which runs proximity-filtered queries on the read replica. Latency usually comes from:
   - **Postgres replica lag.** Check it on the primary with `SELECT now() - pg_last_xact_replay_timestamp()`.
   - **Connection pool exhaustion.** The metrics module exposes `db_pool_connections{state="..."}` (after a future metrics endpoint is added). For now, look at `pg_stat_activity` for waiting queries on the primary.
   - **Slow in-process render.** The Phaser client is a single browser; rendering 1000s of entities can stall. The bbox default (`PROXIMITY_RADIUS_PX=1152`) bounds the entity set.
2. If the WS reconnect storm is firing (clients all reconnect together), the rate-limit counter (`ws_upgrade_rejected_total{reason="rate_limit"}`) climbs. Tune `WS_MAX_UPGRADES_PER_IP` and `WS_IP_WINDOW_MS`.

## Slow-client eviction spikes

Eviction closes a connection with `1008` after its OS send buffer stays over `SLOW_CLIENT_THRESHOLD_BYTES` for `SLOW_CLIENT_HOLD_MS`. The sweep reads `ws.bufferedAmount`, which is the real queued-bytes count.

1. Check the future `ws_evictions_total{reason="slow"}` counter.
2. Check the WS server log for `closing slow WS client` lines (`pino` JSON in production). Look for client IPs or patterns in `clientId` / `playerId`.
3. Increase the threshold temporarily by setting `SLOW_CLIENT_THRESHOLD_BYTES` (env) and rolling the change. Investigate the root cause before merging.

## Snapshot staleness

1. The WS server's snapshot TTL is `SNAPSHOT_TTL_SECONDS` (default 1). Clients get a fresh snapshot at most every `WS_REFRESH_MS`.
2. The `online_players` materialized view is refreshed by `world-tickd` every `ONLINE_PLAYERS_REFRESH_MS` (default 5 s). If presence data is stale, the view is missing a player the `characters` query would include. The snapshot falls back to the direct `characters` query if the view read fails.
3. If a specific chunk is stale, the `online_players` view may be lagging the primary. Check `pg_stat_user_tables` (last analyze) on the view.

## Sim worker not running

1. Check the advisory lock — `SELECT * FROM pg_locks WHERE lockid = 42`. If held, `SELECT pid, classid, objid, mode, granted FROM pg_locks WHERE lockid = 42` to find the holder.
2. If a previous tickd crashed without releasing, force-release:
   ```sql
   SELECT pg_advisory_unlock(42);
   ```
   Then restart the worker.

## Graceful shutdown

`src/server.ts` flips `isDraining()` to true on SIGTERM/SIGINT and waits 5 s for any future readiness endpoint to report 503, then closes the WS server, the periodic refresh, the HTTP listener, and the pub/sub bridge.

- The WS upgrade path returns `503` while draining (`ws_upgrade_rejected_total{reason="draining"}`).
- The graceful drain delay is hard-coded at 5 s; tune in `src/server.ts` if the LB needs more time.
- The slow-client sweep timer is cleared in `closeAllWs` so shutdown completes cleanly.

## Reconnect storm

Client reconnect jitter is in `worldStream.ts` (exponential backoff capped at 8 s plus random jitter). The server-side rate limit (`WS_MAX_UPGRADES_PER_IP` per `WS_IP_WINDOW_MS`) returns `429`. If storms still get through, tighten the limit or have the LB throttle before the WS upgrade reaches the app.

## NOTIFY / Redis pubsub

The Upstash HTTP subscribe proved unreliable; the sim publishes `world_change` events to Redis, but `startPubSubBridge` is kept exported in `src/lib/world-stream.ts` and will return a no-op thunk until the subscriber path is restored. The WS server pushes fresh snapshots on its own schedule (`WS_REFRESH_MS`); entity updates from `world-tickd` therefore do NOT fan out via pub/sub yet.

If a future `redis.subscribe` call returns errors, check the `WS server log` for the connect error message and the Upstash dashboard's "Commands" tab.
