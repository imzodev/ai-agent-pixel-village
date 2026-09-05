import type Phaser from "phaser";
import { TILE } from "@/lib/worldmap";

export type BuildingView = {
  key: string;
  name: string;
  kind: string;
  color: string;
  tw: number;
  th: number;
  reservable: boolean;
  sponsor: { businessName: string; brandColor: string } | null;
};

type TileDef = {
  id: string;
  name?: string;
  category?: string;
  cell: { col: number; row: number };
  px: { x: number; y: number };
};

type TileLegend = {
  tileSize: number;
  atlas: { cols: number; rows: number };
  tiles: TileDef[];
};

type Blueprint = {
  name?: string;
  slug?: string;
  tileSize: number;
  grid: { cols: number; rows: number };
  layers: string[];
  placements: Array<{ x: number; y: number; layer: string; tile: string }>;
};

type BlueprintMap = Record<string, Blueprint>;

const ATLAS_KEY = "bld_atlas";
const LEGEND_KEY = "bld_legend";
const BLUEPRINTS_KEY = "bld_blueprints";
const DEFAULT_BLUEPRINT = "willow-cottage";

const BLUEPRINT_TILE_PX = 16;
const SIGN_H = 18;
const SIGN_PAD_X = 6;

function sanitize(s: string) {
  return s.replace(/[^a-zA-Z0-9_]/g, "");
}

export function buildingTextureKey(b: BuildingView) {
  return `bld_${sanitize(b.key)}_${b.sponsor ? sanitize(b.sponsor.businessName) + sanitize(b.sponsor.brandColor) : "none"}`;
}

function getAtlasImage(scene: Phaser.Scene): HTMLImageElement | null {
  if (!scene.textures.exists(ATLAS_KEY)) return null;
  const src = scene.textures.get(ATLAS_KEY).getSourceImage() as unknown;
  return src instanceof HTMLImageElement ? src : null;
}

function getLegend(scene: Phaser.Scene): TileLegend | null {
  return (scene.cache.json.get(LEGEND_KEY) as TileLegend | null) ?? null;
}

function getBlueprints(scene: Phaser.Scene): BlueprintMap {
  const raw = scene.cache.json.get(BLUEPRINTS_KEY) as Blueprint | { blueprints: BlueprintMap } | null;
  if (!raw || typeof raw !== "object") return {};
  if ("placements" in raw) {
    const slug = raw.slug ?? DEFAULT_BLUEPRINT;
    return { [slug]: raw };
  }
  if ("blueprints" in raw && raw.blueprints && typeof raw.blueprints === "object") {
    const out: BlueprintMap = {};
    for (const [slug, bp] of Object.entries(raw.blueprints)) out[slug] = bp as Blueprint;
    return out;
  }
  return {};
}

function pickBlueprint(b: BuildingView, map: BlueprintMap): Blueprint | null {
  if (!map) return null;
  if (map[b.kind]) return map[b.kind];
  if (map[b.key]) return map[b.key];
  if (map[DEFAULT_BLUEPRINT]) return map[DEFAULT_BLUEPRINT];
  const first = Object.values(map)[0];
  return first ?? null;
}

function tileRect(legend: TileLegend, id: string): TileDef | null {
  return legend.tiles.find((t) => t.id === id) ?? null;
}

function drawSign(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, bg: string, fg: string, label: string) {
  ctx.fillStyle = "#3d2b1f";
  ctx.fillRect(x - 2, y - 1, w + 4, h + 2);
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fg;
  const fontPx = Math.max(7, Math.min(10, Math.floor(h * 0.65)));
  ctx.font = `bold ${fontPx}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const text = label.length > 22 ? label.slice(0, 21) + "…" : label;
  ctx.fillText(text, x + w / 2, y + h / 2 + 1, w - 8);
}

export function makeBuildingTexture(scene: Phaser.Scene, b: BuildingView): string | null {
  const key = buildingTextureKey(b);
  if (scene.textures.exists(key)) return key;

  const atlas = getAtlasImage(scene);
  const legend = getLegend(scene);
  const blueprints = getBlueprints(scene);
  if (!atlas || !legend) return null;

  const bp = pickBlueprint(b, blueprints);
  if (!bp) return null;

  const W = b.tw * TILE;
  const H = b.th * TILE;
  const availH = Math.max(0, H - SIGN_H);

  const bpW = bp.grid.cols * BLUEPRINT_TILE_PX;
  const bpH = bp.grid.rows * BLUEPRINT_TILE_PX;
  const scale = bpW > 0 && bpH > 0 && availH > 0
    ? Math.min(W / bpW, availH / bpH)
    : 0;
  const drawW = bpW * scale;
  const drawH = bpH * scale;
  const offX = (W - drawW) / 2;
  const bpTop = SIGN_H + (availH - drawH) / 2;

  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  if (scale > 0) {
    for (const layer of bp.layers) {
      for (const p of bp.placements) {
        if (p.layer !== layer) continue;
        const tile = tileRect(legend, p.tile);
        if (!tile) continue;
        ctx.drawImage(
          atlas,
          tile.px.x, tile.px.y, BLUEPRINT_TILE_PX, BLUEPRINT_TILE_PX,
          Math.round(offX + p.x * BLUEPRINT_TILE_PX * scale),
          Math.round(bpTop + p.y * BLUEPRINT_TILE_PX * scale),
          Math.max(1, Math.round(BLUEPRINT_TILE_PX * scale)),
          Math.max(1, Math.round(BLUEPRINT_TILE_PX * scale)),
        );
      }
    }
  }

  const label = b.sponsor ? b.sponsor.businessName.toUpperCase() : b.name;
  const labelPx = Math.max(60, Math.min(W - SIGN_PAD_X * 2, label.length * 6 + 16));
  const sx = (W - labelPx) / 2;
  const sy = 1;
  if (b.sponsor) {
    drawSign(ctx, sx, sy, labelPx, SIGN_H - 4, b.sponsor.brandColor, "#ffffff", label);
    ctx.fillStyle = "#ffd166";
    ctx.fillRect(sx + 3, sy + 3, 3, 3);
    ctx.fillRect(sx + labelPx - 6, sy + 3, 3, 3);
  } else {
    drawSign(ctx, sx, sy, labelPx, SIGN_H - 4, "#c8a06a", "#2b1d14", label);
    if (b.reservable) {
      ctx.fillStyle = "#fff3cd";
      ctx.fillRect(W - 56, H - 18, 50, 14);
      ctx.fillStyle = "#7a4a2a";
      ctx.font = "bold 8px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("FOR RENT", W - 31, H - 11);
    }
  }

  scene.textures.addCanvas(key, c);
  return key;
}
