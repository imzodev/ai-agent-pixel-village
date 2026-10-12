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

import { createServer, type Server } from "node:http";
import { EventEmitter } from "node:events";
import next from "next";
import { startMapWork } from "@/lib/worldAtlasServer";
import { attachWsServer, closeAllWs, startPubSubBridge, stopPubSubBridge, startPeriodicRefresh, stopPeriodicRefresh } from "@/lib/world-stream";
import { initRedis } from "@/lib/redis";
import { setDraining } from "@/lib/lifecycle";
import { installCrashLogging, log } from "@/lib/logger";
import { loopLag } from "@/lib/loopLag";

const PORT = Number(process.env.PORT ?? 3000);
const dev = process.env.NODE_ENV !== "production";

// What the game asks for while it loads. In production each route's code is
// loaded on its first request (the first /api/me took 5 s), so right after a
// deploy the first visitors sat on the loading screen for half a minute.
// Ask once ourselves, before they do.
const WARM_PATHS = ["/", "/api/me", "/api/missions/marks", "/api/buildings", "/api/map/markers", "/api/forage", "/api/bakery", "/api/relics", "/api/bounties", "/api/encounters", "/api/chunks/1/0"];

async function warmUp(): Promise<void> {
  const t0 = Date.now();
  for (const path of WARM_PATHS) {
    await fetch(`http://127.0.0.1:${PORT}${path}`, { signal: AbortSignal.timeout(30_000) }).then((r) => r.arrayBuffer()).catch(() => {});
  }
  log.info({ ms: Date.now() - t0 }, "warmed up");
}

async function main(): Promise<void> {
  await initRedis();
  await startPubSubBridge();

  // Next attaches its own 'upgrade' listener (dev HMR and the like) to the
  // server of the first request it handles, and that listener also takes
  // /ws sockets and kills them. Hand it a stand-in server instead; the real
  // one passes it every upgrade that isn't /ws (below).
  const nextUpgrades = new EventEmitter();
  const app = next({ dev, httpServer: nextUpgrades as Server });
  const handle = app.getRequestHandler();
  await app.prepare();

  const server = createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error("[server] next handler error:", err);
      res.statusCode = 500;
      res.end("internal error");
    });
  });

  // Attach WS so we get first crack at /ws upgrades. Everything else goes
  // to Next's listener (Turbopack HMR at /_next/webpack-hmr: without it the
  // dev page never starts). It exists once Next has served a request, which
  // always comes before an HMR upgrade; until then there's no one to answer.
  const wss = attachWsServer(server, (req, socket, head) => {
    if (!nextUpgrades.emit("upgrade", req, socket, head)) socket.destroy();
  });
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
  installCrashLogging();
  loopLag(); // start measuring now, so /api/health has a full window

  server.listen(PORT, () => {
    log.info({ port: PORT, wsPath: "/ws" }, "ready");
    void warmUp();
    // The world map: drop old versions' pictures, pre-draw around the towns (low priority, background workers).
    void startMapWork().catch((err) => log.warn({ err }, "map pre-draw failed"));
  });
}

main().catch((err) => {
  console.error("[server] fatal:", err);
  process.exit(1);
});