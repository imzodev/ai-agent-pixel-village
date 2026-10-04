// Bicycles: twice-and-more walking pace for getting around the continent.
// Press V to get on or off (you need a bicycle in your bag). You can't fight
// or fish from the saddle, and you're knocked off when something hits you
// or when you go indoors. The rider and bike are drawn together, pedalling,
// by src/game/riding.ts; the scene moves them (src/game/WorldScene.ts) and
// the mounted flag rides along with your position to other players
// (src/lib/world-stream.ts). Riding speed is set with every other player
// speed, in src/lib/speedGuard.ts.

export const BIKE_ITEM = "bicycle";
