// NPC keys that were renamed, old → new. NPC keys used to name a job
// (`baker`, `<town>_innkeeper`); they're `<place>_<name>` now, with jobs
// in `trades` (src/lib/npcDefs.ts). The seeder renames saved data on boot
// (renameLegacyNpcKeys in src/lib/seed.ts), so this list only ever grows:
// never reuse an old key as a new one.

import type { LegacyKeyMap } from "@/types/npc";

export const LEGACY_NPC_KEYS: LegacyKeyMap = {
  baker: "village_marigold",
  // Hettie and Bram both had the key `innkeeper`: the one row stood at the
  // inn as Hettie, so it stays hers and Bram gets a row of his own.
  innkeeper: "village_hettie",
  shopkeeper: "village_pip",
  herbalist: "village_wren",
  elder: "village_oswin",
  orphan: "village_tobin",
  tinker: "village_greta",
  miller: "village_hollis",
  blacksmith: "hollowmere_bjorn",
  hm_innkeeper: "hollowmere_ivy",
  hm_elder: "hollowmere_sorrel",
  bw_fishmonger: "brightwater_marina",
  bw_boatwright: "brightwater_tobias",
  bw_mayor: "brightwater_wynn",
  bw_innkeeper: "brightwater_coral",
  coralwick_innkeeper: "coralwick_milo",
  coralwick_shopkeeper: "coralwick_lena",
  coralwick_bounty: "coralwick_sven",
  coralwick_folk4: "coralwick_finn",
  coralwick_folk5: "coralwick_yara",
  sunrest_innkeeper: "sunrest_gus",
  sunrest_shopkeeper: "sunrest_nell",
  sunrest_bounty: "sunrest_quin",
  sunrest_folk4: "sunrest_sven",
  sunrest_folk5: "sunrest_jory",
  icefall_innkeeper: "icefall_kit",
  icefall_shopkeeper: "icefall_bram",
  icefall_bounty: "icefall_wade",
  icefall_folk4: "icefall_ines",
  icefall_folk5: "icefall_rosa",
  reedhollow_innkeeper: "reedhollow_ines",
  reedhollow_shopkeeper: "reedhollow_pia",
  reedhollow_bounty: "reedhollow_gus",
  reedhollow_folk4: "reedhollow_nell",
  reedhollow_folk5: "reedhollow_edda",
  shadewood_innkeeper: "shadewood_yara",
  shadewood_shopkeeper: "shadewood_lena",
  shadewood_bounty: "shadewood_dell",
  shadewood_folk4: "shadewood_quin",
  shadewood_folk5: "shadewood_vic",
  cloverhill_innkeeper: "cloverhill_quin",
  cloverhill_shopkeeper: "cloverhill_otto",
  cloverhill_bounty: "cloverhill_milo",
  cloverhill_folk4: "cloverhill_kit",
  cloverhill_folk5: "cloverhill_pia",
};
