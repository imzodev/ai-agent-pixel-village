import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { animals, buildings, characters, enemies, groundItems, inventory, resourceNodes, worldChat } from "@/db/schema";
import { handleApiError, requireCharacter } from "@/lib/auth";
import { addItem, logEvent, progressMissions, recalcLevel } from "@/lib/game";

export const dynamic = "force-dynamic";

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

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
      return Response.json({ ok: true });
    }

    if (action === "pet") {
      const [a] = await db.select().from(animals).where(eq(animals.id, Number(body.id)));
      if (!a) return Response.json({ error: "It scampered off." }, { status: 404 });
      if (Math.hypot(a.x - me.x, a.y - me.y) > 90) return Response.json({ error: "Get a little closer." }, { status: 400 });
      const recently = a.lastPettedAt && Date.now() - a.lastPettedAt.getTime() < 20_000;
      await db.update(animals).set({ pets: a.pets + 1, lastPettedAt: new Date(), mood: "delighted", hunger: Math.max(0, a.hunger - 5) }).where(eq(animals.id, a.id));
      const reactions: Record<string, string[]> = {
        sheep: ["baas softly and leans into your hand", "closes its eyes and hums"],
        cow: ["moos approvingly", "licks your sleeve"],
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
      }
      await logEvent("pet", `${me.name} petted ${a.name} the ${a.species}.`, "animal", a.id, a.x, a.y);
      return Response.json({ ok: true, message: `${a.name} ${pick(reactions[a.species] ?? ["seems pleased"])}.${drops.length ? " You got " + drops.map((d) => d.itemKey.replace("_", " ")).join(", ") + "!" : ""}`, gained: drops, missions: touched });
    }

    if (action === "gather") {
      const [n] = await db.select().from(resourceNodes).where(eq(resourceNodes.id, Number(body.id)));
      if (!n) return Response.json({ error: "Nothing here." }, { status: 404 });
      if (Math.hypot(n.x - me.x, n.y - me.y) > 90) return Response.json({ error: "Too far." }, { status: 400 });
      if (n.respawnAt || n.qty <= 0) return Response.json({ error: "Picked clean. It'll grow back." }, { status: 400 });
      const qty = n.qty - 1;
      await db.update(resourceNodes).set({ qty, respawnAt: qty <= 0 ? new Date(Date.now() + 4 * 60_000) : null }).where(eq(resourceNodes.id, n.id));
      await addItem(me.id, n.itemKey, 1);
      await progressMissions(me.id, (r) => r.type === "collect" && r.itemKey === n.itemKey, 1);
      await db.update(characters).set({ xp: sql`${characters.xp} + 3` }).where(eq(characters.id, me.id));
      await recalcLevel(me.id);
      return Response.json({ ok: true, message: `Gathered 1 ${n.itemKey.replace("_", " ")}.`, gained: [{ itemKey: n.itemKey, qty: 1 }] });
    }

    if (action === "attack") {
      const [e] = await db.select().from(enemies).where(eq(enemies.id, Number(body.id)));
      if (!e) return Response.json({ error: "It's gone." }, { status: 404 });
      if (Math.hypot(e.x - me.x, e.y - me.y) > 80) return Response.json({ error: "Out of reach." }, { status: 400 });
      const [sword] = await db.select().from(inventory).where(sql`${inventory.characterId} = ${me.id} and ${inventory.itemKey} = 'wooden_sword' and ${inventory.equipped} = true`);
      const dmg = 2 + Math.floor(Math.random() * 3) + (sword ? 2 : 0) + Math.floor(me.level / 2);
      const hp = e.hp - dmg;
      let message = `You hit the ${e.kind} for ${dmg}.`;
      let taken = 0;
      const gained: { itemKey: string; qty: number }[] = [];
      if (hp <= 0) {
        await db.delete(enemies).where(eq(enemies.id, e.id));
        message = `You defeated the ${e.kind}!`;
        if (e.kind === "slime" || Math.random() < 0.5) {
          await db.insert(groundItems).values({ itemKey: e.kind === "slime" ? "slime_gel" : "mushroom", qty: 1, x: e.x, y: e.y + 6 });
        }
        await progressMissions(me.id, (r) => r.type === "defeat" && r.enemyKind === e.kind);
        await db.update(characters).set({ xp: sql`${characters.xp} + 10` }).where(eq(characters.id, me.id));
        await recalcLevel(me.id);
        await logEvent("combat", `${me.name} drove off a ${e.kind}.`, "character", me.id, e.x, e.y);
      } else {
        await db.update(enemies).set({ hp }).where(eq(enemies.id, e.id));
        if (Math.random() < 0.5) {
          taken = 1 + Math.floor(Math.random() * 2);
          const myHp = Math.max(1, me.hp - taken);
          await db.update(characters).set({ hp: myHp }).where(eq(characters.id, me.id));
          message += ` It hits back for ${taken}.`;
        }
      }
      return Response.json({ ok: true, message, gained, defeated: hp <= 0, taken });
    }

    if (action === "enter") {
      const [b] = await db.select().from(buildings).where(eq(buildings.key, String(body.key)));
      if (!b) return Response.json({ error: "No such place." }, { status: 404 });
      await db.update(buildings).set({ visits: b.visits + 1 }).where(eq(buildings.id, b.id));
      await progressMissions(me.id, (r) => r.type === "visit" && r.buildingKey === b.key);
      await logEvent("visit", `${me.name} stepped into ${b.name}.`, "building", b.id);
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return handleApiError(e);
  }
}
