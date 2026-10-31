"use client";
// Pip's Archery Butts' field: runs the game (src/lib/archery/sim.ts) at its
// fixed tick and draws it in between (draw.ts). "play": press anywhere, drag
// back to draw the string (how far is how hard, the angle is the shot) and let
// go to loose; let go while the next arrow's still being nocked and it looses
// as soon as it's on the string. Keys: the arrows nudge the last pull, space
// looses it. "replay": the stored inputs play back. The arcade shell
// (src/components/arcade/ArcadeShell.tsx) hosts it.

import { useEffect, useRef } from "react";
import { ARROWS, MIN_DY, RUN_TICKS, TICKS_PER_SEC, TICK_MS } from "@/lib/archery/rules";
import { windAt } from "@/lib/archery/course";
import { canLoose, initArchery, scoreArchery, stepArchery } from "@/lib/archery/sim";
import { VIEW_H, VIEW_W, burst, drawArchery, drawFx, fitPull, pullOf, toView } from "./draw";
import { cheerSound, creakSound, dingSound, thudSound, thunkSound, twangSound, unlockSound } from "../arcade/sound";
import type { ArcadeFieldProps } from "@/types/arcade";
import type { ArcheryCourse, ArcheryFx, ArcheryInput, ArcheryParticle } from "@/types/archery";

const RING_WORDS = { bull: ["BULL!", "#ffd166"], inner: ["red", "#ff9a7a"], outer: ["blue", "#9ac8ff"] } as const;

export default function ArcheryField({ course: anyCourse, mode, running, inputs: anyInputs, sound = true, speed = 1, onHud, onDone, runKey = 0 }: ArcadeFieldProps) {
  const course = anyCourse as ArcheryCourse, inputs = anyInputs as readonly ArcheryInput[] | undefined;
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ running, sound, speed, onHud, onDone });
  useEffect(() => { live.current = { running, sound, speed, onHud, onDone }; });

  useEffect(() => {
    const canvas = canvasRef.current, box = boxRef.current;
    if (!canvas || !box) return;
    const ctx = canvas.getContext("2d")!;
    const st = initArchery();
    const recorded: ArcheryInput[] = [];
    const fx: ArcheryFx[] = [];
    const particles: ArcheryParticle[] = [];
    /** The pull on the string (or the last one), and a loose waiting for the arrow to be nocked. */
    let aim = { dx: 260, dy: 150 }, drag: { x: number; y: number } | null = null, queued: { dx: number; dy: number } | null = null;
    let k = 0, acc = 0, last = performance.now(), raf = 0, hudAt = 0, seen = 0, finished = false, scale = 1, creakAt = 0;

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
    const at = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * VIEW_W, y: ((e.clientY - r.top) / r.height) * VIEW_H };
    };
    const down = (e: PointerEvent) => {
      if (!playing() || st.tick >= RUN_TICKS) return;
      e.preventDefault(); unlockSound();
      canvas.setPointerCapture(e.pointerId);
      drag = at(e);
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const p = at(e), pull = pullOf(drag.x, drag.y, p.x, p.y, MIN_DY);
      if (pull) {
        aim = pull;
        const now = performance.now();
        if (live.current.sound && now - creakAt > 220) { creakAt = now; creakSound(); }
      }
    };
    const up = (e: PointerEvent) => {
      if (!drag) return;
      const p = at(e), pull = pullOf(drag.x, drag.y, p.x, p.y, MIN_DY);
      drag = null;
      // A tap (no real pull) lets the string go without a shot.
      if (pull && playing()) { aim = pull; queued = { ...pull }; }
    };
    const cancel = () => { drag = null; };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", cancel);
    const kd = (e: KeyboardEvent) => {
      if (!playing()) return;
      const key = e.key;
      const nudge = e.shiftKey ? 1 : 6;
      if (key === "ArrowUp") aim = fitPull(aim.dx, aim.dy + nudge, MIN_DY);
      else if (key === "ArrowDown") aim = fitPull(aim.dx, aim.dy - nudge, MIN_DY);
      else if (key === "ArrowRight") aim = fitPull(aim.dx + nudge, aim.dy, MIN_DY);
      else if (key === "ArrowLeft") aim = fitPull(aim.dx - nudge, aim.dy, MIN_DY);
      else if (key === " " || key === "Enter") { if (!e.repeat) queued = { ...aim }; }
      else return;
      e.preventDefault(); unlockSound();
    };
    window.addEventListener("keydown", kd);

    const tick = () => {
      let now: ArcheryInput[] = [];
      if (mode === "play") {
        if (queued && canLoose(st)) { now = [{ t: st.tick, k: "loose", dx: queued.dx, dy: queued.dy }]; queued = null; }
        if (st.tick >= RUN_TICKS) queued = null;
        recorded.push(...now);
      } else if (inputs) {
        while (k < inputs.length && inputs[k].t < st.tick) k++;
        while (k < inputs.length && inputs[k].t === st.tick) now.push(inputs[k++]);
        if (now.length) aim = { dx: now[0].dx, dy: now[0].dy };
      }
      stepArchery(st, course, now);
      const t = performance.now(), snd = live.current.sound;
      for (; seen < st.log.length; seen++) {
        const ev = st.log[seen], a = st.arrows[ev.arrow];
        const p = toView(a.x, a.y);
        if (ev.k === "loose") {
          if (snd) twangSound();
        } else if (ev.k === "bull" || ev.k === "inner" || ev.k === "outer") {
          const [word, color] = RING_WORDS[ev.k];
          burst(particles, "straw", a, ev.k === "bull" ? 16 : 9, t);
          const chain = ev.chain && ev.chain > 1 ? ` ×${ev.chain}` : "";
          fx.push({ x: p.x, y: p.y - 14, text: `${word} +${ev.points}${chain}`, color, at: t, big: ev.k === "bull" });
          if (snd) { thunkSound(); if (ev.k === "bull") dingSound(); }
        } else if (ev.k === "apple") {
          burst(particles, "gold", a, 24, t);
          fx.push({ x: p.x, y: p.y - 18, text: `THE GOLDEN APPLE! +${ev.points}`, color: "#ffd166", at: t, big: true });
          if (snd) cheerSound();
        } else if (ev.k === "miss") {
          if (a.state === "ground") {
            burst(particles, "dust", a, 6, t);
            if (snd) thudSound();
          }
          fx.push({ x: Math.min(VIEW_W - 30, Math.max(30, p.x)), y: Math.min(VIEW_H - 40, Math.max(30, p.y - 10)), text: "miss", color: "#e8e0d0", at: t });
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
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      drawArchery(ctx, course, st, t, { frac: going ? Math.min(1, acc / TICK_MS) : 0, aim, drawn: !!drag, particles });
      while (fx.length && t - fx[0].at > 1300) fx.shift();
      drawFx(ctx, fx, t);
      if (t - hudAt > 120 || st.done) {
        hudAt = t;
        const w = windAt(course, st.tick);
        live.current.onHud?.({
          seconds: Math.max(0, Math.ceil((RUN_TICKS - st.tick) / TICKS_PER_SEC)),
          phase: st.done ? "The bell rings" : st.tick >= RUN_TICKS ? "The bell! Arrows still in the air" : drag ? "Let go to loose" : canLoose(st) ? "Drag back to draw the bow" : st.quiver > 0 ? "Nocking…" : "Watch them land",
          chips: [
            { icon: "🏹", text: `${st.quiver}/${ARROWS}`, title: "Arrows left" },
            { icon: "🎯", text: String(st.hits), title: "Hits" },
            { icon: "🔗", text: `×${Math.max(1, st.chain)}`, title: "Hits in a row" },
            { icon: "🍃", text: w === 0 ? "calm" : `${w > 0 ? "→" : "←"}${Math.abs(w)}`, title: "The wind (→ down the range)", warn: Math.abs(w) >= 3 },
          ],
        });
      }
      if (st.done && !finished) {
        finished = true;
        live.current.onDone?.(recorded, scoreArchery(st));
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", kd);
    };
  }, [course, mode, inputs, runKey]);

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div ref={boxRef} style={{ position: "relative", borderRadius: 10, overflow: "hidden", boxShadow: "0 0 0 3px #3a4a24, 0 10px 30px rgba(0,0,0,.4)" }}>
        <canvas ref={canvasRef} onContextMenu={(e) => e.preventDefault()} style={{ display: "block", width: "100%", height: "100%", touchAction: "none", cursor: mode === "play" && running ? "crosshair" : "default" }} />
      </div>
    </div>
  );
}
