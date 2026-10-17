// Homesteads (src/lib/homesteadServer.ts). GET ?key=<site key> → the
// homestead window; POST { action, key }:
//   "claim"                  — claim the site, at its signpost (free, 2×2 to start)
//   "buy" { col, row }       — buy a parcel next to yours
//   "preview" { col, row, use } — what changing a parcel's use would clear
//   "use" { col, row, use }  — set what a parcel is for (clears it)
//   "release"                — give the homestead up
// Owner actions need you on your homestead (or at its signpost).

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { lots } from "@/db/schema";
import { handleApiError, requireCharacter } from "@/lib/auth";
import { logEvent } from "@/lib/game";
import { buyParcel, claimHomestead, homesteadView, previewUseChange, setParcelUse } from "@/lib/homesteadServer";
import { isParcelUse } from "@/lib/homestead";
import { siteByKey } from "@/lib/homesteadSites";
import { atLot } from "@/lib/lotReach";
import { releaseLot } from "@/lib/lots";
import { getLivePlayerPosition, markWorldDirty } from "@/lib/world-stream";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const me = await requireCharacter();
    const v = await homesteadView(me.id, new URL(req.url).searchParams.get("key") ?? "");
    return v ? Response.json(v) : Response.json({ error: "No such homestead." }, { status: 404 });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireCharacter();
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const key = String(body.key ?? "");
    const site = siteByKey(key);
    if (!site) return Response.json({ error: "No such homestead." }, { status: 404 });
    const p = getLivePlayerPosition(me.id) ?? me;
    const sign = { x: site.sign.tx * 16 + 8, y: site.sign.ty * 16 + 8 };
    const cell = { col: Math.floor(Number(body.col)), row: Math.floor(Number(body.row)) };

    if (action === "claim") {
      const r = await claimHomestead(me.id, key, p);
      if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
      await logEvent("home", `${me.name} claimed a homestead!`, "character", me.id, sign.x, sign.y);
      markWorldDirty(sign.x, sign.y);
      return Response.json({ ...r, view: await homesteadView(me.id, key) });
    }

    // Everything else is the owner's, from on (or right by) the homestead.
    const [lot] = await db.select().from(lots).where(and(eq(lots.key, key), eq(lots.kind, "homestead")));
    if (!lot || !atLot(lot, p.x, p.y)) return Response.json({ error: "Head over to your homestead first." }, { status: 400 });

    if (action === "preview") {
      const use = String(body.use ?? "");
      if (!isParcelUse(use)) return Response.json({ error: "Pick what the parcel will be." }, { status: 400 });
      const r = await previewUseChange(me.id, key, cell, use);
      return "error" in r ? Response.json({ error: r.error }, { status: 400 }) : Response.json(r);
    }
    const r = action === "buy" ? await buyParcel(me.id, key, cell)
      : action === "use" ? await setParcelUse(me.id, key, cell, String(body.use ?? ""))
      : action === "release" ? await releaseLot(me.id, key)
      : null;
    if (!r) return Response.json({ error: "Unknown action." }, { status: 400 });
    if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
    markWorldDirty(r.x ?? sign.x, r.y ?? sign.y);
    return Response.json({ ...r, view: await homesteadView(me.id, key) });
  } catch (e) {
    return handleApiError(e);
  }
}
