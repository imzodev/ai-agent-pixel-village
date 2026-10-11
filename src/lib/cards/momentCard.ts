// A moment's share card (1200×630): the player standing on the left, what
// they did in the middle, and the boss, friend or level on the right.
// Written once to .cache/cards/<id>.png: a moment never changes.

import fs from "node:fs";
import path from "node:path";
import { npcDef } from "@/lib/npcDefs";
import { characterPng } from "./characterPng";
import { CARD_W, GROUND_Y, creaturePng, renderCard, siteHost, textPng, trimmed, type CardLayer } from "./cardKit";
import type { CardLook, MomentView } from "@/types/moments";

const CACHE = path.join(process.cwd(), ".cache", "cards");
const GOLD = "#ffd166";

/** The art on the right: a boss, an NPC friend, or a level badge (null = none). */
async function artFor(m: MomentView): Promise<{ input: Buffer; width: number; height: number } | null> {
  const art = m.data.art;
  if (!art) return null;
  if (art.kind === "enemy") return creaturePng(art.key, 300);
  if (art.kind === "npc") {
    const npc = npcDef(art.key);
    return npc ? trimmed(await characterPng(npc.appearance, undefined, undefined, 6)) : null;
  }
  return textPng(String(art.level), { font: "pixel", size: 150, color: GOLD });
}

export async function momentCardPng(m: MomentView, look: CardLook): Promise<Buffer> {
  const file = path.join(CACHE, `${m.id}.png`);
  try { return fs.readFileSync(file); } catch { /* not drawn yet */ }

  const layers: CardLayer[] = [];
  const me = await trimmed(await characterPng(look.appearance, look.cosmetics, look.weapon, 6));
  const meLeft = 70;
  layers.push({ input: me.input, left: meLeft, top: GROUND_Y + 14 - me.height });

  const art = await artFor(m);
  const artLeft = art ? CARD_W - 70 - art.width : CARD_W - 60;
  if (art) {
    const onGround = m.data.art?.kind !== "level";
    layers.push({ input: art.input, left: artLeft, top: onGround ? GROUND_Y + 14 - art.height : Math.round((GROUND_Y - art.height) / 2) + 20 });
  }

  // The words, between the two.
  const x = meLeft + me.width + 50;
  const width = Math.max(320, artLeft - 40 - x);
  let y = 70;
  const who = await textPng(`${look.name}${look.title ? ` · ${look.title}` : ""}`, { font: "body", size: 30, color: "#cfd8ff", bold: true, width });
  layers.push({ input: who.input, left: x, top: y }); y += who.height + 22;
  const head = await textPng(m.data.headline, { font: "pixel", size: 40, color: GOLD, width });
  layers.push({ input: head.input, left: x, top: y }); y += head.height + 24;
  const sub = await textPng(m.data.sub, { font: "body", size: 32, color: "#ffffff", width });
  layers.push({ input: sub.input, left: x, top: y }); y += sub.height + 14;
  if (m.data.extra) {
    const extra = await textPng(m.data.extra, { font: "body", size: 30, color: "#ffb86b", bold: true, width });
    layers.push({ input: extra.input, left: x, top: y });
  }

  // Footer, on the grass.
  const brand = await textPng("thegroove", { font: "pixel", size: 26, color: "#fff6d0" });
  layers.push({ input: brand.input, left: 48, top: 572 });
  const play = await textPng(`play free · ${siteHost()}`, { font: "body", size: 26, color: "#fff6d0", bold: true });
  layers.push({ input: play.input, left: CARD_W - 48 - play.width, top: 566 });

  const png = await renderCard(layers);
  try { fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(file, png); } catch { /* serve it anyway */ }
  return png;
}
