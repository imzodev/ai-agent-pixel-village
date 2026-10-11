// A player's profile card (1200×630), the preview X shows for /u/<username>:
// the character, name and title, a few proud numbers, the bosses they've
// beaten and the NPCs who call them a friend.

import { LAIR_BOSSES } from "@/lib/lairs";
import { BOSS_REWARD } from "@/lib/progression";
import { npcDef } from "@/lib/npcDefs";
import { characterPng } from "./characterPng";
import { CARD_W, GROUND_Y, creaturePng, renderCard, siteHost, textPng, trimmed, type CardLayer } from "./cardKit";
import type { Profile } from "@/types/profile";

const GOLD = "#ffd166";

export async function profileCardPng(p: Profile): Promise<Buffer> {
  const layers: CardLayer[] = [];
  const me = await trimmed(await characterPng(p.look.appearance, p.look.cosmetics, p.look.weapon, 7));
  layers.push({ input: me.input, left: 80, top: GROUND_Y + 14 - me.height });

  const x = 80 + me.width + 60;
  const width = CARD_W - x - 70;
  let y = 64;
  const name = await textPng(p.look.name, { font: "pixel", size: 46, color: GOLD, width });
  layers.push({ input: name.input, left: x, top: y }); y += name.height + 18;
  const title = await textPng(`${p.look.title ? `${p.look.title} · ` : ""}level ${p.look.level}`, { font: "body", size: 34, color: "#ffffff", bold: true, width });
  layers.push({ input: title.input, left: x, top: y }); y += title.height + 16;
  const earned = p.achievements.filter((a) => a.done).map((a) => a.name);
  const facts = [
    earned.length ? `${earned.length} achievement${earned.length === 1 ? "" : "s"}: ${earned.slice(0, 3).join(", ")}${earned.length > 3 ? "…" : ""}` : null,
    `${p.collectionPct}% of the collection book`,
    p.trophies.length ? `${p.trophies.length} trophies${p.trophies.some((t) => t.legendary) ? ", legendary weapons among them" : ""}` : null,
    p.dearFriends.length ? `a dear friend of ${p.dearFriends.map((f) => f.name).join(" and ")}` : null,
    p.reputation[0] ? `${p.reputation[0].tier} in ${p.reputation[0].town}` : null,
  ].filter((s): s is string => !!s).slice(0, 3);
  for (const f of facts) {
    const t = await textPng(`· ${f}`, { font: "body", size: 28, color: "#cfd8ff", width });
    layers.push({ input: t.input, left: x, top: y }); y += t.height + 6;
  }

  // On the grass beside them: the bosses they've beaten, then their NPC friends.
  const beaten = [
    ...LAIR_BOSSES.filter((b) => p.trophies.some((t) => t.itemKey === b.trophy)).map((b) => b.kind),
    ...(p.trophies.some((t) => t.itemKey === BOSS_REWARD.itemKey) ? ["rootking"] : []),
  ];
  let gx = x;
  for (const kind of beaten.slice(0, 4)) {
    const art = await creaturePng(kind, 130);
    if (!art || gx + art.width > CARD_W - 60) continue;
    layers.push({ input: art.input, left: gx, top: GROUND_Y + 10 - art.height }); gx += art.width + 18;
  }
  for (const f of p.dearFriends.slice(0, 2)) {
    const def = npcDef(f.key);
    if (!def) continue;
    const art = await trimmed(await characterPng(def.appearance, undefined, undefined, 3));
    if (gx + art.width > CARD_W - 60) break;
    layers.push({ input: art.input, left: gx, top: GROUND_Y + 12 - art.height }); gx += art.width + 14;
  }

  const brand = await textPng("thegroove", { font: "pixel", size: 26, color: "#fff6d0" });
  layers.push({ input: brand.input, left: 48, top: 572 });
  const play = await textPng(`play free · ${siteHost()}`, { font: "body", size: 26, color: "#fff6d0", bold: true });
  layers.push({ input: play.input, left: CARD_W - 48 - play.width, top: 566 });
  return renderCard(layers);
}
