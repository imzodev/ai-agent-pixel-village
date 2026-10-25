"use client";
// Log Flume's field: runs the game (src/lib/flume/sim.ts) at its fixed tick and
// draws it in between (draw.ts). "play": press on a log and drag sideways (it
// slides toward the pointer at its own speed); let go and it drifts. The inputs
// that took effect are recorded for the server to replay. "replay": the stored
// inputs play back. The arcade shell (src/components/arcade/ArcadeShell.tsx) hosts it.

import { useEffect, useRef } from "react";
import { LOGS, LOG_KINDS, RUN_TICKS, TICKS_PER_SEC, TICK_MS } from "@/lib/flume/rules";
import { canGrab, flumeDetail, initFlume, scoreFlume, stepFlume } from "@/lib/flume/sim";
import { VIEW_H, VIEW_W, drawFlume, drawFx, logUnder } from "./draw";
import { crackSound, plopSound, sawSound, thudSound, unlockSound } from "../arcade/sound";
import type { ArcadeFieldProps } from "@/types/arcade";
import type { FlumeCourse, FlumeFx, FlumeInput, FlumePose } from "@/types/flume";

export default function FlumeField({ course: anyCourse, mode, running, inputs: anyInputs, sound = true, speed = 1, onHud, onDone, runKey = 0 }: ArcadeFieldProps) {
  const course = anyCourse as FlumeCourse, inputs = anyInputs as readonly FlumeInput[] | undefined;
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ running, sound, speed, onHud, onDone });
  useEffect(() => { live.current = { running, sound, speed, onHud, onDone }; });

  useEffect(() => {
    const canvas = canvasRef.current, box = boxRef.current;
    if (!canvas || !box) return;
    const ctx = canvas.getContext("2d")!;
    const st = initFlume(course);
    const recorded: FlumeInput[] = [];
    const fx: FlumeFx[] = [];
    // What the player asks for; the next tick turns it into inputs.
    const want = { grab: -1, x: 0, drop: false, holding: false };
    let sentX = Number.NaN;
    let prev: Map<number, FlumePose> | null = null;
    let k = 0, acc = 0, last = performance.now(), raf = 0, hudAt = 0, seen = 0, finished = false;
    let scale = 1;

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

    const at = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * VIEW_W, y: ((e.clientY - r.top) / r.height) * VIEW_H };
    };
    const playing = () => mode === "play" && live.current.running && !finished;
    const down = (e: PointerEvent) => {
      if (!playing()) return;
      e.preventDefault(); unlockSound();
      canvas.setPointerCapture(e.pointerId);
      const p = at(e), log = logUnder(course, st, p.x, p.y);
      if (log >= 0) { want.grab = log; want.x = Math.round(p.x); want.holding = true; }
    };
    const move = (e: PointerEvent) => { if (want.holding) want.x = Math.round(at(e).x); };
    const up = () => { if (want.holding) { want.holding = false; want.drop = true; } };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);

    const tick = () => {
      prev = new Map(st.logs.map((l, i) => [i, { x: l.x, y: l.y }]));
      const now: FlumeInput[] = [];
      if (mode === "play") {
        if (want.grab >= 0) {
          if (canGrab(st, want.grab)) { now.push({ t: st.tick, k: "grab", log: want.grab, x: want.x }); sentX = want.x; }
          want.grab = -1;
        } else if (want.holding && st.held >= 0 && want.x !== sentX) { now.push({ t: st.tick, k: "move", x: want.x }); sentX = want.x; }
        if (want.drop) { if (st.held >= 0) now.push({ t: st.tick, k: "drop" }); want.drop = false; }
        recorded.push(...now);
      } else if (inputs) {
        while (k < inputs.length && inputs[k].t < st.tick) k++;
        while (k < inputs.length && inputs[k].t === st.tick) now.push(inputs[k++]);
      }
      stepFlume(st, course, now);
      const t = performance.now(), snd = live.current.sound;
      for (; seen < st.log.length; seen++) {
        const ev = st.log[seen], p = prev.get(ev.log) ?? st.logs[ev.log];
        if (ev.k === "enter") { if (snd) plopSound(); }
        else if (ev.k === "milled") {
          const name = course.logs[ev.log].kind === "birch" && ev.points! > LOG_KINDS.birch.points ? " ⭐" : "";
          fx.push({ x: p.x, y: p.y - 20, text: `milled +${ev.points}${name}`, color: "#ffd166", at: t });
          if (snd) sawSound();
        } else if (ev.k === "split") { fx.push({ x: p.x, y: p.y, text: "split!", color: "#ff8a80", at: t }); if (snd) crackSound(); }
        else if (ev.k === "beached") fx.push({ x: p.x, y: p.y, text: "beached", color: "#ffffff", at: t });
        else if (ev.k === "spilled") fx.push({ x: p.x, y: p.y - 20, text: "spillway…", color: "#cfe8ff", at: t });
        else if (ev.k === "bump" && snd) thudSound();
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
      const a = going ? Math.min(1, acc / TICK_MS) : 1;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      drawFlume(ctx, course, st, going ? prev : null, a, t);
      while (fx.length && t - fx[0].at > 1200) fx.shift();
      drawFx(ctx, fx, t);
      if (t - hudAt > 150 || st.done) {
        hudAt = t;
        const d = flumeDetail(st, course);
        const out = st.logs.filter((l) => l.status === "beached" || l.status === "spilled").length;
        live.current.onHud?.({
          seconds: Math.max(0, Math.ceil((RUN_TICKS - st.tick) / TICKS_PER_SEC)),
          chips: [
            { icon: "🪵", text: `${d.milled}/${LOGS}`, title: "Milled" },
            { icon: "💥", text: String(d.split), title: "Split on a rock", warn: d.split > 0 },
            { icon: "💨", text: String(out), title: "Beached or down the spillway", warn: out > 0 },
            { icon: "⭐", text: d.birch ? "✓" : "?", title: "The golden birch through its starred saw" },
          ],
        });
      }
      if (st.done && !finished) {
        finished = true;
        live.current.onDone?.(recorded, scoreFlume(st, course));
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
    };
  }, [course, mode, inputs, runKey]);

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div ref={boxRef} style={{ position: "relative", borderRadius: 10, overflow: "hidden", boxShadow: "0 0 0 3px #4a2c18, 0 10px 30px rgba(0,0,0,.4)" }}>
        <canvas ref={canvasRef} onContextMenu={(e) => e.preventDefault()} style={{ display: "block", width: "100%", height: "100%", touchAction: "none", cursor: mode === "play" && running ? "grab" : "default" }} />
      </div>
    </div>
  );
}
