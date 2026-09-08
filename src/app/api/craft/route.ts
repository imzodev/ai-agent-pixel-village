// Craft endpoint — thin transport. The pure recipe checks + the db
// validation live below. Proximity check enforces the discovery mechanic:
// you must stand near the crafter NPC to use their recipes.
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { characters, npcs } from "@/db/schema";
import { handleApiError, requireCharacter } from "@/lib/auth";
import { addItem, logEvent, removeItem } from "@/lib/game";
import { maxCraftable, recipeByKey } from "@/lib/recipes";

export const dynamic = "force-dynamic";

type CraftResult =
  | { ok: true; recipeKey: string; crafted: number; consumed: { itemKey: string; qty: number }[]; outputQty: number }
  | { ok: false; error: string };

async function performCraft(opts: {
  characterId: number;
  recipeKey: string;
  qty: number;
  crafterNpcId: number;
}): Promise<CraftResult> {
  const qty = Math.max(1, Math.min(99, Math.floor(opts.qty || 1)));
  const recipe = recipeByKey(opts.recipeKey);
  if (!recipe) return { ok: false, error: "Nothing like that comes to mind." };

  const [crafter] = await db.select().from(npcs).where(eq(npcs.key, recipe.crafterKey));
  if (!crafter || crafter.id !== opts.crafterNpcId) {
    return { ok: false, error: `That recipe belongs to ${crafter?.name ?? "someone else"}.` };
  }

  const [me] = await db.select().from(characters).where(eq(characters.id, opts.characterId));
  if (!me) return { ok: false, error: "You don't have that." };

  if (Math.hypot(crafter.x - me.x, crafter.y - me.y) > 160) {
    return { ok: false, error: `Walk closer to ${crafter.name} first.` };
  }

  const invRows = await db
    .select({ itemKey: sql<string>`item_key`, qty: sql<number>`sum(${sql.raw("qty")})::int` })
    .from(sql`inventory`)
    .where(sql`character_id = ${opts.characterId} AND item_key = ANY(${recipe.inputs.map((i) => i.itemKey)})`)
    .groupBy(sql`item_key`);
  const have = new Map(invRows.map((r) => [r.itemKey, r.qty ?? 0]));
  const max = maxCraftable(recipe, [...have.entries()].map(([itemKey, q]) => ({ itemKey, qty: q })));
  if (max < qty) {
    const lacking = recipe.inputs
      .filter((i) => (have.get(i.itemKey) ?? 0) < i.qty * qty)
      .map((i) => `${(have.get(i.itemKey) ?? 0)}/${i.qty * qty} ${i.itemKey}`)
      .join(", ");
    return { ok: false, error: `You don't have enough — need ${lacking}.` };
  }

  // Debit inputs
  for (const input of recipe.inputs) {
    const ok = await removeItem(opts.characterId, input.itemKey, input.qty * qty);
    if (!ok) return { ok: false, error: "Something went wrong mid-craft — nothing was made." };
  }

  // Credit output
  await addItem(opts.characterId, recipe.output.itemKey, recipe.output.qty * qty);

  return {
    ok: true,
    recipeKey: recipe.key,
    crafted: qty,
    consumed: recipe.inputs.map((i) => ({ itemKey: i.itemKey, qty: i.qty * qty })),
    outputQty: recipe.output.qty * qty,
  };
}

export async function POST(req: Request) {
  try {
    const me = await requireCharacter();
    const body = await req.json().catch(() => ({}));
    const recipeKey = String(body.recipeKey ?? "");
    const qty = Math.max(1, Math.min(99, Number(body.qty ?? 1)));
    const crafterNpcId = Number(body.crafterNpcId ?? 0);
    if (!recipeKey || !crafterNpcId) {
      return Response.json({ error: "Pick what to craft." }, { status: 400 });
    }

    const r = await performCraft({ characterId: me.id, recipeKey, qty, crafterNpcId });
    if (!r.ok) return Response.json({ error: r.error }, { status: 400 });

    await logEvent(
      "craft",
      `${me.name} crafted ${r.crafted} × ${r.recipeKey}.`,
      "character",
      me.id,
      me.x,
      me.y,
    );
    return Response.json({ ok: true, recipeKey: r.recipeKey, crafted: r.crafted, consumed: r.consumed, outputQty: r.outputQty });
  } catch (e) {
    return handleApiError(e);
  }
}
