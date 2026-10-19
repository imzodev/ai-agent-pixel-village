// Recording helpers for capture.ts: a headless Chrome on the local game, a
// character set up through the dev database, and shots recorded from Chrome's
// screencast (crisper than Playwright's built-in video) into H.264 clips.
import { chromium } from "playwright-core";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const BASE = process.env.PROMO_BASE ?? "http://localhost:3000";
export const db = new pg.Client({ connectionString: process.env.DATABASE_URL });

/** Hide what a promo shouldn't show: the dev badge, save nags, the journey card. Panels stay. */
export const CLEAN_CSS = `
  nextjs-portal, [data-nextjs-toast], [data-next-badge-root] { display: none !important; }
`;

export async function open({ width = 1920, height = 1080, scale = 1 } = {}) {
  // GPU flags: PROMO_GL picks them (the fastest found on this machine is the default).
  const GL = { swiftshader: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"], gles: ["--use-gl=angle", "--use-angle=gl-egl", "--enable-gpu"], vulkan: ["--use-angle=vulkan", "--enable-features=Vulkan", "--enable-gpu"], egl: ["--use-gl=egl", "--enable-gpu"], canvas: ["--disable-webgl", "--disable-3d-apis"] };
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: [...(GL[process.env.PROMO_GL ?? "gles"] ?? GL.gles), "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  await page.addInitScript((css) => { addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s); }); }, CLEAN_CSS);
  return { browser, ctx, page, size: { w: Math.round(width * scale), h: Math.round(height * scale) }, out: { w: 1920, h: 1080 } };
}

/** Record `seconds` of the page while `act` runs; writes footage/<name>.mp4 (30 fps). */
export async function shot(page, size, name, seconds, act = async () => {}, outSize = size, outDir = "footage") {
  const dir = path.join("raw", name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", async (f) => {
    const file = path.join(dir, `${String(frames.length).padStart(5, "0")}.jpg`);
    frames.push({ file, t: f.metadata.timestamp });
    fs.writeFileSync(file, Buffer.from(f.data, "base64"));
    await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: size.w, maxHeight: size.h, everyNthFrame: 1 });
  const end = Date.now() + seconds * 1000;
  await act();
  const left = end - Date.now();
  if (left > 0) await page.waitForTimeout(left);
  await cdp.send("Page.stopScreencast");
  await cdp.detach();
  if (frames.length < 2) throw new Error(`${name}: no frames`);
  // A concat list with each frame's real duration, then a constant 30 fps clip.
  const lines = [];
  for (let i = 0; i < frames.length; i++) {
    const dur = i + 1 < frames.length ? frames[i + 1].t - frames[i].t : 1 / 30;
    lines.push(`file '${path.basename(frames[i].file)}'`, `duration ${dur.toFixed(4)}`);
  }
  lines.push(`file '${path.basename(frames.at(-1).file)}'`);
  fs.writeFileSync(path.join(dir, "list.txt"), lines.join("\n"));
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${name}.mp4`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(dir, "list.txt"), "-vf", `fps=30,scale=${outSize.w}:${outSize.h}:flags=neighbor,format=yuv420p`, "-c:v", "libx264", "-crf", "16", "-preset", "slow", out]);
  console.log(`  ${name}: ${frames.length} frames over ${seconds}s → ${out}`);
  return out;
}

const SESSION = "raw/session.json"; // a Play-now character, made once
/** The filming character: made once with Play now, then reused (its session is kept in raw/). */
export async function makeCharacter(page, name, set = {}) {
  let id;
  if (fs.existsSync(SESSION)) {
    const saved = JSON.parse(fs.readFileSync(SESSION, "utf8"));
    await page.context().addCookies(saved.cookies);
    id = saved.id;
  } else {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    const r = await page.evaluate(async (n) => (await fetch("/api/auth/quick", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: n }) })).json(), name);
    if (!r.ok) throw new Error(`quick: ${r.error}`);
    id = r.character.id;
    fs.writeFileSync(SESSION, JSON.stringify({ id, cookies: await page.context().cookies() }));
  }
  await db.query("update characters set tutorial_step = 99, level = $2, coins = $3 where id = $1", [id, set.level ?? 12, set.coins ?? 800]);
  // A saved character: no "save with a password" reminders in shot.
  await db.query("update users set password_hash = coalesce(password_hash, 'promo-not-a-real-hash') where id = (select user_id from characters where id = $1)", [id]);
  return id;
}

/**
 * A fresh copy of the filming character standing at a tile, logged in on the
 * page. A character the game server has already seen keeps its live position
 * (the speed guard), so each location gets a new one; cleanup.ts deletes them.
 */
export async function goTo(page, templateId, tx, ty, zoomSteps = 2, prep = async () => {}) {
  await page.goto("about:blank");
  const { rows: [u] } = await db.query("insert into users (username, password_hash) values ($1, 'promo-not-a-real-hash') returning id", [`promo_${Date.now().toString(36)}`]);
  const cols = (await db.query("select column_name from information_schema.columns where table_name = 'characters' and column_name not in ('id', 'user_id', 'x', 'y', 'created_at')")).rows.map((r) => `"${r.column_name}"`).join(", ");
  const { rows: [c] } = await db.query(`insert into characters (user_id, x, y, ${cols}) select $2, $3, $4, ${cols} from characters where id = $1 returning id`, [templateId, u.id, tx * 16 + 8, ty * 16 + 8]);
  const token = `promo${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  await db.query("insert into sessions (token, user_id, expires_at) values ($1, $2, now() + interval '1 day')", [token, u.id]);
  await page.context().clearCookies();
  await page.context().addCookies([{ name: "grove_session", value: token, domain: new URL(BASE).hostname, path: "/", httpOnly: true, sameSite: "Lax" }]);
  fs.appendFileSync("raw/made.txt", `${c.id}\n`);
  await prep(c.id); // its bag, jobs… before it loads in
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(9000); // the world streams in
  await page.mouse.move(page.viewportSize().width / 2, page.viewportSize().height / 2);
  for (let i = 0; i < zoomSteps; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(150); }
  await page.waitForTimeout(800);
  return c.id;
}

/** The world's weather and time of day (game hour), for the dev world only. */
export async function setWorld({ weather = "clear", hour = 12 } = {}) {
  const [{ day_length_minutes: len }] = (await db.query("select day_length_minutes from world_state where id = 1")).rows;
  const elapsedMin = (((hour - 7 + 24) % 24) / 24) * len; // the world starts at 7:00
  await db.query("update world_state set weather = $1, weather_until = now() + interval '2 hours', epoch_start = now() - make_interval(secs => $2) where id = 1", [weather, elapsedMin * 60]);
}

const ROOT = path.resolve("../..");
/** Give a villager with a mind some stock and make it think now (src/lib/mind). */
export function nudgeMind(npcKey, stock) {
  const out = execFileSync("npx", ["tsx", "--env-file=.env", "marketing/promo-video/mind.ts", npcKey, JSON.stringify(stock ?? {})], { cwd: ROOT, encoding: "utf8" });
  console.log("  " + out.trim().split("\n").pop());
}

/** Show or hide the HUD (scenery shots hide it; speech bubbles are in the game, so they stay). */
export async function hud(page, on) {
  await page.evaluate((show) => {
    let s = document.getElementById("promo-hud");
    if (!s) { s = document.createElement("style"); s.id = "promo-hud"; document.head.appendChild(s); }
    s.textContent = show ? "" : "div.pointer-events-none.absolute.inset-0.select-none.font-pixel { display: none !important; }";
  }, on);
}

/** Put items in the filming character's bag. */
export async function give(id, itemKey, qty, equipped = false) {
  await db.query("delete from inventory where character_id = $1 and item_key = $2", [id, itemKey]);
  await db.query("insert into inventory (character_id, item_key, qty, meta, equipped) values ($1, $2, $3, '{}', $4)", [id, itemKey, qty, equipped]);
}
