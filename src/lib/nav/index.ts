// Public surface for the navigation module. Keeps test imports and
// sim imports aligned on a single barrel.

export { planPath, makeNavigator } from "./navigator";
export { makeNavCache } from "./navCache";
export type { NavCache } from "./navCache";
export { CELL_PX, cellToWorldCenter, dist, distSq, worldToCell } from "./chunkIndex";
