// Homesteads in the world (src/lib/homestead.ts): each owned parcel drawn
// from public/assets/parcels.png (scripts/draw-parcels.mjs) over the meadow,
// a fence round the whole homestead (a gate by the signpost) and round its
// pastures where they meet other uses, and the site's signpost ("For sale"
// until it's claimed; the owner's banner flies there after, lotBanners.ts).
// Fences are art only: you walk freely on your land, and animals keep to
// their pastures by their zone.

import type Phaser from "phaser";
import { DEPTH_CHAR_BASE } from "./worldTilemap";
import { gameFont } from "./gameFont";
import { BUILDING_KEY, PARCEL_BUILDINGS, PARCEL_SHOWROOM, PARCEL_SPOTS, PARCEL_TILES, plotIndex, plotOffsets } from "@/lib/homestead";
import { FURNITURE_CELLS } from "./furnitureArt";
import { MACHINE_SPRITE } from "./machineSprites";
import { FURNITURE_TEXTURE } from "./textures"; // (textures.ts loads this sheet too: used at draw time only)
import { siteByKey } from "@/lib/homesteadSites";
import type { LotSnapshot } from "@/types/garden";
import type { Parcel, ParcelUse } from "@/types/homestead";

export const PARCELS_TEXTURE = "parcels";
export const PARCELS_SHEET = "/assets/parcels.png";
const P = PARCEL_TILES * 16;
/** Overlay frame per use (barn and workshop parcels are drawn wild until their buildings come). */
const FRAME_OF: Record<ParcelUse, string> = { wild: "p_wild", field: "p_field", pasture: "p_pasture", vineyard: "p_vineyard", orchard: "p_orchard", barn: "p_wild", workshop: "p_wild" };
/** Ground art sits on the terrain and its paths (GroundUpper −99), under every decoration. */
const DEPTH_GROUND = -98;

/** Cut the sheet into its frames (once the image has loaded). */
export function registerParcelFrames(scene: Phaser.Scene): void {
  const tex = scene.textures.get(PARCELS_TEXTURE);
  if (!tex || tex.key === "__MISSING") return;
  ["p_wild", "p_field", "p_pasture", "p_vineyard", "p_orchard"].forEach((f, i) => tex.add(f, 0, i * P, 0, P, P));
  tex.add("fence_h", 0, 0, 160, P, 16);
  tex.add("fence_h_gate", 0, 160, 160, P, 16);
  tex.add("hs_sign", 0, 320, 160, 32, 48);
  tex.add("fence_v", 0, 352, 160, 16, P);
  tex.add("fence_v_gate", 0, 368, 160, 16, P);
  tex.add("p_plot", 0, 0, 320, P, P);
  tex.add("hs_barn", 0, 160, 320, 96, 80);
  tex.add("hs_workshop", 0, 256, 320, 80, 64);
}

/** A stamp of what's drawn, to redraw only when it changes. */
export const homesteadSig = (lot: LotSnapshot): string =>
  `${lot.owner?.id ?? "-"}|${(lot.parcels ?? []).map((p) => `${p.col},${p.row},${p.use}`).sort().join(";")}|${(lot.ranch?.props ?? []).join(",")}|${(lot.ranch?.display ?? []).join(",")}`;

/** The signpost (world px, its foot), or null if the lot isn't a known site. */
export function signPoint(key: string): { x: number; y: number } | null {
  const s = siteByKey(key);
  return s ? { x: s.sign.tx * 16 + 8, y: s.sign.ty * 16 + 14 } : null;
}

/** Draw one homestead; returns everything drawn (destroyed together on a redraw). */
export function drawHomestead(scene: Phaser.Scene, lot: LotSnapshot): Phaser.GameObjects.GameObject[] {
  const site = siteByKey(lot.key);
  if (!site) return [];
  const out: Phaser.GameObjects.GameObject[] = [];
  const parcels = lot.parcels ?? [];
  const at = (c: { col: number; row: number }) => ({ x: (site.tx + c.col * PARCEL_TILES) * 16, y: (site.ty + c.row * PARCEL_TILES) * 16 });
  const find = (col: number, row: number): Parcel | undefined => parcels.find((p) => p.col === col && p.row === row);

  const props = lot.ranch?.props ?? [];
  for (const p of parcels) {
    const o = at(p);
    if (p.use !== "barn" && p.use !== "workshop") {
      out.push(scene.add.image(o.x, o.y, PARCELS_TEXTURE, FRAME_OF[p.use]).setOrigin(0, 0).setDepth(DEPTH_GROUND));
      continue;
    }
    // A barn or workshop parcel: a staked plot until its building is up, then the building and what's been built by it.
    if (!props.includes(BUILDING_KEY[p.use])) {
      out.push(scene.add.image(o.x, o.y, PARCELS_TEXTURE, "p_plot").setOrigin(0, 0).setDepth(DEPTH_GROUND));
      continue;
    }
    const b = PARCEL_BUILDINGS[p.use];
    out.push(scene.add.image(o.x + b.x, o.y + b.y, PARCELS_TEXTURE, BUILDING_KEY[p.use]).setOrigin(0, 0).setDepth(DEPTH_CHAR_BASE + o.y + (b.solid.dy + b.solid.h) * 16 - 2));
    for (const key of props) {
      const spot = PARCEL_SPOTS[key], sprite = MACHINE_SPRITE[key];
      if (!spot || spot.on !== p.use || !sprite) continue;
      out.push(scene.add.image(o.x + spot.x, o.y + spot.y + 1, sprite).setOrigin(0, 1).setDepth(DEPTH_CHAR_BASE + o.y + spot.y));
    }
    if (p.use === "workshop") (lot.ranch?.display ?? []).forEach((item, i) => {
      const spot = PARCEL_SHOWROOM[i], frame = FURNITURE_CELLS[item];
      if (!spot || frame == null) return;
      out.push(scene.add.image(o.x + spot.x, o.y + spot.y + 1, FURNITURE_TEXTURE, frame).setOrigin(0.5, 1).setDepth(DEPTH_CHAR_BASE + o.y + spot.y));
    });
  }
  // Fences: round the outside (a gate by the signpost), and between a pasture
  // and any other use (with a gate). Each inner edge is drawn once, by the
  // parcel west or north of it.
  const pastureEdge = (p: Parcel, nb: Parcel) => (p.use === "pasture") !== (nb.use === "pasture");
  const fence = (x: number, y: number, frame: string, depthY: number) =>
    out.push(scene.add.image(x, y, PARCELS_TEXTURE, frame).setOrigin(0, 0).setDepth(DEPTH_CHAR_BASE + depthY));
  for (const p of parcels) {
    const o = at(p);
    const south = find(p.col, p.row + 1), east = find(p.col + 1, p.row);
    if (!find(p.col, p.row - 1)) fence(o.x, o.y - 8, p.col === 0 && p.row === 0 ? "fence_h_gate" : "fence_h", o.y + 6);
    if (!south) fence(o.x, o.y + P - 8, "fence_h", o.y + P + 6);
    else if (pastureEdge(p, south)) fence(o.x, o.y + P - 8, "fence_h_gate", o.y + P + 6);
    if (!find(p.col - 1, p.row)) fence(o.x - 8, o.y, "fence_v", o.y);
    if (!east) fence(o.x + P - 8, o.y, "fence_v", o.y);
    else if (pastureEdge(p, east)) fence(o.x + P - 8, o.y, "fence_v_gate", o.y);
  }

  // The signpost: "For sale" until claimed.
  const sign = signPoint(lot.key);
  if (sign) {
    out.push(scene.add.image(sign.x, sign.y, PARCELS_TEXTURE, "hs_sign").setOrigin(0.5, 1).setDepth(DEPTH_CHAR_BASE + sign.y));
    if (!lot.owner) {
      out.push(scene.add.text(sign.x, sign.y - 50, "For sale · free", { fontFamily: gameFont(), fontSize: "9px", fontStyle: "bold", color: "#fff4d8", stroke: "#1a1a1a", strokeThickness: 3 })
        .setOrigin(0.5, 1).setResolution(3).setDepth(DEPTH_CHAR_BASE + sign.y + 1));
    }
  }
  return out;
}

/** The empty-plot points of a homestead (world px), for tap zones: field, vineyard and orchard parcels. */
export function homesteadPlotPoints(lot: LotSnapshot): { plot: number; x: number; y: number }[] {
  const site = siteByKey(lot.key);
  if (!site) return [];
  return (lot.parcels ?? []).flatMap((p) => plotOffsets(p.use).map((o, i) => ({
    plot: plotIndex(p, i),
    x: (site.tx + p.col * PARCEL_TILES) * 16 + o.x,
    y: (site.ty + p.row * PARCEL_TILES) * 16 + o.y,
  })));
}
