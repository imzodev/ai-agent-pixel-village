// The patch of world a logged-out visitor can see: the 5×5-chunk camera
// window around VISITOR_CHUNK (the client's WINDOW_RADIUS = 2), in world
// pixels. Shared by the WS server (what goes in the visitor snapshot) and
// the visitor's camera tour, so both agree on the edges.
import { VISITOR_CHUNK } from "@/lib/constants";
import { CHUNK_PX_H, CHUNK_PX_W } from "@/lib/chunkCollision";

export const VISITOR_VIEW = {
  x0: (VISITOR_CHUNK.cx - 2) * CHUNK_PX_W,
  x1: (VISITOR_CHUNK.cx + 3) * CHUNK_PX_W,
  y0: (-VISITOR_CHUNK.cy - 2) * CHUNK_PX_H,
  y1: (-VISITOR_CHUNK.cy + 3) * CHUNK_PX_H,
} as const;

/** Whether a world-pixel rectangle overlaps the visitor's view. */
export function overlapsVisitorView(x: number, y: number, w: number, h: number): boolean {
  return x < VISITOR_VIEW.x1 && x + w > VISITOR_VIEW.x0 && y < VISITOR_VIEW.y1 && y + h > VISITOR_VIEW.y0;
}
