import { NextResponse } from "next/server";
import { defaultChunk } from "@/lib/chunkGen";
import { readAuthored, restyleAuthored } from "@/lib/villageRestyle";
import { ensureFelledLoaded } from "@/lib/treesServer";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ cx: string; cy: string }> },
) {
  try {
    const { cx: cxRaw, cy: cyRaw } = await ctx.params;
    if (!/^-?\d+$/.test(cxRaw) || !/^-?\d+$/.test(cyRaw)) {
      return NextResponse.json(
        { error: "Invalid chunk coordinates" },
        { status: 400 },
      );
    }
    const cx = Number.parseInt(cxRaw, 10);
    const cy = Number.parseInt(cyRaw, 10);

    // Hand-authored chunks (the village) are served restyled to the Wilds
    // look; everything else is generated on demand.
    const authored = await readAuthored(cx, cy);
    if (authored) {
      return NextResponse.json(await restyleAuthored(cx, cy, authored), {
        headers: { "Cache-Control": "no-store" },
      });
    }

    await ensureFelledLoaded(); // felled trees are left out of the terrain
    return NextResponse.json(defaultChunk(cx, cy), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}