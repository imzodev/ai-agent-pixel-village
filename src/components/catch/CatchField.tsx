"use client";
// Fenwick's Orchard Catch's field: runs the game (src/lib/catch/sim.ts) at its
// fixed tick and draws it in between (draw.ts). "play": the basket follows the
// pointer (move, or drag on a phone); the arrow keys slide it while held. The
// target goes in as a whole px, at most once a tick and only when it changed.
// "replay": the stored inputs play back. The arcade shell
// (src/components/arcade/ArcadeShell.tsx) hosts it.

import { useEffect, useRef } from "react";
import { BASKET_CAP, BASKET_MAX, BASKET_MIN, RUN_TICKS, SUB, TICKS_PER_SEC, TICK_MS } from "@/lib/catch/rules";
import { windAt } from "@/lib/catch/course";
import { initCatch, multOf, scoreCatch, stepCatch } from "@/lib/catch/sim";
import { VIEW_H, VIEW_W, burst, drawCatch, drawFx, fruitColor } from "./draw";
import { catchSound, cheerSound, glugSound, splatSound, stingSound, thudSound, unlockSound } from "../arcade/sound";
import type { ArcadeFieldProps } from "@/types/arcade";
import type { CatchCourse, CatchFx, CatchInput, CatchParticle } from "@/types/catch";

export default function CatchField({ course: anyCourse, mode, running, inputs: anyInputs, sound = true, speed = 1, onHud, onDone, runKey = 0 }: ArcadeFieldProps) {
  const course = anyCourse as CatchCourse, inputs = anyInputs as readonly CatchInput[] | undefined;
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ running, sound, speed, onHud, onDone });
  useEffect(() => { live.current = { running, sound, speed, onHud, onDone }; });

  useEffect(() => {
    const canvas = canvasRef.current, box = boxRef.current;
    if (!canvas || !box) return;
    const ctx = canvas.getContext("2d")!;
    const st = initCatch();
    const recorded: CatchInput[] = [];
    const fx: CatchFx[] = [];
    const particles: CatchParticle[] = [];
    /** Where the pointer (or keys) want the basket, in px; the last target sent. */
    let want: number | null = null, sent = Math.round(st.target / SUB), held = 0;
    let k = 0, acc = 0, last = performance.now(), raf = 0, hudAt = 0, seen = 0, finished = false, scale = 1;

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
    const aim = (e: PointerEvent) => {
      if (!playing()) return;
      const r = canvas.getBoundingClientRect();
      want = Math.max(0, Math.min(VIEW_W, Math.round(((e.clientX - r.left) / r.width) * VIEW_W)));
    };
    const down = (e: PointerEvent) => { if (!playing()) return; e.preventDefault(); unlockSound(); aim(e); };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", aim);
    const kd = (e: KeyboardEvent) => {
      if (!playing()) return;
      if (e.key === "ArrowLeft") held = -1; else if (e.key === "ArrowRight") held = 1; else return;
      e.preventDefault(); unlockSound();
    };
    const ku = (e: KeyboardEvent) => {
      if ((e.key === "ArrowLeft" && held < 0) || (e.key === "ArrowRight" && held > 0)) { held = 0; want = Math.round(st.basketX / SUB); }
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    const tick = () => {
      let now: CatchInput[] = [];
      if (mode === "play") {
        if (held) want = held < 0 ? BASKET_MIN - 20 : BASKET_MAX + 20;
        if (want !== null && st.tick < RUN_TICKS) {
          const x = Math.max(0, Math.min(VIEW_W, want));
          if (x !== sent) { now = [{ t: st.tick, k: "to", x }]; sent = x; }
        }
        recorded.push(...now);
      } else if (inputs) {
        while (k < inputs.length && inputs[k].t < st.tick) k++;
        while (k < inputs.length && inputs[k].t === st.tick) now.push(inputs[k++]);
      }
      stepCatch(st, course, now);
      const t = performance.now(), snd = live.current.sound;
      for (; seen < st.log.length; seen++) {
        const ev = st.log[seen], f = ev.i >= 0 ? st.fruit[ev.i] : null;
        const x = f ? f.x / SUB : st.basketX / SUB, y = f ? f.y / SUB : 250;
        if (ev.k === "catch") {
          if (snd) catchSound(ev.n ?? 1);
          fx.push({ x, y: y - 16, text: `+${ev.points}${(ev.n ?? 1) > 1 ? ` ×${ev.n}` : ""}`, color: "#ffe9a8", at: t });
        } else if (ev.k === "golden") {
          if (snd) cheerSound();
          burst(particles, x, y, "#ffd166", 22, t);
          fx.push({ x, y: y - 22, text: `THE GOLDEN PEAR! +${ev.points}`, color: "#ffd166", at: t, big: true });
        } else if (ev.k === "rotten") {
          if (snd) splatSound();
          burst(particles, x, y, "#6a5030", 10, t);
          fx.push({ x, y: y - 16, text: `rotten ${ev.points}`, color: "#d8b08a", at: t });
        } else if (ev.k === "sting") {
          if (snd) stingSound();
          fx.push({ x, y: y - 18, text: "Stung!", color: "#ff9a7a", at: t, big: true });
        } else if (ev.k === "miss") {
          if (snd) thudSound();
          burst(particles, x, 290, f ? fruitColor(f.kind) : "#c03a2a", 8, t);
        } else if (ev.k === "bounce") {
          if (snd) thudSound();
          fx.push({ x, y: y - 16, text: "Basket's full!", color: "#ffb86b", at: t });
        } else if (ev.k === "press") {
          if (snd) glugSound();
          fx.push({ x: 60, y: 200, text: `${ev.n} into the press`, color: "#c8f0a0", at: t });
        }
      }
    };

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(250, t - last);
      last = t;
      if (live.current.running && !st.done) {
        acc += dt * live.current.speed;
        let n = 0;
        while (acc >= TICK_MS && !st.done && n++ < 30) { tick(); acc -= TICK_MS; }
      }
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      drawCatch(ctx, course, st, t, { particles });
      while (fx.length && t - fx[0].at > 1200) fx.shift();
      drawFx(ctx, fx, t);
      if (t - hudAt > 120 || st.done) {
        hudAt = t;
        const w = windAt(course, st.tick), m = multOf(st.streak);
        live.current.onHud?.({
          seconds: Math.max(0, Math.ceil((RUN_TICKS - st.tick) / TICKS_PER_SEC)),
          phase: st.done ? "Fenwick calls it a day" : st.tick < st.stunUntil ? "Stung! Hold on…" : st.load >= BASKET_CAP ? "Full: tip it into the press" : "Catch the good ones",
          chips: [
            { icon: "🍎", text: String(st.caught), title: "Fruit caught" },
            { icon: "🧺", text: `${st.load}/${BASKET_CAP}`, title: "In the basket", warn: st.load >= BASKET_CAP - 1 },
            { icon: "🔗", text: `×${m}`, title: "Every five in a row pays a step more" },
            { icon: "🍃", text: w === 0 ? "calm" : `${w > 0 ? "→" : "←"}${Math.abs(w)}`, title: "The wind", warn: Math.abs(w) >= 3 },
          ],
        });
      }
      if (st.done && !finished) {
        finished = true;
        live.current.onDone?.(recorded, scoreCatch(st));
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", aim);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, [course, mode, inputs, runKey]);

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div ref={boxRef} style={{ position: "relative", borderRadius: 10, overflow: "hidden", boxShadow: "0 0 0 3px #3a5a24, 0 10px 30px rgba(0,0,0,.4)" }}>
        <canvas ref={canvasRef} onContextMenu={(e) => e.preventDefault()} style={{ display: "block", width: "100%", height: "100%", touchAction: "none", cursor: mode === "play" && running ? "ew-resize" : "default" }} />
      </div>
    </div>
  );
}
