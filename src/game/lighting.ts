// Night lighting and atmosphere.
//
// Darkness is a world-space RenderTexture covering the camera view: each
// frame it is filled with the night tint, then a soft radial "hole" is
// stamped out (ERASE) at every light in view, so lamps, windows, torches
// and the player's lantern light real pools in the dark. Warm/cool
// additive glows sit on top. The same module draws colour grading (dawn,
// golden hour), drifting cloud shadows by day, fog banks and rain
// splashes.
//
// Light sources come from three places: terrain tiles scanned when a chunk
// is built (worldTilemap.ts → setLightGroup), building stamps (doors,
// square lamps) and per-frame extras the scene passes in (the player).

import Phaser from "phaser";
import type { AtmosphereState, LightSource } from "@/types/lighting";

export type { AtmosphereState, LightSource } from "@/types/lighting";

const LIGHT_TEX = "fx_light_soft";
/** World px the darkness reaches past each edge of the view: more than the camera moves in a frame. */
const OVERSCAN_PX = 160;
const CLOUD_TEX = "fx_cloud_shadow";
const FOG_TEX = "fx_fog_bank";
const SPLASH_TEX = "fx_splash";
const LIGHT_TEX_SIZE = 128;

/** Light groups by key (a chunk, the building stamps, …). */
const groups = new Map<string, LightSource[]>();
export function setLightGroup(key: string, lights: LightSource[]): void {
  if (lights.length === 0) groups.delete(key);
  else groups.set(key, lights);
}
export function clearLightGroup(key: string): void {
  groups.delete(key);
}
export function resetLights(): void {
  groups.clear();
}

/** Radial falloff, cloud and fog blobs, a splash ring — drawn once. */
function makeTextures(scene: Phaser.Scene): void {
  const radial = (key: string, w: number, h: number, rgb: string, maxA: number, power: number) => {
    if (scene.textures.exists(key)) return;
    const tex = scene.textures.createCanvas(key, w, h);
    if (!tex) return;
    const ctx = tex.getContext();
    const img = ctx.createImageData(w, h);
    const [r, g, b] = rgb.split(",").map(Number);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - w / 2) / (w / 2), dy = (y + 0.5 - h / 2) / (h / 2);
      const d = Math.min(1, Math.hypot(dx, dy));
      const a = maxA * Math.pow(1 - d, power);
      const i = (y * w + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = Math.round(a * 255);
    }
    ctx.putImageData(img, 0, 0);
    tex.refresh();
  };
  radial(LIGHT_TEX, LIGHT_TEX_SIZE, LIGHT_TEX_SIZE, "255,255,255", 1, 1.6);
  radial(CLOUD_TEX, 320, 180, "10,20,30", 1, 1.3);
  radial(FOG_TEX, 320, 140, "236,240,244", 1, 1.4);
  if (!scene.textures.exists(SPLASH_TEX)) {
    const tex = scene.textures.createCanvas(SPLASH_TEX, 8, 4);
    if (tex) {
      const ctx = tex.getContext();
      ctx.strokeStyle = "rgba(220,236,255,0.9)";
      ctx.beginPath();
      ctx.ellipse(4, 2, 3.2, 1.4, 0, 0, Math.PI * 2);
      ctx.stroke();
      tex.refresh();
    }
  }
}

export class Lighting {
  private rt: Phaser.GameObjects.RenderTexture;
  private grade: Phaser.GameObjects.Rectangle;
  private glows: Phaser.GameObjects.Image[] = [];
  private clouds: Phaser.GameObjects.Image[] = [];
  private fogs: Phaser.GameObjects.Image[] = [];
  private splash: Phaser.GameObjects.Particles.ParticleEmitter;
  private splashZone = new Phaser.Geom.Rectangle(0, 0, 10, 10);
  private rtW = 0;
  private rtH = 0;
  /** The area the darkness covers: the camera view plus OVERSCAN_PX around it. */
  private cover = new Phaser.Geom.Rectangle(0, 0, 0, 0);

  constructor(private scene: Phaser.Scene, private depths: { night: number; glow: number; clouds: number; fog: number; ground: number }) {
    makeTextures(scene);
    this.grade = scene.add.rectangle(0, 0, 10, 10, 0xffa060, 0).setOrigin(0).setDepth(depths.night - 1);
    this.rt = scene.add.renderTexture(0, 0, 16, 16).setOrigin(0).setDepth(depths.night);
    this.splash = scene.add.particles(0, 0, SPLASH_TEX, {
      lifespan: 380, scale: { start: 0.6, end: 1.6 }, alpha: { start: 0.8, end: 0 }, frequency: 30, quantity: 2,
      emitZone: { type: "random", source: this.splashZone } as unknown as Phaser.Types.GameObjects.Particles.ParticleEmitterRandomZoneConfig,
    }).setDepth(depths.ground);
    this.splash.stop();
  }

  /** All lights from the groups plus `extra`, within `view` (+ margin). */
  private visibleLights(view: Phaser.Geom.Rectangle, extra: LightSource[]): LightSource[] {
    const out: LightSource[] = [];
    const take = (l: LightSource) => {
      if (l.x + l.radius < view.x || l.x - l.radius > view.right || l.y + l.radius < view.y || l.y - l.radius > view.bottom) return;
      out.push(l);
    };
    for (const list of groups.values()) for (const l of list) take(l);
    for (const l of extra) take(l);
    return out;
  }

  update(state: AtmosphereState, view: Phaser.Geom.Rectangle, extra: LightSource[], time: number, dtMs: number): void {
    // `view` is the camera's worldView as of this update, but the camera
    // settles later in the frame (follow, drag, pans: Camera.preRender), so
    // a rectangle exactly the view's size trails it by a frame and leaves an
    // uncovered strip along the leading edge. Cover a margin beyond it.
    const m = OVERSCAN_PX;
    const vx = Math.floor(view.x) - m, vy = Math.floor(view.y) - m;
    const w = Math.ceil(view.width) + 2 + 2 * m, h = Math.ceil(view.height) + 2 + 2 * m;
    this.cover.setTo(vx, vy, w, h);

    // Colour grading over the world, under the darkness.
    this.grade.setPosition(vx, vy).setSize(w, h).setFillStyle(state.gradeColor, state.gradeAlpha);

    // Darkness with light pools.
    const lights = state.darkness > 0.02 ? this.visibleLights(this.cover, extra) : [];
    if (state.darkness > 0.02) {
      if (w !== this.rtW || h !== this.rtH) { this.rt.resize(w, h); this.rtW = w; this.rtH = h; }
      this.rt.setPosition(vx, vy).setVisible(true);
      this.rt.clear();
      this.rt.fill(state.nightColor, state.darkness);
      for (const l of lights) {
        const f = l.flicker ? 1 + 0.06 * Math.sin(time / 90 + l.x) + 0.04 * Math.sin(time / 37 + l.y) : 1;
        const scale = (l.radius * 2 * f) / LIGHT_TEX_SIZE;
        this.rt.stamp(LIGHT_TEX, undefined, l.x - vx, l.y - vy, { scale, blendMode: Phaser.BlendModes.ERASE });
      }
      this.rt.render();
    } else {
      this.rt.setVisible(false);
    }

    // Additive glows on the light sources.
    let gi = 0;
    if (state.darkness > 0.08) {
      for (const l of lights) {
        let g = this.glows[gi];
        if (!g) {
          g = this.scene.add.image(0, 0, LIGHT_TEX).setBlendMode(Phaser.BlendModes.ADD).setDepth(this.depths.glow);
          this.glows.push(g);
        }
        const f = l.flicker ? 1 + 0.08 * Math.sin(time / 70 + l.y) : 1;
        g.setPosition(l.x, l.y).setScale((l.radius * 1.3 * f) / LIGHT_TEX_SIZE).setTint(l.color).setAlpha(Math.min(0.55, state.darkness * 0.7)).setVisible(true);
        gi++;
      }
    }
    for (; gi < this.glows.length; gi++) this.glows[gi].setVisible(false);

    // Cloud shadows drifting east by day.
    const drift = (dtMs / 1000) * 9;
    if (state.clouds) {
      while (this.clouds.length < 5) {
        const c = this.scene.add.image(0, 0, CLOUD_TEX).setDepth(this.depths.clouds).setAlpha(0.13);
        c.setPosition(view.x + Math.random() * view.width, view.y + Math.random() * view.height).setScale(1.4 + Math.random() * 1.2, 1.1 + Math.random() * 0.8);
        this.clouds.push(c);
      }
      for (const c of this.clouds) {
        c.x += drift;
        c.y += drift * 0.2;
        const margin = 360;
        if (c.x > view.right + margin || c.x < view.x - margin * 2 || c.y > view.bottom + margin || c.y < view.y - margin) {
          c.setPosition(view.x - 300, view.y + Math.random() * view.height);
        }
        c.setVisible(true);
      }
    } else for (const c of this.clouds) c.setVisible(false);

    // Fog banks rolling slowly.
    if (state.fog > 0) {
      while (this.fogs.length < 6) {
        const f = this.scene.add.image(0, 0, FOG_TEX).setDepth(this.depths.fog);
        f.setPosition(view.x + Math.random() * view.width, view.y + Math.random() * view.height).setScale(2 + Math.random() * 1.5, 1.4 + Math.random());
        this.fogs.push(f);
      }
      for (const f of this.fogs) {
        f.x += drift * 1.6;
        if (f.x > view.right + 400 || f.y > view.bottom + 300 || f.y < view.y - 300 || f.x < view.x - 900) f.setPosition(view.x - 380, view.y + Math.random() * view.height);
        f.setAlpha(0.45 * state.fog).setVisible(true);
      }
    } else for (const f of this.fogs) f.setVisible(false);

    // Rain splashes on the ground in view.
    if (state.rain) {
      this.splashZone.setTo(view.x, view.y, view.width, view.height);
      if (!this.splash.emitting) this.splash.start();
    } else if (this.splash.emitting) this.splash.stop();
  }

  destroy(): void {
    this.rt.destroy();
    this.grade.destroy();
    for (const g of [...this.glows, ...this.clouds, ...this.fogs]) g.destroy();
    this.splash.destroy();
  }
}
