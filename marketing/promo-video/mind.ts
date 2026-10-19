// Set a villager's mind up for a shot (stock, purse) and make it think now.
// Run from the repo root: npx tsx --env-file=.env marketing/promo-video/mind.ts <npcKey> '<stock json>'
import { adminMind } from "../../src/lib/mind/mindServer";

const [npcKey, stock] = process.argv.slice(2);
const r = await adminMind(npcKey, { stock: stock ? JSON.parse(stock) : undefined, think: true });
console.log(npcKey, "→", r?.decision?.action, r?.intent);
process.exit(0);
