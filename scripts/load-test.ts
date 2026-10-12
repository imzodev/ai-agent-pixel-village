// Load test: how many players and visitors can one game server take?
//
// Ramps up "Play now" players (who load the village, open the game socket
// and walk around like a real client) plus logged-out visitors, holds each
// step, and reads the server's own overload signal (event-loop delay, from
// /api/health) and how long /api/me takes. Stops when the server struggles.
//
// Run it against a LOCAL production build (never production):
//   NODE_ENV=production PORT=3101 SIGNUP_PER_IP_10MIN=100000 PLAYER_MAX=100000 \
//     SPECTATOR_MAX=100000 npx tsx --env-file=.env src/server.ts
//   npx tsx --env-file=.env scripts/load-test.ts --base http://localhost:3101 --steps 25,50,100,200,300
//   npx tsx --env-file=.env scripts/load-test.ts --cleanup   # delete the bots afterwards
//
// Bots don't chat (no LLM calls, no moderation load). Each bot claims its own
// X-Forwarded-For address, which the server trusts from loopback only.

import WebSocket from "ws";
import { VISITOR_CHUNK } from "../src/lib/constants";
import { PLAYER_SPEED } from "../src/lib/speedGuard";
import { SPAWN } from "../src/lib/worldmap";
import type { Health } from "../src/types/health";
import type { LoadBot, LoadStep } from "../src/types/loadTest";

const arg = (name: string, d: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://localhost:3101");
const STEPS = arg("steps", "25,50,100,200,300").split(",").map(Number);
const VISITORS_PER_PLAYER = Number(arg("visitors-per-player", "1"));
const HOLD_S = Number(arg("hold", "20"));
const LAG_LIMIT_MS = Number(arg("lag-limit", "200"));
const ME_LIMIT_MS = Number(arg("me-limit", "1000"));
const BOT_PREFIX = "loadbot";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let ipSeq = 0;
const fakeIp = () => { ipSeq++; return `10.${(ipSeq >> 16) & 255}.${(ipSeq >> 8) & 255}.${ipSeq & 255}`; };
const wsUrl = BASE.replace(/^http/, "ws") + "/ws";

async function makePlayer(i: number): Promise<LoadBot> {
  const ip = fakeIp();
  const res = await fetch(`${BASE}/api/auth/quick`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ name: `Loadbot ${i}` }) });
  if (!res.ok) throw new Error(`signup ${res.status}: ${await res.text()}`);
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const h = { cookie, "x-forwarded-for": ip };
  // What a real client loads before it plays: who am I, the buildings, the village chunks.
  await fetch(`${BASE}/api/me`, { headers: h });
  await fetch(`${BASE}/api/buildings`, { headers: h });
  for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) await fetch(`${BASE}/api/chunks/${VISITOR_CHUNK.cx + dx}/${VISITOR_CHUNK.cy + dy}`, { headers: h });
  const bot: LoadBot = { ws: new WebSocket(wsUrl, { headers: h }), cookie, msgs: 0, bytes: 0 };
  wire(bot, true);
  return bot;
}

function makeVisitor(): LoadBot {
  const bot: LoadBot = { ws: new WebSocket(wsUrl, { headers: { "x-forwarded-for": fakeIp() } }), msgs: 0, bytes: 0 };
  wire(bot, false);
  return bot;
}

/** Counts what arrives; a player also says hello, heartbeats and walks. */
function wire(bot: LoadBot, player: boolean): void {
  bot.ws.on("message", (m: Buffer) => { bot.msgs++; bot.bytes += m.length; });
  bot.ws.on("close", (code) => { bot.closedWith = code; });
  bot.ws.on("error", () => {});
  if (!player) return;
  bot.ws.on("open", () => {
    bot.ws.send(JSON.stringify({ type: "hello" }));
    // A slow random walk around the plaza at walking speed.
    let x = SPAWN.x, y = SPAWN.y, dir = Math.floor(Math.random() * 4);
    const facings = ["up", "down", "left", "right"] as const;
    const step = PLAYER_SPEED * 0.8 * 0.2;
    let tick = 0;
    const pos = setInterval(() => {
      if (bot.ws.readyState !== WebSocket.OPEN) return clearInterval(pos);
      if (++tick % 10 === 0) dir = Math.floor(Math.random() * 4);
      const nx = x + (dir === 2 ? -step : dir === 3 ? step : 0), ny = y + (dir === 0 ? -step : dir === 1 ? step : 0);
      if (Math.abs(nx - SPAWN.x) < 150 && Math.abs(ny - SPAWN.y) < 100) { x = nx; y = ny; } else dir = (dir + 1) % 4;
      bot.ws.send(JSON.stringify({ type: "pos", x, y, facing: facings[dir], mounted: false, t: Date.now() }));
    }, 200);
    const beat = setInterval(() => {
      if (bot.ws.readyState !== WebSocket.OPEN) return clearInterval(beat);
      bot.ws.send(JSON.stringify({ type: "heartbeat", x, y, facing: facings[dir], t: Date.now() }));
    }, 1500);
  });
}

async function timeMe(cookie: string): Promise<number> {
  const t = performance.now();
  await fetch(`${BASE}/api/me`, { headers: { cookie } });
  return performance.now() - t;
}

async function main(): Promise<void> {
  if (process.argv.includes("--cleanup")) return cleanup();
  const players: LoadBot[] = [], visitors: LoadBot[] = [];
  const results: LoadStep[] = [];
  console.log(`Load test against ${BASE}: steps ${STEPS.join(", ")} players (+${VISITORS_PER_PLAYER}× visitors), ${HOLD_S}s each\n`);
  for (const target of STEPS) {
    // Ramp to this step, a few joins at a time (a real rush, not one instant).
    while (players.length < target) {
      const batch = Math.min(10, target - players.length);
      const made = await Promise.allSettled(Array.from({ length: batch }, (_, k) => makePlayer(players.length + k)));
      for (const m of made) if (m.status === "fulfilled") players.push(m.value); else console.log("  join failed:", m.reason instanceof Error ? m.reason.message : m.reason);
      while (visitors.length < players.length * VISITORS_PER_PLAYER) visitors.push(makeVisitor());
      if (made.every((m) => m.status === "rejected")) break;
    }
    const bots = [...players, ...visitors];
    const before = bots.reduce((n, b) => n + b.msgs, 0);
    // Hold: the server reports lag over 10 s windows, so wait for a full one or two.
    await sleep(HOLD_S * 1000);
    const after = bots.reduce((n, b) => n + b.msgs, 0);
    const health = (await (await fetch(`${BASE}/api/health`)).json()) as Health;
    const times: number[] = [];
    for (const p of players.slice(0, 5)) times.push(await timeMe(p.cookie!));
    times.sort((a, b) => a - b);
    const step: LoadStep = {
      players: health.ws.connections,
      spectators: health.ws.spectators,
      lagP99: health.loopLag.p99Ms,
      lagMax: health.loopLag.maxMs,
      rssMb: health.rssMb,
      meP50: Math.round(times[Math.floor(times.length / 2)] ?? 0),
      meMax: Math.round(times.at(-1) ?? 0),
      msgsPerSec: Math.round((after - before) / HOLD_S),
      refused: bots.filter((b) => b.closedWith !== undefined).length,
    };
    results.push(step);
    console.table([step]);
    if (step.lagP99 > LAG_LIMIT_MS || step.meP50 > ME_LIMIT_MS) { console.log(`\nStopping: the server is struggling (lag p99 ${step.lagP99} ms, /api/me ${step.meP50} ms).`); break; }
  }
  for (const b of [...players, ...visitors]) b.ws.close();
  console.log("\nAll steps:");
  console.table(results);
  const ok = results.filter((r) => r.lagP99 <= 100 && r.meP50 <= 500);
  const best = ok.at(-1);
  console.log(best
    ? `\nComfortable up to ${best.players} players + ${best.spectators} visitors here (lag p99 ≤ 100 ms, /api/me ≤ 500 ms).`
    : "\nEven the first step was over the comfortable limits.");
  console.log(`Clean up the ${players.length} bot accounts with: npx tsx --env-file=.env scripts/load-test.ts --cleanup`);
  process.exit(0);
}

/** Deletes every bot account and its rows (local databases only), with the
 * same helper tickd uses for abandoned characters, records and all. */
async function cleanup(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error("Refusing to clean up: DATABASE_URL isn't a local database.");
  const { pool } = await import("../src/db");
  const { deleteCharacters } = await import("../src/lib/abandoned");
  const { rows } = await pool.query<{ id: number }>(
    `SELECT c.id FROM characters c LEFT JOIN users u ON u.id = c.user_id WHERE u.username LIKE $1 OR (c.name LIKE 'Loadbot %' AND u.id IS NULL)`,
    [`${BOT_PREFIX}\\_%`],
  );
  const n = await deleteCharacters(rows.map((r) => r.id), { keepRecords: false });
  console.log(`Deleted ${rows.length} bot characters (${n} rows in all).`);
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
