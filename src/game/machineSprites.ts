// The sprite each homestead machine is drawn with (src/game/ranchProps.ts,
// vineyardProps.ts, workshopProps.ts), placed by homesteadArt.ts at its
// spot (src/lib/homestead.ts PARCEL_SPOTS). Pure data, so tests can check it.

import type { RanchBuildKey } from "@/types/ranchGrowth";

export const MACHINE_SPRITE: Readonly<Partial<Record<RanchBuildKey, string>>> = {
  silo: "ranch_silo", feeder: "ranch_feeder", mill: "ranch_mill", press: "ranch_press", loom: "ranch_loom", hives: "ranch_hives",
  fruit_press: "vy_fruit_press", cellar: "vy_cellar", racks: "vy_racks", jam: "vy_jam",
  saw: "ws_saw", lathe: "ws_lathe", upholstery: "ws_upholstery", varnish: "ws_varnish",
};
