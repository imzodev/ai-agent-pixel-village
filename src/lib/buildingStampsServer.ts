// Server-side mirror of the client's `stampBuildings()` pass
// (game/buildingStamps.ts). The client populates the `stamped` Map in
// chunkCollision.ts during WorldScene.create; the server process has no
// Phaser scene, so this pass runs once per server process to keep the
// server's walkability registry in sync. Incremental: the world's buildings
// only change when homestead lot rows open (src/lib/lotRowsServer.ts).

import {
  CHUNK_TILE_PX,
  CHUNK_TILE_W,
  blockStampTiles,
  blockedFromChunk,
} from "./chunkCollision";
import { getBuildingsManifest, getTemplate } from "./buildingsServer";
import { openRowsVersion } from "./lotRowsServer";

/** Entries whose collision is registered, and the open-rows version it matches. */
const stamped = new Set<string>();
let stampedVersion = -1;

/** Register the walls of every building in the world; when lot rows open,
 *  the new lots' walls are added (cheap to call often: a version check). */
export async function stampBuildingCollisions(): Promise<void> {
  const manifest = await getBuildingsManifest(); // re-reads open rows at most once a minute
  if (stampedVersion === openRowsVersion()) return;
  stampedVersion = openRowsVersion();
  await Promise.all(
    manifest.buildings.filter((e) => !stamped.has(e.key)).map(async (entry) => {
      stamped.add(entry.key);
      const template = await getTemplate(entry);
      const blocked = blockedFromChunk(template);
      if (blocked.size === 0) return;
      const ox = entry.tx * CHUNK_TILE_PX;
      const oy = entry.ty * CHUNK_TILE_PX;
      blockStampTiles(ox, oy, CHUNK_TILE_W, [...blocked]);
    }),
  );
}
