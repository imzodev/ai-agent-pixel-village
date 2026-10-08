// A background map worker (started by src/lib/mapRenderPool.ts): draws the
// map pictures it's sent (src/lib/mapRender.ts) and saves them to disk, at the
// lowest CPU priority, so the game server never draws a map tile itself.
import os from "node:os";
import { buildBlock, renderTile } from "../src/lib/mapRender";
import type { MapJob, MapJobDone } from "../src/types/mapRender";

try { os.setPriority(19); } catch { /* best effort */ }

process.on("message", async (job: MapJob) => {
  const reply = (r: MapJobDone) => process.send?.(r);
  try {
    if (job.kind === "block") await buildBlock(job.mapV, job.bx, job.by);
    else await renderTile(job.mapV, job.tilesV, job.z, job.mx, job.my);
    reply({ key: job.key, ok: true });
  } catch (err) {
    reply({ key: job.key, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});
// The server went away: so do we.
process.on("disconnect", () => process.exit(0));
