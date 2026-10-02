// The fishing minigame: cast at deep water in front of you (R or E), watch
// the bobber, strike when it dips ("!"), then stop the reel marker inside
// the green zone (smaller for rarer fish). The server rolls the fish and
// checks the timing (src/app/api/fish/route.ts).

import Phaser from "phaser";
import type { FishingHost, FishingSession } from "@/types/fishing";
import { waterInFront } from "@/lib/fishing";

/** How long the bite lasts before the fish lets go (ms). */
const BITE_WINDOW_MS = 900;

async function post(body: Record<string, unknown>): Promise<Record<string, unknown> & { error?: string }> {
  try {
    const r = await fetch("/api/fish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return (await r.json()) as Record<string, unknown> & { error?: string };
  } catch {
    return { error: "Couldn't reach the river spirits. Try again." };
  }
}

export class FishingController {
  private s: FishingSession | null = null;
  private bobber: Phaser.GameObjects.Image | null = null;
  private line: Phaser.GameObjects.Graphics;
  private ui: Phaser.GameObjects.Graphics;

  constructor(private scene: Phaser.Scene, private host: FishingHost, private depth: number) {
    if (!scene.textures.exists("fx_bobber")) {
      const tex = scene.textures.createCanvas("fx_bobber", 6, 7);
      if (tex) {
        const ctx = tex.getContext();
        ctx.fillStyle = "#f4f4f4"; ctx.fillRect(1, 3, 4, 3);
        ctx.fillStyle = "#e84858"; ctx.fillRect(1, 0, 4, 3);
        ctx.fillStyle = "#2a1e18"; ctx.fillRect(2, 6, 2, 1);
        tex.refresh();
      }
    }
    this.line = scene.add.graphics().setDepth(depth);
    this.ui = scene.add.graphics().setDepth(depth + 1);
  }

  get active(): boolean { return this.s !== null; }

  /** Is there fishable water in front of the player right now? */
  canFish(): boolean {
    const p = this.host.player();
    return !this.s && !!p && waterInFront(p.x, p.y, p.facing) !== null;
  }

  /** R / E: cast, strike, or stop the reel. */
  press(time: number): void {
    const s = this.s;
    if (!s) { void this.cast(time); return; }
    if (s.phase === "waiting") { this.end(false, "You pulled too early — the fish swam off."); return; }
    if (s.phase === "bite") { s.phase = "reel"; s.t = 0; s.zoneAt = 0.2 + Math.random() * 0.6; return; }
    if (s.phase === "reel") {
      const marker = this.marker(s);
      const ok = Math.abs(marker - s.zoneAt) <= s.zone / 2;
      s.phase = "landing";
      void this.land(ok);
    }
  }

  /** Walking away snaps the line. */
  cancel(): void {
    if (!this.s || this.s.phase === "landing") return;
    this.end(false, "You reeled in your line.");
  }

  private async cast(time: number): Promise<void> {
    const p = this.host.player();
    if (!p) return;
    if (!waterInFront(p.x, p.y, p.facing)) { this.host.toast("Face some deep water to fish (R).", "info"); return; }
    this.s = { phase: "casting", castId: "", biteAt: Infinity, deadline: Infinity, zone: 0.3, zoneAt: 0.5, t: 0, bobber: { x: p.x, y: p.y } };
    const r = await post({ action: "cast", facing: p.facing });
    if (r.error || !this.s) { this.s = null; if (r.error) this.host.toast(r.error, "bad"); return; }
    const bob = r.bobber as { x: number; y: number };
    const now = this.scene.time.now;
    this.s = { phase: "waiting", castId: String(r.castId), biteAt: now + Number(r.biteInMs), deadline: Infinity, zone: Number(r.zone), zoneAt: 0.5, t: 0, bobber: bob };
    this.bobber = this.scene.add.image(bob.x, bob.y, "fx_bobber").setDepth(this.depth);
    this.scene.tweens.add({ targets: this.bobber, y: bob.y + 1.5, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    void time;
  }

  private marker(s: FishingSession): number {
    return 0.5 - 0.5 * Math.cos(s.t); // ping-pong 0..1
  }

  private async land(ok: boolean): Promise<void> {
    const s = this.s;
    if (!s) return;
    const r = await post({ action: "reel", castId: s.castId, ok });
    this.cleanup();
    if (r.error) { this.host.toast(r.error, "bad"); return; }
    this.host.toast(String(r.message ?? (r.caught ? "Caught!" : "It got away…")), r.caught ? "good" : "info");
    if (r.caught) this.host.refresh();
  }

  private end(_ok: false, message: string): void {
    const s = this.s;
    if (!s) return;
    if (s.castId) void post({ action: "reel", castId: s.castId, ok: false });
    this.cleanup();
    this.host.toast(message, "info");
  }

  private cleanup(): void {
    this.bobber?.destroy();
    this.bobber = null;
    this.line.clear();
    this.ui.clear();
    this.s = null;
  }

  update(time: number, dtMs: number): void {
    const s = this.s;
    if (!s) return;
    const p = this.host.player();
    if (!p) { this.cleanup(); return; }
    // Line from the rod tip to the bobber.
    this.line.clear();
    if (this.bobber) {
      const tipX = p.x + (p.facing === "left" ? -10 : p.facing === "right" ? 10 : 6), tipY = p.y - 30;
      this.line.lineStyle(1, 0xf4f4f4, 0.8);
      this.line.beginPath();
      this.line.moveTo(tipX, tipY);
      this.line.lineTo((tipX + this.bobber.x) / 2, Math.max(tipY, this.bobber.y) + 4);
      this.line.lineTo(this.bobber.x, this.bobber.y - 3);
      this.line.strokePath();
    }
    if (s.phase === "waiting" && time >= s.biteAt) {
      s.phase = "bite";
      s.deadline = time + BITE_WINDOW_MS;
      this.host.emote("!");
      if (this.bobber) this.scene.tweens.add({ targets: this.bobber, y: s.bobber.y + 4, duration: 90, yoyo: true, repeat: 3 });
    }
    if (s.phase === "bite" && time > s.deadline) { this.end(false, "The fish slipped the hook…"); return; }
    // Reel bar above the player.
    this.ui.clear();
    if (s.phase === "reel" || s.phase === "landing") {
      if (s.phase === "reel") s.t += (dtMs / 1000) * (3.2 + (0.36 - s.zone) * 9);
      const w = 70, h = 8, x = p.x - w / 2, y = p.y - 78;
      this.ui.fillStyle(0x3b2a1d, 1).fillRect(x - 2, y - 2, w + 4, h + 4);
      this.ui.fillStyle(0xfff4dc, 1).fillRect(x, y, w, h);
      this.ui.fillStyle(0x58b450, 1).fillRect(x + (s.zoneAt - s.zone / 2) * w, y, s.zone * w, h);
      const mx = x + this.marker(s) * w;
      this.ui.fillStyle(0xe84858, 1).fillRect(mx - 1, y - 3, 3, h + 6);
    }
  }

  destroy(): void {
    this.cleanup();
    this.line.destroy();
    this.ui.destroy();
  }
}
