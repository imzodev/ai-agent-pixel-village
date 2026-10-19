// Records the promo's gameplay footage from the LOCAL dev world (never
// production): run `npm run capture` (wide, 1920×1080) and
// `ORIENT=tall npm run capture` (1080×1920, the phone layout), with the dev
// server and tickd running. Clips land in footage/<orient>/NN-name.mp4.
// One shot: SHOTS=05 npm run capture.
import { db, open, shot, makeCharacter, goTo, setWorld, hud, give, nudgeMind } from "./rec.mjs";

const TALL = process.env.ORIENT === "tall";
const only = (process.env.SHOTS ?? "").split(",").filter(Boolean);
await db.connect();
const { browser, page, size } = await open(TALL ? { width: 1080, height: 1920 } : {});
const dir = `footage/${TALL ? "tall" : "wide"}`;
const id = await makeCharacter(page, "Juniper");
await db.query("update characters set level = 12, coins = 800, hp = 85, max_hp = 85 where id = $1", [id]); // the template each shot's character is copied from
const take = async (key, name, seconds, setup, act) => {
  if (only.length && !only.includes(key)) return;
  console.log(`shot ${key}-${name}`);
  await setup();
  await shot(page, size, `${key}-${name}`, seconds, act, size, dir);
};
const walk = async (keyName, ms) => { await page.keyboard.down(keyName); await page.waitForTimeout(ms); await page.keyboard.up(keyName); };
const near = (n) => talksSince(n);
async function talksSince(t) { return Number((await db.query("select count(*) n from npc_talks where at > $1", [new Date(t)])).rows[0].n); }

// 1. The grove at golden hour.
// Juniper stands still on open ground: the villagers going about their day carry the shot.
await take("01", "grove", 12, async () => { await setWorld({ hour: 17.5 }); await goTo(page, id, 36, 27, 2); await hud(page, false); }, async () => {});

// 2. Two villagers talking on the plaza (tickd starts a watched conversation every ~30 s).
await take("02", "talk", 55, async () => { await setWorld({ hour: 13 }); await goTo(page, id, 28, 25, 3); await hud(page, false); }, async () => {});
console.log("  conversations during the shot:", await near(Date.now() - 60_000));

// 3. Rowan sets off with a full load of wheat for Hollis's mill. His plan is reset in the dev
// database and tickd decides on its own (forcing a think from here can race with tickd's).
await take("03", "carry", 70, async () => {
  await setWorld({ hour: 10 });
  const { rows: [r] } = await db.query("select id, round(home_x/16)::int hx, round(home_y/16)::int hy from npcs where key = 'village_rowan'");
  await goTo(page, id, r.hx + 1, r.hy + 3, 2);
  await db.query("update npc_minds set intent = '', stock = stock || '{\"wheat\": 14}'::jsonb, last_think_at = now() - interval '2 minutes' where npc_id = $1", [r.id]);
  await hud(page, false);
}, async () => {});

// 4. Say something; the villager answers.
await take("04", "chat", 16, async () => { await goTo(page, id, 54, 33, 2); await hud(page, true); }, async () => {
  const box = page.getByPlaceholder(/Say something/);
  await box.click(); await box.type("Marigold, what's fresh today?", { delay: 45 }); await page.keyboard.press("Enter");
});

// 5. Jobs: hired by Hollis, today's wheat handed in.
const hollisAt = async () => (await db.query("select round(x/16)::int tx, round(y/16)::int ty from npcs where key = 'village_hollis'")).rows[0];
await take("05", "jobs", 12, async () => {
  const h = await hollisAt();
  await goTo(page, id, h.tx, h.ty + 2, 2, async (cid) => {
    await db.query("insert into jobs (character_id, job_key, status, hired_day, progress) values ($1, 'supply_village_hollis', 'active', to_char(now() at time zone 'UTC', 'YYYY-MM-DD'), null)", [cid]);
    await give(cid, "wheat", 20);
  });
  await hud(page, true);
  await walk("w", 120); await page.keyboard.press("e"); await page.waitForTimeout(600);
}, async () => {
  await page.getByText("💼 Jobs").first().click(); await page.waitForTimeout(3500);
  await page.getByText("📦 Hand in").first().click(); await page.waitForTimeout(3000);
});

// 6. The economy: the village is swimming in wheat, and the price shows it.
await take("06", "market", 8, async () => {
  await db.query("insert into market_demand (market, item_key, glut, updated_at) values ('village', 'wheat', 160, now()) on conflict (market, item_key) do update set glut = 160, updated_at = now()");
  const h = await hollisAt();
  await goTo(page, id, h.tx, h.ty + 2, 2, async (cid) => give(cid, "wheat", 60));
  await hud(page, true);
  await walk("w", 120); await page.keyboard.press("e"); await page.waitForTimeout(600);
}, async () => { await page.getByText("💰 Sell").first().click(); await page.waitForTimeout(2500); await page.keyboard.press("Enter"); });

// 7. A homestead (site_4: fields, vineyard, orchard, pastures with animals, barn).
await take("07", "homestead", 10, async () => { await setWorld({ hour: 15 }); await goTo(page, id, -86, 66, 1); await hud(page, false); }, async () => { await walk("d", 3000); await walk("w", 2500); });

// 8. A town on the continent: Brightwater's harbour.
await take("08", "town", 9, async () => { await setWorld({ hour: 11 }); await goTo(page, id, -660, 6, 1); await hud(page, false); }, async () => { await walk("a", 4500); });

// 9. Into the Whisperwood, sword out.
await take("09", "fight", 14, async () => {
  await setWorld({ hour: 16 });
  const at = { tx: -250, ty: 12 };
  await goTo(page, id, at.tx, at.ty, 2, async (cid) => give(cid, "stone_sword", 1, true));
  // Two wolves, three tiles to the left (the WS server picks tickd-made enemies up within a beat).
  for (const dy of [-1, 1]) {
    const x = (at.tx - 3) * 16 + 8, y = (at.ty + dy) * 16 + 8;
    await db.query("insert into enemies (kind, x, y, target_x, target_y, hp, max_hp, spawned_at, wild, near_at) values ('wolf', $1, $2, $1, $2, 30, 30, now() - interval '1 minute', true, now())", [x, y]);
  }
  await page.waitForTimeout(6000);
  await hud(page, false);
}, async () => {
  await walk("a", 400);
  for (let i = 0; i < 5; i++) { await page.keyboard.down("j"); await page.waitForTimeout(1600); await page.keyboard.up("j"); await walk(i % 2 ? "w" : "s", 250); await walk("a", 200); }
});

await browser.close();
await setWorld({ hour: 12 });
console.log("done: delete the filming characters with `npm run cleanup`");
await db.end();
