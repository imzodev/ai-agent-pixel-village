// Ambient life around the camera: butterflies by day, fireflies by night,
// falling leaves in Whisperwood, fish leaping in deep water, birds that
// take off when you come close, chimney smoke, crystal sparkles in the
// caverns — and the ground reacting to the player: tall grass rustles and
// covers your feet, running kicks up dust. Everything is pooled and kept
// to what's on screen; textures are drawn at boot.

import Phaser from "phaser";
import type { AmbienceContext, SmokeSource } from "@/types/ambience";
import { terrainAt } from "@/lib/regions";
import { wildsGid } from "@/lib/terrain/wilds";
import { tileGidAt } from "./worldTilemap";

export type { AmbienceContext, SmokeSource } from "@/types/ambience";

/** Tall-grass GIDs on GroundUpper (any corner mask). */
const TALL_GIDS = new Set(Array.from({ length: 15 }, (_, i) => wildsGid(`tall_${i + 1}`)));
const CRYSTAL_GIDS = new Set([wildsGid("crystal_blue"), wildsGid("crystal_purple")]);

// ── Textures ─────────────────────────────────────────────────────────────
type Px = string[]; // rows of single-char palette keys, "." = empty
function pixelTex(scene: Phaser.Scene, key: string, rows: Px, pal: Record<string, string>): void {
  if (scene.textures.exists(key)) return;
  const w = rows[0].length, h = rows.length;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === "." || !pal[ch]) return;
    ctx.fillStyle = pal[ch];
    ctx.fillRect(x, y, 1, 1);
  }));
  tex.refresh();
}
function softBlob(scene: Phaser.Scene, key: string, w: number, h: number, rgb: string, maxA: number): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  const img = ctx.createImageData(w, h);
  const [r, g, b] = rgb.split(",").map(Number);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.min(1, Math.hypot((x + 0.5 - w / 2) / (w / 2), (y + 0.5 - h / 2) / (h / 2)));
    const i = (y * w + x) * 4;
    img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = Math.round(maxA * 255 * (1 - d * d));
  }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
}
export function makeAmbienceTextures(scene: Phaser.Scene): void {
  softBlob(scene, "fx_shadow", 24, 8, "0,0,0", 0.38);
  const wing = (key: string, open: boolean, c1: string, c2: string) =>
    pixelTex(scene, key, open ? ["a...a", "aabaa", ".aba.", "a.b.a"] : [".....", ".aba.", ".aba.", "..b.."], { a: c1, b: c2 });
  wing("fx_bfly_a0", true, "#f8f0a0", "#3a2a20"); wing("fx_bfly_a1", false, "#f8f0a0", "#3a2a20");
  wing("fx_bfly_b0", true, "#f8b0d0", "#3a2a20"); wing("fx_bfly_b1", false, "#f8b0d0", "#3a2a20");
  wing("fx_bfly_c0", true, "#a8d0ff", "#2a2a40"); wing("fx_bfly_c1", false, "#a8d0ff", "#2a2a40");
  softBlob(scene, "fx_firefly", 10, 10, "220,255,140", 1);
  pixelTex(scene, "fx_leaf", [".ab", "aab", "b.."], { a: "#7cc460", b: "#3c8a46" });
  pixelTex(scene, "fx_leaf2", ["ab.", "baa", "..a"], { a: "#e0a040", b: "#a86a28" });
  pixelTex(scene, "fx_fish", ["..aa..", "abbbba", "..aa.."], { a: "#4a6aa0", b: "#a8c4e8" });
  pixelTex(scene, "fx_bird0", [".....", "a...a", ".aba.", "..a.."], { a: "#4a3a30", b: "#e8d8c0" });
  pixelTex(scene, "fx_bird1", [".....", ".....", "aabaa", "..a.."], { a: "#4a3a30", b: "#e8d8c0" });
  pixelTex(scene, "fx_bird_sit", [".aa.", "abbo", ".aa."], { a: "#4a3a30", b: "#e8d8c0", o: "#f0a030" });
  softBlob(scene, "fx_smoke", 14, 14, "220,220,226", 0.9);
  softBlob(scene, "fx_dust", 10, 6, "214,190,140", 0.85);
  pixelTex(scene, "fx_sparkle", [".a.", "aba", ".a."], { a: "#c8f0ff", b: "#ffffff" });
  pixelTex(scene, "fx_ring", ["..aaaa..", ".a....a.", "..aaaa.."], { a: "#e4f2ff" });
  // tutorial guide arrow (points right; rotated toward the target)
  pixelTex(scene, "fx_guide_arrow", [
    "....kk......",
    "....kyk.....",
    "kkkkkyyk....",
    "kyyyyyyyk...",
    "kyyyyyyyyk..",
    "kyyyyyyyk...",
    "kkkkkyyk....",
    "....kyk.....",
    "....kk......",
  ], { k: "#3b2a1d", y: "#ffd84a" });
  // the front of a tall-grass tuft, drawn over the player's feet
  pixelTex(scene, "fx_tall_front", [
    "..a....a.....a..",
    ".aba..aba...aba.",
    ".abba.abba..abba",
    "abbbbabbbbaabbbb",
    "bccbbbccbbbbccbb",
    "cccccccccccccccc",
  ], { a: "#84d068", b: "#3e9844", c: "#2c7838" });
}

type Flyer = { img: Phaser.GameObjects.Image; vx: number; vy: number; t: number; kind: string };

export class Ambience {
  private butterflies: Flyer[] = [];
  private fireflies: Flyer[] = [];
  private birds: { img: Phaser.GameObjects.Image; flying: boolean; vx: number; vy: number; t: number }[] = [];
  private leaves: Phaser.GameObjects.Particles.ParticleEmitter;
  private leafZone = new Phaser.Geom.Rectangle(0, 0, 10, 10);
  private smoke: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private tallFront: Phaser.GameObjects.Image;
  private lastTallTile = "";
  private nextFish = 0;
  private nextBirds = 0;
  private nextSparkle = 0;
  private nextDust = 0;

  constructor(private scene: Phaser.Scene, private depths: { charBase: number; canopy: number; light: number }) {
    makeAmbienceTextures(scene);
    this.leaves = scene.add.particles(0, 0, "fx_leaf", {
      lifespan: 6000, speedY: { min: 14, max: 26 }, speedX: { min: -10, max: 14 }, rotate: { min: 0, max: 360 },
      frequency: 260, quantity: 1, alpha: { start: 1, end: 0.6 }, scale: { min: 1, max: 1.4 },
      emitZone: { type: "random", source: this.leafZone } as unknown as Phaser.Types.GameObjects.Particles.ParticleEmitterRandomZoneConfig,
    }).setDepth(depths.canopy + 2);
    this.leaves.stop();
    this.tallFront = scene.add.image(0, 0, "fx_tall_front").setOrigin(0.5, 1).setVisible(false);
  }

  /** Chimneys that puff smoke (set once the buildings are stamped). */
  setSmokeSources(sources: SmokeSource[]): void {
    for (const e of this.smoke) e.destroy();
    this.smoke = sources.map((s) =>
      this.scene.add.particles(s.x, s.y, "fx_smoke", {
        lifespan: 2600, speedY: { min: -16, max: -10 }, speedX: { min: 2, max: 7 }, scale: { start: 0.35, end: 1.3 },
        alpha: { start: 0.55, end: 0 }, frequency: 520, quantity: 1,
      }).setDepth(this.depths.canopy + 1),
    );
  }

  update(ctx: AmbienceContext, time: number, dtMs: number): void {
    const dt = dtMs / 1000;
    const { view } = ctx;
    const outdoors = !ctx.underground;
    const day = outdoors && ctx.darkness < 0.25 && !ctx.raining;
    const night = outdoors && ctx.darkness > 0.3 && !ctx.raining;
    const inView = (x: number, y: number, m = 40) => x > view.x - m && x < view.right + m && y > view.y - m && y < view.bottom + m;
    const randomInView = () => ({ x: view.x + Math.random() * view.width, y: view.y + Math.random() * view.height });
    const tileAt = (x: number, y: number) => terrainAt(Math.floor(x / 16), Math.floor(y / 16));

    // Butterflies over open grass by day.
    this.flock(this.butterflies, day ? 6 : 0, () => {
      const p = randomInView();
      const kind = ["a", "b", "c"][Math.floor(Math.random() * 3)];
      return { img: this.scene.add.image(p.x, p.y, `fx_bfly_${kind}0`).setDepth(this.depths.canopy + 3), vx: 0, vy: 0, t: Math.random() * 10, kind };
    }, (f) => {
      f.t += dt;
      f.vx += (Math.random() - 0.5) * 60 * dt; f.vy += (Math.random() - 0.5) * 60 * dt;
      f.vx = Phaser.Math.Clamp(f.vx, -22, 22); f.vy = Phaser.Math.Clamp(f.vy, -16, 16);
      f.img.x += f.vx * dt; f.img.y += f.vy * dt + Math.sin(f.t * 9) * 0.4;
      f.img.setTexture(`fx_bfly_${f.kind}${Math.floor(f.t * 8) % 2}`);
    }, inView, randomInView);

    // Fireflies at night: slow drift, pulsing glow.
    this.flock(this.fireflies, night ? 14 : 0, () => {
      const p = randomInView();
      return { img: this.scene.add.image(p.x, p.y, "fx_firefly").setBlendMode(Phaser.BlendModes.ADD).setDepth(this.depths.light + 1), vx: 0, vy: 0, t: Math.random() * 10, kind: "" };
    }, (f) => {
      f.t += dt;
      f.vx += (Math.random() - 0.5) * 20 * dt; f.vy += (Math.random() - 0.5) * 20 * dt;
      f.vx = Phaser.Math.Clamp(f.vx, -8, 8); f.vy = Phaser.Math.Clamp(f.vy, -6, 6);
      f.img.x += f.vx * dt; f.img.y += f.vy * dt;
      f.img.setAlpha(0.35 + 0.65 * Math.max(0, Math.sin(f.t * 2.4)));
    }, inView, randomInView);

    // Falling leaves in Whisperwood.
    if (ctx.region === "whisperwood" && outdoors) {
      this.leafZone.setTo(view.x - 40, view.y - 20, view.width + 80, 30);
      if (!this.leaves.emitting) this.leaves.start();
    } else if (this.leaves.emitting) this.leaves.stop();

    // A fish leaps somewhere in deep water now and then.
    if (outdoors && time > this.nextFish) {
      this.nextFish = time + 2500 + Math.random() * 3500;
      for (let k = 0; k < 6; k++) {
        const p = randomInView();
        if (tileAt(p.x, p.y).ground.startsWith("water_15")) { this.fishJump(p.x, p.y); break; }
      }
    }

    // Birds peck on open grass by day and take off when you come close.
    if (day && time > this.nextBirds && this.birds.length < 4) {
      this.nextBirds = time + 7000 + Math.random() * 8000;
      const p = randomInView();
      // Open ground only: something on the ground layer, nothing on top.
      const open = tileGidAt("Ground", p.x, p.y) > 0 && tileGidAt("GroundUpper", p.x, p.y) <= 0 && tileGidAt("DecorationLower", p.x, p.y) <= 0;
      if (open && !tileAt(p.x, p.y).collide) {
        for (let k = 0; k < 2 + Math.floor(Math.random() * 2); k++) {
          const img = this.scene.add.image(p.x + (Math.random() - 0.5) * 20, p.y + (Math.random() - 0.5) * 12, "fx_bird_sit");
          img.setDepth(this.depths.charBase + img.y).setFlipX(Math.random() < 0.5);
          this.birds.push({ img, flying: false, vx: 0, vy: 0, t: Math.random() * 3 });
        }
      }
    }
    for (const b of this.birds) {
      b.t += dt;
      if (!b.flying) {
        b.img.y += Math.sin(b.t * 6) > 0.95 ? 0.4 : 0; // peck
        const near = ctx.player && Math.hypot(ctx.player.x - b.img.x, ctx.player.y - b.img.y) < 70;
        if (near || !inView(b.img.x, b.img.y, 200)) {
          b.flying = true;
          b.vx = (b.img.x >= (ctx.player?.x ?? 0) ? 1 : -1) * (50 + Math.random() * 30);
          b.vy = -60 - Math.random() * 30;
          b.img.setDepth(this.depths.canopy + 4).setFlipX(b.vx < 0);
        }
      } else {
        b.img.x += b.vx * dt; b.img.y += b.vy * dt;
        b.img.setTexture(Math.floor(b.t * 10) % 2 ? "fx_bird0" : "fx_bird1");
        b.img.setAlpha(Math.max(0, b.img.alpha - dt * 0.35));
      }
    }
    this.birds = this.birds.filter((b) => { if (b.img.alpha > 0.02 && inView(b.img.x, b.img.y, 300)) return true; b.img.destroy(); return false; });

    // Crystal sparkles underground.
    if (ctx.underground && time > this.nextSparkle) {
      this.nextSparkle = time + 180;
      for (let k = 0; k < 4; k++) {
        const p = randomInView();
        if (!CRYSTAL_GIDS.has(tileGidAt("DecorationLower", p.x, p.y))) continue;
        const s = this.scene.add.image(Math.floor(p.x / 16) * 16 + 4 + Math.random() * 8, Math.floor(p.y / 16) * 16 + 2 + Math.random() * 10, "fx_sparkle")
          .setBlendMode(Phaser.BlendModes.ADD).setDepth(this.depths.light + 1).setScale(0.4);
        this.scene.tweens.add({ targets: s, scale: 1.1, alpha: 0, duration: 520, onComplete: () => s.destroy() });
      }
    }

    // The player: tall grass rustles and hides your feet; running raises dust.
    const pl = ctx.player;
    if (pl) {
      const gid = tileGidAt("GroundUpper", pl.x, pl.y - 2);
      const inTall = TALL_GIDS.has(gid);
      if (inTall) {
        this.tallFront.setPosition(Math.round(pl.x), Math.round(pl.y) + 1).setDepth(pl.depth + 1).setVisible(true);
        const key = `${Math.floor(pl.x / 16)},${Math.floor(pl.y / 16)}`;
        if (pl.moving && key !== this.lastTallTile) this.rustle(pl.x, pl.y);
        this.lastTallTile = key;
      } else {
        this.tallFront.setVisible(false);
        this.lastTallTile = "";
      }
      if (pl.moving && pl.running && !inTall && time > this.nextDust) {
        this.nextDust = time + 110;
        const d = this.scene.add.image(pl.x + (Math.random() - 0.5) * 6, pl.y - 1, "fx_dust").setDepth(pl.depth - 1).setAlpha(0.8);
        this.scene.tweens.add({ targets: d, y: d.y - 4, scale: 1.8, alpha: 0, duration: 420, onComplete: () => d.destroy() });
      }
    } else this.tallFront.setVisible(false);
  }

  /** Keep `pool` at `want` members inside the view, recycling strays. */
  private flock(pool: Flyer[], want: number, spawn: () => Flyer, step: (f: Flyer) => void,
    inView: (x: number, y: number, m?: number) => boolean, randomInView: () => { x: number; y: number }): void {
    while (pool.length < want) pool.push(spawn());
    while (pool.length > want) pool.pop()!.img.destroy();
    for (const f of pool) {
      step(f);
      if (!inView(f.img.x, f.img.y, 120)) { const p = randomInView(); f.img.setPosition(p.x, p.y); }
    }
  }

  private fishJump(x: number, y: number): void {
    const fish = this.scene.add.image(x, y, "fx_fish").setDepth(this.depths.charBase + y);
    const dir = Math.random() < 0.5 ? -1 : 1;
    fish.setFlipX(dir < 0);
    this.ring(x, y);
    this.scene.tweens.add({
      targets: fish, x: x + dir * 18, duration: 700, ease: "Linear",
      onUpdate: (tw) => { const t = tw.progress; fish.y = y - Math.sin(t * Math.PI) * 14; fish.setAngle(dir * (t - 0.5) * 70); },
      onComplete: () => { this.ring(fish.x, y); fish.destroy(); },
    });
  }

  private ring(x: number, y: number): void {
    const r = this.scene.add.image(x, y, "fx_ring").setDepth(this.depths.charBase + y - 2).setAlpha(0.9);
    this.scene.tweens.add({ targets: r, scale: 2.4, alpha: 0, duration: 650, onComplete: () => r.destroy() });
  }

  private rustle(x: number, y: number): void {
    for (let k = 0; k < 4; k++) {
      const leaf = this.scene.add.image(x + (Math.random() - 0.5) * 10, y - 4, Math.random() < 0.5 ? "fx_leaf" : "fx_leaf2").setDepth(this.depths.charBase + y + 2);
      this.scene.tweens.add({
        targets: leaf, x: leaf.x + (Math.random() - 0.5) * 22, y: leaf.y - 6 - Math.random() * 8, angle: (Math.random() - 0.5) * 200,
        alpha: 0, duration: 420 + Math.random() * 200, ease: "Quad.easeOut", onComplete: () => leaf.destroy(),
      });
    }
  }

  destroy(): void {
    for (const f of [...this.butterflies, ...this.fireflies]) f.img.destroy();
    for (const b of this.birds) b.img.destroy();
    for (const e of this.smoke) e.destroy();
    this.leaves.destroy();
    this.tallFront.destroy();
  }
}
