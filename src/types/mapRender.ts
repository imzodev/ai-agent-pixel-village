// The map's background drawing (src/lib/mapRender.ts, src/lib/mapRenderPool.ts). Types only.
import type { ChildProcess } from "node:child_process";

/** A piece of map work for a background worker. */
export type MapJob =
  | { kind: "block"; key: string; mapV: string; bx: number; by: number }
  | { kind: "tile"; key: string; mapV: string; tilesV: string; z: number; mx: number; my: number };

/** What a worker reports back. */
export type MapJobDone = { key: string; ok: boolean; error?: string };

/** The overview's frame: where it starts (tiles) and its size in blocks. */
export type OverviewFrame = { tx0: number; ty0: number; blocksX: number; blocksY: number };

/** The worker pool's state (src/lib/mapRenderPool.ts). */
export type MapPoolWaiting = { job: MapJob; low: boolean; resolve: ((ok: boolean) => void)[] };
export type MapPoolWorker = { proc: ChildProcess; busy: string | null };
export type MapPool = { waiting: Map<string, MapPoolWaiting>; order: string[]; low: string[]; workers: MapPoolWorker[] };
