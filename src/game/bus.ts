import type { Appearance } from "@/db/schema";

export type Snapshot = {
  now: number;
  hour: number;
  weather: string;
  dayLengthMinutes: number;
  epochStart: number;
  me: { id: number; name: string; x: number; y: number; facing: string; appearance: Appearance; level: number; hp: number; maxHp: number; coins: number; xp: number; equipped: string[] } | null;
  players: { id: number; name: string; x: number; y: number; facing: string; appearance: Appearance; level: number; equipped: string[] }[];
  npcs: { id: number; key: string; name: string; role: string; x: number; y: number; targetX: number | null; targetY: number | null; facing: string; appearance: Appearance; mood: string; kind: string; sponsor: { businessName: string; brandColor: string } | null }[];
  animals: { id: number; species: string; name: string; x: number; y: number; targetX: number | null; targetY: number | null; facing: string; state: string; mood: string }[];
  buildings: { id: number; key: string; name: string; kind: string; color: string; tx: number; ty: number; tw: number; th: number; reservable: boolean; doorX: number; doorY: number; sponsor: { businessName: string; brandColor: string; tagline: string } | null }[];
  groundItems: { id: number; itemKey: string; qty: number; x: number; y: number; meta: Record<string, unknown> }[];
  nodes: { id: number; kind: string; x: number; y: number; qty: number; ready: boolean }[];
  enemies: { id: number; kind: string; x: number; y: number; targetX: number | null; targetY: number | null; hp: number; maxHp: number }[];
  chat: { id: number; speakerType: string; speakerId: number; text: string; at: number }[];
  events: { id: number; kind: string; text: string; at: number }[];
};

export type Selection =
  | { type: "npc"; id: number; name: string; role: string; sponsored: boolean; distance: number }
  | { type: "animal"; id: number; name: string; species: string; distance: number }
  | { type: "building"; id: number; key: string; name: string; reservable: boolean; hasSponsor: boolean; distance: number }
  | { type: "player"; id: number; name: string; distance: number }
  | { type: "item"; id: number; itemKey: string; distance: number }
  | { type: "node"; id: number; kind: string; ready: boolean; distance: number }
  | { type: "enemy"; id: number; kind: string; hp: number; maxHp: number; distance: number };

type Events = {
  snapshot: Snapshot;
  select: Selection | null;
  toast: { text: string; kind?: "info" | "good" | "bad" };
  enterBuilding: { key: string; name: string };
  focus: { x: number; y: number };
  refreshMe: undefined;
  moveTo: { x: number; y: number };
  poke: undefined;
  chatFocus: boolean;
};

type Handler<T> = (payload: T) => void;

class Bus {
  private handlers = new Map<string, Set<Handler<unknown>>>();
  on<K extends keyof Events>(ev: K, h: Handler<Events[K]>) {
    if (!this.handlers.has(ev)) this.handlers.set(ev, new Set());
    this.handlers.get(ev)!.add(h as Handler<unknown>);
    return () => this.off(ev, h);
  }
  off<K extends keyof Events>(ev: K, h: Handler<Events[K]>) {
    this.handlers.get(ev)?.delete(h as Handler<unknown>);
  }
  emit<K extends keyof Events>(ev: K, payload: Events[K]) {
    this.handlers.get(ev)?.forEach((h) => h(payload));
  }
}

export const bus = new Bus();

export const ITEM_ICONS: Record<string, string> = {
  herb: "🌿", berry: "🫐", stone: "🪨", mushroom: "🍄", flour: "🌾", egg: "🥚", wool: "🧶", slime_gel: "🟢", honey_bun: "🥐",
  recipe_cinnamon: "📜", recipe_tea: "📜", wooden_sword: "🗡️", straw_hat: "👒", lantern: "🏮", chair: "🪑", table: "🟤", plant: "🪴",
  rug: "🟥", bed: "🛏️", lamp: "💡", bookshelf: "📚", painting: "🖼️", discount: "🎟️", fox_charm: "🦊", elder_seal: "🔏",
};
