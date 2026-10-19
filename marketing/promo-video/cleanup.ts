// Delete the filming characters capture.mjs made (listed in raw/made.txt), the
// way the game deletes characters (src/lib/abandoned.ts): users and sessions too.
// Run from the repo root: npx tsx --env-file=.env marketing/promo-video/cleanup.ts
import fs from "node:fs";
import { deleteCharacters } from "../../src/lib/abandoned";

const file = "marketing/promo-video/raw/made.txt";
const ids = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").map(Number).filter(Boolean) : [];
const rows = ids.length ? await deleteCharacters(ids, { keepRecords: false }) : 0; // users and sessions too
fs.rmSync(file, { force: true });
console.log(`deleted ${ids.length} filming characters (${rows} rows)`);
process.exit(0);
