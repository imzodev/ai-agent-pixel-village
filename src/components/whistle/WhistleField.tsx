"use client";
// Whistle's field: runs the simulation (src/lib/whistle/sim.ts) at its fixed
// tick and draws it in between. "play": taps on the field whistle, and the
// taps that took effect are recorded for the server to replay. "replay": the
// stored taps are played back, so the run comes out exactly as it was.

import { useEffect, useRef } from "react";
import { FIELD_H, FIELD_W, TICK_MS, TICKS_PER_SEC, MAX_TICKS } from "@/lib/whistle/rules";
import { canWhistle, initRun, solidsOf, step } from "@/lib/whistle/sim";
import { breathWhistles, drawField, loadSprites } from "./draw";
import { dryWhistleSound, lostSound, pennedSound, unlockSound, whistleSound } from "./sound";
import type { Course, RunState, WhistleFx, WhistleHud, WhistleInput, WhistlePrev, WhistleSprites } from "@/types/whistle";

let spritesOnce: Promise<WhistleSprites> | null = null;

export default function WhistleField({ course, mode, running, inputs, sound = true, speed = 1, onHud, onDone, runKey = 0 }: {
  course: Course;
  mode: "play" | "replay";
  /** play: the run goes once this is true; replay: plays while true. */
  running: boolean;
  /** replay: the run's taps. */
  inputs?: readonly WhistleInput[];
  sound?: boolean;
  speed?: number;
  onHud?: (h: WhistleHud) => void;
  onDone?: (inputs: WhistleInput[], st: RunState) => void;
  /** Change it to start over. */
  runKey?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ running, sound, speed, onHud, onDone });
  useEffect(() => { live.current = { running, sound, speed, onHud, onDone }; });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let sprites: WhistleSprites | null = null;
    spritesOnce ??= loadSprites();
    void spritesOnce.then((s) => { sprites = s; }).catch(() => undefined);

    const st = initRun(course);
    const solids = solidsOf(course);
    const recorded: WhistleInput[] = [];
    const pending: { x: number; y: number }[] = [];
    const fx: WhistleFx[] = [];
    let prev: WhistlePrev | null = null;
    let k = 0; // replay: next stored tap
    let acc = 0, last = performance.now(), raf = 0, hudAt = 0, finished = false;

    // Size the canvas to its box, sharp on high-density screens.
    const fit = () => {
      const box = canvas.parentElement!.getBoundingClientRect();
      const scale = Math.max(0.5, Math.min(box.width / FIELD_W, box.height / FIELD_H));
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = `${Math.floor(FIELD_W * scale)}px`;
      canvas.style.height = `${Math.floor(FIELD_H * scale)}px`;
      canvas.width = Math.floor(FIELD_W * scale * dpr);
      canvas.height = Math.floor(FIELD_H * scale * dpr);
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas.parentElement!);

    const tap = (e: PointerEvent) => {
      if (mode !== "play" || !live.current.running || finished) return;
      e.preventDefault();
      unlockSound();
      const r = canvas.getBoundingClientRect();
      const x = Math.round(((e.clientX - r.left) / r.width) * FIELD_W), y = Math.round(((e.clientY - r.top) / r.height) * FIELD_H);
      pending.push({ x: Math.min(FIELD_W, Math.max(0, x)), y: Math.min(FIELD_H, Math.max(0, y)) });
    };
    canvas.addEventListener("pointerdown", tap);

    const tick = () => {
      prev = { sheep: st.sheep.map((s) => ({ x: s.x, y: s.y })), wolves: st.wolves.map((w) => ({ x: w.x, y: w.y })) };
      const before = { penned: st.penned, lost: st.lost, status: st.sheep.map((s) => s.status) };
      let taps: WhistleInput[] = [];
      if (mode === "play") {
        const p = pending.pop();
        pending.length = 0;
        if (p) {
          if (canWhistle(st)) { taps = [{ t: st.tick, ...p }]; recorded.push(taps[0]); }
          else { fx.push({ ...p, kind: "dry", at: performance.now() }); if (live.current.sound) dryWhistleSound(); }
        }
      } else if (inputs) {
        while (k < inputs.length && inputs[k].t < st.tick) k++;
        while (k < inputs.length && inputs[k].t === st.tick) taps.push(inputs[k++]);
      }
      const whistled = st.whistles;
      step(st, course, taps, solids);
      const now = performance.now();
      if (st.whistles > whistled && live.current.sound) whistleSound();
      if (st.penned > before.penned || st.lost > before.lost) {
        st.sheep.forEach((s, i) => {
          if (s.status !== before.status[i]) fx.push({ x: s.x, y: s.y, kind: s.status === "lost" ? "lost" : "penned", at: now });
        });
        if (live.current.sound) (st.lost > before.lost ? lostSound : pennedSound)();
      }
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(250, now - last);
      last = now;
      const going = live.current.running && !st.done;
      if (going) {
        acc += dt * live.current.speed;
        let n = 0;
        while (acc >= TICK_MS && !st.done && n++ < 20) { tick(); acc -= TICK_MS; }
      }
      while (fx.length && now - fx[0].at > 700) fx.shift();
      drawField(ctx, course, st, going ? prev : null, going ? Math.min(1, acc / TICK_MS) : 1, sprites, fx, now);
      if (now - hudAt > 100 || st.done) {
        hudAt = now;
        live.current.onHud?.({ seconds: Math.ceil((MAX_TICKS - st.tick) / TICKS_PER_SEC), penned: st.penned, lost: st.lost, breath: breathWhistles(st), total: st.sheep.length });
      }
      if (st.done && !finished) {
        finished = true;
        live.current.onDone?.(recorded, st);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", tap);
    };
  }, [course, mode, inputs, runKey]);

  // The box sizes the canvas, never the other way round (absolute, so it fills its parent).
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
    <canvas
      ref={canvasRef}
      style={{ display: "block", touchAction: "none", imageRendering: "pixelated", borderRadius: 10, cursor: mode === "play" ? "crosshair" : "default", boxShadow: "0 0 0 3px #4a2c18, 0 10px 30px rgba(0,0,0,.4)" }}
    />
    </div>
  );
}
