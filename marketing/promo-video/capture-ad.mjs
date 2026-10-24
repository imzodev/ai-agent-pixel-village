// Records the billboard promo's footage from the LOCAL dev world (never
// production), with the dev server and tickd running: `npm run capture-ad`.
// Three shots, each at a different board (a filming character lingers a while
// after its shot): the plaza's west board waiting for a poster ("your ad here"),
// the east board with the sample poster up (ad-poster.ts; a rental made for the
// shot and deleted after), and the roadside board at the village gate.
// Clips land in footage/ad/.
// POSTER=<file> is the stored poster's name (ad-poster.ts prints it).
import { db, open, shot, makeCharacter, goTo, setWorld, hud } from "./rec.mjs";

const POSTER = process.env.POSTER;
if (!POSTER) throw new Error("POSTER=<file from ad-poster.ts> is required");
const only = (process.env.SHOTS ?? "").split(",").filter(Boolean);
await db.connect();
const { browser, page, size } = await open();
const dir = "footage/ad";
const id = await makeCharacter(page, "Juniper");
const take = async (key, name, seconds, setup, act) => {
  if (only.length && !only.includes(key)) return;
  console.log(`shot ${key}-${name}`);
  await setup();
  await shot(page, size, `${key}-${name}`, seconds, act, size, dir);
};
const walk = async (keyName, ms) => { await page.keyboard.down(keyName); await page.waitForTimeout(ms); await page.keyboard.up(keyName); };
/** A board's spot (src/lib/billboardSpotsData.json): its top-left tile; a board is 7×5 tiles. */
const spot = async (key) => (await import("../../src/lib/billboardSpotsData.json", { with: { type: "json" } })).default.find((s) => s.key === key);

const west = await spot("plaza_west"), plaza = await spot("plaza_east"), road = await spot("road_gate");

// 1. A plaza board, empty: "your ad here", villagers passing.
await take("01", "empty", 10, async () => { await setWorld({ hour: 10 }); await goTo(page, id, west.tx + 5, west.ty + 7, 3); await hud(page, false); }, async () => {});

// 2. The other plaza board with the sample poster up: Juniper stands under it a while, then strolls off.
let rental = null;
try {
  await take("02", "poster", 10, async () => {
    const { rows: [r] } = await db.query(
      `insert into billboard_rentals (spot_key, tier, price_cents, status, owner_token, contact_email, title, image_path, approved_at)
       values ($1, 'plaza', 0, 'active', $2, 'promo@localhost', 'Your game here', $3, now()) returning id`,
      [plaza.key, `promo-${Date.now().toString(36)}`, POSTER],
    );
    rental = r.id;
    await page.waitForTimeout(32_000); // the server's poster cache (30 s)
    await setWorld({ hour: 11 });
    await goTo(page, id, plaza.tx + 3, plaza.ty + 7, 3);
    await hud(page, false);
  }, async () => { await page.waitForTimeout(5500); await walk("d", 2500); });
} finally {
  if (rental) await db.query("delete from billboard_rentals where id = $1", [rental]);
}

// 3. The roadside board at the village gate, on the King's Road out west.
await take("03", "road", 8, async () => { await setWorld({ hour: 16 }); await goTo(page, id, road.tx + 5, road.ty + 7, 2); await hud(page, false); }, async () => {});

await browser.close();
await setWorld({ hour: 12 });
console.log("done: delete the filming characters with `npm run cleanup`");
await db.end();
