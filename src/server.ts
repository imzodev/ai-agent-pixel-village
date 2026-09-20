// Custom Next.js + WebSocket server. Both HTTP and WS share the same
// port so the browser sends the session cookie on the WS upgrade.
//
// Why this exists: the WS path needs to read the user's `grove_session`
// cookie to authenticate the connection. Browser same-origin rules
// require WS and HTTP to share scheme + host + port — otherwise the
// cookie is silently dropped on the upgrade and every connection
// arrives anonymous.
//
// Next.js 16's App Router does not support WS upgrades natively, so
// the custom server is the standard solution. Next handles all HTTP
// requests; the WS handler intercepts only the `/ws` upgrade path.
//
// Production deployment: run this file with `tsx` or compile to JS.
// The `dev` and `start` scripts point here.

import { createServer } from "node:http";
import next from "next";
import { attachWsServer, closeAllWs, startPubSubBridge, stopPubSubBridge, startPeriodicRefresh, stopPeriodicRefresh } from "@/lib/world-stream";
import { initRedis } from "@/lib/redis";
import { setDraining } from "@/lib/lifecycle";
import { log } from "@/lib/logger";

const PORT = Number(process.env.PORT ?? 3000);
const dev = process.env.NODE_ENV !== "production";

async function main(): Promise<void> {
  await initRedis();
  await startPubSubBridge();

  const app = next({ dev });
  const handle = app.getRequestHandler();
  await app.prepare();
  // After prepare(), the upgrade handler is available.
  const upgradeHandler = app.getUpgradeHandler();

  const server = createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error("[server] next handler error:", err);
      res.statusCode = 500;
      res.end("internal error");
    });
  });

  // Attach WS so we get first crack at /ws upgrades. Next.js's upgrade
  // handler still gets called for everything else (Turbopack HMR lives
  // at /_next/webpack-hmr and other Next-internal paths). Without the
  // fallback, those upgrades fall through and get killed.
  const wss = attachWsServer(server, (req, socket, head) => upgradeHandler(req, socket, head));
  startPeriodicRefresh();

  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, "draining");
    // Mark the process draining FIRST so any future health/readiness
    // endpoint can return 503 and an LB removes us from rotation. New
    // WS upgrades are also rejected (see world-stream.ts).
    setDraining(true);
    // Give the LB a moment to notice. 5 s is plenty for a healthy LB;
    // longer adds to total shutdown time.
    await new Promise((r) => setTimeout(r, 5000));
    closeAllWs(wss);
    stopPeriodicRefresh();
    await new Promise<void>((r) => server.close(() => r()));
    await stopPubSubBridge();
    log.info("exiting");
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  server.listen(PORT, () => {
    log.info({ port: PORT, wsPath: "/ws" }, "ready");
  });
}

main().catch((err) => {
  console.error("[server] fatal:", err);
  process.exit(1);
});