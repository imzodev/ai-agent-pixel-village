// The inns (src/lib/inn.ts): rest, hot stew, rumours, patrons. Types only.

/** The world as the rumour board sees it (src/lib/inn.ts `rumours`). */
export type InnWorld = {
  now: number;
  /** In-game hour, 0–24. */
  hour: number;
  weather: string;
  /** The Old Rootking: awake now, or when it next rises (ms epoch). */
  boss: { active: boolean; at: number };
  freeFields: number;
  freeRanches: number;
  /** The latest rare or legendary catch ("Ana landed a Moonfin!"), if recent. */
  lastCatch: string | null;
};

/** One player at the inn. */
export type InnPatron = { id: number; name: string; level: number; title: string | null };

/** The inn panel's data. */
export type InnView = {
  key: string;
  name: string;
  innkeeper: string;
  restCost: number;
  /** Resting is on the house when you're badly hurt. */
  restFree: boolean;
  stewCost: number;
  /** An old rumour of buried treasure (a treasure map). */
  mapCost: number;
  rumours: string[];
  patrons: InnPatron[];
};
