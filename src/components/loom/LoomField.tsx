"use client";
// Della's Loom's field: runs the game (src/lib/loom/sim.ts) at its fixed tick and
// draws it in between (draw.ts). "play": watch Della show the row, then tap the
// spools in order (keys 1–5); "Got it!" (or space) ends the show early, and the
// threads you hadn't seen pay extra if the row comes out clean. "replay": the
// stored inputs play back. The arcade shell (src/components/arcade/ArcadeShell.tsx)
// hosts it.

import { useEffect, useRef } from "react";
import { ROWS, RUN_TICKS, SNAG_MAX, TICKS_PER_SEC, TICK_MS } from "@/lib/loom/rules";
import { litAt, showTicks } from "@/lib/loom/course";
import { canPick, canReady, initLoom, scoreLoom, stepLoom } from "@/lib/loom/sim";
import { VIEW_H, VIEW_W, drawFx, drawLoom, readyHit, slotAt, spoolAt, spoolHit } from "./draw";
import { chimeSound, cheerSound, noteSound, snagSound, tockSound, unlockSound } from "../arcade/sound";
import type { ArcadeFieldProps } from "@/types/arcade";
import type { LoomCourse, LoomFx, LoomInput } from "@/types/loom";

export default function LoomField({ course: anyCourse, mode, running, inputs: anyInputs, sound = true, speed = 1, onHud, onDone, runKey = 0 }: ArcadeFieldProps) {
  const course = anyCourse as LoomCourse, inputs = anyInputs as readonly LoomInput[] | undefined;
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ running, sound, speed, onHud, onDone });
  useEffect(() => { live.current = { running, sound, speed, onHud, onDone }; });

  useEffect(() => {
    const canvas = canvasRef.current, box = boxRef.current;
    if (!canvas || !box) return;
    const ctx = canvas.getContext("2d")!;
    const st = initLoom();
    const recorded: LoomInput[] = [];
    const fx: LoomFx[] = [];
    /** Taps since the last tick, applied in order on the next one. */
    let queued: ({ k: "pick"; c: number } | { k: "ready" })[] = [];
    let tapped: { c: number; at: number } | null = null;
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
    const pick = (c: number) => { queued.push({ k: "pick", c }); tapped = { c, at: performance.now() }; };
    const down = (e: PointerEvent) => {
      if (!playing()) return;
      e.preventDefault(); unlockSound();
      const r = canvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * VIEW_W, y = ((e.clientY - r.top) / r.height) * VIEW_H;
      if (readyHit(x, y)) { queued.push({ k: "ready" }); return; }
      const c = spoolHit(x, y, course.colors);
      if (c >= 0) pick(c);
    };
    canvas.addEventListener("pointerdown", down);
    const kd = (e: KeyboardEvent) => {
      if (!playing() || e.repeat) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= course.colors) pick(n - 1);
      else if (e.key === " " || e.key === "Enter") queued.push({ k: "ready" });
      else return;
      e.preventDefault(); unlockSound();
    };
    window.addEventListener("keydown", kd);

    const tick = () => {
      let now: LoomInput[] = [];
      if (mode === "play") {
        // Only what takes effect is kept: a tap mid-show, or Ready before a thread has lit, does nothing.
        if (queued.length && st.tick < RUN_TICKS) {
          const probe = structuredClone(st);
          // The show may end this very tick (the run flips to weaving before it reads the taps).
          if (probe.phase === "show" && probe.tick >= probe.showAt + showTicks(course.rows[probe.row])) probe.phase = "weave";
          for (const q of queued) {
            const inp: LoomInput = q.k === "ready" ? { t: st.tick, k: "ready" } : { t: st.tick, k: "pick", c: q.c };
            const ok = q.k === "ready" ? canReady(probe, course) : canPick(probe, course, q.c);
            if (!ok) continue;
            stepProbe(probe, inp);
            now.push(inp);
          }
        }
        queued = [];
        recorded.push(...now);
      } else if (inputs) {
        while (k < inputs.length && inputs[k].t < st.tick) k++;
        while (k < inputs.length && inputs[k].t === st.tick) now.push(inputs[k++]);
        for (const i of now) if (i.k === "pick") tapped = { c: i.c, at: performance.now() };
      }
      stepLoom(st, course, now);
      const t = performance.now(), snd = live.current.sound;
      for (; seen < st.log.length; seen++) {
        const ev = st.log[seen];
        if (ev.k === "thread") {
          if (snd) noteSound(ev.c ?? 0);
        } else if (ev.k === "show") {
          // Each thread's note while Della shows it is played from the frame loop.
        } else if (ev.k === "ready") {
          if (snd) tockSound();
          if (ev.i) fx.push({ x: 240, y: 150, text: `From memory: ${ev.i} unseen`, color: "#cfe8ff", at: t });
        } else if (ev.k === "row") {
          const len = course.rows[ev.row].threads.length, p = slotAt(len >> 1, len, 1);
          const chain = ev.clean && ev.chain && ev.chain > 1 ? ` ×${ev.chain}` : "";
          fx.push({ x: p.x, y: p.y - 16, text: `${ev.clean ? "Clean! " : ""}+${ev.points}${chain}`, color: ev.clean ? "#ffd166" : "#f0e0c0", at: t, big: !!ev.clean });
          if (snd) chimeSound(ev.clean ? Math.min(4, (ev.chain ?? 1)) : 1);
          if (st.done && st.row >= ROWS && snd) cheerSound();
        } else if (ev.k === "snag") {
          const row = course.rows[ev.row], len = row.threads.length;
          const slot = row.kind === "back" ? len - 1 - (ev.i ?? 0) : ev.i ?? 0, p = slotAt(slot, len, 0);
          fx.push({ x: p.x, y: p.y - 14, text: st.snags >= SNAG_MAX ? "Snag! That's three." : "Snag!", color: "#ff9a7a", at: t, big: true });
          if (snd) snagSound();
        }
      }
      // A thread lighting in the show sounds its note.
      if (st.phase === "show" && !st.done && snd) {
        const row = course.rows[st.row];
        for (let i = 0; i < row.threads.length; i++) if (st.tick - 1 === st.showAt + litAt(row, i)) noteSound(row.threads[i]);
      }
    };
    /** Step a copy of the run with one input, to know whether the next one would take. */
    const stepProbe = (probe: typeof st, inp: LoomInput) => {
      const tickWas = probe.tick;
      stepLoom(probe, course, [inp]);
      probe.tick = tickWas;
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
      drawLoom(ctx, course, st, t, { tapped, readyButton: mode === "play" });
      while (fx.length && t - fx[0].at > 1300) fx.shift();
      drawFx(ctx, fx, t);
      if (t - hudAt > 120 || st.done) {
        hudAt = t;
        const row = st.row < ROWS ? course.rows[st.row] : null;
        live.current.onHud?.({
          seconds: Math.max(0, Math.ceil((RUN_TICKS - st.tick) / TICKS_PER_SEC)),
          phase: st.done ? "Della takes the shuttle" : st.phase === "show" ? (row?.kind === "back" ? "Watch: you'll weave it back again" : "Watch the row") : row?.kind === "back" ? "Back again: last thread first" : "Weave it: tap the spools",
          chips: [
            { icon: "🧶", text: `${Math.min(st.row + (st.done ? 0 : 1), ROWS)}/${ROWS}`, title: "Row" },
            { icon: "📏", text: row ? String(row.threads.length) : "–", title: "Threads in this row" },
            { icon: "✨", text: `×${Math.max(1, st.chain)}`, title: "Clean rows in a row" },
            { icon: "🪢", text: `${st.snags}/${SNAG_MAX}`, title: "Snags", warn: st.snags >= SNAG_MAX - 1 },
          ],
        });
      }
      if (st.done && !finished) {
        finished = true;
        live.current.onDone?.(recorded, scoreLoom(st));
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
      <div ref={boxRef} style={{ position: "relative", borderRadius: 10, overflow: "hidden", boxShadow: "0 0 0 3px #4a3422, 0 10px 30px rgba(0,0,0,.4)" }}>
        <canvas ref={canvasRef} onContextMenu={(e) => e.preventDefault()} style={{ display: "block", width: "100%", height: "100%", touchAction: "none", cursor: mode === "play" && running ? "pointer" : "default" }} />
      </div>
    </div>
  );
}
