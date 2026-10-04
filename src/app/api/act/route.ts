import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { animals, buildings, characters, enemies, forageClaims, groundItems, inventory, resourceNodes, worldChat } from "@/db/schema";
import { handleApiError, requireCharacter } from "@/lib/auth";
import { getContainer } from "@/lib/container";
import { getCropKind } from "@/lib/crops";
import { addItem, logEvent, progressMissions, recalcLevel, removeItem } from "@/lib/game";
import { broadcastChunkReload, getLivePlayerPosition, interruptStrike, livePlayersNear, markWorldDirty, placePlayer } from "@/lib/world-stream";
import { progressHunts, wantedSlain } from "@/lib/bountiesServer";
import { WANTED_XP_MULT } from "@/lib/bounties";
import { chopTree } from "@/lib/treesServer";
import { forageKey, isForage, readyIn } from "@/lib/forage";
import { TREE_REACH_PX, trunkPoint } from "@/lib/trees";
import { getBuildingDoor, getBuildingsManifest } from "@/lib/buildingsServer";
import { rowPositionAt } from "@/lib/motion";
import { rollForageSeed } from "@/lib/gardenRules";
import { ARROW_ITEM, AXE_ITEMS, BOSS_KIND, BOSS_REWARD, SHOT_COOLDOWN_MS, bossRewardees, bowOf, chopBonus, enemyHit, enemyKind, enemyXpAt, isAggressive, playerDamage, rollDrops, weaponBonus } from "@/lib/progression";
import { damagePlayer, gearOf, perksOf } from "@/lib/combat";
import { arrivalPoint } from "@/lib/chunkCollisionServer";
import { tierAt } from "@/lib/continent";
import { tutorialEvent } from "@/lib/tutorialServer";
import { attackerFell, encounterKindOf, noteFighter } from "@/lib/encountersServer";
import { ENCOUNTERS } from "@/lib/encounters";
import { recordCollection } from "@/lib/collectionServer";

/** A blow that interrupts an enemy's wind-up lands this much harder. */
const STAGGER_DMG_MULT = 1.5;

/** When each player last loosed an arrow (the draw takes SHOT_COOLDOWN_MS). */
const lastShot = new Map<number, number>();

export const dynamic = "force-dynamic";

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

/** Fire-and-forget daily-quest event. Keeps the call sites short. */
function daily(characterId: number, kind: "collect" | "pet" | "talk" | "visit" | "spend_coins" | "defeat", payload: Record<string, number | string>, amount = 1): void {
  void getContainer().services.quest
    .recordEvent(characterId, { kind, payload }, amount)
    .catch((e) => console.error("[act] daily quest event failed:", e));
}

/** Live sprite position, falling back to the (stale) DB row. */
function livePos(me: { id: number; x: number; y: number }): { x: number; y: number } {
  const live = getLivePlayerPosition(me.id);
  return { x: live?.x ?? me.x, y: live?.y ?? me.y };
}

/** World actions: pet | gather | attack | enter | chat */
export async function POST(req: Request) {
  try {
    const me = await requireCharacter();
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    if (action === "chat") {
      const text = String(body.text ?? "").trim().slice(0, 140);
      if (!text) return Response.json({ error: "Say something." }, { status: 400 });
      await db.insert(worldChat).values({ speakerType: "player", speakerId: me.id, text });
      const p = livePos(me);
      markWorldDirty(p.x, p.y);
      return Response.json({ ok: true });
    }

    if (action === "pet") {
      const [a] = await db.select().from(animals).where(eq(animals.id, Number(body.id)));
      if (!a) return Response.json({ error: "It scampered off." }, { status: 404 });
      const p = livePos(me);
      // Animals may be mid-walk: compare against where they are right now.
      const ap = rowPositionAt(a, Date.now());
      if (Math.hypot(ap.x - p.x, ap.y - p.y) > 90) return Response.json({ error: "Get a little closer." }, { status: 400 });
      const recently = a.lastPettedAt && Date.now() - a.lastPettedAt.getTime() < 20_000;
      await db.update(animals).set({ pets: a.pets + 1, lastPettedAt: new Date(), mood: "delighted", hunger: Math.max(0, a.hunger - 5) }).where(eq(animals.id, a.id));
      const reactions: Record<string, string[]> = {
        sheep: ["baas softly and leans into your hand", "closes its eyes and hums"],
        cow: ["moos approvingly", "licks your sleeve"],
        pig: ["oinks happily and snuffles your boots", "flops over for a belly rub"],
        llama: ["hums softly and nuzzles your hat", "gives you a long, judgmental look — then leans in"],
        chicken: ["clucks and fluffs up", "pecks your shoe affectionately"],
        duck: ["quacks twice", "wiggles its tail"],
        rabbit: ["twitches its nose", "flops over contentedly"],
        fox: ["watches you warily, then allows it", "chirps"],
        cat: ["purrs like a small engine", "headbutts your hand"],
        dog: ["wags so hard its whole body wiggles", "rolls over"],
      };
      const touched = recently ? [] : await progressMissions(me.id, (r) => r.type === "pet" && r.species === a.species);
      const drops: { itemKey: string; qty: number }[] = [];
      if (!recently) {
        if (a.species === "chicken" && Math.random() < 0.7) drops.push({ itemKey: "egg", qty: 1 });
        if (a.species === "sheep" && Math.random() < 0.5) drops.push({ itemKey: "wool", qty: 1 });
        if (a.species === "fox" && a.pets + 1 >= 5) {
          const [has] = await db.select().from(inventory).where(sql`${inventory.characterId} = ${me.id} and ${inventory.itemKey} = 'fox_charm'`);
          if (!has) drops.push({ itemKey: "fox_charm", qty: 1 });
        }
        for (const d of drops) {
          await addItem(me.id, d.itemKey, d.qty);
          await progressMissions(me.id, (r) => r.type === "collect" && r.itemKey === d.itemKey, d.qty);
        }
        await db.update(characters).set({ xp: sql`${characters.xp} + 2` }).where(eq(characters.id, me.id));
        await recalcLevel(me.id);
        // Daily quests: this pet counts, and each drop is a collect.
        daily(me.id, "pet", { species: a.species });
        for (const d of drops) daily(me.id, "collect", { itemKey: d.itemKey }, d.qty);
      }
      await logEvent("pet", `${me.name} petted ${a.name} the ${a.species}.`, "animal", a.id, a.x, a.y);
      markWorldDirty(a.x, a.y);
      return Response.json({ ok: true, message: `${a.name} ${pick(reactions[a.species] ?? ["seems pleased"])}.${drops.length ? " You got " + drops.map((d) => d.itemKey.replace("_", " ")).join(", ") + "!" : ""}`, gained: drops, missions: touched });
    }

    if (action === "gather") {
      const [n] = await db.select().from(resourceNodes).where(eq(resourceNodes.id, Number(body.id)));
      if (!n) return Response.json({ error: "Nothing here." }, { status: 404 });
      // Garden crops belong to a player: they're harvested via /api/garden.
      if (n.lotId != null) return Response.json({ error: "That's someone's garden. Only the owner can harvest it." }, { status: 403 });
      const p = livePos(me);
      if (Math.hypot(n.x - p.x, n.y - p.y) > 90) return Response.json({ error: "Too far." }, { status: 400 });

      const cfg = getCropKind(n.kind);
      // Every kind in CROP_KINDS has stages>=2; legacy kinds default to
      // a 2-stage binary (ready/picked) so old data still works.
      const stages = cfg?.stages ?? 2;
      let yieldAmt = cfg?.yield ?? n.qty;
      const regrowthMs = cfg?.regrowthMs ?? 0;

      // Pickable at every stage except stage 0 (depleted). With stages=5
      // the user can pick 4 times before the node hits 0 and refuses
      // further picks until it regrows.
      const chop = cfg?.needsAxe === true;
      // Wild patches are personal: each player picks every patch on their
      // own cooldown, and the patch stays for everyone else.
      const forage = isForage(n.kind);
      if (forage) {
        const patch = forageKey(n.kind, n.x, n.y);
        const [claim] = await db.select({ at: forageClaims.at }).from(forageClaims).where(and(eq(forageClaims.characterId, me.id), eq(forageClaims.patch, patch)));
        const wait = readyIn(n.kind, claim?.at.getTime() ?? null, Date.now());
        if (wait > 0) return Response.json({ error: `You've picked this one clean. It'll be ready for you again in ${Math.ceil(wait / 60_000)}m.`, readyInMs: wait }, { status: 400 });
        await db.insert(forageClaims).values({ characterId: me.id, patch, at: new Date() })
          .onConflictDoUpdate({ target: [forageClaims.characterId, forageClaims.patch], set: { at: new Date() } });
      } else if (n.stage < 1) {
        return Response.json({ error: chop ? "Just a stump. It'll grow back." : "Picked clean. It'll grow back." }, { status: 400 });
      }
      const [gear, perks] = await Promise.all([gearOf(me.id), perksOf(me.id)]);
      if (chop && !gear.bag.some((k) => AXE_ITEMS.includes(k))) {
        return Response.json({ error: "You need an axe. Pip sells them." }, { status: 400 });
      }

      // Pick: decrement toward empty (stage 0). If regrowthMs > 0, the
      // next regrowth tick will advance stage back toward stages-1;
      // picking again interrupts that and starts a fresh cycle.
      // (Wild patches don't deplete — the pick was recorded per player above.)
      if (!forage) {
        const newStage = n.stage - 1;
        const newNextAdvanceAt = regrowthMs > 0 ? new Date(Date.now() + regrowthMs) : null;
        await db.update(resourceNodes).set({
          stage: newStage,
          nextAdvanceAt: newNextAdvanceAt,
        }).where(eq(resourceNodes.id, n.id));
      }

      // Better axes and the Lumberjack perk add wood per chop.
      if (chop) yieldAmt += chopBonus(gear.bag, gear.plus) + (perks.has("lumberjack") ? 1 : 0);
      await addItem(me.id, n.itemKey, yieldAmt);
      // Foraging now and then turns up seeds for a home garden (not chopping).
      const found = chop ? null : rollForageSeed(Math.random, perks.has("forager") ? 2 : 1);
      if (found) await addItem(me.id, found, 1);
      await progressMissions(me.id, (r) => r.type === "collect" && r.itemKey === n.itemKey, yieldAmt);
      await db.update(characters).set({ xp: sql`${characters.xp} + 3` }).where(eq(characters.id, me.id));
      await recalcLevel(me.id);
      daily(me.id, "collect", { itemKey: n.itemKey }, yieldAmt);
      markWorldDirty(n.x, n.y);
      const step = await tutorialEvent(me.id, "collect", { itemKey: n.itemKey }, yieldAmt);
      return Response.json({
        ok: true,
        notices: step ? [step] : [],
        message: `${chop ? "Chopped" : "Gathered"} ${yieldAmt} ${n.itemKey.replace("_", " ")}.${found ? ` You found ${found.replace("_seeds", "")} seeds!` : ""}`,
        gained: [{ itemKey: n.itemKey, qty: yieldAmt }, ...(found ? [{ itemKey: found, qty: 1 }] : [])],
      });
    }

    // A generated tree (woods, tree walls): every chop gives wood; the last
    // one fells it, opening the way until it grows back.
    if (action === "chop_tree") {
      const vx = Number(body.vx), vy = Number(body.vy);
      const t = trunkPoint(vx, vy);
      const p = livePos(me);
      if (!Number.isFinite(t.x) || Math.hypot(t.x - p.x, t.y - p.y) > TREE_REACH_PX) return Response.json({ error: "Get closer to the trunk." }, { status: 400 });
      const [gear, perks] = await Promise.all([gearOf(me.id), perksOf(me.id)]);
      if (!gear.bag.some((k) => AXE_ITEMS.includes(k))) return Response.json({ error: "You need an axe. Pip sells them." }, { status: 400 });
      const r = await chopTree(vx, vy);
      if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
      const yieldAmt = 1 + chopBonus(gear.bag, gear.plus) + (perks.has("lumberjack") ? 1 : 0);
      await addItem(me.id, "wood", yieldAmt);
      await progressMissions(me.id, (q) => q.type === "collect" && q.itemKey === "wood", yieldAmt);
      await db.update(characters).set({ xp: sql`${characters.xp} + ${r.felled ? 5 : 3}` }).where(eq(characters.id, me.id));
      await recalcLevel(me.id);
      daily(me.id, "collect", { itemKey: "wood" }, yieldAmt);
      if (r.felled) broadcastChunkReload(r.chunks);
      const step = await tutorialEvent(me.id, "collect", { itemKey: "wood" }, yieldAmt);
      return Response.json({
        ok: true,
        felled: r.felled,
        notices: step ? [step] : [],
        message: r.felled ? `🌲 Timber! The tree comes down (+${yieldAmt} wood). It'll grow back in time.` : `Chopped ${yieldAmt} wood. ${r.hitsLeft} more to fell it.`,
        gained: [{ itemKey: "wood", qty: yieldAmt }],
      });
    }

    // Melee ("attack") or a bow shot ("shoot": an equipped bow, an arrow,
    // its range, no faster than the draw; the target can't hit back).
    if (action === "attack" || action === "shoot") {
      const ranged = action === "shoot";
      const [e] = await db.select().from(enemies).where(eq(enemies.id, Number(body.id)));
      if (!e) return Response.json({ error: "It's gone." }, { status: 404 });
      const p = livePos(me);
      const ep = rowPositionAt(e, Date.now());
      const [gear, perks] = await Promise.all([gearOf(me.id), perksOf(me.id)]);
      const bow = ranged ? bowOf(gear.equipped) : null;
      if (ranged && !bow) return Response.json({ error: "Equip a bow to shoot." }, { status: 400 });
      if (Math.hypot(ep.x - p.x, ep.y - p.y) > (bow ? bow.rangePx : 80)) return Response.json({ error: "Out of reach." }, { status: 400 });
      if (ranged) {
        const now = Date.now();
        if (now - (lastShot.get(me.id) ?? 0) < SHOT_COOLDOWN_MS) return Response.json({ error: "Still drawing…" }, { status: 429 });
        if (!(await removeItem(me.id, ARROW_ITEM, 1))) return Response.json({ error: "You're out of arrows. Shops sell them; smiths make them." }, { status: 400 });
        lastShot.set(me.id, now);
      }
      const def = enemyKind(e.kind);
      const weapon = bow ? bow.damage + (gear.plus[bow.key] ?? 0) : weaponBonus(gear.equipped, gear.plus);
      // Hit it while it's winding up an attack: the attack breaks off, it
      // reels, and the blow lands harder.
      const staggered = interruptStrike(e.id);
      const dmg = Math.round(playerDamage({ level: me.level, weapon, fighter: perks.has("fighter"), roll: Math.random() }) * (staggered ? STAGGER_DMG_MULT : 1));
      const boss = e.kind === BOSS_KIND;
      const who = String(me.id);
      // Atomic hit: many players may strike at once (the boss especially).
      // The boss also tallies each fighter's damage for the shared reward.
      const [after] = await db
        .update(enemies)
        .set({
          hp: sql`${enemies.hp} - ${dmg}`,
          ...(boss ? { damage: sql`coalesce(${enemies.damage}, '{}'::jsonb) || jsonb_build_object(${who}::text, coalesce((${enemies.damage} ->> ${who})::int, 0) + ${dmg})` } : {}),
        })
        .where(eq(enemies.id, e.id))
        .returning({ hp: enemies.hp, maxHp: enemies.maxHp, damage: enemies.damage });
      if (!after) return Response.json({ error: "It's gone." }, { status: 404 });
      // Striking an encounter's attacker earns a share when the fight is won.
      if (e.encounterId) await noteFighter(e.encounterId, me.id);
      let message = staggered ? `⚡ Staggered! You hit the ${def.name} for ${dmg}.` : `You hit the ${def.name} for ${dmg}.`;
      let taken = 0;
      let knockout: { x: number; y: number; coinsLost: number } | null = null;
      const gained: { itemKey: string; qty: number }[] = [];
      const notices: string[] = [];
      let encounterResolved: number | null = null;
      // Only the request that removes the row gets the kill.
      const killed = after.hp <= 0 ? await db.delete(enemies).where(eq(enemies.id, e.id)).returning({ id: enemies.id }) : [];
      const hp = killed.length > 0 ? 0 : Math.max(1, after.hp);
      if (killed.length > 0 && boss) {
        const winners = bossRewardees(after.damage ?? {}, after.maxHp);
        for (const id of winners) {
          await db.update(characters).set({ xp: sql`${characters.xp} + ${BOSS_REWARD.xp}`, coins: sql`${characters.coins} + ${BOSS_REWARD.coins}` }).where(eq(characters.id, id));
          await addItem(id, BOSS_REWARD.itemKey, 1);
          await recalcLevel(id);
          await recordCollection(id, "enemy", BOSS_KIND);
        }
        if (winners.includes(me.id)) gained.push({ itemKey: BOSS_REWARD.itemKey, qty: 1 });
        message = winners.includes(me.id)
          ? `The Old Rootking falls! +${BOSS_REWARD.xp} XP, +${BOSS_REWARD.coins} coins and a Rootking Heartwood.`
          : "The Old Rootking falls! Deal more damage next time to share the reward.";
        await progressMissions(me.id, (r) => r.type === "defeat" && r.enemyKind === e.kind);
        daily(me.id, "defeat", { enemyKind: e.kind });
        await logEvent("boss_defeated", `🌳 The Old Rootking was driven back by ${winners.length} brave villager${winners.length === 1 ? "" : "s"}! ${me.name} struck the final blow.`, "character", me.id, e.x, e.y);
      } else if (killed.length > 0) {
        // Drops go straight to the bag so a zone can be farmed without
        // chasing loot around.
        for (const d of rollDrops(e.kind)) {
          await addItem(me.id, d.itemKey, d.qty);
          gained.push(d);
        }
        // Wanted beasts are worth far more, and pay out their bounty to
        // everyone close by who carries it.
        // Tougher land, tougher beasts, more XP (src/lib/progression.ts TIER_XP_MULT).
        const xp = enemyXpAt(e.kind, tierAt(Math.floor(ep.x / 16), Math.floor(ep.y / 16))) * (e.elite ? WANTED_XP_MULT : 1);
        message = e.title ? `⭐ You brought down ${e.title}! +${xp} XP` : `You defeated the ${def.name}! +${xp} XP`;
        if (e.bountyId) {
          await wantedSlain(e.bountyId, [me.id, ...livePlayersNear(e.x, e.y, 240)]);
          notices.push(`📜 ${e.title} is down — claim the bounty at its town's board.`);
        }
        notices.push(...(await progressHunts(me.id, e.kind)));
        // The last attacker of an encounter: everyone who fought is paid.
        const won = e.encounterId ? await attackerFell(e.encounterId, me.id) : null;
        if (e.encounterId && won) {
          const def = ENCOUNTERS[(await encounterKindOf(e.encounterId)) ?? "beset"];
          notices.push(`🤝 ${def.thanks} +${def.reward.coins} 🪙, +${def.reward.xp} XP`, ...won);
          encounterResolved = e.encounterId;
        }
        if (await recordCollection(me.id, "enemy", e.kind)) notices.push(`📖 New creature in your book: ${def.name}!`);
        const step = await tutorialEvent(me.id, "defeat", { enemyKind: e.kind });
        if (step) notices.push(step);
        await progressMissions(me.id, (r) => r.type === "defeat" && r.enemyKind === e.kind);
        await db.update(characters).set({ xp: sql`${characters.xp} + ${xp}` }).where(eq(characters.id, me.id));
        await recalcLevel(me.id);
        daily(me.id, "defeat", { enemyKind: e.kind });
        await logEvent("combat", `${me.name} drove off a ${def.name}.`, "character", me.id, e.x, e.y);
      } else if (!boss && after.hp > 0) {
        // Aggressive enemies attack on their own, telegraphed and dodgeable
        // (the combat clock in world-stream); only the gentle tier-1 critters
        // still nip back when you hit them up close.
        if (!ranged && !isAggressive(e.kind) && Math.random() < 0.5) {
          taken = enemyHit(e.kind, perks.has("tough"));
          const r = await damagePlayer(me.id, taken);
          message += ` It hits back for ${taken}.`;
          if (r?.knockedOut) {
            knockout = { x: r.x!, y: r.y!, coinsLost: r.coinsLost };
            placePlayer(me.id, r.x!, r.y!);
            message += ` You're knocked out and wake in the village square${r.coinsLost ? `, ${r.coinsLost} coins lighter` : ""}.`;
          }
        }
      }
      markWorldDirty(e.x, e.y);
      return Response.json({ ok: true, message, gained, defeated: hp <= 0, taken, knockout, notices, encounterResolved });
    }

    if (action === "enter") {
      const [b] = await db.select().from(buildings).where(eq(buildings.key, String(body.key)));
      if (!b) return Response.json({ error: "No such place." }, { status: 404 });
      await db.update(buildings).set({ visits: b.visits + 1 }).where(eq(buildings.id, b.id));
      await progressMissions(me.id, (r) => r.type === "visit" && r.buildingKey === b.key);
      daily(me.id, "visit", { buildingKey: b.key });
      // Portals (the Greyspine cave) move you to their other end.
      const entry = (await getBuildingsManifest()).buildings.find((x) => x.key === b.key);
      if (entry?.kind === "portal" && entry.portalTo) {
        const [from, farDoor] = await Promise.all([getBuildingDoor(b.key), getBuildingDoor(entry.portalTo)]);
        const p = livePos(me);
        if (!from || !farDoor) return Response.json({ error: "The way is blocked." }, { status: 400 });
        const to = await arrivalPoint(farDoor); // open ground by the far door, not inside its stamp
        if (Math.hypot(from.x - p.x, from.y - p.y) > 160) return Response.json({ error: "Walk up to it first." }, { status: 400 });
        await db.update(characters).set({ x: to.x, y: to.y }).where(eq(characters.id, me.id));
        placePlayer(me.id, to.x, to.y);
        const into = entry.portalTo === "cave_exit";
        await logEvent("visit", into ? `${me.name} ventured into the Greyspine Caverns.` : `${me.name} climbed back out of the caverns.`, "building", b.id);
        return Response.json({ ok: true, teleport: to, message: into ? "You duck under the timbers and into the dark…" : "You climb the rope ladder back into daylight." });
      }
      await logEvent("visit", `${me.name} stepped into ${b.name}.`, "building", b.id);
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return handleApiError(e);
  }
}
