import type Phaser from "phaser";
import { buildingTextureKey, makeBuildingTexture } from "./buildings";
import type { BuildingView } from "./buildings";

export type { BuildingView };
export { buildingTextureKey, makeBuildingTexture };

type Scene = Phaser.Scene;

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}

export function pixelTexture(scene: Scene, key: string, rows: string[], palette: Record<string, string>, scale = 2) {
  if (scene.textures.exists(key)) return;
  const w = Math.max(...rows.map((r) => r.length));
  const { c, ctx } = canvas(w * scale, rows.length * scale);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = palette[row[x]];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  });
  scene.textures.addCanvas(key, c);
}

// ---------- Animals & creatures ----------
const CREATURES: Record<string, { rows: string[]; palette: Record<string, string> }> = {
  sheep: { rows: ["....wwwww...", "...wwwwwww..", "..wwwwwwwwkk", ".wwwwwwwwwkk", ".wwwwwwwwwk.", ".wwwwwwwww..", "..wwwwwww...", "..d.d..d.d..", "..d.d..d.d.."], palette: { w: "#f6f2ea", k: "#3a3230", d: "#3a3230" } },
  cow: { rows: ["..............", "..bbbbbbbb..hh", ".bbssbbbbbbbhh", ".bsssbbssbbbpp", ".bbbbbbssbbbpp", ".bbbbbbbbbbb..", ".bbbbbbbbbb...", "..b..b..b..b..", "..b..b..b..b.."], palette: { b: "#f7f5ef", s: "#2f2a28", h: "#f7f5ef", p: "#e9a0a0" } },
  chicken: { rows: ["....rr..", "...wwwo.", "...www..", ".wwwwww.", "wwwwwww.", ".wwwww..", "..www...", "..y.y...", "..y.y..."], palette: { r: "#d94a3a", w: "#fbf7f0", o: "#f0a020", y: "#f0a020" } },
  duck: { rows: ["...gg....", "...ggo...", "...gg....", ".wwwww...", "wwwwwww..", ".wwwwww..", "..wwww...", "...o.o..."], palette: { g: "#3f8a4a", o: "#f0a020", w: "#e7dcc6" } },
  rabbit: { rows: ["..t.t...", "..t.t...", "..ttt...", ".ttttt..", ".tttttt.", ".tttttt.", ".ttttt.t", "..t.t..."], palette: { t: "#d9b38c" } },
  fox: { rows: ["..o.......o.", "..oo.....oo.", ".ooooooooooo", ".oowooooooo.", ".oooooooooow", "..ooooooooww", "..o..o..o.ww", "..k..k..k..."], palette: { o: "#e07b39", w: "#fbf2e6", k: "#3a2a20" } },
  cat: { rows: [".g.g......", ".ggg......", ".gggggggg.", ".gggggggg.", ".ggggggg.g", "..g.g..g.g", "..g.g..gg."], palette: { g: "#e8985a" } },
  dog: { rows: ["..b.........", "..bb........", ".bbbbbbbbbb.", ".bbbbbbbbbbb", ".bbbbbbbbbb.", "..bbbbbbbb..", "..b..b..b.b.", "..b..b..b..."], palette: { b: "#a5682a" } },
  slime: { rows: ["...gggg...", "..gggggg..", ".gggggggg.", ".gkggggkg.", ".gggggggg.", "gggggggggg", "gggggggggg", ".gggggggg."], palette: { g: "#6ccf7a", k: "#1e3a22" } },
  bat: { rows: ["p.........p.", "pp...kk..pp.", "ppp.kkkk.ppp", "pppkkkkkkppp", ".ppkkwkkwpp.", "..kkkkkkkk..", "...kk..kk..."], palette: { p: "#6b4a8a", k: "#2e2340", w: "#f8e16c" } },
  thornling: { rows: ["...t..t...", "..tttttt..", ".tttttttt.", ".twttttwt.", ".tttttttt.", "tttttttttt", ".tttttttt.", "..t.tt.t.."], palette: { t: "#4f7a3a", w: "#f8e16c" } },
};

export function makeCreatureTextures(scene: Scene) {
  for (const [k, def] of Object.entries(CREATURES)) pixelTexture(scene, `cr_${k}`, def.rows, def.palette, 2);
}

// ---------- Nodes / props ----------
export function makePropTextures(scene: Scene) {
  pixelTexture(scene, "node_berry_bush", ["...gggg....", "..gggpgg...", ".gpgggggg..", ".ggggpggpg.", "gggpggggggg", ".ggggggpgg.", "..ggpgggg..", "....dd....."], { g: "#4e9a51", p: "#7a4fb5", d: "#5a3a22" }, 2);
  pixelTexture(scene, "node_herb_patch", ["..g...g..g.", ".gg..gg.gg.", ".g.g.g.g.g.", "..g..g..g..", "..g..g..g..", ".dddddddddd"], { g: "#6fc36a", d: "#8a6a4a" }, 2);
  pixelTexture(scene, "node_rock", ["...sss....", "..sssss...", ".sssssss..", "sssslssss.", "sssssssss.", ".ddddddd.."], { s: "#9a9aa2", l: "#c9c9d0", d: "#5a5a62" }, 2);
  pixelTexture(scene, "node_mushroom_ring", ["rr...rr...", "rrr..rrr.r", ".w....w..r", ".w..rr.w.w", "....rrr...", ".....w...."], { r: "#d94a3a", w: "#f5efe4" }, 2);
  pixelTexture(scene, "rain", ["b", "b", "b", "b", "b", "b"], { b: "#bcdcf5" }, 1);
  pixelTexture(scene, "snow", [".ww.", "wwww", "wwww", ".ww."], { w: "#ffffff" }, 1);
  pixelTexture(scene, "shadow", ["..oooo..", ".oooooo.", "oooooooo", ".oooooo.", "..oooo.."], { o: "rgba(0,0,0,0.25)" }, 3);
  pixelTexture(scene, "marker", ["...y...", "..yyy..", ".yyyyy.", "...y...", "...y..."], { y: "#fff176" }, 2);
}

// ---------- Trees ----------
export function makeTreeTextures(scene: Scene) {
  const defs = [
    { key: "tree_0", leaf: "#5d9c59", dark: "#3f7a3c", kind: "round" },
    { key: "tree_1", leaf: "#3f7a5a", dark: "#2c5a40", kind: "pine" },
    { key: "tree_2", leaf: "#e8a0b8", dark: "#c97a98", kind: "round" },
  ];
  for (const d of defs) {
    if (scene.textures.exists(d.key)) continue;
    const { c, ctx } = canvas(48, 64);
    ctx.fillStyle = "#6b4a2a";
    ctx.fillRect(20, 44, 8, 18);
    if (d.kind === "pine") {
      for (let i = 0; i < 3; i++) {
        const y = 12 + i * 12, w = 16 + i * 8;
        ctx.fillStyle = d.dark; ctx.beginPath(); ctx.moveTo(24, y - 12); ctx.lineTo(24 + w / 2, y + 10); ctx.lineTo(24 - w / 2, y + 10); ctx.fill();
        ctx.fillStyle = d.leaf; ctx.beginPath(); ctx.moveTo(24, y - 10); ctx.lineTo(24 + w / 2 - 4, y + 8); ctx.lineTo(24 - w / 2 + 4, y + 8); ctx.fill();
      }
    } else {
      ctx.fillStyle = d.dark;
      ctx.beginPath(); ctx.arc(24, 28, 20, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = d.leaf;
      ctx.beginPath(); ctx.arc(20, 24, 15, 0, Math.PI * 2); ctx.arc(30, 20, 12, 0, Math.PI * 2); ctx.arc(28, 32, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath(); ctx.arc(17, 18, 5, 0, Math.PI * 2); ctx.fill();
    }
    scene.textures.addCanvas(d.key, c);
  }
}

export function makeAllTextures(scene: Scene) {
  // The procedural `ground` canvas (plaza cobbles, paths, pond, fountain,
  // fence pens) is no longer drawn — the Tiled chunk maps render the entire
  // visible terrain. Trees, creatures and node textures are still needed
  // because the chunk maps only carry static tiles.
  makeTreeTextures(scene);
  makeCreatureTextures(scene);
  makePropTextures(scene);
}
