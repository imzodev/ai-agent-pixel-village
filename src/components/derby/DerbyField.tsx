"use client";
// Fishing Derby's field: runs the game (src/lib/derby/sim.ts) at its fixed tick
// and draws it in between (draw.ts). "play": tap the water to cast, tap again
// when the bobber goes under to strike, then hold to reel (let go while the fish
// runs); Space does the same where the pointer is. The inputs that took effect
// are recorded for the server to replay. "replay": the stored inputs play back.
// The arcade shell (src/components/arcade/ArcadeShell.tsx) hosts it.

import { useEffect, useRef, useState } from "react";
import { DERBY_FISH, RUN_TICKS, TICKS_PER_SEC, TICK_MS } from "@/lib/derby/rules";
import { inPond } from "@/lib/derby/course";
import { canCast, canStrike, derbyDetail, initDerby, scoreDerby, stepDerby } from "@/lib/derby/sim";
import { VIEW_H, VIEW_W, drawDerby, drawFx } from "./draw";
import { biteSound, lostSound, plopSound, reelSound, snapSound, splashSound, unlockSound } from "../arcade/sound";
import type { ArcadeFieldProps } from "@/types/arcade";
import type { DerbyCourse, DerbyEnd, DerbyFx, DerbyInput, DerbyPose, DerbyState } from "@/types/derby";

const PHASE_WORD: Record<DerbyState["phase"], string> = { idle: "Cast!", flight: "Cast!", waiting: "Wait for the bite…", bite: "Strike!", reel: "Reel it in!", recover: "" };
const HINT: Record<DerbyState["phase"], string> = {
  idle: "Tap the water to cast, a little short of a fish",
  flight: "",
  waiting: "Wait… tap when the bobber goes under",
  bite: "Now! Tap!",
  reel: "Hold to reel · let go while it runs",
  recover: "",
};
const END_WORD: Record<DerbyEnd, [string, string]> = {
  caught: ["", "#ffd166"], snap: ["snap!", "#ff8a80"], thrown: ["it threw the hook", "#ffffff"],
  stolen: ["it took the bait", "#ffffff"], early: ["too soon!", "#ffffff"], timeout: ["it got away", "#ffffff"],
};

export default function DerbyField({ course: anyCourse, mode, running, inputs: anyInputs, sound = true, speed = 1, onHud, onDone, runKey = 0 }: ArcadeFieldProps) {
  const course = anyCourse as DerbyCourse, inputs = anyInputs as readonly DerbyInput[] | undefined;
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ running, sound, speed, onHud, onDone });
  useEffect(() => { live.current = { running, sound, speed, onHud, onDone }; });
  // What the player asks for; the next tick turns it into inputs.
  const want = useRef<{ cast: { x: number; y: number } | null; strike: boolean; reel: 0 | 1 }>({ cast: null, strike: false, reel: 0 });
  const [phase, setPhase] = useState<DerbyState["phase"]>("idle");

  useEffect(() => {
    const canvas = canvasRef.current, box = boxRef.current;
    if (!canvas || !box) return;
    const ctx = canvas.getContext("2d")!;
    const st = initDerby(course);
    want.current = { cast: null, strike: false, reel: 0 };
    const recorded: DerbyInput[] = [];
    const fx: DerbyFx[] = [];
    let prev: Map<number, DerbyPose> | null = null;
    let sentReel: 0 | 1 = 0, k = 0, acc = 0, last = performance.now(), raf = 0, hudAt = 0, clickAt = 0, finished = false;
    let hover: { x: number; y: number } | null = null;
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
      return { x: Math.round(((e.clientX - r.left) / r.width) * VIEW_W), y: Math.round(((e.clientY - r.top) / r.height) * VIEW_H) };
    };
    const playing = () => mode === "play" && live.current.running && !finished;
    /** A tap or Space: cast where it points, strike, or start reeling. */
    const press = (p: { x: number; y: number } | null) => {
      if (st.phase === "idle") {
        if (p && inPond(course.pond, p.x, p.y)) want.current.cast = p;
        else if (p) fx.push({ x: p.x, y: p.y, text: "cast into the water", color: "#fff", at: performance.now() });
      } else if (st.phase === "waiting" || st.phase === "bite") { want.current.strike = true; want.current.reel = 1; }
      else if (st.phase === "reel") want.current.reel = 1;
    };
    const down = (e: PointerEvent) => {
      if (!playing()) return;
      e.preventDefault(); unlockSound();
      hover = at(e);
      press(hover);
    };
    const move = (e: PointerEvent) => { hover = at(e); };
    const up = () => { want.current.reel = 0; };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("pointerleave", up);
    const kd = (e: KeyboardEvent) => {
      if (!playing() || (e.key !== " " && e.key !== "Enter") || e.repeat) return;
      e.preventDefault(); unlockSound();
      press(hover);
    };
    const ku = (e: KeyboardEvent) => { if (e.key === " " || e.key === "Enter") want.current.reel = 0; };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    const tick = () => {
      prev = new Map(st.fish.map((f, i) => [i, { x: f.x, y: f.y }]));
      const before = { phase: st.phase, last: st.last };
      let now: DerbyInput[] = [];
      if (mode === "play") {
        const w = want.current;
        if (w.cast && canCast(st, course, w.cast.x, w.cast.y)) now.push({ t: st.tick, k: "cast", x: w.cast.x, y: w.cast.y });
        if (w.strike && canStrike(st)) now.push({ t: st.tick, k: "strike" });
        if (w.reel !== sentReel) { now.push({ t: st.tick, k: "reel", v: w.reel }); sentReel = w.reel; }
        w.cast = null; w.strike = false;
        recorded.push(...now);
      } else if (inputs) {
        while (k < inputs.length && inputs[k].t < st.tick) k++;
        while (k < inputs.length && inputs[k].t === st.tick) now.push(inputs[k++]);
      }
      stepDerby(st, course, now);
      const t = performance.now(), snd = live.current.sound;
      if (before.phase === "flight" && st.phase === "waiting" && snd) plopSound();
      if (st.phase === "bite" && before.phase !== "bite" && snd) biteSound();
      if (st.last && st.last !== before.last) {
        const { k: end, fish } = st.last;
        const p = fish >= 0 ? prev.get(fish) : null;
        const x = p?.x ?? st.bx, y = p?.y ?? st.by;
        if (end === "caught") {
          const cf = course.fish[fish];
          fx.push({ x, y, text: `${DERBY_FISH[cf.key].icon} ${(cf.grams / 1000).toFixed(2)} kg ${DERBY_FISH[cf.key].name}`, color: END_WORD.caught[1], at: t });
          if (snd) splashSound();
        } else {
          fx.push({ x, y, text: END_WORD[end][0], color: END_WORD[end][1], at: t });
          if (snd) (end === "snap" ? snapSound : lostSound)();
        }
      }
      if (st.phase === "reel" && st.reeling && snd && t - clickAt > 85) { clickAt = t; reelSound(); }
      if (st.phase !== before.phase) setPhase(st.phase);
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
      drawDerby(ctx, course, st, going ? prev : null, a, t);
      // Where a cast would land.
      if (mode === "play" && st.phase === "idle" && hover && inPond(course.pond, hover.x, hover.y)) {
        ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.setLineDash([2, 2]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(hover.x, hover.y, 6, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
      while (fx.length && t - fx[0].at > 1400) fx.shift();
      drawFx(ctx, fx, t);
      if (t - hudAt > 120 || st.done) {
        hudAt = t;
        const d = derbyDetail(st, course);
        const ti = course.fish.length - 1, tf = st.fish[ti], tdef = DERBY_FISH[course.fish[ti].key];
        const trophy = tf.status === "hidden" ? "?" : tf.status === "caught" ? "✓" : tf.status === "lost" || tf.status === "gone" ? "✗" : "!";
        live.current.onHud?.({
          seconds: Math.max(0, Math.ceil((RUN_TICKS - st.tick) / TICKS_PER_SEC)),
          phase: st.tick >= RUN_TICKS && st.phase === "reel" ? "Last fish!" : PHASE_WORD[st.phase] || undefined,
          chips: [
            { icon: "🐟", text: String(d.caught), title: "Fish landed" },
            { icon: "⚖", text: `${(d.grams / 1000).toFixed(1)} kg`, title: "Weight landed" },
            { icon: "💔", text: String(d.lost), title: "Got away", warn: d.lost > 0 },
            { icon: "🏆", text: trophy, title: tf.status === "hidden" ? "The trophy fish hasn't surfaced yet" : `Today's trophy: the ${tdef.name}`, warn: trophy === "!" },
          ],
        });
      }
      if (st.done && !finished) {
        finished = true;
        live.current.onDone?.(recorded, scoreDerby(st, course));
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
      canvas.removeEventListener("pointerleave", up);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, [course, mode, inputs, runKey]);

  const hint = mode === "play" && running ? HINT[phase] : "";
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div ref={boxRef} style={{ position: "relative", borderRadius: 10, overflow: "hidden", boxShadow: "0 0 0 3px #4a2c18, 0 10px 30px rgba(0,0,0,.4)" }}>
        <canvas ref={canvasRef} onContextMenu={(e) => e.preventDefault()} style={{ display: "block", width: "100%", height: "100%", touchAction: "none", imageRendering: "pixelated", cursor: mode === "play" && running ? "crosshair" : "default" }} />
        {hint && (
          <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
            <span className="rounded-md bg-black/45 px-2 py-1 text-xs font-bold text-amber-50">{hint}</span>
          </div>
        )}
      </div>
    </div>
  );
}
