// The world map's pictures on the client, shared by the map panel
// (src/components/MapPanel.tsx) and the quiet prefetch while you play, so
// tiles fetched ahead are already in memory when M opens the map. Also keeps
// the last markers and explored chunks, so the panel draws at once and
// refreshes them in the background.

import { MAP_TILE_H, MAP_TILE_W, mapTileInBounds } from "@/lib/worldAtlas";
import { OPEN_LEVEL, ZOOM_LEVELS, tileZoomFor } from "@/lib/mapZoom";
import type { MapMarkers } from "@/types/map";

const images = new Map<string, HTMLImageElement>(); // bounded below
const IMAGES_CAP = 800;

/** A map tile image, requested once; one still being drawn on the server is asked for again shortly. */
export function tileImage(version: string, z: number, mx: number, my: number): HTMLImageElement {
  const key = `${version}/${z}/${mx}/${my}`;
  let img = images.get(key);
  if (img) return img;
  img = new Image();
  img.onerror = () => { setTimeout(() => { if (images.get(key) === img) images.delete(key); }, 1500); };
  img.src = `/api/map/tile/${z}/${mx}/${my}?v=${version}`;
  images.set(key, img);
  if (images.size > IMAGES_CAP) images.delete(images.keys().next().value!);
  return img;
}

/** What the panel last had (shown at once on the next open, then refreshed). */
export const mapMemory: { markers: MapMarkers | null; seen: Set<string> | null } = { markers: null, seen: null };

let lastPrefetch = 0;
/**
 * While you play, when the browser is idle: fetch the tiles the map opens on
 * around you (and the next level out), so pressing M shows them at once.
 * At most every 20 s; the browser caches tiles (they're immutable per version).
 */
export function prefetchMapAround(x: number, y: number): void {
  const now = Date.now();
  if (now - lastPrefetch < 20_000) return;
  lastPrefetch = now;
  const idle = (fn: () => void) => ((window as typeof window & { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 200)))(fn);
  idle(async () => {
    if (!mapMemory.markers) {
      const m = await fetch("/api/map/markers").then((r) => r.json()).catch(() => null);
      if (m && !m.error) mapMemory.markers = m;
    }
    const version = mapMemory.markers?.version;
    if (!version) return;
    const tx = x / 16, ty = y / 16;
    for (const level of [OPEN_LEVEL, OPEN_LEVEL + 2]) {
      const z = tileZoomFor(ZOOM_LEVELS[level]), k = 2 ** z;
      const mx0 = Math.floor(tx / (MAP_TILE_W * k)), my0 = Math.floor(ty / (MAP_TILE_H * k));
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (mapTileInBounds(z, mx0 + dx, my0 + dy)) tileImage(version, z, mx0 + dx, my0 + dy);
    }
  });
}
