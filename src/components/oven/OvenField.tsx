"use client";
// Marigold's Oven's field: runs the game (src/lib/oven/sim.ts) at its fixed tick
// and draws it in between (draw.ts). "play": tap a dough bin, then an empty oven,
// to put it in; tap a full oven to take it out (keys: 1–3 for the bins, Q W E
// for the ovens). The inputs that took effect are recorded for the server to
// replay. "replay": the stored inputs play back. The arcade shell
// (src/components/arcade/ArcadeShell.tsx) hosts it.

import { useEffect, useRef } from "react";
import { OVEN_GOODS, RUN_TICKS, TICKS_PER_SEC, TICK_MS } from "@/lib/oven/rules";
import { doughsOf } from "@/lib/oven/course";
import { canLoad, canTake, initOven, ovenDetail, scoreOven, stepOven } from "@/lib/oven/sim";
import { VIEW_H, VIEW_W, drawFx, drawOven, hitTest, ovenCentre, ticketCentre } from "./draw";
import { dingSound, doorSound, hissSound, huffSound, tillSound, unlockSound } from "../arcade/sound";
import type { ArcadeFieldProps } from "@/types/arcade";
import type { OvenCourse, OvenFx, OvenInput } from "@/types/oven";

const OVEN_KEYS = ["q", "w", "e"];

export default function OvenField({ course: anyCourse, mode, running, inputs: anyInputs, sound = true, speed = 1, onHud, onDone, runKey = 0 }: ArcadeFieldProps) {
  const course = anyCourse as OvenCourse, inputs = anyInputs as readonly OvenInput[] | undefined;
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ running, sound, speed, onHud, onDone });
  useEffect(() => { live.current = { running, sound, speed, onHud, onDone }; });

  useEffect(() => {
    const canvas = canvasRef.current, box = boxRef.current;
    if (!canvas || !box) return;
    const ctx = canvas.getContext("2d")!;
    const st = initOven(course);
    const doughs = doughsOf(course);
    const recorded: OvenInput[] = [];
    const fx: OvenFx[] = [];
    // Ovens tapped, with the bin picked at the time; the next tick turns them into inputs.
    const want: { oven: number; bin: number | null }[] = [];
    let picked: number | null = mode === "play" ? 0 : null;
    let k = 0, acc = 0, last = performance.now(), raf = 0, hudAt = 0, seen = 0, finished = false, dinged = new Set<string>();
    let order: number[] = [];
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

    const playing = () => mode === "play" && live.current.running && !finished;
    const down = (e: PointerEvent) => {
      if (!playing()) return;
      e.preventDefault(); unlockSound();
      const r = canvas.getBoundingClientRect();
      const hit = hitTest(((e.clientX - r.left) / r.width) * VIEW_W, ((e.clientY - r.top) / r.height) * VIEW_H);
      if (hit?.kind === "bin") picked = hit.i;
      else if (hit?.kind === "oven") want.push({ oven: hit.i, bin: picked });
    };
    canvas.addEventListener("pointerdown", down);
    const kd = (e: KeyboardEvent) => {
      if (!playing() || e.repeat) return;
      const key = e.key.toLowerCase();
      if (key === "1" || key === "2" || key === "3") { picked = Number(key) - 1; e.preventDefault(); }
      else if (OVEN_KEYS.includes(key)) { unlockSound(); want.push({ oven: OVEN_KEYS.indexOf(key), bin: picked }); e.preventDefault(); }
    };
    window.addEventListener("keydown", kd);

    const tick = () => {
      const now: OvenInput[] = [];
      if (mode === "play") {
        // A full oven: take it out. An empty one: put the picked dough in.
        for (const { oven: o, bin } of want.splice(0)) {
          if (canTake(st, o)) now.push({ t: st.tick, k: "take", oven: o });
          else if (bin !== null && canLoad(st, course, o, doughs[bin])) now.push({ t: st.tick, k: "load", oven: o, item: doughs[bin] });
        }
        recorded.push(...now);
      } else if (inputs) {
        while (k < inputs.length && inputs[k].t < st.tick) k++;
        while (k < inputs.length && inputs[k].t === st.tick) now.push(inputs[k++]);
      }
      stepOven(st, course, now);
      const t = performance.now(), snd = live.current.sound;
      for (; seen < st.log.length; seen++) {
        const ev = st.log[seen];
        const at = ev.oven !== undefined ? ovenCentre(ev.oven) : null;
        if (ev.k === "load" && snd) doorSound();
        else if (ev.k === "doughy" && at) fx.push({ ...at, text: "doughy…", color: "#fff", at: t });
        else if (ev.k === "burnt" && at) { fx.push({ ...at, text: "burnt!", color: "#ff8a80", at: t }); if (snd) hissSound(); }
        else if (ev.k === "perfect" && at) { fx.push({ ...at, text: `perfect! +${ev.points}`, color: "#ffd166", at: t }); if (snd) doorSound(); }
        else if (ev.k === "golden" && at) { fx.push({ ...at, text: `+${ev.points}`, color: "#fff6d0", at: t }); if (snd) doorSound(); }
        else if (ev.k === "served" && ev.ticket !== undefined) {
          const slot = Math.max(0, order.indexOf(ev.ticket));
          fx.push({ ...ticketCentre(slot), text: `🧾 +${ev.points}`, color: "#9fe0a0", at: t });
          if (snd) tillSound();
        } else if (ev.k === "left" && ev.ticket !== undefined) {
          const slot = Math.max(0, order.indexOf(ev.ticket));
          fx.push({ ...ticketCentre(slot), text: "walked out 😤", color: "#ff8a80", at: t });
          if (snd) huffSound();
        }
      }
      // A ding the moment a bake turns golden.
      st.ovens.forEach((s, o) => {
        if (!s) return;
        const id = `${o}:${s.at}`;
        const g = OVEN_GOODS[s.item];
        if (!dinged.has(id) && (st.tick - s.at) * course.heat[o] >= g.bakeTicks * 4) { dinged.add(id); if (snd) dingSound(); }
      });
      if (dinged.size > 50) dinged = new Set();
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
      const a = going ? Math.min(1, acc / TICK_MS) : 0;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      order = drawOven(ctx, course, st, a, picked, t);
      while (fx.length && t - fx[0].at > 1200) fx.shift();
      drawFx(ctx, fx, t);
      if (t - hudAt > 120 || st.done) {
        hudAt = t;
        const d = ovenDetail(st);
        live.current.onHud?.({
          seconds: Math.max(0, Math.ceil((RUN_TICKS - st.tick) / TICKS_PER_SEC)),
          phase: picked !== null && mode === "play" ? `${OVEN_GOODS[doughs[picked]].icon} ready` : undefined,
          chips: [
            { icon: "🧾", text: String(d.served), title: "Orders served" },
            { icon: "✨", text: String(d.perfect), title: "Perfect bakes" },
            { icon: "🔥", text: String(d.spoiled), title: "Doughy or burnt", warn: d.spoiled > 0 },
            { icon: "😤", text: String(d.left), title: "Walked out", warn: d.left > 0 },
          ],
        });
      }
      if (st.done && !finished) {
        finished = true;
        live.current.onDone?.(recorded, scoreOven(st));
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
      <div ref={boxRef} style={{ position: "relative", borderRadius: 10, overflow: "hidden", boxShadow: "0 0 0 3px #4a2c18, 0 10px 30px rgba(0,0,0,.4)" }}>
        <canvas ref={canvasRef} onContextMenu={(e) => e.preventDefault()} style={{ display: "block", width: "100%", height: "100%", touchAction: "none", cursor: mode === "play" && running ? "pointer" : "default" }} />
      </div>
    </div>
  );
}
