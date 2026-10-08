// Ranch growth (src/lib/ranchUpgrades.ts): farm level, buildings you add to
// a ranch, the workshop's jobs, and what the panel shows. Types only.

/** Something you can build on a ranch (coop / barn are upgraded by level). */
export type RanchBuildKey =
  | "coop" | "barn" | "silo" | "feeder" | "mill" | "press" | "loom" | "hives"
  | "fruit_press" | "cellar" | "racks" | "jam"
  | "workbench" | "saw" | "lathe" | "upholstery" | "varnish";

/** The kinds of lot that grow (ranches and vineyards share farm growth). */
export type GrowthLot = "ranch" | "vineyard" | "workshop" | "orchard";

/** A machine that turns goods into better goods (hives make honey alone). */
export type MachineKey =
  | "mill" | "press" | "loom" | "hives" | "fruit_press" | "cellar" | "racks" | "jam"
  | "workbench" | "saw" | "lathe" | "upholstery" | "varnish";

/** One step you can build: what it costs and what it needs first. */
export type BuildStep = {
  id: string;
  lot: GrowthLot;
  key: RanchBuildKey;
  /** The level it brings the building to (1 for one-off buildings). */
  level: number;
  name: string;
  description: string;
  coins: number;
  items: Readonly<Record<string, number>>;
  farmLevel: number;
  needs?: RanchBuildKey;
};

/** A workshop recipe: inputs in, output out after `ms`. */
export type MachineRecipe = {
  id: string; lot: GrowthLot; machine: MachineKey; inputs: Readonly<Record<string, number>>; output: string; qty: number; ms: number; name: string;
  /** Farm XP for one job (default: XP_PER_PROCESSED per item made). */
  xp?: number;
};

/** Work in progress on a machine. */
export type RanchJob = { machine: MachineKey; recipe: string; output: string; qty: number; readyAt: number };

/** A ranch's growth, as stored (ranch_state). */
export type RanchGrowth = {
  farmXp: number;
  coopLevel: number;
  barnLevel: number;
  /** Feed stored in the silo, by item. */
  silo: Record<string, number>;
  /** One-off buildings built. */
  machines: RanchBuildKey[];
  jobs: RanchJob[];
  /** When the hives were last emptied (ms). */
  hivesAt: number | null;
  /** Workshops: the furniture on show on the porch (item keys, in order). */
  display: string[];
};

/** The panel's view of a ranch's growth. */
export type RanchGrowthView = {
  farmLevel: number;
  farmXp: number;
  /** XP where the next level starts (null at the top). */
  nextAt: number | null;
  coopLevel: number;
  barnLevel: number;
  silo: { stored: number; cap: number } | null;
  built: RanchBuildKey[];
  builds: (BuildStep & { can: boolean; why: string | null })[];
  recipes: (MachineRecipe & { can: boolean })[];
  /** Running jobs, with the time left when the view was made. */
  jobs: (RanchJob & { ready: boolean; inMs: number })[];
  honey: number | null;
  /** Workshops: what's on show, and the furniture in your bag you could put up. */
  display: string[] | null;
  displayable: { itemKey: string; qty: number }[];
};

/** What the scene draws on a ranch lot: its buildings, at the template's origin (world px). */
export type RanchLook = { props: RanchBuildKey[]; ox: number; oy: number; display?: string[] };
