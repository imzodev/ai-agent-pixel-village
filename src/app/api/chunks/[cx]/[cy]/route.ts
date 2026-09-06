import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CHUNK_TILE_W = 24;
const CHUNK_TILE_H = 15;
const TILE_PX = 16;

function emptyLayerData(width: number, height: number): number[] {
  return new Array(width * height).fill(0);
}

// Grass GIDs used by the hand-authored chunk maps (Floors_Tiles grass
// variants). Generated chunks fill their Ground layer with these so
// unauthored areas blend seamlessly with authored ones.
const GRASS_GIDS = [4952, 4953, 4954];

function grassLayerData(width: number, height: number, cx: number, cy: number): number[] {
  // Deterministic per-cell variant so a chunk always looks the same.
  const data = new Array<number>(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const h = Math.imul(x + cx * width, 37219) ^ Math.imul(y + cy * height, 84229);
      data[y * width + x] = GRASS_GIDS[Math.abs(h) % GRASS_GIDS.length];
    }
  }
  return data;
}

function fullTilesets() {
  return [
    { columns: 10, firstgid: 1, image: "../beginnertileset.png", imageheight: 160, imagewidth: 160, margin: 0, name: "beginnertileset", spacing: 0, tilecount: 100, tileheight: TILE_PX, tilewidth: TILE_PX, transparentcolor: "#000000" },
    { columns: 25, firstgid: 101, image: "../Floors.png", imageheight: 400, imagewidth: 400, margin: 0, name: "Floors", spacing: 0, tilecount: 625, tileheight: TILE_PX, tilewidth: TILE_PX, transparentcolor: "#000000" },
    { columns: 25, firstgid: 726, image: "../Props.png", imageheight: 400, imagewidth: 400, margin: 0, name: "Props", spacing: 0, tilecount: 625, tileheight: TILE_PX, tilewidth: TILE_PX, transparentcolor: "#000000" },
    { columns: 25, firstgid: 1351, image: "../Roofs.png", imageheight: 400, imagewidth: 400, margin: 0, name: "Roofs", spacing: 0, tilecount: 625, tileheight: TILE_PX, tilewidth: TILE_PX, transparentcolor: "#000000" },
    { columns: 25, firstgid: 1976, image: "../Shadows.png", imageheight: 400, imagewidth: 400, margin: 0, name: "Shadows", spacing: 0, tilecount: 625, tileheight: TILE_PX, tilewidth: TILE_PX, transparentcolor: "#000000" },
    { columns: 42, firstgid: 2601, image: "../Walls.png", imageheight: 800, imagewidth: 672, margin: 0, name: "Walls", spacing: 0, tilecount: 2100, tileheight: TILE_PX, tilewidth: TILE_PX, transparentcolor: "#000000" },
    { columns: 25, firstgid: 4701, image: "../Floors_Tiles.png", imageheight: 416, imagewidth: 400, margin: 0, name: "Floors_Tiles", spacing: 0, tilecount: 650, tileheight: TILE_PX, tilewidth: TILE_PX, transparentcolor: "#000000" },
    { columns: 13, firstgid: 5351, image: "../Rocks.png", imageheight: 304, imagewidth: 208, margin: 0, name: "Rocks", spacing: 0, tilecount: 247, tileheight: TILE_PX, tilewidth: TILE_PX, transparentcolor: "#000000" },
    { columns: 9, firstgid: 5598, image: "../Trees_Size_03.png", imageheight: 160, imagewidth: 144, margin: 0, name: "Trees_Size_03", spacing: 0, tilecount: 90, tileheight: TILE_PX, tilewidth: TILE_PX, transparentcolor: "#000000" },
    { columns: 50, firstgid: 5688, image: "../Furniture.png", imageheight: 864, imagewidth: 800, margin: 0, name: "Furniture", spacing: 0, tilecount: 2700, tileheight: TILE_PX, tilewidth: TILE_PX, transparentcolor: "#000000" },
  ];
}

function defaultChunk(cx: number, cy: number) {
  return {
    compressionlevel: -1,
    height: CHUNK_TILE_H,
    infinite: false,
    layers: [
      {
        data: grassLayerData(CHUNK_TILE_W, CHUNK_TILE_H, cx, cy),
        height: CHUNK_TILE_H,
        id: 1,
        name: "Ground",
        opacity: 1,
        type: "tilelayer",
        visible: true,
        width: CHUNK_TILE_W,
        x: 0,
        y: 0,
      },
      {
        data: emptyLayerData(CHUNK_TILE_W, CHUNK_TILE_H),
        height: CHUNK_TILE_H,
        id: 2,
        name: "DecorationUpper",
        opacity: 1,
        type: "tilelayer",
        visible: true,
        width: CHUNK_TILE_W,
        x: 0,
        y: 0,
      },
    ],
    nextlayerid: 3,
    nextobjectid: 1,
    orientation: "orthogonal",
    renderorder: "right-down",
    tiledversion: "1.11.2",
    tileheight: TILE_PX,
    tilesets: fullTilesets(),
    tilewidth: TILE_PX,
    type: "map",
    version: "1.10",
    width: CHUNK_TILE_W,
  };
}

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