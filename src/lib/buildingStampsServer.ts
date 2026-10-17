// Server-side mirror of the client's `stampBuildings()` pass
// (game/buildingStamps.ts). The client populates the `stamped` Map in
// chunkCollision.ts during WorldScene.create; the server process has no
// Phaser scene, so this pass runs once per server process to keep the
// server's walkability registry in sync. (A homestead's barn and workshop
// block through chunkCollision's dynamic layer instead: homesteadServer.ts.)

import {
  CHUNK_TILE_PX,
  CHUNK_TILE_W,
  blockStampTiles,
  blockedFromChunk,
} from "./chunkCollision";
import { getBuildingsManifest, getTemplate } from "./buildingsServer";

/** The walls of every building, registered once per process. */
let stamping: Promise<void> | null = null;

/** Register the walls of every building in the world (once; cheap to call often). */
export function stampBuildingCollisions(): Promise<void> {
  stamping ??= (async () => {
    const manifest = await getBuildingsManifest();
    await Promise.all(manifest.buildings.map(async (entry) => {
      const blocked = blockedFromChunk(await getTemplate(entry));
      if (blocked.size) blockStampTiles(entry.tx * CHUNK_TILE_PX, entry.ty * CHUNK_TILE_PX, CHUNK_TILE_W, [...blocked]);
    }));
  })();
  return stamping;
}
