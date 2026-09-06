import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { defaultChunk } from "@/lib/chunkGen";

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

    const mapPath = path.join(
      process.cwd(),
      "public",
      "assets",
      "maps",
      `map_${cx}_${cy}.json`,
    );
    try {
      const buf = await fs.readFile(mapPath);
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    } catch {
      // No hand-authored map for this chunk — fall through to the
      // on-demand default generator so the player can always keep walking.
    }

    return NextResponse.json(defaultChunk(cx, cy), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}