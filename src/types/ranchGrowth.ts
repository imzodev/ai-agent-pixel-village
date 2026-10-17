// Homestead growth (src/lib/ranchUpgrades.ts): farm level, the barn and the
// workshop and what goes by them, the machines' jobs, and what the panel
// shows. Types only.

/** Something you can build on a homestead. */
export type RanchBuildKey =
  | "silo" | "feeder" | "mill" | "press" | "loom" | "hives"
  | "fruit_press" | "cellar" | "racks" | "jam"
  | "workbench" | "saw" | "lathe" | "upholstery" | "varnish"
  // A homestead's buildings (src/lib/homestead.ts): its barn and its workshop.
  | "hs_barn" | "hs_workshop";

/** Where a step or recipe belongs: by the barn, in the workshop, or the homestead's own buildings. */
export type GrowthPlace = "barn" | "workshop" | "homestead";

/** Which of a homestead's buildings have a parcel to stand on (src/lib/ranchUpgrades.ts homesteadScope). */
export type BuildingParcels = { barn: boolean; workshop: boolean };

/** A machine that turns goods into better goods (hives make honey alone). */
export type MachineKey =
  | "mill" | "press" | "loom" | "hives" | "fruit_press" | "cellar" | "racks" | "jam"
  | "workbench" | "saw" | "lathe" | "upholstery" | "varnish";

/** One step you can build: what it costs and what it needs first. */
export type BuildStep = {
  id: string;
  place: GrowthPlace;
  key: RanchBuildKey;
  name: string;
  description: string;
  coins: number;
  items: Readonly<Record<string, number>>;
  farmLevel: number;
  needs?: RanchBuildKey;
};

/** A workshop recipe: inputs in, output out after `ms`. */
export type MachineRecipe = {
  id: string; place: Exclude<GrowthPlace, "homestead">; machine: MachineKey; inputs: Readonly<Record<string, number>>; output: string; qty: number; ms: number; name: string;
  /** Farm XP for one job (default: XP_PER_PROCESSED per item made). */
  xp?: number;
};

/** Work in progress on a machine. */
export type RanchJob = { machine: MachineKey; recipe: string; output: string; qty: number; readyAt: number };

/** A homestead's growth, as stored (ranch_state). */
export type RanchGrowth = {
  farmXp: number;
  /** Feed stored in the silo, by item. */
  silo: Record<string, number>;
  /** One-off buildings built. */
  machines: RanchBuildKey[];
  jobs: RanchJob[];
  /** When the hives were last emptied (ms). */
  hivesAt: number | null;
  /** The furniture on show in front of the workshop (item keys, in order). */
  display: string[];
};

/** The panel's view of a ranch's growth. */
export type RanchGrowthView = {
  farmLevel: number;
  farmXp: number;
  /** XP where the next level starts (null at the top). */
  nextAt: number | null;
  silo: { stored: number; cap: number } | null;
  built: RanchBuildKey[];
  builds: (BuildStep & { can: boolean; why: string | null })[];
  recipes: (MachineRecipe & { can: boolean })[];
  /** Running jobs, with the time left when the view was made. */
  jobs: (RanchJob & { ready: boolean; inMs: number })[];
  honey: number | null;
  /** The workshop's showroom (when it's up), and the furniture in your bag you could put up. */
  display: string[] | null;
  displayable: { itemKey: string; qty: number }[];
};

/** What the scene draws on a homestead: its buildings and machines, and the showroom (src/game/homesteadArt.ts). */
export type RanchLook = { props: RanchBuildKey[]; ox: number; oy: number; display?: string[] };
