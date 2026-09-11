// API request/response DTOs. Server route handlers depend on these;
// the HUD and game scene consume them through narrow type aliases.

import type { Appearance, HomeTheme } from "./domain";

export type MeResponse = {
  id: number;
  username: string;
  character: {
    id: number;
    name: string;
    appearance: Appearance;
    coins: number;
    gems: number;
    level: number;
    xp: number;
    homeTheme: HomeTheme;
    equipped: string[];
  } | null;
};

export type SignupRequest = {
  username: string;
  password: string;
  character: {
    name: string;
    body: "male" | "female";
    skin: string;
    hair: string;
    hairColor: string;
    shirtColor: string;
    pantsColor: string;
  };
};

export type Snapshot = {
  me: {
    id: number;
    name: string;
    appearance: Appearance;
    x: number;
    y: number;
    facing: string;
    coins: number;
    gems: number;
    equipped: string[];
  } | null;
  players: Array<{
    id: number;
    name: string;
    x: number;
    y: number;
    facing: string;
    appearance: Appearance;
  }>;
  npcs: Array<{
    id: number;
    name: string;
    role: string;
    x: number;
    y: number;
    facing: string;
    appearance: Appearance;
    sponsor: { id: number; businessName: string; brandColor: string } | null;
    kind: "builtin" | "remote";
  }>;
  animals: Array<{
    id: number;
    species: string;
    name: string | null;
    x: number;
    y: number;
    facing: string;
    state: string;
  }>;
  enemies: Array<{ id: number; kind: string; x: number; y: number; hp: number; maxHp: number }>;
  buildings: Array<{
    id: number;
    key: string;
    name: string;
    tx: number;
    ty: number;
    tw: number;
    th: number;
    doorX: number;
    doorY: number;
    reservable: boolean;
    sponsor: { id: number; businessName: string; brandColor: string } | null;
  }>;
  groundItems: Array<{ id: number; itemKey: string; x: number; y: number; qty: number }>;
  nodes: Array<{ id: number; kind: string; itemKey: string; x: number; y: number; ready: boolean }>;
  chat: Array<{ id: number; speakerType: "player" | "npc"; speakerId: number; text: string; at: number }>;
  weather: "clear" | "rain" | "fog" | "snow";
  epochStart: number;
  dayLengthMinutes: number;
  serverTime: number;
};

export type Selection =
  | { type: "player"; id: number; name: string; distance: number }
  | { type: "npc"; id: number; name: string; role: string; sponsored: boolean; distance: number }
  | { type: "animal"; id: number; name: string; species: string; distance: number }
  | { type: "enemy"; id: number; kind: string; hp: number; maxHp: number; distance: number }
  | { type: "item"; id: number; itemKey: string; distance: number }
  | { type: "node"; id: number; kind: string; ready: boolean; distance: number }
  | { type: "building"; id: number; key: string; name: string; reservable: boolean; hasSponsor: boolean; distance: number };
