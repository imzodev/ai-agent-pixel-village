
/** The whole-world map overview (src/lib/mapOverview.ts): RGBA, one pixel per `step` tiles from (tx0, ty0). */
export type MapOverview = { tx0: number; ty0: number; step: number; width: number; height: number; rgba: Buffer };
