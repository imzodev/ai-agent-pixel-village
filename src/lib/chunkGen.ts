// Deterministic default chunk generator. Shared by the /api/chunks route
// (HTTP delivery) and the server-side collision loader (walkability checks
// for unauthored chunks), so what blocks on screen blocks on the server.
// Plain chunks are grass; the regions west of the village (src/lib/regions.ts)
// add the road, forests, mountains, the river and bridge, towns and caverns.

import { terrainAt } from "./regions";
import { WILDS_FIRSTGID, WILDS_SHEET, WILDS_TILE_ANIMATIONS, wildsGid } from "./terrain/wilds";

export const CHUNK_TILE_W = 24;
export const CHUNK_TILE_H = 15;
export const TILE_PX = 16;

function emptyLayerData(width: number, height: number): number[] {
  return new Array(width * height).fill(0);
}

export function fullTilesets() {
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
    { columns: WILDS_SHEET.columns, firstgid: WILDS_FIRSTGID, image: "../Wilds.png", imageheight: WILDS_SHEET.height, imagewidth: WILDS_SHEET.width, margin: 0, name: "Wilds", spacing: 0, tilecount: (WILDS_SHEET.width / TILE_PX) * (WILDS_SHEET.height / TILE_PX), tileheight: TILE_PX, tilewidth: TILE_PX, tiles: WILDS_TILE_ANIMATIONS },
  ];
}

function layer(id: number, name: string, data: number[]) {
  return { data, height: CHUNK_TILE_H, id, name, opacity: 1, type: "tilelayer", visible: name !== "Collision", width: CHUNK_TILE_W, x: 0, y: 0 };
}

export function defaultChunk(cx: number, cy: number) {
  const W = CHUNK_TILE_W, H = CHUNK_TILE_H;
  const ground = emptyLayerData(W, H);
  const upper = emptyLayerData(W, H);
  const middle = emptyLayerData(W, H);
  const lower = emptyLayerData(W, H);
  const canopy = emptyLayerData(W, H);
  const collision = emptyLayerData(W, H);
  const ox = cx * W, oy = -cy * H;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const cell = terrainAt(ox + x, oy + y);
      // "grass" (under rock, the cave mouth …) uses the Wilds grass too, so the
      // whole generated world shares one palette with the restyled village.
      ground[i] = wildsGid(cell.ground === "grass" ? `grass_${Math.abs(Math.imul(ox + x, 37219) ^ Math.imul(oy + y, 84229)) % 4}` : cell.ground);
      if (cell.upper) upper[i] = wildsGid(cell.upper);
      if (cell.lower) lower[i] = wildsGid(cell.lower);
      if (cell.collide) collision[i] = 1;
      if (cell.prop) middle[i] = wildsGid(cell.prop);
      // A tree crown's walkable upper half is Y-sorted over the player
      // against the blocking crown tile below it — which must be in this
      // chunk to anchor it, so on the chunk's last row it stays static.
      if (cell.canopy) (y < H - 1 ? canopy : middle)[i] = wildsGid(cell.canopy);
    }
  }
  const layers = [
    layer(1, "Ground", ground),
    layer(2, "GroundUpper", upper),
    layer(3, "DecorationLower", lower),
    layer(4, "DecorationMiddle", middle),
    layer(5, "DecorationUpper", canopy),
    layer(6, "Collision", collision),
  ];
  return {
    compressionlevel: -1,
    height: H,
    infinite: false,
    layers,
    nextlayerid: layers.length + 1,
    nextobjectid: 1,
    orientation: "orthogonal",
    renderorder: "right-down",
    tiledversion: "1.11.2",
    tileheight: TILE_PX,
    tilesets: fullTilesets(),
    tilewidth: TILE_PX,
    type: "map",
    version: "1.10",
    width: W,
  };
}
