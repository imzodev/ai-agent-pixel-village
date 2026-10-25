"use client";
// Bjorn's Forge's field: runs the game (src/lib/forgeGame/sim.ts) at its fixed
// tick and draws it in between (draw.ts). "play": pick the fuel and tools and
// light the forge (or it lights itself when the prep runs out), then tap the
// forge to heat the billet, the anvil to pull it out and strike on the beat
// (or knock the scale off). Keys: space strikes, F moves the billet, Q quenches,
// X hands it in. "replay": the stored inputs play back. The arcade shell
// (src/components/arcade/ArcadeShell.tsx) hosts it.

import { useEffect, useRef } from "react";
import { PREP_TICKS, RUN_TICKS, TICKS_PER_SEC, TICK_MS } from "@/lib/forgeGame/rules";
import { canFinish, canKnock, canMove, canQuench, canStrike, initForge, scoreForge, stepForge } from "@/lib/forgeGame/sim";
import { ANVIL_SPOT, BARREL_SPOT, FIRE_SPOT, PREP_CHOICES, VIEW_H, VIEW_W, burst, drawForge, drawFx, hint, hitTest } from "./draw";
import { crackSound, dingSound, hammerSound, hissSound, quenchSound, thudSound, tillSound, tockSound, unlockSound } from "../arcade/sound";
import type { ArcadeFieldProps } from "@/types/arcade";
import type { ForgeCourse, ForgeFx, ForgeInput, ForgeLoadout, ForgeParticle } from "@/types/forgeGame";

/** What the player asked for; turned into an input on the next tick if it can take effect. */
type Want = "light" | "move" | "fire" | "anvil" | "strike" | "quench" | "finish";

export default function ForgeField({ course: anyCourse, mode, running, inputs: anyInputs, sound = true, speed = 1, onHud, onDone, runKey = 0 }: ArcadeFieldProps) {
  const course = anyCourse as ForgeCourse, inputs = anyInputs as readonly ForgeInput[] | undefined;
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ running, sound, speed, onHud, onDone });
  useEffect(() => { live.current = { running, sound, speed, onHud, onDone }; });

  useEffect(() => {
    const canvas = canvasRef.current, box = boxRef.current;
    if (!canvas || !box) return;
    const ctx = canvas.getContext("2d")!;
    const st = initForge(course);
    const recorded: ForgeInput[] = [];
    const fx: ForgeFx[] = [];
    const particles: ForgeParticle[] = [];
    const want: Want[] = [];
    let pick: ForgeLoadout = { ...st.loadout };
    let lit = false;
    let k = 0, acc = 0, last = performance.now(), raf = 0, hudAt = 0, seen = 0, finished = false;
    let scale = 1, slamAt = -1e9, rising = 0;

    const fit = () => {
      const r = box.parentElement!.getBoundingClientRect();
      scale = Math.max(0.5, Math.min(r.width / VIEW_W, r.height / VIEW_H));
      const dpr = window.devicePixelRatio || 1;
      box.style.width = `${Math.floor(VIEW_W * scale)}px`;
      box.style.height = `${Math.floor(VIEW_H * scale)}px`;
      canvas.width = Math.floor(VIEW_W * scale * dpr);
      canvas.height = Math.floor(VIEW_H * scale * dpr);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box.parentElement!);

    const playing = () => mode === "play" && live.current.running && !finished;
    const down = (e: PointerEvent) => {
      if (!playing()) return;
      e.preventDefault(); unlockSound();
      const r = canvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * VIEW_W, y = ((e.clientY - r.top) / r.height) * VIEW_H;
      const hit = hitTest(x, y, st.phase === "prep");
      if (!hit) return;
      if (hit.k === "fuel" || hit.k === "hammer" || hit.k === "tongs") {
        if (!lit) pick = { ...pick, [hit.k]: PREP_CHOICES[hit.k][hit.i] };
        return;
      }
      want.push(hit.k);
    };
    canvas.addEventListener("pointerdown", down);
    const kd = (e: KeyboardEvent) => {
      if (!playing() || e.repeat) return;
      const key = e.key.toLowerCase();
      let w: Want | null = null;
      if (key === " " || key === "enter") w = st.phase === "prep" ? "light" : "strike";
      else if (key === "k") w = "strike";
      else if (key === "f" || key === "arrowleft" || key === "arrowright") w = "move";
      else if (key === "q") w = "quench";
      else if (key === "x") w = "finish";
      if (!w) return;
      e.preventDefault(); unlockSound();
      want.push(w);
    };
    window.addEventListener("keydown", kd);

    /** Turn what the player asked for into the inputs that will take effect this tick. */
    const resolve = (): ForgeInput[] => {
      const now: ForgeInput[] = [], t = st.tick;
      for (const w of want.splice(0)) {
        if (w === "light") {
          if (st.phase === "prep" && !lit) { now.push({ t, k: "prep", loadout: { ...pick } }); lit = true; }
        } else if (w === "move") {
          const to = st.place === "fire" ? "anvil" : "fire";
          if (canMove(st, to)) now.push({ t, k: "move", to });
        } else if (w === "fire") {
          if (canMove(st, "fire")) now.push({ t, k: "move", to: "fire" });
        } else if (w === "anvil" || w === "strike") {
          if (w === "anvil" && st.place === "fire") { if (canMove(st, "anvil")) now.push({ t, k: "move", to: "anvil" }); }
          else if (canKnock(st)) now.push({ t, k: "knock" });
          else if (canStrike(st)) now.push({ t, k: "strike" });
        } else if (w === "quench") {
          if (canQuench(st)) now.push({ t, k: "quench" });
        } else if (w === "finish") {
          if (canFinish(st)) now.push({ t, k: "finish" });
        }
      }
      // The prep ran out: light it with what's chosen.
      if (st.phase === "prep" && !lit && t >= PREP_TICKS - 1) { now.push({ t, k: "prep", loadout: { ...pick } }); lit = true; }
      return now;
    };

    const tick = () => {
      let now: ForgeInput[] = [];
      if (mode === "play") {
        now = resolve();
        recorded.push(...now);
      } else if (inputs) {
        while (k < inputs.length && inputs[k].t < st.tick) k++;
        while (k < inputs.length && inputs[k].t === st.tick) now.push(inputs[k++]);
      }
      // Where the billet was, for the words and sparks of what happens to it.
      const wasFire = st.place === "fire" && st.moving === 0;
      const before = st.heat;
      stepForge(st, course, now);
      rising = st.heat > before ? 1 : st.heat < before ? -1 : 0;
      const t = performance.now(), snd = live.current.sound;
      const at = { x: ANVIL_SPOT.x, y: ANVIL_SPOT.y - 16 };
      for (; seen < st.log.length; seen++) {
        const ev = st.log[seen];
        const spark = { x: ANVIL_SPOT.x, y: ANVIL_SPOT.y - 4 };
        if (ev.k === "perfect") {
          slamAt = t; burst(particles, "spark", spark.x, spark.y, 22, t);
          fx.push({ ...at, text: `${ev.dull ? "" : "perfect! "}+${ev.points}`, color: "#ffd166", at: t, big: true });
          if (snd) { hammerSound(); dingSound(); }
        } else if (ev.k === "strike") {
          slamAt = t; burst(particles, "spark", spark.x, spark.y, ev.dull ? 6 : 12, t);
          fx.push({ ...at, text: ev.dull ? `dull +${ev.points}` : `good +${ev.points}`, color: ev.dull ? "#e0c8a0" : "#fff6e0", at: t });
          if (snd) hammerSound();
        } else if (ev.k === "glance") {
          slamAt = t; burst(particles, "spark", spark.x, spark.y, 3, t);
          fx.push({ ...at, text: "glanced", color: "#b8a890", at: t });
          if (snd) thudSound();
        } else if (ev.k === "cold_crack") {
          slamAt = t; burst(particles, "flake", spark.x, spark.y, 14, t);
          fx.push({ ...at, text: "CRACKED! too cold", color: "#a8c0e8", at: t, big: true });
          if (snd) crackSound();
        } else if (ev.k === "burnt") {
          const p = wasFire ? FIRE_SPOT : ANVIL_SPOT;
          if (!wasFire) slamAt = t;
          burst(particles, "smoke", p.x, p.y - 4, 16, t); burst(particles, "spark", p.x, p.y, 16, t);
          fx.push({ x: p.x + (wasFire ? 20 : 0), y: p.y - 18, text: "BURNT OUT!", color: "#ff7a5a", at: t, big: true });
          if (snd) hissSound();
        } else if (ev.k === "knock") {
          slamAt = t; burst(particles, "flake", spark.x, spark.y, 9, t);
          fx.push({ ...at, text: "scale off", color: "#e8e0d0", at: t });
          if (snd) tockSound();
        } else if (ev.k === "quench") {
          burst(particles, "steam", BARREL_SPOT.x, BARREL_SPOT.y, 18, t);
          fx.push({ x: BARREL_SPOT.x - 10, y: BARREL_SPOT.y - 14, text: "hsss!", color: "#8fd0ff", at: t });
          if (snd) quenchSound();
        } else if (ev.k === "completed") {
          burst(particles, "spark", ANVIL_SPOT.x, ANVIL_SPOT.y - 6, 30, t);
          fx.push({ x: ANVIL_SPOT.x - 20, y: ANVIL_SPOT.y - 40, text: `MADE! +${ev.points}`, color: "#9fe0a0", at: t + 120, big: true });
          if (snd) tillSound();
        } else if (ev.k === "finished") {
          fx.push({ x: ANVIL_SPOT.x - 20, y: ANVIL_SPOT.y - 40, text: `handed in +${ev.points}`, color: "#e8c070", at: t, big: true });
          if (snd) tillSound();
        }
      }
    };

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(250, t - last);
      last = t;
      const going = live.current.running && !st.done;
      if (going) {
        acc += dt * live.current.speed;
        let n = 0;
        while (acc >= TICK_MS && !st.done && n++ < 30) { tick(); acc -= TICK_MS; }
      }
      if (mode === "replay") pick = st.loadout;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      drawForge(ctx, course, st, t, { frac: going ? Math.min(1, acc / TICK_MS) : 0, pick, slamAt, rising, particles });
      while (fx.length && t - fx[0].at > 1300) fx.shift();
      drawFx(ctx, fx, t);
      if (t - hudAt > 120 || st.done) {
        hudAt = t;
        const left = st.phase === "prep" ? PREP_TICKS - st.tick : st.startAt + RUN_TICKS - st.tick;
        live.current.onHud?.({
          seconds: Math.max(0, Math.ceil(left / TICKS_PER_SEC)),
          phase: st.phase === "prep" ? "Pick your fuel and tools, then light the forge" : hint(st)?.text ?? (st.done ? "The bell rings" : "…"),
          chips: [
            { icon: "⚒️", text: `${st.completed}/${course.commissions.length}`, title: "Commissions made" },
            { icon: "✨", text: String(st.perfectStrikes), title: "Perfect strikes" },
            { icon: "🔗", text: `×${st.chain}`, title: "Good blows in a row" },
            { icon: "💔", text: String(st.ruined), title: "Billets cracked or burnt", warn: st.ruined > 0 },
          ],
        });
      }
      if (st.done && !finished) {
        finished = true;
        live.current.onDone?.(recorded, scoreForge(st, course));
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", down);
      window.removeEventListener("keydown", kd);
    };
  }, [course, mode, inputs, runKey]);

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div ref={boxRef} style={{ position: "relative", borderRadius: 10, overflow: "hidden", boxShadow: "0 0 0 3px #3a2418, 0 10px 30px rgba(0,0,0,.4)" }}>
        <canvas ref={canvasRef} onContextMenu={(e) => e.preventDefault()} style={{ display: "block", width: "100%", height: "100%", touchAction: "none", cursor: mode === "play" && running ? "pointer" : "default" }} />
      </div>
    </div>
  );
}
