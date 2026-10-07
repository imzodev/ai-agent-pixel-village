import Phaser from "phaser";
import type { Appearance } from "@/db/schema";
import { isWalkable } from "@/lib/worldmap";
import { appearanceKey, composeCharacter, FRAME, ROWS, SHOOT_FRAMES, SHOOT_RELEASE_FRAME, SHOOT_ROW, SLASH_FRAMES, SLASH_ROW, weaponOf } from "./lpc";
import { BOWS, SHOT_COOLDOWN_MS } from "@/lib/progression";
import { RIDE_FRAMES, riderSheet } from "./riding";
import { REACH_PX, pickTarget } from "./interactTarget";
import { pickedByMe } from "./forageClaims";
import { breadTakenByMe, loafSlots, tableTexture } from "./breadTable";
import { ROLL_MS, ROLL_PX, canRoll, dirVec } from "@/lib/combat/strikes";
import type { Strike, StrikeShape } from "@/types/combat";
import { CROP_KINDS } from "@/lib/crops";
import { placeByKey, regionAt } from "@/lib/regions";
import { Lighting, resetLights, setLightGroup } from "./lighting";
import { Ambience } from "./ambience";
import { FishingController } from "./fishing";
import type { AtmosphereState, LightSource } from "@/types/lighting";
import { FURNITURE_TEXTURE, makeAllTextures, loadPropSprites, nodeFrameKey, nodeOrigin, nodeSheetKey, nodeTextureKey, registerCropFrames } from "./textures";
import { bus, ITEM_ICONS, type Selection, type Snapshot } from "./bus";
import { chunkAtWorldPx, debugRegistry, isWalkableAt, registerChunk, chunkRegistered } from "@/lib/chunkCollision";
import { chimneySources, resetStampVisuals, stampBuildings, stampLights, syncStampVisuals } from "./buildingStamps";
import type { BuildingManifest } from "@/lib/buildingManifest";
import { WorldStream } from "./worldStream";
import {
  DEPTH_CANOPY,
  DEPTH_CHAR_BASE,
  CHUNK_PX_H,
  CHUNK_PX_W,
  chunkAtPixel,
  chunkCenter,
  ensureChunks,
  loadTilemapAssets,
  recenterCamera,
  releaseOutside,
  reloadChunk,
  resetChunkState,
  tileGidAt,
} from "./worldTilemap";
import { wildsNameOf } from "@/lib/terrain/wilds";
import { treeFromTile, trunkPoint } from "@/lib/trees";
import { TOWNS } from "@/lib/settlements";
import { boardPoint } from "@/lib/bounties";
import { RELICS, relicPoint } from "@/lib/relics";
import { tableByKey } from "@/lib/bakery";
import { SHOP_DISPLAYS, piecePoint } from "@/lib/shopDisplay";
import { BIKE_SPEED_MULT, PLAYER_SPEED, RUN_SPEED_MULT } from "@/lib/speedGuard";
import type { TreeSpot } from "@/types/trees";
import { inputRouter } from "./input/router";
import type { Facing } from "@/types/world";
import type { CharEnt, CritterEnt, InteractCandidate } from "@/types/game";
import type { Move, ScheduledMove } from "@/types/motion";
import type { EnemySnapshot } from "@/lib/protocol";
import type { BreadTableSnapshot } from "@/types/bakery";
import type { ShopDisplaySnapshot } from "@/types/shopDisplay";
import type { LotSnapshot } from "@/types/garden";
import type { RanchBuildKey } from "@/types/ranchGrowth";
import { RANCH_PROP_SPOTS } from "./ranchProps";
import { VINEYARD_PROP_SPOTS } from "./vineyardProps";
import { SHOWROOM_SPOTS, WORKSHOP_PROP_SPOTS } from "./workshopProps";
import { FURNITURE_CELLS } from "./furnitureArt";
import { positionAt } from "@/lib/motion";
import { ANIMAL_SPRITES, animKey, frameIndex, sheetKey } from "./animalSprites";
import type { EquippedCosmetics } from "@/types/cosmetic";

// Fixed UI/effect depths relative to the canopy band, preserving the old
// draw order (weather over lights, bubbles on top).
const DEPTH_MARKER = DEPTH_CHAR_BASE - 10_000; // ground click marker, under characters
const DEPTH_LIGHT = DEPTH_CANOPY + 10;         // lantern / door glows over canopy
const DEPTH_WEATHER = DEPTH_CANOPY + 20;
// Creatures whose art already includes a ground shadow (they fly / float).
const FLYERS = new Set(["bat", "wisp", "rootking", "wyvern", "rime_wraith"]);
const DEPTH_NIGHT = DEPTH_CANOPY + 30;
const DEPTH_FOG = DEPTH_CANOPY + 31;
const DEPTH_BUBBLE = DEPTH_CANOPY + 40;        // chat bubbles always readable


// Walking speed and the running multiplier (hold Shift / push the joystick
// all the way) are shared with the server's speed limit
// (src/lib/speedGuard.ts). Running also cycles the legs faster.
const RUN_ANIM_SCALE = 1.6;
// Remote characters covering ground faster than this (px/s) are shown
// running (their positions arrive via the relay, not as a run flag).
const REMOTE_RUN_PX_S = 170;
// Attack swing: LPC slash frames at this rate; movement pauses meanwhile.
const SLASH_FPS = 14;
const SLASH_MS = Math.round((SLASH_FRAMES / SLASH_FPS) * 1000);
// How close an enemy must be for the attack key to hit it (server allows 80).
const ATTACK_REACH_PX = 76;
// Drawing a bow takes as long as the server's shot cooldown; the arrow
// leaves the string at the release frame and flies at ARROW_PX_S.
const SHOOT_FPS = Math.round(SHOOT_FRAMES / (SHOT_COOLDOWN_MS / 1000));
const SHOOT_RELEASE_MS = Math.round((SHOOT_RELEASE_FRAME / SHOOT_FPS) * 1000);
const ARROW_PX_S = 420;
// Clickable height (px) at the base of a garden crop — less than the 32 px
// between plot rows, so neighbouring plots never steal each other's clicks.
const GARDEN_HIT_H = 22;
// Clickable height of a tree node (its trunk base).
const TREE_HIT_H = 22;

/** Convert the snapshot's flat slot/itemKey list into an EquippedCosmetics
 *  record the LPC compositor can read. Slots not in CosmeticSlot are
 *  ignored (e.g. sponsor-only slots without sprites yet). */
function cosmeticsListToEquipped(list: { slot: string; itemKey: string }[] | undefined): EquippedCosmetics | undefined {
  if (!list || list.length === 0) return undefined;
  const out: EquippedCosmetics = {};
  for (const { slot, itemKey } of list) {
    if (slot === "hair" || slot === "hat" || slot === "glasses" || slot === "outfit" || slot === "back" || slot === "pet") {
      out[slot] = itemKey;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Keep the newest scheduled move. Snapshots can be served from a cache
 * built before the latest beat's `moves` message, so never let an older
 * move (or a missing one) overwrite a newer one.
 */
function acceptMove(ent: { move?: Move | null }, move: Move | null): void {
  if (!move) return;
  if (!ent.move || move.startAt >= ent.move.startAt) ent.move = move;
}

function zoneOf(rect: Phaser.Geom.Rectangle): Phaser.Types.GameObjects.Particles.ParticleEmitterRandomZoneConfig {
  return { type: "random", source: rect as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource };
}

function touchDist(t: TouchList): number {
  return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
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
  /** Dark wet-soil patch under crops watered in their current stage. */
  private wetSoil = new Map<number, Phaser.GameObjects.Ellipse>();
  /** Whether the local player owns a bicycle (told by the HUD). */
  private hasBike = false;
  /** Riding sheets being built (texture keys). */
  private rideBuilding = new Set<string>();
  /** Hidden relics still to find glint where they lie (null until loaded). */
  private relicsFound: Set<string> | null = null;
  private relicGlints = new Map<string, { img: Phaser.GameObjects.Image; glint: Phaser.GameObjects.Image }>();
  /** The loaf images on each bakery bread table. */
  private breadLoaves = new Map<string, Phaser.GameObjects.Image[]>();
  /** What's been built on each ranch lot, by building. */
  private ranchProps = new Map<string, Map<string, Phaser.GameObjects.Image>>();
  /** The goods on each shop display, per item. */
  private displayPieces = new Map<string, Map<string, Phaser.GameObjects.Image[]>>();
  /** Relics we've already pointed out ("something glints nearby"). */
  private relicsNoticed = new Set<string>();
  private relicCheckAt = 0;
  /** The "E acts on this" marker: its target, when to next look for one,
   *  and where we stood (and faced) when we last looked. */
  private targetMarker?: Phaser.GameObjects.Image;
  private markerTarget: Selection | null = null;
  private targetCheckAt = 0;
  private targetFrom: { x: number; y: number; facing: Facing } | null = null;
  private forageCheckAt = 0;
  /** Enemy attacks under way: their telegraphs (and bolts in flight). */
  private fights = new Map<number, { s: Strike; g: Phaser.GameObjects.Graphics; bolt?: Phaser.GameObjects.Image }>();
  /** When the last dodge roll started (rolls have a short cooldown). */
  private lastRollAt: number | undefined;
  /** A dodge roll in progress: until when, and which way. */
  private roll: { until: number; vx: number; vy: number } | null = null;
  /** Slowed (a frost wolf's bite) until this scene time. */
  private slowUntil = 0;
  // Door world-px per building key, derived from the template's Interactive
  // layer during stamping. Snapshot rows also carry doorX/doorY (server-side).
  private buildingDoors = new Map<string, { x: number; y: number }>();
  // Selection/click rect per building key (collision bbox inside the template).
  private buildingZonesRects = new Map<string, { x: number; y: number; w: number; h: number }>();
  private buildingZones = new Map<string, { zone: Phaser.GameObjects.Zone; glow: Phaser.GameObjects.Arc; door: { x: number; y: number } }>();
  private shownChat = new Set<number>();
  private moveTarget: { x: number; y: number } | null = null;
  /** The most recent Selection the player has chosen (click or E). Used
   *  by the context-sensitive `interact` command handler so a second
   *  press of E acts on the same selection instead of re-targeting. */
  private lastSelection: Selection | null = null;
  private nextIdleEmote = 0;
  private fishing!: FishingController;
  private canFishShown = false;
  private nextFishCheck = 0;
  private guide: { x: number; y: number; npcId?: number } | null = null;
  private guideArrow!: Phaser.GameObjects.Image;
  private nextGuideEmote = 0;
  /** Chimney smoke positions, known once the buildings are stamped. */
  private pendingSmoke: { x: number; y: number }[] = [];
  private ambience!: Ambience;
  private playerMoving = false;
  private playerRunning = false;
  /** Region the player was last in (undefined until first placed). */
  private lastRegionKey: string | null | undefined = undefined;
  private lighting!: Lighting;
  private fog!: Phaser.GameObjects.Rectangle;
  private rain!: Phaser.GameObjects.Particles.ParticleEmitter;
  private snow!: Phaser.GameObjects.Particles.ParticleEmitter;
  private lastHeartbeat = 0;
  private stream: WorldStream | null = null;
  private dragging = false;
  private marker!: Phaser.GameObjects.Image;
  private sentFirst = false;
  private lastPlayerChunk: { cx: number; cy: number } | null = null;
  private unsub: (() => void)[] = [];
  // Camera zoom floor: the smallest zoom at which the viewport still fits
  // inside the loaded 5×5 chunk window. Recomputed on resize; used by the
  // wheel handler so zooming out can never reveal the background.
  private minZoom = 1;
  private fitted = false;
  private modalOpen = false;
  // Set on scene shutdown/destroy. Async work (WS snapshots, chunk loading,
  // building stamps) checks this before touching Phaser, so a destroyed
  // scene is never written to. React StrictMode double-mounts in dev and
  // would otherwise crash with `this.add` / tilemaps being null.
  private destroyed = false;

  // Throttle state for the `playerMoved` bus event (HUD proximity UI).
  private lastSelfEmitAt = 0;
  private lastSelfEmitX = 0;
  private lastSelfEmitY = 0;

  // Bound teardown so it can be used as an event handler and registered
  // before create()'s awaits. Idempotent.
  private readonly teardown = (): void => {
    this.destroyed = true;
    this.stream?.stop();
    this.stream = null;
    this.unsub.forEach((u) => u());
    this.unsub = [];
    // Free module-global chunk/rendering state owned by this scene so a
    // recreated scene never reuses dead tilemaps.
    resetChunkState();
    resetStampVisuals();
  };

  // True while it is safe to create/modify game objects. Guards every async
  // continuation and the WS snapshot handler.
  private alive(): boolean {
    return !this.destroyed && Boolean(this.sys?.isActive()) && Boolean(this.add) && Boolean(this.tweens);
  }

  constructor() {
    super("world");
  }

  preload() {
    loadTilemapAssets(this);
    loadPropSprites(this);
    // Animated animals (cow, fox, …) — one sheet per species, see
    // src/game/animalSprites.ts. Licensing: public/assets/ATTRIBUTION.md.
    for (const [species, def] of Object.entries(ANIMAL_SPRITES)) {
      this.load.spritesheet(sheetKey(species), def.url, { frameWidth: def.frameWidth, frameHeight: def.frameHeight });
    }
  }

  async create() {
    resetLights(); // light groups outlive a scene restart
    this.destroyed = false;
    // Register teardown FIRST, before any await below. create() is async and
    // the scene can be shut down mid-flight (StrictMode remount, HMR); if
    // teardown were registered at the end, `destroyed` would stay false and
    // later continuations would write to a dead scene.
    this.events.once("shutdown", this.teardown);
    this.events.once("destroy", this.teardown);
    // Drop any chunk/render state left by a previous scene instance. The
    // chunk maps are module-global and would otherwise hold tilemaps owned
    // by the dead scene (StrictMode remount / HMR), which crash on reuse.
    resetChunkState();
    resetStampVisuals();
    makeAllTextures(this);
    // The lpc_crops image is loaded in preload; add per-crop frame regions
    // (wheat_field, …) so node rendering can pick the right one via a frame
    // name. Must run after preload, hence here in create().
    registerCropFrames(this);
    // One animation per species × action × direction, from the registry.
    for (const [species, def] of Object.entries(ANIMAL_SPRITES)) {
      for (const [action, a] of Object.entries(def.actions)) {
        for (const dir of def.dirRows) {
          const frames = Array.from({ length: a.frames }, (_, f) => frameIndex(def, action, dir, f));
          this.anims.create({
            key: animKey(species, action, dir),
            frames: this.anims.generateFrameNumbers(sheetKey(species), { frames }),
            frameRate: a.frameRate,
            repeat: a.loop ? -1 : 0,
          });
        }
      }
    }
    // Initial chunk window: central chunk (0, 0). Streaming kicks in once the
    // player crosses a chunk boundary in updatePlayer.
    this.lastPlayerChunk = { cx: 0, cy: 0 };
    await ensureChunks(this, this.lastPlayerChunk);
    // The scene may have been shut down during the await (StrictMode
    // remount, HMR, navigation). Stop before touching Phaser again.
    if (!this.alive()) return;
    // Stamp interactive buildings from the manifest (best-effort: a missing
    // or broken manifest leaves the world decor-only).
    try {
      const res = await fetch("/buildings/buildings.json");
      if (!this.alive()) return;
      if (res.ok) {
        const manifest = (await res.json()) as BuildingManifest;
        if (!this.alive()) return;
        const stamped = await stampBuildings(this, manifest);
        if (!this.alive()) return;
        for (const s of stamped) {
          if (s.door) this.buildingDoors.set(s.entry.key, s.door);
          this.buildingZonesRects.set(s.entry.key, s.zone);
          for (const p of s.garden) this.addPlotZone(s.entry.key, p);
        }
        setLightGroup("stamps", stampLights(stamped));
        this.pendingSmoke = chimneySources(stamped);
        syncStampVisuals(this, this.lastPlayerChunk); // only the ones near the player are drawn
      }
    } catch {
      /* manifest unavailable — decor-only world */
    }
    if (!this.alive()) return;
    recenterCamera(this, this.lastPlayerChunk);
    // placeholder char texture
    if (!this.textures.exists("ph_char")) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0x000000, 0.25); g.fillEllipse(32, 58, 22, 8);
      g.fillStyle(0x8899aa, 1); g.fillRect(24, 24, 16, 30); g.fillCircle(32, 20, 8);
      g.generateTexture("ph_char", 64, 64); g.destroy();
    }
    this.marker = this.add.image(0, 0, "marker").setDepth(DEPTH_MARKER).setVisible(false);

    this.cameras.main.setRoundPixels(true);

    this.scale.on("resize", () => this.fitCameraToCanvas());
    this.fitCameraToCanvas();

    // overlays
    this.lighting = new Lighting(this, { night: DEPTH_NIGHT, glow: DEPTH_NIGHT + 0.5, clouds: DEPTH_CANOPY + 5, fog: DEPTH_FOG, ground: -10 });
    this.ambience = new Ambience(this, { charBase: DEPTH_CHAR_BASE, canopy: DEPTH_CANOPY, light: DEPTH_NIGHT + 1 });
    this.ambience.setSmokeSources(this.pendingSmoke);
    this.fishing = new FishingController(this, {
      player: () => (this.player ? { x: this.player.sprite.x, y: this.player.sprite.y, facing: this.player.facing } : null),
      toast: (text, kind) => bus.emit("toast", { text, kind }),
      refresh: () => bus.emit("refreshMe", undefined),
      emote: (text) => { if (this.player) this.showEmote(this.player, text, 900); },
    }, DEPTH_CANOPY - 2);
    this.guideArrow = this.add.image(0, 0, "fx_guide_arrow").setDepth(DEPTH_NIGHT + 2).setVisible(false);
    this.unsub.push(bus.on("guide", (g) => { this.guide = g; }));
    this.fog = this.add.rectangle(0, 0, 10, 10, 0xdfe6ea, 0).setOrigin(0).setScrollFactor(0).setDepth(DEPTH_FOG);
    this.rain = this.add.particles(0, 0, "rain", {
      lifespan: 1200, speedY: { min: 420, max: 520 }, speedX: -60, quantity: 4, frequency: 24, alpha: { start: 0.7, end: 0.2 }, scale: { min: 0.8, max: 1.2 },
      emitZone: zoneOf(new Phaser.Geom.Rectangle(-600, -40, 1200, 60)),
    }).setDepth(DEPTH_WEATHER);
    this.snow = this.add.particles(0, 0, "snow", {
      lifespan: 5000, speedY: { min: 30, max: 60 }, speedX: { min: -20, max: 20 }, quantity: 2, frequency: 60, alpha: { start: 0.9, end: 0.3 }, scale: { min: 0.5, max: 1 },
      emitZone: zoneOf(new Phaser.Geom.Rectangle(-600, -40, 1200, 60)),
    }).setDepth(DEPTH_WEATHER);
    this.rain.stop(); this.snow.stop();
    this.scale.on("resize", () => this.resizeOverlays());
    this.resizeOverlays();

    // input — keyboard + touch both go through the input router. See
    // src/game/input/router.ts. The DOM adapter is installed once per
    // page by GameCanvas; here we just register the scene's commands.
    this.unsub.push(inputRouter.register({
      id: "player.interact",
      scope: "gameplay",
      run: () => this.interact(),
    }));
    this.unsub.push(inputRouter.register({
      id: "player.fish",
      scope: "gameplay",
      run: () => {
        if (this.player?.mounted) { bus.emit("toast", { text: "Get off your bike to fish (V).", kind: "info" }); return; }
        this.fishing?.press(this.time.now);
      },
    }));
    this.unsub.push(inputRouter.register({
      id: "player.bike",
      scope: "gameplay",
      run: () => this.toggleBike(),
    }));
    this.unsub.push(inputRouter.register({
      id: "player.dodge",
      scope: "gameplay",
      run: () => this.dodge(),
    }));
    this.unsub.push(inputRouter.register({
      id: "player.attack",
      scope: "gameplay",
      run: () => this.attack(),
    }));

    this.input.on("wheel", (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const cam = this.cameras.main;
      cam.setZoom(Phaser.Math.Clamp(cam.zoom - Math.sign(dy) * 0.25, this.minZoom, 4));
      this.resizeOverlays();
    });
    // iOS Safari does not fire "wheel" for pinch — sample two-finger distance.
    let lastPinchDist: number | null = null;
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      const ev = p.event as unknown as { touches?: TouchList };
      if (ev?.touches && ev.touches.length === 2) {
        lastPinchDist = touchDist(ev.touches);
      }
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      const ev = p.event as unknown as { touches?: TouchList };
      if (!ev?.touches || ev.touches.length !== 2 || lastPinchDist === null) return;
      const dist = touchDist(ev.touches);
      const cam = this.cameras.main;
      cam.setZoom(Phaser.Math.Clamp(cam.zoom + (dist - lastPinchDist) * 0.01, this.minZoom, 4));
      lastPinchDist = dist;
      this.resizeOverlays();
    });
    this.input.on("pointerup", () => { lastPinchDist = null; });
    this.input.on("pointerdown", (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (this.modalOpen) return;
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
    this.unsub.push(bus.on("attack", (e) => {
      const { x, y } = e;
      const p = this.player;
      if (!p) return;
      const dx = x - p.sprite.x, dy = y - p.sprite.y;
      const facing: Facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      const tool = e.tool;
      this.setMounted(false); // hop off to swing
      if (tool === "bow") {
        this.playShoot(p, facing, { x, y });
        this.stream?.sendAct("shoot", facing);
        return;
      }
      this.playSlash(p, facing, tool);
      this.stream?.sendAct(tool === "axe" ? "chop" : "slash", facing);
    }));
    this.unsub.push(bus.on("hurt", ({ amount }) => {
      this.showHurt(amount);
      if (this.player?.mounted) { this.setMounted(false); bus.emit("toast", { text: "💥 You're knocked off your bike!", kind: "bad" }); }
    }));
    this.unsub.push(bus.on("hasBike", (has) => { this.hasBike = has; if (!has) this.setMounted(false); }));
    this.unsub.push(bus.on("dismount", () => this.setMounted(false)));
    this.unsub.push(bus.on("knockout", ({ x, y }) => {
      const p = this.player;
      if (!p) return;
      this.setMounted(false);
      p.sprite.setPosition(x, y);
      p.tx = x; p.ty = y;
      this.moveTarget = null;
      this.marker.setVisible(false);
      this.cameras.main.flash(400, 40, 0, 0);
    }));
    this.unsub.push(bus.on("teleport", ({ x, y }) => {
      const p = this.player;
      if (!p) return;
      this.setMounted(false);
      const cam = this.cameras.main;
      cam.fadeOut(220, 0, 0, 0);
      cam.once("camerafadeoutcomplete", () => {
        p.sprite.setPosition(x, y);
        p.tx = x; p.ty = y;
        this.moveTarget = null;
        this.marker.setVisible(false);
        this.stream?.setPosition(x, y, p.facing);
        this.syncStreamingChunks();
        cam.fadeIn(320, 0, 0, 0);
      });
    }));
    this.unsub.push(bus.on("select", (s) => { this.lastSelection = s; }));
    this.unsub.push(bus.on("relicsFound", (keys) => { this.relicsFound = new Set(keys); this.syncRelics(); }));
    this.unsub.push(bus.on("relicPicked", (p) => this.showRelicPicked(p.key, p.have, p.total)));
    bus.emit("sceneReady", undefined);
    this.unsub.push(bus.on("modalOpen", (open) => { this.modalOpen = open; }));

    // Phase 2: replace 1 Hz polling with WebSocket push.
    // The WS is mounted at /ws on the SAME port as Next.js so the browser
    // sends the session cookie on the upgrade. Cross-port WS upgrades
    // would be blocked by same-origin rules and the WS server would
    // receive no auth.
    const explicit = typeof window !== "undefined"
      ? (window as unknown as Record<string, unknown>).__WS_URL__ as string | undefined
      : undefined;
    const envUrl = typeof process !== "undefined" && process.env
      ? process.env.NEXT_PUBLIC_WS_URL
      : undefined;
    // Default: same-origin WS at /ws. This works in both dev and prod
    // because both Next.js and the WS server share port 3000.
    const fallback = typeof window !== "undefined"
      ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`
      : "ws://localhost:3000/ws";
    const wsUrl = explicit ?? envUrl ?? fallback;
    this.stream = new WorldStream({
      url: wsUrl,
      handlers: {
        onSnapshot: (data) => {
          if (!this.alive()) return;
          this.applySnapshot(data);
          if (!this.alive()) return;
          bus.emit("snapshot", data);
        },
        onDelta: () => {
          // Phase 2 minimum viable: ignore delta hints and rely on the
          // next full snapshot. Phase 3+ can implement targeted delta
          // fetches per affected chunk.
        },
        onMoves: ({ moves }) => {
          if (!this.alive()) return;
          this.applyMoves(moves);
        },
        onPlayerAct: ({ id, kind, facing }) => {
          if (!this.alive() || id === this.meId) return;
          const ent = this.players.get(id);
          if (!ent) return;
          if (kind === "shoot") this.playShoot(ent, facing);
          else this.playSlash(ent, facing, kind === "chop" ? "axe" : undefined);
        },
        onHurt: ({ amount, hp, maxHp, from, status }) => {
          if (!this.alive()) return;
          bus.emit("hurt", { amount, hp, maxHp });
          this.feelHit(amount, maxHp, from, status?.kind, status?.ms);
        },
        onChunkReload: ({ chunks }) => {
          if (!this.alive()) return;
          const around = this.player ? chunkAtPixel(this.player.sprite.x, this.player.sprite.y) : this.lastPlayerChunk ?? { cx: 0, cy: 0 };
          for (const c of chunks) void reloadChunk(this, c.cx, c.cy, around);
        },
        onSpawns: (enemies) => this.applySpawns(enemies),
        onEnemyAct: ({ id, x, y }) => {
          if (!this.alive()) return;
          this.playEnemyAttack(id, x, y);
        },
        onSaloon: ({ inn }) => bus.emit("saloon", { inn }),
        onStrikes: (strikes) => { if (this.alive()) for (const s of strikes) this.addStrike(s); },
        onStrikeCancel: (id) => { if (this.alive()) this.cancelStrike(id); },
        // The server's speed limit says we're really here: snap back.
        onCorrect: ({ x, y }) => {
          const p = this.player;
          if (!this.alive() || !p) return;
          p.sprite.setPosition(x, y);
          p.tx = x; p.ty = y;
          this.moveTarget = null;
          this.marker.setVisible(false);
          this.placeChar(p);
          this.stream?.setPosition(x, y, p.facing, !!p.mounted);
        },
        onKnockout: ({ x, y, coinsLost, by }) => {
          if (!this.alive()) return;
          bus.emit("knockout", { x, y, coinsLost });
          bus.emit("toast", { text: `The ${by} knocked you out! You wake in the village square${coinsLost ? `, ${coinsLost} coins lighter` : ""}.`, kind: "bad" });
          bus.emit("refreshMe", undefined);
        },
        onPlayerPos: ({ id, x, y, facing, mounted }) => {
          if (!this.alive() || id === this.meId) return;
          const ent = this.players.get(id);
          if (!ent) return; // not in our proximity window yet
          ent.tx = x;
          ent.ty = y;
          ent.mounted = mounted === true;
          if (facing === "up" || facing === "down" || facing === "left" || facing === "right") {
            ent.facing = facing;
          }
        },
        onClose: () => {
          // Optional: trigger a one-off HTTP snapshot fallback. For now,
          // the stream auto-reconnects; the player sees stale state until
          // the WS recovers. Acceptable trade-off vs. building a complex
          // fallback path for what should be a rare case.
        },
      },
      // 1.5s so the server's view of the player's position (used to
      // center the proximity bbox) stays fresh. This does NOT increase
      // DB writes — refreshLastSeen throttles those to every 10s.
      heartbeatIntervalMs: 1500,
    });
    this.stream.start();
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
    this.fog.setSize(w, h);
    const zone = new Phaser.Geom.Rectangle(-w / this.cameras.main.zoom / 2 - 100, -40, w / this.cameras.main.zoom + 200, 60);
    this.rain.clearEmitZones(); this.rain.addEmitZone(zoneOf(zone));
    this.snow.clearEmitZones(); this.snow.addEmitZone(zoneOf(zone));
  }

  // ---------- networking ----------
  /** True once the first enemies were drawn (later arrivals fade in). */
  private enemiesShown = false;

  private syncEnemies(list: readonly EnemySnapshot[]): void {
    this.syncCritters(this.enemies, list.map((e) => ({ id: e.id, kind: e.kind, x: e.x, y: e.y, facing: "right", state: "walk", hp: e.hp, maxHp: e.maxHp, move: e.move, name: e.title ? `★ ${e.title}` : undefined, big: !!e.title })), 26, (e) => ({ type: "enemy", id: e.id, kind: e.kind, hp: e.hp, maxHp: e.maxHp, title: e.name, distance: this.distTo(e.x, e.y) }));
    this.enemiesShown = true;
  }

  /** New enemies between resyncs: add them to what the snapshot holds and draw them now. */
  private applySpawns(spawned: readonly EnemySnapshot[]): void {
    if (!this.alive() || !this.snapshot || !spawned.length) return;
    const ids = new Set(spawned.map((e) => e.id));
    this.snapshot = { ...this.snapshot, enemies: [...this.snapshot.enemies.filter((e) => !ids.has(e.id)), ...spawned] };
    this.syncEnemies(this.snapshot.enemies);
  }

  private applySnapshot(s: Snapshot) {
    // A snapshot can arrive after the scene was shut down (WS message in
    // flight during teardown). `this.add`, `this.tweens` and the tilemaps
    // are gone by then, so applying it would throw.
    if (!this.alive()) return;
    const first = !this.snapshot;
    this.snapshot = s;
    this.meId = s.me?.id ?? null;
    this.syncBreadTables(s.breadTables ?? []);
    this.syncDisplays(s.displays ?? []);
    this.syncRanchProps(s.lots ?? []);
    // buildings — visuals come from the stamped templates; the snapshot only
    // contributes DB identity (selection), door position and sponsor glow.
    for (const b of s.buildings) {
      const door = this.buildingDoors.get(b.key) ?? { x: b.doorX, y: b.doorY };
      const rect = this.buildingZonesRects.get(b.key) ?? { x: b.tx * 16, y: b.ty * 16, w: b.tw * 16, h: b.th * 16 };
      let ent = this.buildingZones.get(b.key);
      if (!ent) {
        const zone = this.add.zone(rect.x, rect.y, rect.w, rect.h)
          .setOrigin(0, 0)
          .setDepth(DEPTH_CHAR_BASE + rect.y + rect.h);
        zone.setInteractive({ useHandCursor: true });
        zone.on("pointerdown", () => {
          if (this.modalOpen) return;
          const s = { type: "building" as const, id: b.id, key: b.key, name: b.name, reservable: b.reservable, hasSponsor: !!b.sponsor, distance: this.distTo(door.x, door.y) };
          this.select(s);
        });
        const glow = this.add.circle(door.x, door.y - 30, 40, 0xffc866, 0.0).setDepth(DEPTH_LIGHT).setBlendMode(Phaser.BlendModes.ADD);
        ent = { zone, glow, door };
        this.buildingZones.set(b.key, ent);
      } else {
        ent.door = door;
      }
    }
// me
    //
    // The player sprite is created once on first snapshot and NEVER
    // destroyed on subsequent snapshots. The previous behavior of
    // destroy-and-recreate when `s.me` was null is the cause of the
    // "respawn at previous location" bug: the DB-stale `s.me.x/y`
    // (refreshLastSeen is throttled to 10 s) would become the spawn
    // position of the new sprite, yanking the camera back. The client
    // is authoritative on its own position; the WS heartbeats keep
    // the DB in sync, and the local sprite stays where the user moved
    // it regardless of what the snapshot says.
    if (s.me) {
      const meEq = cosmeticsListToEquipped(s.me.cosmetics);
      const meWeapon = weaponOf(s.me.equipped);
      if (this.player) this.applyTitle(this.player, s.me.title ?? null);
      if (!this.player) {
        // First spawn — place the player at the DB position so we rejoin
        // where we left off. Fall back to the central chunk only if the DB
        // position is wildly off (e.g. negative world coords).
        const spawn =
          s.me.x >= 0 && s.me.x < 2000 && s.me.y >= -1500 && s.me.y < 1500
            ? { x: s.me.x, y: s.me.y }
            : chunkCenter(0, 0);
        this.player = this.makeChar(spawn.x, spawn.y, s.me.name, s.me.appearance, PLAYER_SPEED, "#ffe08a", meEq, meWeapon);
        this.player.sprite.setDepth(DEPTH_CHAR_BASE + spawn.y);
        this.cameras.main.startFollow(this.player.sprite, true, 0.12, 0.12);
        this.resizeOverlays();
      } else if (this.player.equipped !== meEq || this.player.weapon !== meWeapon) {
        // Re-equip or unequip (shop cosmetics, sword from the bag). Rebuild
        // the texture so the new gear shows up without a place teleport.
        this.player.equipped = meEq;
        this.player.weapon = meWeapon;
        void this.ensureCharTexture(this.player, s.me.appearance, meEq, meWeapon);
      }
      this.player.glow?.setVisible(s.me.equipped.includes("lantern"));
      if (s.me.equipped.includes("lantern") && !this.player.glow) {
        this.player.glow = this.add.circle(s.me.x, s.me.y, 70, 0xffc866, 0.16).setDepth(DEPTH_LIGHT).setBlendMode(Phaser.BlendModes.ADD);
      }
    } else if (!this.player) {
      // No `s.me` on the very first snapshot (e.g. cookie not yet set
      // up). Place the player at the central chunk so we have something
      // to follow. Subsequent snapshots with `s.me` non-null will spawn
      // a real sprite; we still won't destroy this placeholder.
      const spawn = chunkCenter(0, 0);
      this.player = this.makeChar(spawn.x, spawn.y, "you", { body: "male", skin: "#f1c9a5", hair: "plain", hairColor: "#5a3a1a", shirtColor: "#4a7c59", pantsColor: "#3a3a4a" }, PLAYER_SPEED, "#ffe08a");
      this.player.sprite.setDepth(DEPTH_CHAR_BASE + spawn.y);
      this.cameras.main.startFollow(this.player.sprite, true, 0.12, 0.12);
      this.resizeOverlays();
    }
    // other players
    this.syncChars(this.players, s.players.filter((p) => p.id !== this.meId), 130, "#d6f5ff", (p) => ({ type: "player", id: p.id, name: p.name, distance: this.distTo(p.x, p.y) }));
    // npcs
    this.syncChars(this.npcs, s.npcs, 46, "#fff2b3", (n) => ({ type: "npc", id: n.id, name: n.name, role: n.role, sponsored: !!n.sponsor, distance: this.distTo(n.x, n.y) }), (n) => (n.sponsor ? `★ ${n.sponsor.businessName}` : n.kind === "remote" ? "◇ agent" : n.role));
    // animals
    this.syncCritters(this.animals, s.animals.map((a) => ({ id: a.id, kind: a.species, x: a.x, y: a.y, facing: a.facing, state: a.state, hp: 1, maxHp: 1, name: a.name, move: a.move })), 34, (a) => ({ type: "animal", id: a.id, name: a.name!, species: a.kind, distance: this.distTo(a.x, a.y) }));
    this.syncEnemies(s.enemies);
    // ground items
    const seenItems = new Set<number>();
    for (const it of s.groundItems) {
      seenItems.add(it.id);
      if (!this.items.has(it.id)) {
        const t = this.add.text(it.x, it.y, ITEM_ICONS[it.itemKey] ?? "📦", { fontSize: "14px" }).setOrigin(0.5, 1).setDepth(DEPTH_CHAR_BASE + it.y).setResolution(2);
        t.setInteractive({ useHandCursor: true });
        t.on("pointerdown", () => { if (this.modalOpen) return; this.select({ type: "item", id: it.id, itemKey: it.itemKey, distance: this.distTo(it.x, it.y) }); });
        this.tweens.add({ targets: t, y: it.y - 4, duration: 900, yoyo: true, repeat: -1, ease: "Sine.inOut" });
        this.items.set(it.id, t);
      }
    }
    for (const [id, t] of this.items) if (!seenItems.has(id)) { t.destroy(); this.items.delete(id); }
    // nodes
    for (const n of s.nodes) {
      let img = this.nodes.get(n.id);
      // Stage 0 = picked/empty. Non-crop kinds (rock, berry, herb,
      // mushroom) hide entirely; crop kinds still render their stage-0
      // frame so the player sees the "regrowing" tile.
      const isReady = n.stage >= n.stages - 1;
      const frameKey = nodeFrameKey(n.kind, n.stage);
      const targetKey = frameKey ? nodeSheetKey(n.kind) : nodeTextureKey(n.kind);
      // Kinds with their own sheet (trees) show growth through frames.
      const ownSheet = !!CROP_KINDS[n.kind]?.sheet;
      const depleted = n.stage === 0 && !frameKey; // procedural kind with no regrowth
      if (depleted) {
        // Static kinds (rock, berry, herb, mushroom) — regrowthMs = 0,
        // so once picked they stay gone. Hide the sprite entirely.
        if (img) { img.destroy(); this.nodes.delete(n.id); }
        continue;
      }
      if (!img) {
        img = this.add.image(n.x, n.y, targetKey, frameKey ?? undefined).setOrigin(...nodeOrigin(n.kind)).setDepth(DEPTH_CHAR_BASE + n.y);
        if (n.ownerId != null) {
          // Garden crop: the frame is 32×64 but plots are only 32 px apart,
          // so a full-frame hit area would swallow clicks meant for the plot
          // behind it (and the house above). Only the plant's base — its own
          // plot — is clickable.
          img.setInteractive({
            hitArea: new Phaser.Geom.Rectangle(4, img.height - GARDEN_HIT_H, img.width - 8, GARDEN_HIT_H),
            hitAreaCallback: Phaser.Geom.Rectangle.Contains,
            useHandCursor: true,
          });
        } else if (ownSheet) {
          // Tree: only the trunk base is clickable, so a canopy never
          // steals clicks from what's behind it.
          img.setInteractive({
            hitArea: new Phaser.Geom.Rectangle(img.width / 2 - 10, img.height - TREE_HIT_H, 20, TREE_HIT_H),
            hitAreaCallback: Phaser.Geom.Rectangle.Contains,
            useHandCursor: true,
          });
        } else {
          img.setInteractive({ useHandCursor: true });
        }
        img.on("pointerdown", () => { if (this.modalOpen) return; const cur = this.snapshot?.nodes.find((x) => x.id === n.id); this.select({ type: "node", id: n.id, kind: n.kind, stage: cur?.stage ?? n.stage, stages: cur?.stages ?? n.stages, distance: this.distTo(n.x, n.y) }); });
        this.nodes.set(n.id, img);
      } else if (img.texture.key !== targetKey) {
        // Texture key changed (e.g. procedural → cropped). Swap; the frame
        // re-applies below.
        img.setTexture(targetKey, frameKey ?? undefined);
      } else if (frameKey) {
        // Same texture, different state — just swap the frame.
        img.setFrame(frameKey);
      }
      // Garden crops show growth through their frames; wild regrowth fades.
      img.setAlpha(isReady || n.ownerId != null || ownSheet ? 1 : 0.55);
      this.showForage(img, n.kind, n.x, n.y);
      let wet = this.wetSoil.get(n.id);
      if (n.watered && !wet) {
        wet = this.add.ellipse(n.x, n.y - 3, 22, 7, 0x3a2414, 0.55).setDepth(DEPTH_CHAR_BASE + n.y - 1);
        this.wetSoil.set(n.id, wet);
      } else if (!n.watered && wet) {
        wet.destroy();
        this.wetSoil.delete(n.id);
      }
    }
    // Harvested crops and nodes that left the proximity window.
    const liveNodes = new Set(s.nodes.map((n) => n.id));
    for (const [id, img] of this.nodes) if (!liveNodes.has(id)) { img.destroy(); this.nodes.delete(id); }
    for (const [id, wet] of this.wetSoil) if (!liveNodes.has(id)) { wet.destroy(); this.wetSoil.delete(id); }
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
  private makeChar(x: number, y: number, name: string, app: Appearance, speed: number, labelColor: string, eq?: EquippedCosmetics, weapon?: string): CharEnt {
    const sprite = this.add.sprite(x, y, "ph_char").setOrigin(0.5, 0.9);
    sprite.setInteractive({ useHandCursor: true });
    const label = this.add.text(x, y - 52, name, { fontFamily: "monospace", fontSize: "11px", color: labelColor, stroke: "#1a1a1a", strokeThickness: 3 }).setOrigin(0.5, 1).setResolution(3);
    const ent: CharEnt = { sprite, label, tx: x, ty: y, facing: "down", speed, texKey: null, appKey: appearanceKey(app, eq, weapon), equipped: eq, weapon, app };
    ent.shadow = this.add.image(x, y, "fx_shadow").setScale(0.9, 0.9).setDepth(DEPTH_CHAR_BASE + y - 1);
    void this.ensureCharTexture(ent, app, eq, weapon);
    return ent;
  }

  private async ensureCharTexture(ent: CharEnt, app: Appearance, eq?: EquippedCosmetics, weapon?: string) {
    const key = await this.ensureSheet(app, eq, weapon);
    if (!key || !ent.sprite.active) return;
    ent.texKey = key;
    ent.appKey = key;
    ent.sprite.setTexture(key, `${ROWS[ent.facing]}_0`);
  }

  /** Compose (once) the character sheet for this look + held item, with its
   *  walk / slash frames and animations. Resolves to the texture key. */
  private async ensureSheet(app: Appearance, eq?: EquippedCosmetics, weapon?: string): Promise<string | null> {
    const key = appearanceKey(app, eq, weapon);
    if (!this.textures.exists(key)) {
      const canvas = await composeCharacter(app, eq, weapon);
      // Scene may have been destroyed during the await.
      if (!this.alive()) return null;
      if (!this.textures.exists(key)) {
        const tex = this.textures.addCanvas(key, canvas);
        if (!tex) return null;
        for (let r = 0; r < 4; r++) for (let c = 0; c < 9; c++) tex.add(`${r}_${c}`, 0, c * FRAME, r * FRAME, FRAME, FRAME);
        // Slash (attack) frames sit below the walk block.
        for (let r = 0; r < 4; r++) for (let c = 0; c < SLASH_FRAMES; c++) tex.add(`s${r}_${c}`, 0, c * FRAME, (SLASH_ROW + r) * FRAME, FRAME, FRAME);
        // Shoot (bow) frames below those.
        for (let r = 0; r < 4; r++) for (let c = 0; c < SHOOT_FRAMES; c++) tex.add(`h${r}_${c}`, 0, c * FRAME, (SHOOT_ROW + r) * FRAME, FRAME, FRAME);
        for (const dir of Object.keys(ROWS) as Facing[]) {
          const r = ROWS[dir];
          this.anims.create({ key: `${key}_walk_${dir}`, frames: Array.from({ length: 8 }, (_, i) => ({ key, frame: `${r}_${i + 1}` })), frameRate: 11, repeat: -1 });
          this.anims.create({ key: `${key}_slash_${dir}`, frames: Array.from({ length: SLASH_FRAMES }, (_, i) => ({ key, frame: `s${r}_${i}` })), frameRate: SLASH_FPS, repeat: 0 });
          this.anims.create({ key: `${key}_shoot_${dir}`, frames: Array.from({ length: SHOOT_FRAMES }, (_, i) => ({ key, frame: `h${r}_${i}` })), frameRate: SHOOT_FPS, repeat: 0 });
        }
      }
    }
    return key;
  }

  private destroyChar(e: CharEnt) {
    e.sprite.destroy(); e.label.destroy(); e.badge?.destroy(); e.bubble?.c.destroy(); e.glow?.destroy(); e.shadow?.destroy(); e.emote?.t.destroy(); e.titleText?.destroy();
  }

  private syncChars<T extends { id: number; x: number; y: number; facing: string; name: string; appearance: Appearance; cosmetics: { slot: string; itemKey: string }[]; move?: Move | null; equipped?: string[]; title?: string | null; mounted?: boolean }>(
    map: Map<number, CharEnt>, list: T[], speed: number, labelColor: string, sel: (t: T) => Selection, badge?: (t: T) => string,
  ) {
    const seen = new Set<number>();
    for (const p of list) {
      seen.add(p.id);
      const eq = cosmeticsListToEquipped(p.cosmetics);
      const weapon = weaponOf(p.equipped);
      let ent = map.get(p.id);
      const appKey = appearanceKey(p.appearance, eq, weapon);
      if (ent && ent.appKey !== appKey) { this.destroyChar(ent); map.delete(p.id); ent = undefined; }
      if (!ent) {
        ent = this.makeChar(p.x, p.y, p.name, p.appearance, speed, labelColor, eq, weapon);
        const created = ent;
        ent.sprite.on("pointerdown", () => { if (this.modalOpen) return; const s = sel(p); s.distance = this.distTo(created.sprite.x, created.sprite.y); this.select(s); });
        if (badge) {
          const txt = badge(p);
          ent.badge = this.add.text(p.x, p.y - 62, txt, { fontFamily: "monospace", fontSize: "9px", color: txt.startsWith("★") ? "#ffd166" : "#cfe8cf", stroke: "#1a1a1a", strokeThickness: 3 }).setOrigin(0.5, 1).setResolution(3);
        }
        map.set(p.id, ent);
      } else if (ent.equipped !== eq) {
        // Existing sprite, equipped gear changed (equip/unequip from shop).
        // Rebuild the texture so the new cosmetics show up.
        ent.equipped = eq;
        void this.ensureCharTexture(ent, p.appearance, eq, weapon);
      }
      ent.tx = p.x; ent.ty = p.y;
      if (ent !== this.player) ent.mounted = p.mounted === true;
      this.applyTitle(ent, p.title ?? null);
      if (p.move !== undefined) acceptMove(ent, p.move);
      if (ent.label.text !== p.name) ent.label.setText(p.name);
      if (["up", "down", "left", "right"].includes(p.facing) && Math.hypot(ent.sprite.x - p.x, ent.sprite.y - p.y) < 2) ent.facing = p.facing as Facing;
      if (Math.hypot(ent.sprite.x - p.x, ent.sprite.y - p.y) > 400) ent.sprite.setPosition(p.x, p.y);
    }
    for (const [id, ent] of map) if (!seen.has(id)) { this.destroyChar(ent); map.delete(id); }
  }

  private syncCritters<T extends { id: number; kind: string; x: number; y: number; facing: string; state: string; hp: number; maxHp: number; name?: string; big?: boolean; move: Move | null }>(
    map: Map<number, CritterEnt>, list: T[], speed: number, sel: (t: T) => Selection,
  ) {
    const seen = new Set<number>();
    for (const a of list) {
      seen.add(a.id);
      let ent = map.get(a.id);
      if (!ent) {
        // Spritesheet animals need a real Sprite to play animations
        // (Images are static); everyone else uses a procedural texture.
        const def = ANIMAL_SPRITES[a.kind];
        const sprite = def
          ? this.add.sprite(a.x, a.y, sheetKey(a.kind), frameIndex(def, "walk", def.dirRows[0], 0)).setOrigin(def.originX, def.originY).setScale(def.scale)
          : this.add.image(a.x, a.y, `cr_${a.kind}`).setOrigin(0.5, 1);
        sprite.setDepth(DEPTH_CHAR_BASE + a.y);
        if (a.big) sprite.setScale((def?.scale ?? 1) * 1.4); // wanted beasts loom
        sprite.setInteractive({ useHandCursor: true });
        sprite.on("pointerdown", () => { if (this.modalOpen) return; const s = sel(a); s.distance = this.distTo(sprite.x, sprite.y); this.select(s); });
        // Height of the art above the anchor (frames are padded, so not sprite.height).
        const top = (def ? def.labelHeight * def.scale : sprite.height) * (a.big ? 1.4 : 1);
        ent = { sprite, kind: a.kind, def, top, tx: a.x, ty: a.y, facing: a.facing, state: a.state, speed, hp: a.hp, maxHp: a.maxHp, phase: Math.random() * 10 };
        // Flyers (and the boss) draw their own shadow into their art.
        if (!FLYERS.has(a.kind)) {
          const w = def ? def.frameWidth * def.scale * 0.55 : sprite.width * 0.7;
          ent.shadow = this.add.image(a.x, a.y, "fx_shadow").setScale(w / 24, Math.max(0.7, w / 30)).setDepth(DEPTH_CHAR_BASE + a.y - 1);
        }
        if (a.name) ent.label = this.add.text(a.x, a.y - top - 2, a.name, { fontFamily: "monospace", fontSize: a.big ? "10px" : "9px", color: a.big ? "#ffcf5a" : "#e8f5e9", stroke: "#1a1a1a", strokeThickness: 3 }).setOrigin(0.5, 1).setResolution(3).setAlpha(a.big ? 1 : 0.85);
        if (a.maxHp > 1) ent.hpBar = this.add.graphics().setDepth(DEPTH_CHAR_BASE + a.y + 1);
        // An enemy that shows up while you're here fades in rather than popping.
        if (map === this.enemies && this.enemiesShown) {
          const parts = [sprite, ent.shadow, ent.label].filter((o): o is NonNullable<typeof o> => !!o);
          for (const o of parts) { const to = o.alpha; o.setAlpha(0); this.tweens.add({ targets: o, alpha: to, duration: 400 }); }
        }
        map.set(a.id, ent);
      }
      ent.tx = a.x; ent.ty = a.y; ent.state = a.state; ent.hp = a.hp; ent.maxHp = a.maxHp;
      acceptMove(ent, a.move);
      // Sheet animals have 4-direction art — accept every facing from the
      // server. Procedural critters only have left/right art.
      if (ent.def ? ["up", "down", "left", "right"].includes(a.facing) : (a.facing === "left" || a.facing === "right")) ent.facing = a.facing;
      if (Math.hypot(ent.sprite.x - a.x, ent.sprite.y - a.y) > 300) ent.sprite.setPosition(a.x, a.y);
      if (ent.hpBar) {
        ent.hpBar.clear();
        if (a.hp < a.maxHp) { ent.hpBar.fillStyle(0x000000, 0.5); ent.hpBar.fillRect(-10, -ent.top - 6, 20, 3); ent.hpBar.fillStyle(0xe63946, 1); ent.hpBar.fillRect(-10, -ent.top - 6, 20 * (a.hp / a.maxHp), 3); }
      }
    }
    for (const [id, ent] of map) if (!seen.has(id)) { ent.sprite.destroy(); ent.shadow?.destroy(); ent.label?.destroy(); ent.zz?.destroy(); ent.hpBar?.destroy(); map.delete(id); }
  }

  private showBubble(ent: CharEnt, text: string) {
    ent.bubble?.c.destroy();
    const t = this.add.text(0, 0, text, { fontFamily: "monospace", fontSize: "10px", color: "#222", wordWrap: { width: 130 }, align: "center" }).setOrigin(0.5, 1).setResolution(3);
    const bg = this.add.rectangle(0, 2, t.width + 10, t.height + 8, 0xffffff, 0.95).setOrigin(0.5, 1).setStrokeStyle(1, 0x555555);
    const tail = this.add.triangle(0, 6, 0, 0, 8, 0, 4, 5, 0xffffff).setOrigin(0.5, 0);
    const c = this.add.container(ent.sprite.x, ent.sprite.y - 66, [bg, tail, t]).setDepth(DEPTH_BUBBLE);
    ent.bubble = { c, until: this.time.now + 4000 + Math.min(5000, text.length * 40) };
  }

  // ---------- selection / interaction ----------
  private distTo(x: number, y: number) {
    return this.player ? Math.hypot(this.player.sprite.x - x, this.player.sprite.y - y) : 9999;
  }
  private select(sel: Selection) {
    // An NPC you pick out nearby notices you.
    if (sel.type === "npc" && sel.distance < 220) {
      const n = this.npcs.get(sel.id);
      if (n) this.showEmote(n, "!", 1100);
    }
    bus.emit("select", sel);
  }

  /**
   * Clickable area for a garden plot (its soil mound). Phaser may deliver
   * the click to this zone even when a crop image overlaps it, so the zone
   * itself decides: a planted plot selects its crop, an empty one the plot.
   */
  private addPlotZone(lotKey: string, p: { plot: number; x: number; y: number }) {
    const zone = this.add.zone(p.x, p.y - 8, 28, 16).setDepth(DEPTH_CHAR_BASE + p.y - 20);
    zone.setInteractive({ useHandCursor: true });
    zone.on("pointerdown", () => {
      if (this.modalOpen) return;
      const crop = this.snapshot?.nodes.find((n) => n.x === p.x && n.y === p.y);
      if (crop) {
        this.select({ type: "node", id: crop.id, kind: crop.kind, stage: crop.stage, stages: crop.stages, distance: this.distTo(p.x, p.y) });
        return;
      }
      this.select({ type: "plot", lotKey, plot: p.plot, x: p.x, y: p.y, distance: this.distTo(p.x, p.y) });
    });
  }
  /**
   * True when the snapshot still contains the entity the selection points
   * at. Used to detect stale selections (e.g. after a pickup, before the
   * post-mutation snapshot has been pushed) so the next E press re-targets
   * instead of silently acting on nothing.
   */
  private selectionExists(sel: Selection): boolean {
    if (!this.snapshot) return false;
    switch (sel.type) {
      case "npc": return this.snapshot.npcs.some((x) => x.id === sel.id);
      case "animal": return this.snapshot.animals.some((x) => x.id === sel.id);
      case "enemy": return this.snapshot.enemies.some((x) => x.id === sel.id);
      case "item": return this.snapshot.groundItems.some((x) => x.id === sel.id);
      case "node": return this.snapshot.nodes.some((x) => x.id === sel.id);
      case "building": return this.snapshot.buildings.some((x) => x.id === sel.id);
      case "player": return this.snapshot.players.some((x) => x.id === sel.id);
      case "tree": return this.treesNear(sel.x, sel.y, 24).some((t) => t.vx === sel.vx && t.vy === sel.vy);
      case "board": return true;
      case "relic": return !!this.relicsFound && !this.relicsFound.has(sel.key);
      case "bread": return this.breadOnOffer(sel.table);
      // An empty plot stays valid until something is planted in it.
      case "plot": return !this.snapshot.nodes.some((n) => n.x === sel.x && n.y === sel.y);
    }
  }
  /**
   * Context-sensitive E/Space handler: act on the closest usable thing
   * (facing wins ties); with nothing nearby, walk to the clicked selection.
   */
  private interact() {
    // While fishing, E strikes / reels like R.
    if (this.fishing?.active) { this.fishing.press(this.time.now); return; }
    // What you act on may change (a felled tree, a picked-up item): look again.
    this.targetFrom = null;
    // 1. E acts on what's right here: the closest usable thing, preferring
    //    what you face. If you moved, you want what's next to you now.
    const near = this.nearestCandidate();
    if (near) { this.select(near); bus.emit("primaryAction", near); return; }
    // 2. Nothing close: walk to the (clicked) selection, if it's still there.
    const sel = this.lastSelection;
    if (sel && this.isActionable(sel) && this.selectionExists(sel) && !this.isSpent(sel)) { bus.emit("primaryAction", sel); return; }
    this.lastSelection = null;
    bus.emit("toast", { text: "Nothing close enough to interact with.", kind: "info" });
  }
  /** Is there a loaf on this table you may still take? */
  private breadOnOffer(key: string): boolean {
    const t = this.snapshot?.breadTables?.find((x) => x.key === key);
    return !!t && t.left > 0 && !breadTakenByMe(t.batchId);
  }
  /** The loaves left on each bakery table (src/game/breadTable.ts): one
   *  image per loaf, shown or hidden as the batch runs down. */
  private syncBreadTables(tables: readonly BreadTableSnapshot[]): void {
    for (const t of tables) {
      const def = tableByKey(t.key);
      if (!def) continue;
      let imgs = this.breadLoaves.get(t.key);
      if (!imgs) {
        const depth = DEPTH_CHAR_BASE + (def.ty + 1) * 16 + 1; // just over the table's own art
        imgs = loafSlots(def).map((p, i) => {
          const img = this.add.image(p.x, p.y, "bread_loaf").setOrigin(0, 0).setDepth(depth - i * 0.01).setVisible(false);
          img.setInteractive({ useHandCursor: true });
          img.on("pointerdown", () => {
            if (this.modalOpen) return;
            this.select({ type: "bread", table: t.key, name: def.name, x: t.x, y: t.y, distance: this.distTo(t.x, t.y) });
          });
          return img;
        });
        this.breadLoaves.set(t.key, imgs);
      }
      const tex = tableTexture(t.itemKey);
      imgs.forEach((img, i) => { if (img.texture.key !== tex) img.setTexture(tex); img.setVisible(i < t.left); });
    }
  }

  /** Buildings on ranch lots (silo, mill, hives…; src/game/ranchProps.ts),
   *  added as they're built and cleared when the ranch is given up. */
  private syncRanchProps(lots: readonly LotSnapshot[]): void {
    for (const lot of lots) {
      if (lot.kind !== "ranch" && lot.kind !== "vineyard" && lot.kind !== "workshop") continue;
      const spots = lot.kind === "vineyard" ? VINEYARD_PROP_SPOTS : lot.kind === "workshop" ? WORKSHOP_PROP_SPOTS : RANCH_PROP_SPOTS;
      const have = this.ranchProps.get(lot.key) ?? new Map<string, Phaser.GameObjects.Image>();
      // What should stand there: built stations, and a workshop's pieces on show.
      const want = new Map<string, () => Phaser.GameObjects.Image>();
      const r = lot.ranch;
      if (r) {
        for (const key of r.props) {
          const spot = spots[key as RanchBuildKey];
          if (!spot) continue;
          const x = r.ox + spot.x, y = r.oy + spot.y;
          want.set(key, () => this.add.image(x, y + 1, spot.sprite).setOrigin(0, 1).setDepth(DEPTH_CHAR_BASE + y));
        }
        (r.display ?? []).forEach((item, i) => {
          const spot = SHOWROOM_SPOTS[i], frame = FURNITURE_CELLS[item];
          if (!spot || frame == null) return;
          const x = r.ox + spot.x, y = r.oy + spot.y;
          want.set(`show:${i}:${item}`, () => this.add.image(x, y + 1, FURNITURE_TEXTURE, frame).setOrigin(0.5, 1).setDepth(DEPTH_CHAR_BASE + y));
        });
      }
      for (const [key, img] of have) if (!want.has(key)) { img.destroy(); have.delete(key); }
      for (const [key, make] of want) if (!have.has(key)) have.set(key, make());
      this.ranchProps.set(lot.key, have);
    }
  }

  /** Shop displays (src/lib/shopDisplay.ts): one image per piece of each
   *  good, shown up to what the shop really has in stock. */
  private syncDisplays(displays: readonly ShopDisplaySnapshot[]): void {
    for (const snap of displays) {
      const def = SHOP_DISPLAYS.find((d) => d.key === snap.key);
      if (!def) continue;
      let byItem = this.displayPieces.get(def.key);
      if (!byItem) {
        byItem = new Map();
        const depth = DEPTH_CHAR_BASE + (def.buildingTy + 13) * 16 + 1; // just over the rack's own art
        for (const slot of def.slots) {
          byItem.set(slot.itemKey, slot.at.map((at) => {
            const p = piecePoint(def, at);
            return this.add.image(p.x, p.y, slot.sprite).setOrigin(0, 0).setDepth(depth).setVisible(false);
          }));
        }
        this.displayPieces.set(def.key, byItem);
      }
      for (const [item, imgs] of byItem) imgs.forEach((img, i) => img.setVisible(i < (snap.counts[item] ?? 0)));
    }
  }

  /** The relics still to find, each with its own look and a twinkle; a
   *  found one pops up into the air and fades. */
  private syncRelics(): void {
    const found = this.relicsFound;
    if (!found) return;
    for (const r of RELICS) {
      const shown = this.relicGlints.get(r.key);
      if (found.has(r.key)) {
        if (shown) {
          this.relicGlints.delete(r.key);
          this.tweens.killTweensOf([shown.img, shown.glint]);
          shown.glint.destroy();
          shown.img.destroy();
        }
        continue;
      }
      if (shown) continue;
      const at = relicPoint(r);
      const img = this.add.image(at.x, at.y + 4, `relic_${r.set}`).setOrigin(0.5, 1).setDepth(DEPTH_CHAR_BASE + at.y);
      img.setInteractive({ useHandCursor: true });
      img.on("pointerdown", () => { if (this.modalOpen) return; this.select({ type: "relic", key: r.key, name: r.name, x: at.x, y: at.y, distance: this.distTo(at.x, at.y) }); });
      const glint = this.add.image(at.x + 5, at.y - 10, "relic_glint").setDepth(DEPTH_CHAR_BASE + at.y + 1).setAlpha(0).setScale(0.5);
      this.tweens.add({ targets: glint, alpha: 1, scale: 1.1, angle: 45, duration: 380, yoyo: true, repeat: -1, repeatDelay: 700 + Math.floor(Math.random() * 600), ease: "Sine.inOut" });
      this.relicGlints.set(r.key, { img, glint });
    }
  }
  /** A relic you just picked up: held up over your head with a burst of
   *  sparkles and your tally for the set, Zelda-style. */
  private showRelicPicked(key: string, have: number, total: number): void {
    const r = RELICS.find((x) => x.key === key);
    if (!r || !this.player) return;
    // Everything rides in a container that follows the player.
    const box = this.add.container(this.player.sprite.x, this.player.sprite.y - 34).setDepth(DEPTH_CANOPY + 5);
    const img = this.add.image(0, 6, `relic_${r.set}`).setScale(0.6).setAlpha(0);
    const burst = this.add.particles(0, -8, "relic_glint", {
      speed: { min: 40, max: 110 }, angle: { min: 0, max: 360 }, scale: { start: 0.9, end: 0 }, alpha: { start: 1, end: 0 },
      lifespan: 650, quantity: 14, emitting: false,
    });
    const badge = this.add.text(0, -26, total ? `${r.name}  ${have}/${total}` : r.name, {
      fontSize: "10px", color: "#fff7d6", backgroundColor: "rgba(40,24,8,0.75)", padding: { x: 4, y: 2 },
    }).setOrigin(0.5, 1).setResolution(2).setAlpha(0);
    box.add([burst, img, badge]);
    const follow = () => { const q = this.player?.sprite; if (q) box.setPosition(q.x, q.y - 34); };
    this.events.on("update", follow);
    this.tweens.add({ targets: img, y: -8, scale: 1.6, alpha: 1, duration: 380, ease: "Back.out", onComplete: () => burst.explode() });
    this.tweens.add({ targets: badge, alpha: 1, duration: 300, delay: 250 });
    this.tweens.add({
      targets: [img, badge], alpha: 0, duration: 450, delay: 1700,
      onComplete: () => { this.events.off("update", follow); box.destroy(); },
    });
  }
  /** Point out a relic the first time you come near it. */
  private noticeRelics(time: number): void {
    if (!this.player || !this.relicsFound || time < this.relicCheckAt) return;
    this.relicCheckAt = time + 1000;
    const p = this.player.sprite;
    for (const r of RELICS) {
      if (this.relicsFound.has(r.key) || this.relicsNoticed.has(r.key)) continue;
      const at = relicPoint(r);
      if (Math.hypot(at.x - p.x, at.y - p.y) > 12 * 16) continue;
      this.relicsNoticed.add(r.key);
      bus.emit("toast", { text: "✨ Something's glinting on the ground nearby — look around!", kind: "info" });
    }
  }
  /** Get on or off your bike. */
  private toggleBike(): void {
    const p = this.player;
    if (!p || this.modalOpen) return;
    if (p.mounted) { this.setMounted(false); return; }
    if (!this.hasBike) { bus.emit("toast", { text: "You need a bicycle — Pip and the town shops sell them.", kind: "info" }); return; }
    if (this.fishing?.active) return;
    this.setMounted(true);
  }
  private setMounted(on: boolean): void {
    const p = this.player;
    if (!p || !!p.mounted === on) return;
    p.mounted = on;
    if (on) this.ensureRideSheet(p);
    this.playWalk(p, this.playerMoving);
    this.placeChar(p);
    this.stream?.setPosition(p.sprite.x, p.sprite.y, p.facing, on);
  }
  /** A rider casts a longer shadow side-on. */
  private placeBike(e: CharEnt): void {
    e.shadow?.setScale(e.mounted && (e.facing === "left" || e.facing === "right") ? 1.5 : 0.9, 0.9);
  }
  /**
   * Build (once per look) the character's riding sheet — their own head and
   * torso on a bike, legs pedalling (src/game/riding.ts) — with a pedalling
   * animation per direction. Sets `e.rideKey` when ready.
   */
  private ensureRideSheet(e: CharEnt): void {
    const base = e.texKey;
    if (!base || !e.app) return;
    const key = `${base}_ride`;
    if (e.rideKey === key) return;
    if (this.textures.exists(key)) { e.rideKey = key; return; }
    if (this.rideBuilding.has(key)) return;
    this.rideBuilding.add(key);
    const app = e.app;
    void composeCharacter(app, e.equipped, e.weapon).then((sheet) => {
      this.rideBuilding.delete(key);
      if (!this.alive() || this.textures.exists(key)) { if (this.alive()) e.rideKey = key; return; }
      const ctx = sheet.getContext("2d");
      if (!ctx) return;
      const img = ctx.getImageData(0, 0, sheet.width, sheet.height);
      const ride = riderSheet({ w: img.width, h: img.height, d: img.data }, app.skin, app.body === "female" ? "female" : "male");
      const c = document.createElement("canvas");
      c.width = ride.w; c.height = ride.h;
      const cctx = c.getContext("2d")!;
      const out = cctx.createImageData(ride.w, ride.h);
      out.data.set(ride.d);
      cctx.putImageData(out, 0, 0);
      const tex = this.textures.addCanvas(key, c);
      if (!tex) return;
      for (let r = 0; r < 4; r++) for (let f = 0; f < RIDE_FRAMES; f++) tex.add(`${r}_${f}`, 0, f * FRAME, r * FRAME, FRAME, FRAME);
      for (const dir of Object.keys(ROWS) as Facing[]) {
        this.anims.create({ key: `${key}_ride_${dir}`, frames: Array.from({ length: RIDE_FRAMES }, (_, i) => ({ key, frame: `${ROWS[dir]}_${i}` })), frameRate: 9, repeat: -1 });
      }
      e.rideKey = key;
    }).catch(() => this.rideBuilding.delete(key));
  }
  /** A felled tree / picked-clean bush (or a wild patch you've picked): nothing to do until it's back. */
  private isSpent(sel: Selection): boolean {
    if (sel.type !== "node") return false;
    const n = this.snapshot?.nodes.find((x) => x.id === sel.id);
    return !n || n.stage < 1 || pickedByMe(n.kind, n.x, n.y);
  }
  /** A wild patch you've picked is gone for you until your cooldown ends. */
  private showForage(img: Phaser.GameObjects.Image, kind: string, x: number, y: number): void {
    const hide = pickedByMe(kind, x, y);
    if (img.visible === !hide) return;
    img.setVisible(!hide);
    if (img.input) img.input.enabled = !hide;
  }
  /** Bring picked patches back (and hide fresh picks) without waiting for a snapshot. */
  private refreshForage(time: number): void {
    if (time < this.forageCheckAt || !this.snapshot) return;
    this.forageCheckAt = time + 500;
    for (const n of this.snapshot.nodes) {
      const img = this.nodes.get(n.id);
      if (img) this.showForage(img, n.kind, n.x, n.y);
    }
  }
  /** Generated trees whose trunks are within `r` px of (x, y), read off the
   *  loaded tile layers (src/lib/trees.ts). */
  private treesNear(x: number, y: number, r: number): TreeSpot[] {
    const out = new Map<string, TreeSpot>();
    const tx0 = Math.floor((x - r) / 16), tx1 = Math.floor((x + r) / 16);
    const ty0 = Math.floor((y - r) / 16) - 1, ty1 = Math.floor((y + r) / 16) + 1;
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      for (const layer of ["DecorationLower", "DecorationMiddle", "DecorationUpper"]) {
        const t = treeFromTile(wildsNameOf(tileGidAt(layer, tx * 16 + 8, ty * 16 + 8)), tx, ty);
        if (!t) continue;
        const at = trunkPoint(t.vx, t.vy);
        if (Math.hypot(at.x - x, at.y - y) <= r) out.set(`${t.vx},${t.vy}`, t);
      }
    }
    return [...out.values()];
  }

  /** Selection types that have a primary action the player can perform. */
  private isActionable(sel: Selection): boolean {
    return sel.type !== "player";
  }
  /** What E acts on: the nearest usable thing in front of you, or right
   *  underfoot (src/game/interactTarget.ts) — never what's behind you. */
  private nearestCandidate(): Selection | null {
    if (!this.player || !this.snapshot) return null;
    const s = this.snapshot;
    const p = this.player.sprite;
    const cands: InteractCandidate<Selection>[] = [];
    const add = (x: number, y: number, mk: (d: number) => Selection) => {
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < REACH_PX) cands.push({ x, y, sel: mk(Math.round(d)) });
    };
    const live = (m: Map<number, { sprite: { x: number; y: number } }>, id: number, x: number, y: number) => { const e = m.get(id); return e ? e.sprite : { x, y }; };
    for (const n of s.npcs) { const q = live(this.npcs, n.id, n.x, n.y); add(q.x, q.y, (d) => ({ type: "npc", id: n.id, name: n.name, role: n.role, sponsored: !!n.sponsor, distance: d })); }
    for (const a of s.animals) { const q = live(this.animals, a.id, a.x, a.y); add(q.x, q.y, (d) => ({ type: "animal", id: a.id, name: a.name, species: a.species, distance: d })); }
    for (const e of s.enemies) { const q = live(this.enemies, e.id, e.x, e.y); add(q.x, q.y, (d) => ({ type: "enemy", id: e.id, kind: e.kind, hp: e.hp, maxHp: e.maxHp, distance: d })); }
    for (const i of s.groundItems) add(i.x, i.y, (d) => ({ type: "item", id: i.id, itemKey: i.itemKey, distance: d }));
    for (const n of s.nodes) if (n.stage >= 1 && !pickedByMe(n.kind, n.x, n.y)) add(n.x, n.y, (d) => ({ type: "node", id: n.id, kind: n.kind, stage: n.stage, stages: n.stages, distance: d }));
    for (const b of s.buildings) { const door = this.buildingZones.get(b.key)?.door ?? { x: b.doorX, y: b.doorY }; add(door.x, door.y, (d) => ({ type: "building", id: b.id, key: b.key, name: b.name, reservable: b.reservable, hasSponsor: !!b.sponsor, distance: d })); }
    // Hidden relics you haven't found yet.
    if (this.relicsFound) for (const r of RELICS) if (!this.relicsFound.has(r.key)) { const at = relicPoint(r); add(at.x, at.y, (d) => ({ type: "relic", key: r.key, name: r.name, x: at.x, y: at.y, distance: d })); }
    // Bakery tables with a loaf left for you.
    for (const t of s.breadTables ?? []) if (this.breadOnOffer(t.key)) add(t.x, t.y, (d) => ({ type: "bread", table: t.key, name: tableByKey(t.key)?.name ?? "Bread table", x: t.x, y: t.y, distance: d }));
    // Town bounty boards.
    for (const t of TOWNS) { const b = boardPoint(t.key); if (b) add(b.x, b.y, (d) => ({ type: "board", town: t.key, name: t.name, x: b.x, y: b.y, distance: d })); }
    // Terrain trees (choppable): judged by their trunk.
    for (const t of this.treesNear(p.x, p.y, 64)) { const at = trunkPoint(t.vx, t.vy); add(at.x, at.y, (d) => ({ type: "tree", vx: t.vx, vy: t.vy, kind: t.kind, x: at.x, y: at.y, distance: d })); }
    return pickTarget(cands, p, this.player.facing);
  }

  /**
   * A little marker over whatever E would act on. Looking for the target is
   * a scan, so it's done at most every 300 ms and only after you've moved or
   * turned; between scans the marker just follows its target (cheap).
   */
  private updateTargetMarker(time: number): void {
    const p = this.player;
    if (!p) return;
    const hidden = this.modalOpen || !!this.fishing?.active;
    if (time >= this.targetCheckAt) {
      this.targetCheckAt = time + 300;
      const from = this.targetFrom;
      const moved = !from || from.facing !== p.facing || Math.abs(from.x - p.sprite.x) > 1 || Math.abs(from.y - p.sprite.y) > 1;
      if (moved) {
        this.targetFrom = { x: p.sprite.x, y: p.sprite.y, facing: p.facing };
        this.markerTarget = this.nearestCandidate();
      }
    }
    const at = !hidden && this.markerTarget ? this.markerPoint(this.markerTarget) : null;
    if (!at) { this.targetMarker?.setVisible(false); return; }
    this.targetMarker ??= this.add.image(0, 0, "fx_target").setOrigin(0.5, 1).setDepth(DEPTH_CANOPY + 4);
    this.targetMarker.setVisible(true).setPosition(at.x, at.y + Math.sin(time / 180) * 1.5);
  }
  /** Where the marker sits for a target: above heads, over trunks and things on the ground. */
  private markerPoint(sel: Selection): { x: number; y: number } | null {
    const spriteOf = (m: Map<number, { sprite: { x: number; y: number } }>, id: number) => m.get(id)?.sprite ?? null;
    switch (sel.type) {
      case "npc": { const q = spriteOf(this.npcs, sel.id); return q && { x: q.x, y: q.y - 66 }; }
      case "player": { const q = spriteOf(this.players, sel.id); return q && { x: q.x, y: q.y - 66 }; }
      case "animal": { const q = spriteOf(this.animals, sel.id); return q && { x: q.x, y: q.y - 34 }; }
      case "enemy": { const q = spriteOf(this.enemies, sel.id); return q && { x: q.x, y: q.y - 38 }; }
      case "item": { const g = this.snapshot?.groundItems.find((x) => x.id === sel.id); return g ? { x: g.x, y: g.y - 20 } : null; }
      case "node": { const n = this.snapshot?.nodes.find((x) => x.id === sel.id); return n ? { x: n.x, y: n.y - 26 } : null; }
      case "building": { const b = this.snapshot?.buildings.find((x) => x.id === sel.id); if (!b) return null; const door = this.buildingZones.get(b.key)?.door ?? { x: b.doorX, y: b.doorY }; return { x: door.x, y: door.y - 24 }; }
      case "tree": return { x: sel.x, y: sel.y - 40 };
      case "board": return { x: sel.x, y: sel.y - 34 };
      case "relic": return { x: sel.x, y: sel.y - 18 };
      case "bread": return { x: sel.x, y: sel.y - 26 };
      case "plot": return { x: sel.x, y: sel.y - 14 };
    }
  }

  // ---------- update loop ----------
  update(time: number, deltaMs: number) {
    const dt = Math.min(0.05, deltaMs / 1000);
    if (this.player) {
      this.updatePlayer(dt);
      this.syncStreamingChunks();
      this.noticeRelics(time);
      this.updateTargetMarker(time);
      this.refreshForage(time);
      this.drawStrikes();
    }
    for (const e of this.players.values()) this.moveChar(e, dt);
    for (const e of this.npcs.values()) this.moveChar(e, dt);
    for (const e of this.animals.values()) this.moveCritter(e, dt, time);
    for (const e of this.enemies.values()) this.moveCritter(e, dt, time);
    this.updateAtmosphere(time, deltaMs);
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
    this.announceRegion();
    void ensureChunks(this, cur);
    releaseOutside(this, cur);
    syncStampVisuals(this, cur);
    // No recenter: the player-follow owns the framing on chunk crossings.
    recenterCamera(this, cur, false);
  }

  /** Toast the region's name when the player walks into a new one. */
  private announceRegion(): void {
    if (!this.player) return;
    const key = regionAt(this.player.sprite.x, this.player.sprite.y)?.key ?? null;
    const prev = this.lastRegionKey;
    this.lastRegionKey = key;
    if (key === prev || key === null) return; // unchanged / open country
    const r = placeByKey(key);
    if (!r) return;
    // Title-case the name for the sign ("the Silverrun" → "The Silverrun").
    // First sight (spawn) is quiet: the book records it, no banner.
    bus.emit("region", { name: r.name.charAt(0).toUpperCase() + r.name.slice(1), key: r.key, quiet: prev === undefined });
  }

  private updatePlayer(dt: number) {
    const p = this.player!;
    // Mid-roll: a quick dash the way you rolled (walls still stop it).
    if (this.roll) {
      if (this.time.now >= this.roll.until) { this.roll = null; p.sprite.setAlpha(1); }
      else {
        const step = (ROLL_PX / ROLL_MS) * 1000 * dt;
        const nx = p.sprite.x + this.roll.vx * step, ny = p.sprite.y + this.roll.vy * step;
        if (isWalkable(nx, p.sprite.y)) p.sprite.x = nx;
        if (isWalkable(p.sprite.x, ny)) p.sprite.y = ny;
        p.sprite.setAlpha(Math.floor(this.time.now / 50) % 2 ? 0.45 : 0.85);
        this.placeChar(p);
        this.stream?.setPosition(p.sprite.x, p.sprite.y, p.facing, !!p.mounted);
        return;
      }
    }
    if (p.actingUntil !== undefined && this.time.now < p.actingUntil) {
      // Mid-swing: plant your feet until the slash finishes.
      this.placeChar(p);
      if (p.glow) p.glow.setPosition(p.sprite.x, p.sprite.y - 20);
      return;
    }
    // The router merges touch joystick + keyboard movement and returns 0
    // while a text field is focused. See src/game/input/router.ts.
    const axis = inputRouter.axis();
    let vx = axis.x;
    let vy = axis.y;
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
    this.playerMoving = moving;
    // Slowed (a frost wolf's bite), you move at 60%.
    this.playerRunning = moving && inputRouter.isHeld("move.run");
    if (moving) {
      const len = Math.hypot(vx, vy);
      const running = this.playerRunning; // also Shift+click to run somewhere
      const slow = this.time.now < this.slowUntil ? 0.6 : 1;
      const step = PLAYER_SPEED * slow * (p.mounted ? BIKE_SPEED_MULT : running ? RUN_SPEED_MULT : 1) * dt;
      p.sprite.anims.timeScale = p.mounted ? 1.4 : running ? RUN_ANIM_SCALE : 1;
      const nx = p.sprite.x + (vx / len) * step, ny = p.sprite.y + (vy / len) * step;
      let movedAny = false;
      // Already standing in something solid (a teleport or a correction put
      // us there)? Then any step is allowed until we're out — else every
      // step would be refused and we could only turn on the spot.
      const stuck = !isWalkable(p.sprite.x, p.sprite.y);
      if (stuck || isWalkable(nx, p.sprite.y)) { p.sprite.x = nx; movedAny = true; }
      if (stuck || isWalkable(p.sprite.x, ny)) { p.sprite.y = ny; movedAny = true; }
      if (!movedAny && this.moveTarget) { this.moveTarget = null; this.marker.setVisible(false); }
      p.facing = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? "right" : "left") : vy > 0 ? "down" : "up";
      this.playWalk(p, true);
    } else this.playWalk(p, false);
    this.placeChar(p);
    if (p.glow) p.glow.setPosition(p.sprite.x, p.sprite.y - 20);
    // Stream the latest position to the WS server. The server forwards
    // heartbeats to refreshLastSeen (10s throttled) and uses the position
    // to update proximity tracking. Sending every frame is cheap because
    // the WS layer only carries the latest snapshot forward.
    if (this.stream) this.stream.setPosition(p.sprite.x, p.sprite.y, p.facing, !!p.mounted);
    // Tell the HUD where we are so its proximity UI (Pick up / Gather / …)
    // reflects the live position, not the up-to-10s-stale server row.
    // At most ~10 Hz, only when we've actually moved (standing still sends
    // nothing), and at once after a big jump (a teleport, a correction).
    const now = this.time.now;
    const moved = Math.max(Math.abs(p.sprite.x - this.lastSelfEmitX), Math.abs(p.sprite.y - this.lastSelfEmitY));
    if (!this.lastSelfEmitAt || (moved > 0.5 && now - this.lastSelfEmitAt >= 100) || moved > 48) {
      this.lastSelfEmitAt = now;
      this.lastSelfEmitX = p.sprite.x;
      this.lastSelfEmitY = p.sprite.y;
      bus.emit("playerMoved", { x: p.sprite.x, y: p.sprite.y });
    }
  }

  /** Apply one beat's scheduled moves to the sprites we already track. */
  private applyMoves(moves: ScheduledMove[]) {
    for (const m of moves) {
      const ent = m.kind === "npc" ? this.npcs.get(m.id) : m.kind === "animal" ? this.animals.get(m.id) : this.enemies.get(m.id);
      if (!ent) continue; // outside our window — the next snapshot creates it
      ent.tx = m.x; ent.ty = m.y;
      acceptMove(ent, m.move);
    }
  }

  /** Server clock, so every client samples a move at the same instant. */
  private serverNow(): number {
    return this.stream?.serverNow() ?? Date.now();
  }

  private moveChar(e: CharEnt, dt: number) {
    if (e.move) {
      // Scheduled (NPC) motion: exact position from the shared clock.
      const p = positionAt(e.move, this.serverNow());
      e.sprite.setPosition(p.x, p.y);
      e.facing = p.facing;
      this.playWalk(e, p.moving);
      this.placeChar(e);
      return;
    }
    const dx = e.tx - e.sprite.x, dy = e.ty - e.sprite.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.5) {
      const step = Math.min(d, Math.max(e.speed * dt, d * 3 * dt));
      e.sprite.x += (dx / d) * step; e.sprite.y += (dy / d) * step;
      e.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      // A player who is running shows up as fast catch-up: speed the legs up.
      e.sprite.anims.timeScale = dt > 0 && step / dt > REMOTE_RUN_PX_S ? RUN_ANIM_SCALE : 1;
      this.playWalk(e, true);
    } else this.playWalk(e, false);
    this.placeChar(e);
  }

  /**
   * Attack key: hit the nearest enemy in reach (same path as E / the
   * Attack button, so the server resolves the hit), otherwise swing freely
   * in the facing direction. Ignored mid-swing so holding the key can't spam.
   */
  // ── Fights: telegraphs, dodging, getting hit ─────────────────────────
  /** An enemy attack was announced: draw its telegraph; a lunge starts its move. */
  private addStrike(s: Strike): void {
    this.fights.get(s.id)?.g.destroy();
    const g = this.add.graphics().setDepth(DEPTH_MARKER + 1);
    this.fights.set(s.id, { s, g });
    if (s.dash) {
      const ent = this.enemies.get(s.enemyId);
      if (ent) acceptMove(ent, s.dash);
    }
  }
  private cancelStrike(id: number): void {
    const f = this.fights.get(id);
    if (!f) return;
    f.g.destroy(); f.bolt?.destroy();
    this.fights.delete(id);
    const ent = this.enemies.get(f.s.enemyId);
    if (ent) {
      ent.sprite.clearTint();
      const t = this.add.text(ent.sprite.x, ent.sprite.y - ent.top - 6, "💫", { fontSize: "14px" }).setOrigin(0.5, 1).setDepth(DEPTH_CANOPY + 2);
      this.tweens.add({ targets: t, y: t.y - 10, alpha: 0, duration: 700, onComplete: () => t.destroy() });
    }
  }
  /** Telegraphs fill up until the attack lands; bolts fly; the wind-up flashes the enemy red. */
  private drawStrikes(): void {
    if (!this.fights.size) return;
    const now = this.serverNow();
    for (const [id, f] of this.fights) {
      const { s, g } = f;
      if (now > s.hitAt + 140) { g.destroy(); f.bolt?.destroy(); this.fights.delete(id); continue; }
      const p = Math.max(0, Math.min(1, (now - s.windupAt) / Math.max(1, s.releaseAt - s.windupAt)));
      const landing = now >= s.hitAt;
      g.clear();
      g.lineStyle(1, 0xff3030, 0.75);
      this.shapePath(g, s.shape, s.origin, s.dir, 1, landing ? 0.55 : 0.12, landing ? 0xffd0d0 : 0xff2a2a);
      this.shapePath(g, s.shape, s.origin, s.dir, p, 0.32, 0xff2a2a, false);
      const ent = this.enemies.get(s.enemyId);
      if (ent) { if (now < s.releaseAt && Math.floor(now / 90) % 2) ent.sprite.setTint(0xff7070); else ent.sprite.clearTint(); }
      if (s.from && now >= s.releaseAt) {
        const t = Math.min(1, (now - s.releaseAt) / Math.max(1, s.hitAt - s.releaseAt));
        f.bolt ??= this.add.image(s.from.x, s.from.y, "fx_bolt").setDepth(DEPTH_CANOPY + 2);
        f.bolt.setPosition(s.from.x + (s.origin.x - s.from.x) * t, s.from.y - 14 + (s.origin.y - s.from.y + 14) * t);
      }
    }
  }
  /** Fill (and outline) an attack shape, scaled by `k` from its origin. */
  private shapePath(g: Phaser.GameObjects.Graphics, shape: StrikeShape, o: { x: number; y: number }, dir: Facing, k: number, alpha: number, color: number, outline = true): void {
    if (k <= 0) return;
    g.fillStyle(color, alpha);
    const [dx, dy] = dirVec(dir);
    if (shape.type === "circle") {
      g.fillCircle(o.x, o.y, shape.r * k);
      if (outline) g.strokeCircle(o.x, o.y, shape.r);
    } else if (shape.type === "cone") {
      const a = Math.atan2(dy, dx);
      g.slice(o.x, o.y, shape.r * k, a - shape.half, a + shape.half, false);
      g.fillPath();
      if (outline) { g.beginPath(); g.slice(o.x, o.y, shape.r, a - shape.half, a + shape.half, false); g.strokePath(); }
    } else {
      const len = shape.length * k, w = shape.width;
      const x = dx ? (dx > 0 ? o.x : o.x - len) : o.x - w / 2;
      const y = dy ? (dy > 0 ? o.y : o.y - len) : o.y - w / 2;
      g.fillRect(x, y, dx ? len : w, dy ? len : w);
      if (outline) {
        const fx = dx ? (dx > 0 ? o.x : o.x - shape.length) : o.x - w / 2, fy = dy ? (dy > 0 ? o.y : o.y - shape.length) : o.y - w / 2;
        g.strokeRect(fx, fy, dx ? shape.length : w, dy ? shape.length : w);
      }
    }
  }
  /** Dodge roll: a quick dash with a moment of invulnerability (the server grants it). */
  private dodge(): void {
    const p = this.player;
    if (!p || this.modalOpen || p.mounted || this.roll) return;
    const now = Date.now();
    if (!canRoll(this.lastRollAt, now)) return;
    this.lastRollAt = now;
    const axis = inputRouter.axis();
    let [vx, vy] = dirVec(p.facing);
    if (axis.x || axis.y) { [vx, vy] = Math.abs(axis.x) >= Math.abs(axis.y) ? [Math.sign(axis.x), 0] : [0, Math.sign(axis.y)]; }
    p.facing = vx > 0 ? "right" : vx < 0 ? "left" : vy < 0 ? "up" : "down";
    p.actingUntil = undefined;
    this.roll = { until: this.time.now + ROLL_MS, vx, vy };
    this.stream?.sendRoll(this.serverNow(), p.facing);
  }
  /**
   * Make a hit felt: a shake (harder for bigger hits), a shove away from the
   * blow, and its effect — slowed (blue) or poisoned (green).
   */
  private feelHit(amount: number, maxHp: number, from?: { x: number; y: number }, status?: string, ms = 0): void {
    const p = this.player;
    if (!p) return;
    this.cameras.main.shake(140, Math.min(0.012, 0.003 + (amount / Math.max(1, maxHp)) * 0.04));
    if (from) {
      const dx = p.sprite.x - from.x, dy = p.sprite.y - from.y, d = Math.hypot(dx, dy) || 1;
      const nx = p.sprite.x + (dx / d) * 8, ny = p.sprite.y + (dy / d) * 8;
      if (isWalkable(nx, ny)) p.sprite.setPosition(nx, ny);
    }
    if (status === "slow") {
      this.slowUntil = this.time.now + ms;
      this.showEmote(p, "❄", 900);
    } else if (status === "poison") {
      this.showEmote(p, "☠", 900);
      p.sprite.setTint(0x80ff80);
      this.time.delayedCall(ms, () => { if (p.sprite.active) p.sprite.clearTint(); });
    }
  }

  private attack() {
    const p = this.player;
    if (!p || this.modalOpen || !this.snapshot) return;
    if (p.mounted) { bus.emit("toast", { text: "Get off your bike to fight (V).", kind: "info" }); return; }
    if (p.actingUntil !== undefined && this.time.now < p.actingUntil) return;
    // With a bow, anything in its range is a target (the HUD shoots it).
    const bow = p.weapon ? BOWS[p.weapon] : undefined;
    let target: EnemySnapshot | null = null;
    let best = bow ? bow.rangePx : ATTACK_REACH_PX;
    for (const e of this.snapshot.enemies) {
      const ent = this.enemies.get(e.id);
      if (!ent) continue;
      const d = Math.hypot(ent.sprite.x - p.sprite.x, ent.sprite.y - p.sprite.y);
      if (d <= best) { best = d; target = e; }
    }
    if (target) {
      const sel: Selection = { type: "enemy", id: target.id, kind: target.kind, hp: target.hp, maxHp: target.maxHp, distance: best };
      this.select(sel);
      bus.emit("primaryAction", sel); // HUD attacks: swing + server hit
      return;
    }
    if (bow) { this.playShoot(p, p.facing); this.stream?.sendAct("shoot", p.facing); return; } // a shot at nothing
    this.playSlash(p, p.facing);
    this.stream?.sendAct("slash", p.facing);
  }

  /**
   * Draw and loose a bow: the shoot animation, then an arrow flying from
   * the bow — to `at` when shooting something, else straight ahead.
   */
  private playShoot(e: CharEnt, facing: Facing, at?: { x: number; y: number }) {
    if (!e.texKey || !e.sprite.active) return;
    if (at) facing = Math.abs(at.x - e.sprite.x) > Math.abs(at.y - e.sprite.y) ? (at.x > e.sprite.x ? "right" : "left") : at.y > e.sprite.y ? "down" : "up";
    e.facing = facing;
    e.actingUntil = this.time.now + SHOT_COOLDOWN_MS;
    e.sprite.play(`${e.texKey}_shoot_${facing}`, true);
    this.time.delayedCall(SHOOT_RELEASE_MS, () => {
      if (!e.sprite.active) return;
      const from = { x: e.sprite.x, y: e.sprite.y - 26 };
      const [dx, dy] = facing === "left" ? [-1, 0] : facing === "right" ? [1, 0] : facing === "up" ? [0, -1] : [0, 1];
      const to = at ? { x: at.x, y: at.y - 14 } : { x: from.x + dx * 120, y: from.y + dy * 120 };
      const arrow = this.add.image(from.x, from.y, "fx_arrow").setDepth(DEPTH_CANOPY + 3).setRotation(Math.atan2(to.y - from.y, to.x - from.x));
      const ms = Math.max(60, (Math.hypot(to.x - from.x, to.y - from.y) / ARROW_PX_S) * 1000);
      this.tweens.add({ targets: arrow, x: to.x, y: to.y, duration: ms, ease: "Linear", onComplete: () => arrow.destroy() });
    });
  }

  /** Tutorial guide: a bouncing arrow over the target when it's on
   *  screen, otherwise an arrow at the screen edge pointing toward it. */
  private updateGuide(time: number) {
    const a = this.guideArrow;
    let g = this.guide;
    if (!g || !a || !this.player) { a?.setVisible(false); return; }
    // NPCs walk: follow the sprite rather than the last snapshot position.
    const live = g.npcId ? this.npcs.get(g.npcId)?.sprite : undefined;
    if (live) g = { ...g, x: live.x, y: live.y };
    const v = this.cameras.main.worldView;
    const margin = 22;
    if (v.contains(g.x, g.y - 30)) {
      a.setPosition(g.x, g.y - 46 - Math.abs(Math.sin(time / 220)) * 6).setRotation(Math.PI / 2).setVisible(true);
      if (g.npcId && time > this.nextGuideEmote) {
        this.nextGuideEmote = time + 2600;
        const n = this.npcs.get(g.npcId);
        if (n) this.showEmote(n, "!", 1200);
      }
      return;
    }
    const cx = v.centerX, cy = v.centerY;
    const dx = g.x - cx, dy = g.y - cy;
    const sx = (v.width / 2 - margin) / Math.max(1e-6, Math.abs(dx)), sy = (v.height / 2 - margin) / Math.max(1e-6, Math.abs(dy));
    const k = Math.min(sx, sy);
    const pulse = 1 + 0.08 * Math.sin(time / 160);
    a.setPosition(cx + dx * k, cy + dy * k).setRotation(Math.atan2(dy, dx)).setScale(pulse).setVisible(true);
  }

  /** Show (or update) a character's title above their name. */
  private applyTitle(e: CharEnt, title: string | null) {
    if (e.title === title) return;
    e.title = title;
    e.titleText?.destroy();
    e.titleText = title
      ? this.add.text(e.sprite.x, e.sprite.y - 59, `« ${title} »`, { fontFamily: "monospace", fontSize: "9px", color: "#ffd166", stroke: "#1a1a1a", strokeThickness: 3 }).setOrigin(0.5, 1).setResolution(3)
      : undefined;
  }

  /** A short emote bubble over a character ("!", "♪", "…"). */
  private showEmote(e: CharEnt, text: string, ms = 1400) {
    e.emote?.t.destroy();
    const t = this.add.text(e.sprite.x, e.sprite.y - 64, text, {
      fontFamily: "monospace", fontSize: "11px", color: "#2a2a2a", backgroundColor: "#fffdf4", padding: { x: 3, y: 1 },
      stroke: "#fffdf4", strokeThickness: 1,
    }).setOrigin(0.5, 1).setResolution(3);
    e.emote = { t, until: this.time.now + ms };
  }

  /** Now and then an NPC on screen hums or muses. */
  private idleEmotes(time: number) {
    if (time < this.nextIdleEmote) return;
    this.nextIdleEmote = time + 5000 + Math.random() * 6000;
    const view = this.cameras.main.worldView;
    const onScreen = [...this.npcs.values()].filter((n) => view.contains(n.sprite.x, n.sprite.y) && !n.emote && !n.bubble);
    const n = onScreen[Math.floor(Math.random() * onScreen.length)];
    if (n) this.showEmote(n, Math.random() < 0.55 ? "♪" : "…", 1800);
  }

  /** Red flash on the player and a floating "−N". */
  private showHurt(amount: number) {
    const p = this.player;
    if (!p || !p.sprite.active) return;
    p.sprite.setTint(0xff6060);
    this.time.delayedCall(180, () => { if (p.sprite.active) p.sprite.clearTint(); });
    const t = this.add.text(p.sprite.x, p.sprite.y - 44, `−${amount}`, { fontFamily: "monospace", fontSize: "12px", color: "#ff5a5a", stroke: "#1a1a1a", strokeThickness: 3 })
      .setOrigin(0.5, 1).setResolution(3).setDepth(DEPTH_CHAR_BASE + p.sprite.y + 10);
    this.tweens.add({ targets: t, y: t.y - 18, alpha: 0, duration: 800, onComplete: () => t.destroy() });
  }

  /** Play the attack swing facing `facing`; walk/idle resume after it.
   *  With `tool` (e.g. "axe") the swing uses a sheet holding that item. */
  private playSlash(e: CharEnt, facing: Facing, tool?: string) {
    if (!e.texKey || !e.sprite.active) return;
    e.facing = facing;
    e.actingUntil = this.time.now + SLASH_MS;
    if (!tool || tool === e.weapon || !e.app) {
      e.sprite.play(`${e.texKey}_slash_${facing}`, true);
      return;
    }
    const toolKey = appearanceKey(e.app, e.equipped, tool);
    if (this.textures.exists(toolKey)) {
      e.sprite.play(`${toolKey}_slash_${facing}`, true);
      return;
    }
    // First swing with this tool: compose its sheet, then swing.
    void this.ensureSheet(e.app, e.equipped, tool).then((k) => {
      if (!k || !e.sprite.active) return;
      e.actingUntil = this.time.now + SLASH_MS;
      e.sprite.play(`${k}_slash_${facing}`, true);
    });
  }

  private playWalk(e: CharEnt, moving: boolean) {
    if (!e.texKey) return;
    if (e.actingUntil !== undefined && this.time.now < e.actingUntil) return; // mid-swing
    // On a bike: pedal (or coast with one foot down) on the riding sheet.
    if (e.mounted) {
      this.ensureRideSheet(e);
      const rk = e.rideKey;
      if (rk && rk === `${e.texKey}_ride`) {
        const ride = `${rk}_ride_${e.facing}`;
        if (moving) { if (e.sprite.anims.currentAnim?.key !== ride || !e.sprite.anims.isPlaying) e.sprite.play(ride, true); }
        else if (e.sprite.anims.isPlaying || e.sprite.texture.key !== rk || e.sprite.frame.name !== `${ROWS[e.facing]}_0`) { e.sprite.stop(); e.sprite.setTexture(rk, `${ROWS[e.facing]}_0`); }
        return;
      }
    }
    const anim = `${e.texKey}_walk_${e.facing}`;
    if (moving) { if (e.sprite.anims.currentAnim?.key !== anim || !e.sprite.anims.isPlaying) e.sprite.play(anim, true); }
    else if (e.sprite.anims.isPlaying || e.sprite.frame.name !== `${ROWS[e.facing]}_0` || e.sprite.texture.key !== e.texKey) {
      // Back to the character's own sheet (a tool swing may have swapped it).
      e.sprite.stop();
      e.sprite.setTexture(e.texKey, `${ROWS[e.facing]}_0`);
    }
  }

  private placeChar(e: CharEnt) {
    const { x, y } = e.sprite;
    e.sprite.setDepth(DEPTH_CHAR_BASE + y);
    this.placeBike(e);
    e.shadow?.setPosition(x, y - 4).setDepth(DEPTH_CHAR_BASE + y - 1);
    e.titleText?.setPosition(x, y - 59).setDepth(DEPTH_CHAR_BASE + y + 2);
    if (e.emote) {
      if (this.time.now > e.emote.until) { e.emote.t.destroy(); e.emote = undefined; }
      else e.emote.t.setPosition(x, y - (e.badge ? 74 : 64) - Math.abs(Math.sin(this.time.now / 160)) * 2).setDepth(DEPTH_CHAR_BASE + y + 4);
    }
    e.label.setPosition(x, y - 50).setDepth(DEPTH_CHAR_BASE + y + 2);
    e.badge?.setPosition(x, y - 60).setDepth(DEPTH_CHAR_BASE + y + 3);
    if (e.bubble) {
      e.bubble.c.setPosition(x, y - (e.badge ? 72 : 62));
      if (this.time.now > e.bubble.until) { e.bubble.c.destroy(); e.bubble = undefined; }
    }
  }

  private moveCritter(e: CritterEnt, dt: number, time: number) {
    let moving: boolean;
    let dx = 0, dy = 0;
    if (e.move) {
      // Scheduled motion: exact position from the shared clock.
      const p = positionAt(e.move, this.serverNow());
      dx = p.x - e.sprite.x; dy = p.y - e.sprite.y;
      e.sprite.setPosition(p.x, p.y);
      moving = p.moving;
      if (moving) {
        dx = p.facing === "right" ? 1 : p.facing === "left" ? -1 : 0;
        dy = p.facing === "down" ? 1 : p.facing === "up" ? -1 : 0;
      }
    } else {
      dx = e.tx - e.sprite.x; dy = e.ty - e.sprite.y;
      const d = Math.hypot(dx, dy);
      moving = d > 0.5;
      if (moving) {
        const step = Math.min(d, Math.max(e.speed * dt, d * 2.5 * dt));
        e.sprite.x += (dx / d) * step; e.sprite.y += (dy / d) * step;
      }
    }
    if (e.def) {
      // Sheet animals: real 4-direction frames, motion comes from the art.
      if (moving) e.facing = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
      // A strike (bite) plays out before the walk/idle loop takes over again.
      if (!(e.actingUntil && time < e.actingUntil)) this.animateSheetCritter(e, moving);
    } else {
      let bob = 0;
      if (moving) {
        // Procedural critters only have left/right art.
        if (dx !== 0) e.facing = dx > 0 ? "right" : "left";
        bob = Math.abs(Math.sin(time / 90 + e.phase)) * 2;
      } else if (e.state === "graze") bob = Math.sin(time / 400 + e.phase) > 0.8 ? 1 : 0;
      else if (e.maxHp > 1) bob = Math.abs(Math.sin(time / 300 + e.phase)) * 1.5;
      e.sprite.setFlipX(e.facing === "left");
      e.sprite.setDisplayOrigin(e.sprite.width / 2, e.sprite.height + bob);
    }
    e.sprite.setDepth(DEPTH_CHAR_BASE + e.sprite.y);
    e.shadow?.setPosition(e.sprite.x, e.sprite.y - 1).setDepth(DEPTH_CHAR_BASE + e.sprite.y - 1);
    e.label?.setPosition(e.sprite.x, e.sprite.y - e.top - 4);
    e.hpBar?.setPosition(e.sprite.x, e.sprite.y);
    if (e.state === "sleep") {
      if (!e.zz) e.zz = this.add.text(e.sprite.x + 8, e.sprite.y - e.top - 10, "z", { fontFamily: "monospace", fontSize: "10px", color: "#ffffff", stroke: "#000", strokeThickness: 2 }).setResolution(3).setDepth(DEPTH_CHAR_BASE + e.sprite.y + 1);
      e.zz.setPosition(e.sprite.x + 8, e.sprite.y - e.top - 8 - Math.abs(Math.sin(time / 500)) * 4);
    } else if (e.zz) { e.zz.destroy(); e.zz = undefined; }
  }

  /**
   * Pick and play a sheet animal's animation: `walk` while moving, else
   * the action mapped from its resting state (e.g. graze → eat), else
   * the idle pose (first walk frame). The resting state is the move's
   * `after` once the move has ended — it rides along with the move, so
   * clients don't wait for a snapshot to learn the animal started eating.
   */
  /** An enemy struck at the player standing at (x, y): face them and attack. */
  private playEnemyAttack(id: number, x: number, y: number) {
    const e = this.enemies.get(id);
    const a = e?.def?.actions.attack;
    if (!e || !a) return;
    const dx = x - e.sprite.x, dy = y - e.sprite.y;
    e.facing = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
    const dir = (e.def!.dirRows.includes(e.facing as Facing) ? e.facing : e.def!.dirRows[0]) as Facing;
    (e.sprite as Phaser.GameObjects.Sprite).play(animKey(e.kind, "attack", dir), true);
    e.actingUntil = this.time.now + (a.frames / a.frameRate) * 1000;
  }

  private animateSheetCritter(e: CritterEnt, moving: boolean) {
    const def = e.def!;
    const sprite = e.sprite as Phaser.GameObjects.Sprite;
    const dir = (def.dirRows.includes(e.facing as Facing) ? e.facing : def.dirRows[0]) as Facing;
    let action: string | undefined;
    let restToken = 0;
    if (moving) action = "walk";
    else {
      const ended = e.move ? this.serverNow() >= e.move.startAt : false;
      const rest = (ended ? e.move!.after : undefined) ?? e.state;
      action = def.stateActions[rest];
      restToken = e.move?.startAt ?? 0;
    }
    const a = action ? def.actions[action] : undefined;
    const key = action ? animKey(e.kind, action, dir) : "";
    // One-shot actions (jump, poop, …) play once per rest, then idle.
    const spent = a && !a.loop && e.oneShot === `${key}@${restToken}` && !sprite.anims.isPlaying;
    if (a && !spent) {
      if (sprite.anims.currentAnim?.key !== key || (!sprite.anims.isPlaying && a.loop)) {
        sprite.play(key, true);
        if (!a.loop) e.oneShot = `${key}@${restToken}`;
      }
    } else if (sprite.anims.isPlaying || sprite.frame.name !== String(frameIndex(def, "walk", dir, 0))) {
      sprite.stop();
      sprite.setFrame(frameIndex(def, "walk", dir, 0));
    }
  }

  private updateAtmosphere(time: number, deltaMs: number) {
    const s = this.snapshot;
    if (!s) return;
    // continuous clock from epoch
    const dayMs = s.dayLengthMinutes * 60_000;
    const hour = ((((Date.now() - s.epochStart) % dayMs) / dayMs) * 24 + 7) % 24;
    let dark = 0;
    if (hour < 5) dark = 0.6; else if (hour < 7) dark = 0.6 * (1 - (hour - 5) / 2); else if (hour < 18) dark = 0; else if (hour < 21) dark = 0.6 * ((hour - 18) / 3); else dark = 0.6;
    const dusk = hour >= 17.5 && hour < 20 ? 1 - Math.abs(hour - 18.75) / 1.25 : 0;
    // Underground: always dark, no sky weather.
    const underground = this.lastRegionKey === "caverns";
    const raining = s.weather === "rain" && !underground;
    // Golden hour before sunset, a pink dawn.
    const golden = hour >= 16.5 && hour < 19.5 ? 1 - Math.abs(hour - 18) / 1.5 : 0;
    const dawn = hour >= 5 && hour < 7.5 ? 1 - Math.abs(hour - 6.2) / 1.3 : 0;
    const state: AtmosphereState = {
      darkness: underground ? 0.82 : Math.min(0.78, dark * 1.2 + (raining ? 0.12 : 0)),
      nightColor: underground ? 0x05040a : dusk > 0.2 ? 0x2a1438 : 0x0a1030,
      gradeColor: golden > dawn ? 0xffa050 : 0xff8fb0,
      gradeAlpha: underground ? 0 : Math.max(golden * 0.16, dawn * 0.12),
      clouds: !underground && dark < 0.2 && s.weather !== "fog" && !raining,
      fog: s.weather === "fog" && !underground ? 1 : 0,
      rain: raining,
    };
    // The player's light: always underground, and the lantern by night.
    const extra: LightSource[] = [];
    const p = this.player;
    if (p) {
      const lantern = (s.me?.equipped ?? []).includes("lantern");
      if (lantern) extra.push({ x: p.sprite.x, y: p.sprite.y - 14, radius: 130, color: 0xffd27a, flicker: true });
      else if (underground) extra.push({ x: p.sprite.x, y: p.sprite.y - 14, radius: 86, color: 0xffe0b0 });
      p.glow?.setVisible(false);
    }
    this.lighting.update(state, this.cameras.main.worldView, extra, time, deltaMs);
    const v = this.cameras.main.worldView;
    this.ambience.update({
      view: { x: v.x, y: v.y, width: v.width, height: v.height, right: v.right, bottom: v.bottom },
      player: p ? { x: p.sprite.x, y: p.sprite.y, depth: p.sprite.depth, moving: this.playerMoving, running: this.playerRunning } : null,
      region: this.lastRegionKey ?? null,
      darkness: state.darkness,
      underground,
      raining,
    }, time, deltaMs);
    this.idleEmotes(time);
    // Fishing: walking away reels in; tell the HUD when you face water.
    if (this.fishing) {
      if (this.playerMoving && this.fishing.active) this.fishing.cancel();
      this.fishing.update(time, deltaMs);
      if (time > this.nextFishCheck) {
        this.nextFishCheck = time + 250;
        const can = this.fishing.canFish();
        if (can !== this.canFishShown) { this.canFishShown = can; bus.emit("canFish", can); }
      }
    }
    this.updateGuide(time);
    this.fog.setFillStyle(0xdfe6ea, state.fog ? 0.16 : 0);
    const cam = this.cameras.main;
    const top = cam.worldView.y - 30;
    this.rain.setPosition(cam.midPoint.x, top); this.snow.setPosition(cam.midPoint.x, top);
    if (raining) { if (!this.rain.emitting) this.rain.start(); } else if (this.rain.emitting) this.rain.stop();
    if (s.weather === "snow" && !underground) { if (!this.snow.emitting) this.snow.start(); } else if (this.snow.emitting) this.snow.stop();
  }
}


