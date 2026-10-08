// Orchards: the fruit trees beyond the apple (LPC "Fruit Trees" sheet,
// src/lib/crops.ts). Each sapling is sold by the shops of the towns whose
// land suits it, so collecting fruit means travelling the continent. Pure
// data; items (src/lib/seed.ts), saplings (GARDEN_CROPS), shops and buyers
// (src/lib/trade.ts) are all built from this table.

import type { OrchardFruit } from "@/types/garden";

export type { OrchardFruit } from "@/types/garden";

export const ORCHARD_FRUITS: readonly OrchardFruit[] = [
  { tree: "lemon_tree", fruit: "lemon", sapling: "lemon_sapling", name: "Lemon", icon: "🍋", value: 4, saplingPrice: 45, families: ["desert"], origin: "the desert outposts" },
  { tree: "orange_tree", fruit: "orange", sapling: "orange_sapling", name: "Orange", icon: "🍊", value: 4, saplingPrice: 45, families: ["desert", "port"], origin: "the desert outposts and the ports" },
  { tree: "peach_tree", fruit: "peach", sapling: "peach_sapling", name: "Peach", icon: "🍑", value: 5, saplingPrice: 50, families: ["hills"], origin: "the hill towns" },
  { tree: "cherry_tree", fruit: "cherry", sapling: "cherry_sapling", name: "Cherry", icon: "🍒", value: 6, saplingPrice: 50, families: ["hills"], origin: "the hill towns" },
  { tree: "pear_tree", fruit: "pear", sapling: "pear_sapling", name: "Pear", icon: "🍐", value: 4, saplingPrice: 45, families: ["hills"], origin: "the hill towns" },
  { tree: "plum_tree", fruit: "plum", sapling: "plum_sapling", name: "Plum", icon: "🟣", value: 5, saplingPrice: 55, families: ["darkwood"], origin: "the darkwood hamlets" },
  { tree: "coconut_palm", fruit: "coconut", sapling: "coconut_sapling", name: "Coconut", icon: "🥥", value: 9, saplingPrice: 70, families: ["port"], origin: "the ports" },
  { tree: "banana_palm", fruit: "banana", sapling: "banana_sapling", name: "Banana", icon: "🍌", value: 5, saplingPrice: 55, families: ["port", "swamp"], origin: "the ports and the swamp villages" },
];

/** What the orchard's press and jam kitchen make (item, name, icon, value). */
export const ORCHARD_PRODUCTS: readonly { key: string; name: string; icon: string; value: number; heal?: number; description: string }[] = [
  { key: "orange_juice", name: "Orange Juice", icon: "🧃", value: 10, heal: 6, description: "Fresh-pressed. Restores 6 HP." },
  { key: "lemonade", name: "Lemonade", icon: "🍋", value: 12, heal: 6, description: "Lemons and honey. Restores 6 HP." },
  { key: "pear_cider", name: "Pear Cider", icon: "🍾", value: 14, description: "Perry, the innkeepers call it." },
  { key: "cherry_jam", name: "Cherry Jam", icon: "🫙", value: 13, heal: 10, description: "Dark and sweet. Restores 10 HP." },
  { key: "peach_jam", name: "Peach Jam", icon: "🫙", value: 13, heal: 10, description: "Sunshine in a jar. Restores 10 HP." },
  { key: "plum_jam", name: "Plum Jam", icon: "🫙", value: 13, heal: 10, description: "From the darkwood's plums. Restores 10 HP." },
  { key: "cherry_pie", name: "Cherry Pie", icon: "🥧", value: 10, heal: 16, description: "Marigold's, from your cherries. Restores 16 HP." },
  { key: "peach_pie", name: "Peach Pie", icon: "🥧", value: 10, heal: 16, description: "Marigold's, from your peaches. Restores 16 HP." },
];
