import Phaser from "phaser";
import type { Appearance } from "@/db/schema";
import { BUILDINGS, TILE, WORLD_H, WORLD_W, buildingDoor, isWalkable } from "@/lib/worldmap";
import { appearanceKey, composeCharacter, FRAME, ROWS } from "./lpc";
import { buildingTextureKey, makeAllTextures, makeBuildingTexture } from "./textures";
import { bus, ITEM_ICONS, type Selection, type Snapshot } from "./bus";
import { chunkAtWorldPx, debugRegistry, isWalkableAt, registerChunk, chunkRegistered } from "@/lib/chunkCollision";
import {
  CHUNK_PX_H,
  CHUNK_PX_W,
  chunkAtPixel,
  chunkCenter,
  ensureChunks,
  loadTilemapAssets,
  recenterCamera,
  releaseOutside,
} from "./worldTilemap";

const BLD_ATLAS_URL = "/buildings/thegrove-blueprint-atlas.png";
const BLD_LEGEND_URL = "/buildings/thegrove-tile-legend.json";
const BLD_BLUEPRINTS_URL = "/buildings/willow-cottage.blueprint.json";

type Dir = keyof typeof ROWS;

type CharEnt = {
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  badge?: Phaser.GameObjects.Text;
  tx: number; ty: number; facing: Dir; speed: number;
  texKey: string | null; appKey: string;
  bubble?: { c: Phaser.GameObjects.Container; until: number };
  glow?: Phaser.GameObjects.Arc;
};
type CritterEnt = { sprite: Phaser.GameObjects.Image; tx: number; ty: number; facing: string; state: string; speed: number; label?: Phaser.GameObjects.Text; zz?: Phaser.GameObjects.Text; hpBar?: Phaser.GameObjects.Graphics; hp: number; maxHp: number; phase: number };

const PLAYER_SPEED = 120;

function zoneOf(rect: Phaser.Geom.Rectangle): Phaser.Types.GameObjects.Particles.ParticleEmitterRandomZoneConfig {
  return { type: "random", source: rect as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource };
}

export class WorldScene extends Phaser.Scene {
  private snapshot: Snapshot | null = null;
  private meId: number | null = null;
  private player: CharEnt | null = null;
  private players = new Map<number, CharEnt>();
  private npcs = new Map<number, CharEnt>();
  private animals = new Map<number, CritterEnt>();
  private enemies = new Map<number, CritterEnt>();
  private items = new Map<number, Phaser.GameObjects.Text>();
  private nodes = new Map<number, Phaser.GameObjects.Image>();
  private buildingImgs = new Map<string, { img: Phaser.GameObjects.Image; texKey: string; glow: Phaser.GameObjects.Arc }>();
  private shownChat = new Set<number>();
  private moveTarget: { x: number; y: number } | null = null;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private night!: Phaser.GameObjects.Rectangle;
  private fog!: Phaser.GameObjects.Rectangle;
  private rain!: Phaser.GameObjects.Particles.ParticleEmitter;
  private snow!: Phaser.GameObjects.Particles.ParticleEmitter;
  private lastHeartbeat = 0;
  private pollTimer: number | null = null;
  private dragging = false;
  private chatFocused = false;
  private marker!: Phaser.GameObjects.Image;
  private sentFirst = false;
  private lastPlayerChunk: { cx: number; cy: number } | null = null;
  private unsub: (() => void)[] = [];
  // Camera zoom floor: the smallest zoom at which the viewport still fits
  // inside the loaded 5×5 chunk window. Recomputed on resize; used by the
  // wheel handler so zooming out can never reveal the background.
  private minZoom = 1;
  private fitted = false;

  constructor() {
    super("world");
  }

  preload() {
    this.load.image("bld_atlas", BLD_ATLAS_URL);
    this.load.json("bld_legend", BLD_LEGEND_URL);
    this.load.json("bld_blueprints", BLD_BLUEPRINTS_URL);
    loadTilemapAssets(this);
  }

  async create() {
    makeAllTextures(this);
    // Initial chunk window: central chunk (0, 0). Streaming kicks in once the
    // player crosses a chunk boundary in updatePlayer.
    this.lastPlayerChunk = { cx: 0, cy: 0 };
    await ensureChunks(this, this.lastPlayerChunk);
    recenterCamera(this, this.lastPlayerChunk);
    // placeholder char texture
    if (!this.textures.exists("ph_char")) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0x000000, 0.25); g.fillEllipse(32, 58, 22, 8);
      g.fillStyle(0x8899aa, 1); g.fillRect(24, 24, 16, 30); g.fillCircle(32, 20, 8);
      g.generateTexture("ph_char", 64, 64); g.destroy();
    }
    this.marker = this.add.image(0, 0, "marker").setDepth(20000).setVisible(false);

    this.cameras.main.setRoundPixels(true);

    this.scale.on("resize", () => this.fitCameraToCanvas());
    this.fitCameraToCanvas();

    // overlays
    this.night = this.add.rectangle(0, 0, 10, 10, 0x0a1030, 0).setOrigin(0).setScrollFactor(0).setDepth(9000);
    this.fog = this.add.rectangle(0, 0, 10, 10, 0xdfe6ea, 0).setOrigin(0).setScrollFactor(0).setDepth(9001);
    this.rain = this.add.particles(0, 0, "rain", {
      lifespan: 1200, speedY: { min: 420, max: 520 }, speedX: -60, quantity: 4, frequency: 24, alpha: { start: 0.7, end: 0.2 }, scale: { min: 0.8, max: 1.2 },
      emitZone: zoneOf(new Phaser.Geom.Rectangle(-600, -40, 1200, 60)),
    }).setDepth(8500);
    this.snow = this.add.particles(0, 0, "snow", {
      lifespan: 5000, speedY: { min: 30, max: 60 }, speedX: { min: -20, max: 20 }, quantity: 2, frequency: 60, alpha: { start: 0.9, end: 0.3 }, scale: { min: 0.5, max: 1 },
      emitZone: zoneOf(new Phaser.Geom.Rectangle(-600, -40, 1200, 60)),
    }).setDepth(8500);
    this.rain.stop(); this.snow.stop();
    this.scale.on("resize", () => this.resizeOverlays());
    this.resizeOverlays();

    // input
    const kb = this.input.keyboard!;
    this.keys = {
      W: kb.addKey("W", false), A: kb.addKey("A", false), S: kb.addKey("S", false), D: kb.addKey("D", false),
      UP: kb.addKey("UP", false), LEFT: kb.addKey("LEFT", false), DOWN: kb.addKey("DOWN", false), RIGHT: kb.addKey("RIGHT", false),
      E: kb.addKey("E", false), SPACE: kb.addKey("SPACE", false),
    };
    kb.on("keydown-E", () => { if (!this.chatFocused) this.interactNearest(); });
    kb.on("keydown-SPACE", () => { if (!this.chatFocused) this.interactNearest(); });
    this.input.on("wheel", (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const cam = this.cameras.main;
      cam.setZoom(Phaser.Math.Clamp(cam.zoom - Math.sign(dy) * 0.25, this.minZoom, 4));
      this.resizeOverlays();
    });
    this.input.on("pointerdown", (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length > 0) return;
      this.dragging = false;
      if (this.player) {
        const wp = this.cameras.main.getWorldPoint(p.x, p.y);
        this.moveTarget = { x: wp.x, y: wp.y };
        this.marker.setPosition(wp.x, wp.y).setVisible(true);
        bus.emit("select", null);
      }
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      if (this.player) return; // spectators drag to pan
      this.dragging = true;
      const cam = this.cameras.main;
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
      cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
    });

    // bus wiring
    this.unsub.push(bus.on("focus", ({ x, y }) => this.cameras.main.pan(x, y, 500)));
    this.unsub.push(bus.on("moveTo", ({ x, y }) => { this.moveTarget = { x, y }; this.marker.setPosition(x, y).setVisible(true); }));
    this.unsub.push(bus.on("poke", () => { this.lastHeartbeat = 0; }));
    this.unsub.push(bus.on("chatFocus", (f) => { this.chatFocused = f; if (f) kb.disableGlobalCapture(); else kb.enableGlobalCapture(); }));
    this.events.on("shutdown", () => { this.unsub.forEach((u) => u()); if (this.pollTimer) window.clearInterval(this.pollTimer); });

    void this.poll();
    this.pollTimer = window.setInterval(() => void this.poll(), 1000);
    // Debug/testing hook: lets Playwright read camera + player state live.
    (window as unknown as Record<string, unknown>).__worldScene = this;
    (window as unknown as Record<string, unknown>).__walk = { isWalkableAt, debugRegistry, chunkAtWorldPx, registerChunk, chunkRegistered };
  }

  // Zoom policy: the FIRST fit (before any user zoom) uses the cover ratio on
  // the central 3×3 chunks — the world always overflows the canvas and the
  // camera bounds crop the overflow. Afterwards, user wheel zoom is preserved
  // across resizes but clamped so the viewport can never exceed a 3×3 chunk
  // area. That floor also guarantees a chunk crossing never clamp-jumps the
  // scroll: a ≤3×3-sized viewport centered on the player always fits inside
  // both the old and the new 5×5 loaded window.
  private fitCameraToCanvas() {
    const w = this.scale.width, h = this.scale.height;
    const cam = this.cameras.main;
    this.minZoom = Math.max(w / (3 * CHUNK_PX_W), h / (3 * CHUNK_PX_H));
    if (!this.fitted) {
      cam.setZoom(this.minZoom);
      this.fitted = true;
    } else {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom, this.minZoom, 4));
    }
  }

  private resizeOverlays() {
    this.fitCameraToCanvas();
    const w = this.scale.width, h = this.scale.height;
    this.night.setSize(w, h); this.fog.setSize(w, h);
    const zone = new Phaser.Geom.Rectangle(-w / this.cameras.main.zoom / 2 - 100, -40, w / this.cameras.main.zoom + 200, 60);
    this.rain.clearEmitZones(); this.rain.addEmitZone(zoneOf(zone));
    this.snow.clearEmitZones(); this.snow.addEmitZone(zoneOf(zone));
  }

  // ---------- networking ----------
  private polling = false;
  private async poll() {
    if (this.polling) return;
    this.polling = true;
    try {
      const body = this.player ? JSON.stringify({ x: this.player.sprite.x, y: this.player.sprite.y, facing: this.player.facing }) : null;
      const res = await fetch("/api/world", body ? { method: "POST", body, headers: { "content-type": "application/json" } } : undefined);
      if (!res.ok) return;
      const snap = (await res.json()) as Snapshot;
      this.applySnapshot(snap);
      bus.emit("snapshot", snap);
    } catch {
      /* offline blip */
    } finally {
      this.polling = false;
    }
  }

  private applySnapshot(s: Snapshot) {
    const first = !this.snapshot;
    this.snapshot = s;
    this.meId = s.me?.id ?? null;
    // buildings
    for (const b of s.buildings) {
      const view = { key: b.key, name: b.name, kind: b.kind, color: b.color, tw: b.tw, th: b.th, reservable: b.reservable, sponsor: b.sponsor };
      const texKey = buildingTextureKey(view);
      let ent = this.buildingImgs.get(b.key);
      if (!ent) {
        if (!makeBuildingTexture(this, view)) continue;
        const img = this.add.image(b.tx * TILE, (b.ty + b.th) * TILE, texKey).setOrigin(0, 1).setDepth((b.ty + b.th) * TILE - 4);
        img.setScale(TILE / 16);
        img.setInteractive({ useHandCursor: true });
        img.on("pointerdown", () => this.select({ type: "building", id: b.id, key: b.key, name: b.name, reservable: b.reservable, hasSponsor: !!b.sponsor, distance: this.distTo(buildingDoor(b).x, buildingDoor(b).y) }));
        const door = buildingDoor(b);
        const glow = this.add.circle(door.x, door.y - 30, 40, 0xffc866, 0.0).setDepth(8000).setBlendMode(Phaser.BlendModes.ADD);
        ent = { img, texKey, glow };
        this.buildingImgs.set(b.key, ent);
      } else if (ent.texKey !== texKey) {
        if (!makeBuildingTexture(this, view)) continue;
        ent.img.setTexture(texKey); ent.texKey = texKey;
      }
    }
    // me
    if (s.me) {
      if (!this.player) {
        // Spawn inside the central chunk so the player appears on screen even
        // when the server reports a position outside the chunk world.
        const spawn = chunkCenter(0, 0);
        this.player = this.makeChar(spawn.x, spawn.y, s.me.name, s.me.appearance, PLAYER_SPEED, "#ffe08a");
        this.player.sprite.setDepth(spawn.y);
        this.cameras.main.startFollow(this.player.sprite, true, 0.12, 0.12);
        this.resizeOverlays();
      } else if (first || Math.hypot(this.player.sprite.x - s.me.x, this.player.sprite.y - s.me.y) > 500) {
        this.player.sprite.setPosition(s.me.x, s.me.y);
      }
      this.player.glow?.setVisible(s.me.equipped.includes("lantern"));
      if (s.me.equipped.includes("lantern") && !this.player.glow) {
        this.player.glow = this.add.circle(s.me.x, s.me.y, 70, 0xffc866, 0.16).setDepth(8001).setBlendMode(Phaser.BlendModes.ADD);
      }
    } else if (this.player) {
      this.destroyChar(this.player); this.player = null; this.cameras.main.stopFollow();
    }
    // other players
    this.syncChars(this.players, s.players.filter((p) => p.id !== this.meId), 130, "#d6f5ff", (p) => ({ type: "player", id: p.id, name: p.name, distance: this.distTo(p.x, p.y) }));
    // npcs
    this.syncChars(this.npcs, s.npcs, 46, "#fff2b3", (n) => ({ type: "npc", id: n.id, name: n.name, role: n.role, sponsored: !!n.sponsor, distance: this.distTo(n.x, n.y) }), (n) => (n.sponsor ? `★ ${n.sponsor.businessName}` : n.kind === "remote" ? "◇ agent" : n.role));
    // animals
    this.syncCritters(this.animals, s.animals.map((a) => ({ id: a.id, kind: a.species, x: a.x, y: a.y, facing: a.facing, state: a.state, hp: 1, maxHp: 1, name: a.name })), 34, (a) => ({ type: "animal", id: a.id, name: a.name!, species: a.kind, distance: this.distTo(a.x, a.y) }));
    // enemies
    this.syncCritters(this.enemies, s.enemies.map((e) => ({ id: e.id, kind: e.kind, x: e.x, y: e.y, facing: "right", state: "walk", hp: e.hp, maxHp: e.maxHp })), 26, (e) => ({ type: "enemy", id: e.id, kind: e.kind, hp: e.hp, maxHp: e.maxHp, distance: this.distTo(e.x, e.y) }));
    // ground items
    const seenItems = new Set<number>();
    for (const it of s.groundItems) {
      seenItems.add(it.id);
      if (!this.items.has(it.id)) {
        const t = this.add.text(it.x, it.y, ITEM_ICONS[it.itemKey] ?? "📦", { fontSize: "14px" }).setOrigin(0.5, 1).setDepth(it.y).setResolution(2);
        t.setInteractive({ useHandCursor: true });
        t.on("pointerdown", () => this.select({ type: "item", id: it.id, itemKey: it.itemKey, distance: this.distTo(it.x, it.y) }));
        this.tweens.add({ targets: t, y: it.y - 4, duration: 900, yoyo: true, repeat: -1, ease: "Sine.inOut" });
        this.items.set(it.id, t);
      }
    }
    for (const [id, t] of this.items) if (!seenItems.has(id)) { t.destroy(); this.items.delete(id); }
    // nodes
    for (const n of s.nodes) {
      let img = this.nodes.get(n.id);
      if (!img) {
        img = this.add.image(n.x, n.y, `node_${n.kind}`).setOrigin(0.5, 1).setDepth(n.y);
        img.setInteractive({ useHandCursor: true });
        img.on("pointerdown", () => { const cur = this.snapshot?.nodes.find((x) => x.id === n.id); this.select({ type: "node", id: n.id, kind: n.kind, ready: cur?.ready ?? n.ready, distance: this.distTo(n.x, n.y) }); });
        this.nodes.set(n.id, img);
      }
      img.setAlpha(n.ready ? 1 : 0.35);
    }
    // chat bubbles
    for (const c of s.chat) {
      if (this.shownChat.has(c.id)) continue;
      this.shownChat.add(c.id);
      if (first && Date.now() - c.at > 8000) continue;
      const ent = c.speakerType === "npc" ? this.npcs.get(c.speakerId) : c.speakerId === this.meId ? this.player : this.players.get(c.speakerId);
      if (ent) this.showBubble(ent, c.text);
    }
    if (this.shownChat.size > 500) this.shownChat = new Set([...this.shownChat].slice(-200));
  }

  // ---------- entities ----------
  private makeChar(x: number, y: number, name: string, app: Appearance, speed: number, labelColor: string): CharEnt {
    const sprite = this.add.sprite(x, y, "ph_char").setOrigin(0.5, 0.9);
    sprite.setInteractive({ useHandCursor: true });
    const label = this.add.text(x, y - 52, name, { fontFamily: "monospace", fontSize: "11px", color: labelColor, stroke: "#1a1a1a", strokeThickness: 3 }).setOrigin(0.5, 1).setResolution(3);
    const ent: CharEnt = { sprite, label, tx: x, ty: y, facing: "down", speed, texKey: null, appKey: appearanceKey(app) };
    void this.ensureCharTexture(ent, app);
    return ent;
  }

  private async ensureCharTexture(ent: CharEnt, app: Appearance) {
    const key = appearanceKey(app);
    if (!this.textures.exists(key)) {
      const canvas = await composeCharacter(app);
      if (!this.textures.exists(key)) {
        const tex = this.textures.addCanvas(key, canvas);
        if (!tex) return;
        for (let r = 0; r < 4; r++) for (let c = 0; c < 9; c++) tex.add(`${r}_${c}`, 0, c * FRAME, r * FRAME, FRAME, FRAME);
        for (const dir of Object.keys(ROWS) as Dir[]) {
          const r = ROWS[dir];
          this.anims.create({ key: `${key}_walk_${dir}`, frames: Array.from({ length: 8 }, (_, i) => ({ key, frame: `${r}_${i + 1}` })), frameRate: 11, repeat: -1 });
        }
      }
    }
    if (!ent.sprite.active) return;
    ent.texKey = key;
    ent.sprite.setTexture(key, `${ROWS[ent.facing]}_0`);
  }

  private destroyChar(e: CharEnt) {
    e.sprite.destroy(); e.label.destroy(); e.badge?.destroy(); e.bubble?.c.destroy(); e.glow?.destroy();
  }

  private syncChars<T extends { id: number; x: number; y: number; facing: string; name: string; appearance: Appearance }>(
    map: Map<number, CharEnt>, list: T[], speed: number, labelColor: string, sel: (t: T) => Selection, badge?: (t: T) => string,
  ) {
    const seen = new Set<number>();
    for (const p of list) {
      seen.add(p.id);
      let ent = map.get(p.id);
      const appKey = appearanceKey(p.appearance);
      if (ent && ent.appKey !== appKey) { this.destroyChar(ent); map.delete(p.id); ent = undefined; }
      if (!ent) {
        ent = this.makeChar(p.x, p.y, p.name, p.appearance, speed, labelColor);
        const created = ent;
        ent.sprite.on("pointerdown", () => { const s = sel(p); s.distance = this.distTo(created.sprite.x, created.sprite.y); this.select(s); });
        if (badge) {
          const txt = badge(p);
          ent.badge = this.add.text(p.x, p.y - 62, txt, { fontFamily: "monospace", fontSize: "9px", color: txt.startsWith("★") ? "#ffd166" : "#cfe8cf", stroke: "#1a1a1a", strokeThickness: 3 }).setOrigin(0.5, 1).setResolution(3);
        }
        map.set(p.id, ent);
      }
      ent.tx = p.x; ent.ty = p.y;
      if (ent.label.text !== p.name) ent.label.setText(p.name);
      if (["up", "down", "left", "right"].includes(p.facing) && Math.hypot(ent.sprite.x - p.x, ent.sprite.y - p.y) < 2) ent.facing = p.facing as Dir;
      if (Math.hypot(ent.sprite.x - p.x, ent.sprite.y - p.y) > 400) ent.sprite.setPosition(p.x, p.y);
    }
    for (const [id, ent] of map) if (!seen.has(id)) { this.destroyChar(ent); map.delete(id); }
  }

  private syncCritters<T extends { id: number; kind: string; x: number; y: number; facing: string; state: string; hp: number; maxHp: number; name?: string }>(
    map: Map<number, CritterEnt>, list: T[], speed: number, sel: (t: T) => Selection,
  ) {
    const seen = new Set<number>();
    for (const a of list) {
      seen.add(a.id);
      let ent = map.get(a.id);
      if (!ent) {
        const sprite = this.add.image(a.x, a.y, `cr_${a.kind}`).setOrigin(0.5, 1).setDepth(a.y);
        sprite.setInteractive({ useHandCursor: true });
        sprite.on("pointerdown", () => { const s = sel(a); s.distance = this.distTo(sprite.x, sprite.y); this.select(s); });
        ent = { sprite, tx: a.x, ty: a.y, facing: a.facing, state: a.state, speed, hp: a.hp, maxHp: a.maxHp, phase: Math.random() * 10 };
        if (a.name) ent.label = this.add.text(a.x, a.y - sprite.height - 2, a.name, { fontFamily: "monospace", fontSize: "9px", color: "#e8f5e9", stroke: "#1a1a1a", strokeThickness: 3 }).setOrigin(0.5, 1).setResolution(3).setAlpha(0.85);
        if (a.maxHp > 1) ent.hpBar = this.add.graphics().setDepth(a.y + 1);
        map.set(a.id, ent);
      }
      ent.tx = a.x; ent.ty = a.y; ent.state = a.state; ent.hp = a.hp; ent.maxHp = a.maxHp;
      if (a.facing === "left" || a.facing === "right") ent.facing = a.facing;
      if (Math.hypot(ent.sprite.x - a.x, ent.sprite.y - a.y) > 300) ent.sprite.setPosition(a.x, a.y);
      if (ent.hpBar) {
        ent.hpBar.clear();
        if (a.hp < a.maxHp) { ent.hpBar.fillStyle(0x000000, 0.5); ent.hpBar.fillRect(-10, -ent.sprite.height - 6, 20, 3); ent.hpBar.fillStyle(0xe63946, 1); ent.hpBar.fillRect(-10, -ent.sprite.height - 6, 20 * (a.hp / a.maxHp), 3); }
      }
    }
    for (const [id, ent] of map) if (!seen.has(id)) { ent.sprite.destroy(); ent.label?.destroy(); ent.zz?.destroy(); ent.hpBar?.destroy(); map.delete(id); }
  }

  private showBubble(ent: CharEnt, text: string) {
    ent.bubble?.c.destroy();
    const t = this.add.text(0, 0, text, { fontFamily: "monospace", fontSize: "10px", color: "#222", wordWrap: { width: 130 }, align: "center" }).setOrigin(0.5, 1).setResolution(3);
    const bg = this.add.rectangle(0, 2, t.width + 10, t.height + 8, 0xffffff, 0.95).setOrigin(0.5, 1).setStrokeStyle(1, 0x555555);
    const tail = this.add.triangle(0, 6, 0, 0, 8, 0, 4, 5, 0xffffff).setOrigin(0.5, 0);
    const c = this.add.container(ent.sprite.x, ent.sprite.y - 66, [bg, tail, t]).setDepth(15000);
    ent.bubble = { c, until: this.time.now + 4000 + Math.min(5000, text.length * 40) };
  }

  // ---------- selection / interaction ----------
  private distTo(x: number, y: number) {
    return this.player ? Math.hypot(this.player.sprite.x - x, this.player.sprite.y - y) : 9999;
  }
  private select(sel: Selection) {
    bus.emit("select", sel);
  }
  private interactNearest() {
    if (!this.player || !this.snapshot) return;
    const s = this.snapshot;
    const cands: { d: number; sel: Selection }[] = [];
    for (const n of s.npcs) cands.push({ d: this.distTo(n.x, n.y), sel: { type: "npc", id: n.id, name: n.name, role: n.role, sponsored: !!n.sponsor, distance: this.distTo(n.x, n.y) } });
    for (const a of s.animals) cands.push({ d: this.distTo(a.x, a.y), sel: { type: "animal", id: a.id, name: a.name, species: a.species, distance: this.distTo(a.x, a.y) } });
    for (const e of s.enemies) cands.push({ d: this.distTo(e.x, e.y), sel: { type: "enemy", id: e.id, kind: e.kind, hp: e.hp, maxHp: e.maxHp, distance: this.distTo(e.x, e.y) } });
    for (const i of s.groundItems) cands.push({ d: this.distTo(i.x, i.y), sel: { type: "item", id: i.id, itemKey: i.itemKey, distance: this.distTo(i.x, i.y) } });
    for (const n of s.nodes) cands.push({ d: this.distTo(n.x, n.y), sel: { type: "node", id: n.id, kind: n.kind, ready: n.ready, distance: this.distTo(n.x, n.y) } });
    for (const b of s.buildings) { const d = buildingDoor(b); cands.push({ d: this.distTo(d.x, d.y), sel: { type: "building", id: b.id, key: b.key, name: b.name, reservable: b.reservable, hasSponsor: !!b.sponsor, distance: this.distTo(d.x, d.y) } }); }
    cands.sort((a, b) => a.d - b.d);
    if (cands[0] && cands[0].d < 110) this.select(cands[0].sel);
    else bus.emit("toast", { text: "Nothing close enough to interact with.", kind: "info" });
  }

  // ---------- update loop ----------
  update(time: number, deltaMs: number) {
    const dt = Math.min(0.05, deltaMs / 1000);
    if (this.player) {
      this.updatePlayer(dt);
      this.syncStreamingChunks();
    }
    for (const e of this.players.values()) this.moveChar(e, dt);
    for (const e of this.npcs.values()) this.moveChar(e, dt);
    for (const e of this.animals.values()) this.moveCritter(e, dt, time);
    for (const e of this.enemies.values()) this.moveCritter(e, dt, time);
    this.updateAtmosphere();
    // spectator drift
    if (!this.player && !this.dragging && !this.input.activePointer.isDown) {
      const cam = this.cameras.main;
      cam.scrollX += Math.sin(time / 9000) * 0.15;
      cam.scrollY += Math.cos(time / 11000) * 0.1;
    }
  }

  // Streaming: only when the player crosses a chunk boundary, load the new
  // surrounding chunks, release the ones outside the window, and recompute
  // camera bounds.
  private syncStreamingChunks(): void {
    if (!this.player) return;
    const cur = chunkAtPixel(this.player.sprite.x, this.player.sprite.y);
    if (this.lastPlayerChunk && this.lastPlayerChunk.cx === cur.cx && this.lastPlayerChunk.cy === cur.cy) return;
    this.lastPlayerChunk = cur;
    void ensureChunks(this, cur);
    releaseOutside(this, cur);
    // No recenter: the player-follow owns the framing on chunk crossings.
    recenterCamera(this, cur, false);
  }

  private updatePlayer(dt: number) {
    const p = this.player!;
    let vx = 0, vy = 0;
    if (!this.chatFocused) {
      if (this.keys.A.isDown || this.keys.LEFT.isDown) vx -= 1;
      if (this.keys.D.isDown || this.keys.RIGHT.isDown) vx += 1;
      if (this.keys.W.isDown || this.keys.UP.isDown) vy -= 1;
      if (this.keys.S.isDown || this.keys.DOWN.isDown) vy += 1;
    }
    // Snap to dominant axis so WASD is cardinal-only (matches the facing
    // selection below). Click-to-move NPCs stay diagonal — that's correct
    // for moving toward a specific point.
    if (vx !== 0 && vy !== 0) {
      if (Math.abs(vx) > Math.abs(vy)) vy = 0;
      else vx = 0;
    }
    if (vx || vy) { this.moveTarget = null; this.marker.setVisible(false); }
    else if (this.moveTarget) {
      const dx = this.moveTarget.x - p.sprite.x, dy = this.moveTarget.y - p.sprite.y;
      const d = Math.hypot(dx, dy);
      if (d < 4) { this.moveTarget = null; this.marker.setVisible(false); }
      else { vx = dx / d; vy = dy / d; }
    }
    const moving = vx !== 0 || vy !== 0;
    if (moving) {
      const len = Math.hypot(vx, vy);
      const step = PLAYER_SPEED * dt;
      const nx = p.sprite.x + (vx / len) * step, ny = p.sprite.y + (vy / len) * step;
      let movedAny = false;
      if (isWalkable(nx, p.sprite.y)) { p.sprite.x = nx; movedAny = true; }
      if (isWalkable(p.sprite.x, ny)) { p.sprite.y = ny; movedAny = true; }
      if (!movedAny && this.moveTarget) { this.moveTarget = null; this.marker.setVisible(false); }
      p.facing = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? "right" : "left") : vy > 0 ? "down" : "up";
      this.playWalk(p, true);
    } else this.playWalk(p, false);
    this.placeChar(p);
    if (p.glow) p.glow.setPosition(p.sprite.x, p.sprite.y - 20);
  }

  private moveChar(e: CharEnt, dt: number) {
    const dx = e.tx - e.sprite.x, dy = e.ty - e.sprite.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.5) {
      const step = Math.min(d, Math.max(e.speed * dt, d * 3 * dt));
      e.sprite.x += (dx / d) * step; e.sprite.y += (dy / d) * step;
      e.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      this.playWalk(e, true);
    } else this.playWalk(e, false);
    this.placeChar(e);
  }

  private playWalk(e: CharEnt, moving: boolean) {
    if (!e.texKey) return;
    const anim = `${e.texKey}_walk_${e.facing}`;
    if (moving) { if (e.sprite.anims.currentAnim?.key !== anim || !e.sprite.anims.isPlaying) e.sprite.play(anim, true); }
    else if (e.sprite.anims.isPlaying || e.sprite.frame.name !== `${ROWS[e.facing]}_0`) { e.sprite.stop(); e.sprite.setFrame(`${ROWS[e.facing]}_0`); }
  }

  private placeChar(e: CharEnt) {
    const { x, y } = e.sprite;
    e.sprite.setDepth(y);
    e.label.setPosition(x, y - 50);
    e.badge?.setPosition(x, y - 60);
    if (e.bubble) {
      e.bubble.c.setPosition(x, y - (e.badge ? 72 : 62));
      if (this.time.now > e.bubble.until) { e.bubble.c.destroy(); e.bubble = undefined; }
    }
  }

  private moveCritter(e: CritterEnt, dt: number, time: number) {
    const dx = e.tx - e.sprite.x, dy = e.ty - e.sprite.y;
    const d = Math.hypot(dx, dy);
    let bob = 0;
    if (d > 0.5) {
      const step = Math.min(d, Math.max(e.speed * dt, d * 2.5 * dt));
      e.sprite.x += (dx / d) * step; e.sprite.y += (dy / d) * step;
      if (Math.abs(dx) > 1) e.facing = dx > 0 ? "right" : "left";
      bob = Math.abs(Math.sin(time / 90 + e.phase)) * 2;
    } else if (e.state === "graze") bob = Math.sin(time / 400 + e.phase) > 0.8 ? 1 : 0;
    else if (e.maxHp > 1) bob = Math.abs(Math.sin(time / 300 + e.phase)) * 1.5;
    e.sprite.setFlipX(e.facing === "left");
    e.sprite.setDepth(e.sprite.y);
    e.sprite.y -= 0; // keep base
    e.sprite.setDisplayOrigin(e.sprite.width / 2, e.sprite.height + bob);
    e.label?.setPosition(e.sprite.x, e.sprite.y - e.sprite.height - 4);
    e.hpBar?.setPosition(e.sprite.x, e.sprite.y);
    if (e.state === "sleep") {
      if (!e.zz) e.zz = this.add.text(e.sprite.x + 8, e.sprite.y - e.sprite.height - 10, "z", { fontFamily: "monospace", fontSize: "10px", color: "#ffffff", stroke: "#000", strokeThickness: 2 }).setResolution(3).setDepth(e.sprite.y + 1);
      e.zz.setPosition(e.sprite.x + 8, e.sprite.y - e.sprite.height - 8 - Math.abs(Math.sin(time / 500)) * 4);
    } else if (e.zz) { e.zz.destroy(); e.zz = undefined; }
  }

  private updateAtmosphere() {
    const s = this.snapshot;
    if (!s) return;
    // continuous clock from epoch
    const dayMs = s.dayLengthMinutes * 60_000;
    const hour = ((((Date.now() - s.epochStart) % dayMs) / dayMs) * 24 + 7) % 24;
    let dark = 0;
    if (hour < 5) dark = 0.6; else if (hour < 7) dark = 0.6 * (1 - (hour - 5) / 2); else if (hour < 18) dark = 0; else if (hour < 21) dark = 0.6 * ((hour - 18) / 3); else dark = 0.6;
    const dusk = hour >= 17.5 && hour < 20 ? 1 - Math.abs(hour - 18.75) / 1.25 : 0;
    this.night.setFillStyle(dusk > 0.2 ? 0x3a1a40 : 0x0a1030, dark + dusk * 0.12);
    this.fog.setFillStyle(0xdfe6ea, s.weather === "fog" ? 0.38 : 0);
    const cam = this.cameras.main;
    const top = cam.worldView.y - 30;
    this.rain.setPosition(cam.midPoint.x, top); this.snow.setPosition(cam.midPoint.x, top);
    if (s.weather === "rain") { if (!this.rain.emitting) this.rain.start(); } else if (this.rain.emitting) this.rain.stop();
    if (s.weather === "snow") { if (!this.snow.emitting) this.snow.start(); } else if (this.snow.emitting) this.snow.stop();
    const glowA = dark > 0.1 ? Math.min(0.28, dark * 0.5) : 0;
    for (const b of this.buildingImgs.values()) b.glow.setAlpha(glowA);
  }
}

export { BUILDINGS };
