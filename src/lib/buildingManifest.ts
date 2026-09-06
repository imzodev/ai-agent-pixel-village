// Building manifest types + pure helpers shared by the client (stamping) and
// the server (seeding). A "building template" is a chunk-sized Tiled JSON
// with the building's art and its own Collision layer; an optional
// "Interactive" tile layer marks the door / interaction point (never
// rendered, never blocking). The manifest carries only placement and business
// metadata — geometry comes from the template itself.

export const BUILDING_TILE_PX = 16;
export const BUILDING_TEMPLATE_W = 24;
export const BUILDING_TEMPLATE_H = 15;

export type BuildingManifestEntry = {
  key: string;
  /** Public URL of the Tiled template JSON. */
  file: string;
  name: string;
  kind: string;
  description?: string;
  color?: string;
  menu?: string[];
  reservable?: boolean;
  /** World tile (16px grid) of the template's top-left corner. */
  tx: number;
  ty: number;
};

export type BuildingManifest = { buildings: BuildingManifestEntry[] };

type TiledLayer = { name?: unknown; type?: unknown; data?: unknown };
type TiledMap = { layers?: TiledLayer[] };

function layerByName(map: unknown, name: string): number[] | null {
  const layers = (map as TiledMap)?.layers;
  if (!Array.isArray(layers)) return null;
  for (const layer of layers) {
    if (layer?.type !== "tilelayer") continue;
    if (typeof layer.name !== "string" || layer.name.toLowerCase() !== name.toLowerCase()) continue;
    if (!Array.isArray(layer.data)) continue;
    return layer.data as number[];
  }
  return null;
}

/** First non-zero tile in the "Interactive" layer → {dx, dy}, or null. */
export function doorTileOf(template: unknown): { dx: number; dy: number } | null {
  const data = layerByName(template, "Interactive");
  if (!data) return null;
  for (let i = 0; i < data.length; i++) {
    if (typeof data[i] === "number" && data[i] > 0) {
      return { dx: i % BUILDING_TEMPLATE_W, dy: Math.floor(i / BUILDING_TEMPLATE_W) };
    }
  }
  return null;
}

/** Bounding box of the Collision layer (tile units), 1×1 fallback. */
export function footprintOf(template: unknown): { tw: number; th: number } {
  const data = layerByName(template, "Collision");
  if (!data) return { tw: 1, th: 1 };
  let minX = BUILDING_TEMPLATE_W, minY = BUILDING_TEMPLATE_H, maxX = -1, maxY = -1;
  for (let i = 0; i < data.length; i++) {
    if (!(typeof data[i] === "number" && data[i] > 0)) continue;
    const x = i % BUILDING_TEMPLATE_W;
    const y = Math.floor(i / BUILDING_TEMPLATE_W);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (maxX < 0) return { tw: 1, th: 1 };
  return { tw: maxX - minX + 1, th: maxY - minY + 1 };
}

/** World pixel of the door for a placed building; falls back to the
 *  footprint's bottom-center when the template has no Interactive layer. */
export function doorWorldPx(entry: BuildingManifestEntry, template: unknown): { x: number; y: number } {
  const door = doorTileOf(template);
  if (door) {
    return { x: (entry.tx + door.dx) * BUILDING_TILE_PX + 8, y: (entry.ty + door.dy) * BUILDING_TILE_PX + 12 };
  }
  const fp = footprintOf(template);
  return { x: (entry.tx + fp.tw / 2) * BUILDING_TILE_PX, y: (entry.ty + fp.th) * BUILDING_TILE_PX + 12 };
}
