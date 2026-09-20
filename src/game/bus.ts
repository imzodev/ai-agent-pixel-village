import type { Handler, Events } from "@/types/bus";
import type { Snapshot } from "@/types/snapshot";
import type { Selection } from "@/types/world";

// Re-exported so existing subscribers can import them from the bus.
export type { Events, Handler, Selection, Snapshot };

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
