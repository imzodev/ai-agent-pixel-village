// Server-side mirror of the client's `stampBuildings()` pass
// (game/buildingStamps.ts). The client populates the `stamped` Map in
// chunkCollision.ts during WorldScene.create; the server process has no
// Phaser scene, so this pass runs once per server process to keep the
// server's walkability registry in sync. Memoised — the manifest never
// changes at runtime.

import {
  CHUNK_TILE_PX,
  CHUNK_TILE_W,
  blockStampTiles,
  blockedFromChunk,
} from "./chunkCollision";
import { getBuildingsManifest, getTemplate } from "./buildingsServer";

let stamped = false;

export async function stampBuildingCollisions(): Promise<void> {
  if (stamped) return;
  stamped = true;
  const manifest = await getBuildingsManifest();
  await Promise.all(
    manifest.buildings.map(async (entry) => {
      const template = await getTemplate(entry);
      const blocked = blockedFromChunk(template);
      if (blocked.size === 0) return;
      const ox = entry.tx * CHUNK_TILE_PX;
      const oy = entry.ty * CHUNK_TILE_PX;
      blockStampTiles(ox, oy, CHUNK_TILE_W, [...blocked]);
    }),
  );
}