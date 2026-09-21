// Wire protocol shared by the WS server, the client WS client, and the
// snapshot module. Single source of truth for the shape of every message
// that crosses the network boundary. Both ends import from here so TS
// guarantees shape parity at compile time.

import type { Appearance } from "@/types/domain";
import type { Facing } from "@/types/world";

// Re-exported for callers that already import protocol types together.
export type { Facing };

export type WsClientMessage =
  | { type: "hello"; sessionId?: string; lastVersion?: number }
  | { type: "ping" }
  // Presence heartbeat: slow (1.5 s) and drives the DB lastSeenAt write.
  | { type: "heartbeat"; x: number; y: number; facing: Facing }
  // Movement update: fast (~5 Hz), in-memory only, relayed to nearby
  // players. Never triggers a DB write.
  | { type: "pos"; x: number; y: number; facing: Facing };

export type WsServerMessage =
  | { type: "snapshot"; data: WorldSnapshot }
  | { type: "delta"; version: number; chunkX: number; chunkY: number }
  // Another player's live position, relayed on their `pos`. Applied to the
  // existing sprite if present; ignored otherwise (the next snapshot
  // creates it).
  | { type: "playerPos"; id: number; x: number; y: number; facing: Facing }
  | { type: "pong" }
  | { type: "error"; message: string };

// The same shape the /api/world HTTP endpoint returns. The WS path
// produces the exact same object so the client can hydrate from either
// source identically. `version` is the snapshot version; clients send
// `lastVersion` on reconnect and the server replies with deltas since.
export type WorldSnapshot = {
  version: number;
  now: number;
  hour: number;
  weather: string;
  dayLengthMinutes: number;
  epochStart: number;
  me: PlayerSnapshot | null;
  /** Total online players, world-wide — `players` is proximity-filtered. */
  onlineCount: number;
  players: PlayerSnapshot[];
  npcs: NpcSnapshot[];
  animals: AnimalSnapshot[];
  buildings: BuildingSnapshot[];
  groundItems: GroundItemSnapshot[];
  nodes: ResourceNodeSnapshot[];
  enemies: EnemySnapshot[];
  chat: ChatSnapshot[];
  events: EventSnapshot[];
};

export type PlayerSnapshot = {
  id: number;
  name: string;
  x: number;
  y: number;
  facing: string;
  appearance: Appearance;
  level: number;
  hp: number;
  maxHp: number;
  coins: number;
  gems: number;
  xp: number;
  equipped: string[];
};

export type NpcSnapshot = {
  id: number;
  key: string;
  name: string;
  role: string;
  x: number;
  y: number;
  targetX: number | null;
  targetY: number | null;
  facing: string;
  appearance: Appearance;
  mood: string;
  kind: string;
  sponsor: { businessName: string; brandColor: string } | null;
};

export type AnimalSnapshot = {
  id: number;
  species: string;
  name: string;
  x: number;
  y: number;
  targetX: number | null;
  targetY: number | null;
  facing: string;
  state: string;
  mood: string;
};

export type BuildingSnapshot = {
  id: number;
  key: string;
  name: string;
  kind: string;
  color: string;
  tx: number;
  ty: number;
  tw: number;
  th: number;
  reservable: boolean;
  doorX: number;
  doorY: number;
  sponsor: { businessName: string; brandColor: string; tagline: string } | null;
};

export type GroundItemSnapshot = {
  id: number;
  itemKey: string;
  qty: number;
  x: number;
  y: number;
  meta?: Record<string, unknown>;
};

export type ResourceNodeSnapshot = {
  id: number;
  kind: string;
  x: number;
  y: number;
  /** Current regrowth stage. 0 = picked/empty; (stages-1) = fully grown. */
  stage: number;
  /** Total visual stages for this kind (from src/lib/crops.ts). */
  stages: number;
  /** Epoch ms when the sim worker will advance `stage` by one. Null when fully grown or no regrowth. */
  nextAdvanceAt: number | null;
};

export type EnemySnapshot = {
  id: number;
  kind: string;
  x: number;
  y: number;
  targetX: number | null;
  targetY: number | null;
  hp: number;
  maxHp: number;
};

export type ChatSnapshot = {
  id: number;
  speakerType: string;
  speakerId: number;
  text: string;
  at: number;
};

export type EventSnapshot = {
  id: number;
  kind: string;
  text: string;
  at: number;
};

// World-change event payload published to the world_changes channel by
// sim updates and consumed by the WS server to drive delta pushes.
export type WorldChange = {
  kind: "animal" | "npc" | "enemy" | "groundItem" | "resource" | "weather";
  id: number;
  chunkX: number;
  chunkY: number;
};