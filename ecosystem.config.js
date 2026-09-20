// pm2 process manager config for the ai-village stack. Run with
// `pm2 start ecosystem.config.js` (or `pm2-runtime ecosystem.config.js`
// in containers). Each app is intentionally independent so they can be
// scaled separately.
//
// Single-process deployments (the default / dev) use only the `server`
// and `tickd` apps — `ws` stays at 1 instance. To shard the WS layer,
// define WS_SHARD_REGIONS on each `ws-*` instance to cover a disjoint
// band of chunk coordinates and have the LB (Caddyfile.example, or your
// own) route by the `shard` cookie.
//
// Notes on env:
//   - PORT (default 3000): shared by the WS+Next process so the browser
//     sends the session cookie on the WS upgrade (same-origin rule).
//   - DATABASE_REPLICA_URL: snapshot reads go here on the `server` app.
//   - WS_SHARD_ID / WS_SHARD_REGIONS: see src/lib/shards.ts.
//   - SNAPSHOT_TTL_MS, LAST_SEEN_TTL_SECONDS, PROXIMITY_RADIUS_PX,
//     CHUNK_REGISTRY_CAPACITY: Phase 1/2/3 tunables.
//   - WS_REFRESH_MS: how often the WS pushes a fresh snapshot (default 5s).
//   - WS_MAX_UPGRADES_PER_IP / WS_IP_WINDOW_MS: Phase 4 rate limit.

module.exports = {
  apps: [
    {
      name: "ai-village-server",
      script: "tsx src/server.ts",
      // The custom server boots Next.js + the WS on a single port.
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
    {
      name: "ai-village-tickd",
      script: "tsx src/lib/world-tickd.ts",
      env: {
        NODE_ENV: "production",
      },
    },
    // Uncomment and replicate for a sharded WS deployment. Each shard
    // owns a rectangular band of chunk coordinates and routes its own
    // share of the world.
    // {
    //   name: "ai-village-ws-0",
    //   script: "tsx src/lib/world-stream.ts",
    //   env: {
    //     NODE_ENV: "production",
    //     PORT: 3000,
    //     WS_SHARD_ID: "0",
    //     WS_SHARD_REGIONS: "0-9,-9-0",
    //   },
    // },
    // {
    //   name: "ai-village-ws-1",
    //   script: "tsx src/lib/world-stream.ts",
    //   env: {
    //     NODE_ENV: "production",
    //     PORT: 3000,
    //     WS_SHARD_ID: "1",
    //     WS_SHARD_REGIONS: "10-19,-9-0",
    //   },
    // },
  ],
};
