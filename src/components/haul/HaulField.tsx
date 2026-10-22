"use client";
// Harvest Haul's field: runs the game (src/lib/haul/sim.ts) at its fixed tick
// and draws it in between (draw.ts). "play": slide over the cart to aim and
// let go to drop, ↻ (or R) turns the next item, Go! starts the drive early,
// and ◀ ▶ (or the arrow keys, A/D) lean the cart; the inputs that took effect
// are recorded for the server to replay. "replay": the stored inputs play back.
// The arcade shell (src/components/arcade/ArcadeShell.tsx) hosts it.

import { useEffect, useRef, useState } from "react";
import { DROP_RANGE, HAUL_ITEMS, STACK_TICKS, TICKS_PER_SEC, TICK_MS } from "@/lib/haul/rules";
import { marketX } from "@/lib/haul/course";
import { canDrop, haulDetail, initHaul, scoreHaul, stepHaul } from "@/lib/haul/sim";
import { VIEW_H, VIEW_W, cameraTarget, drawFx, drawHaul, loadHaulSheet } from "./draw";
import { cheerSound, crackSound, fallSound, hoofSound, unlockSound } from "../arcade/sound";
import type { ArcadeFieldProps } from "@/types/arcade";
import type { HaulCamera, HaulCourse, HaulFx, HaulInput, HaulPose, HaulState } from "@/types/haul";

let sheetOnce: Promise<HTMLImageElement> | null = null;
const PHASE_WORD: Record<HaulState["phase"], string> = { stack: "Load the cart", settle: "Hold tight…", drive: "To market!", arrive: "Made it!", done: "Made it!" };

export default function HaulField({ course: anyCourse, mode, running, inputs: anyInputs, sound = true, speed = 1, onHud, onDone, runKey = 0 }: ArcadeFieldProps) {
  const course = anyCourse as HaulCourse, inputs = anyInputs as readonly HaulInput[] | undefined;
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ running, sound, speed, onHud, onDone });
  useEffect(() => { live.current = { running, sound, speed, onHud, onDone }; });
  // What the player asks for; the next tick turns it into inputs.
  const want = useRef({ aim: 0, rot: 0, drop: false, go: false, lean: 0 });
  const [ui, setUi] = useState<{ phase: HaulState["phase"]; rot: number; canGo: boolean }>({ phase: "stack", rot: 0, canGo: false });

  useEffect(() => {
    const canvas = canvasRef.current, box = boxRef.current;
    if (!canvas || !box) return;
    const ctx = canvas.getContext("2d")!;
    let img: HTMLImageElement | null = null;
    sheetOnce ??= loadHaulSheet();
    void sheetOnce.then((i) => { img = i; }).catch(() => undefined);

    const st = initHaul(course);
    want.current = { aim: 0, rot: 0, drop: false, go: false, lean: 0 };
    const recorded: HaulInput[] = [];
    const fx: HaulFx[] = [];
    let prev: Map<number, HaulPose> | null = null;
    let sentLean = 0, k = 0, acc = 0, last = performance.now(), raf = 0, hudAt = 0, finished = false, hoofAt = 0;
    let cam: HaulCamera = cameraTarget(st, course, 0, 0);
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

    // Aim: the pointer's x over the cart (world units from the bed's middle).
    const aimAt = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const wx = cam.x + ((e.clientX - r.left) / r.width) * VIEW_W;
      want.current.aim = Math.round(Math.max(-DROP_RANGE, Math.min(DROP_RANGE, wx - st.bodies[0].x)));
    };
    const playing = () => mode === "play" && live.current.running && !finished;
    const down = (e: PointerEvent) => { if (!playing()) return; e.preventDefault(); unlockSound(); aimAt(e); };
    const move = (e: PointerEvent) => { if (playing()) aimAt(e); };
    const up = (e: PointerEvent) => { if (!playing()) return; aimAt(e); if (st.phase === "stack") want.current.drop = true; };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    const held = new Set<string>();
    const leanFromKeys = () => { want.current.lean = (held.has("r") ? 1 : 0) - (held.has("l") ? 1 : 0); };
    const key = (e: KeyboardEvent, isDown: boolean) => {
      if (!playing()) return;
      const k2 = e.key.toLowerCase();
      if (k2 === "arrowleft" || k2 === "a") { if (isDown) held.add("l"); else held.delete("l"); leanFromKeys(); e.preventDefault(); }
      else if (k2 === "arrowright" || k2 === "d") { if (isDown) held.add("r"); else held.delete("r"); leanFromKeys(); e.preventDefault(); }
      else if (isDown && k2 === "r") { want.current.rot = (want.current.rot + 1) % 4; setUi((u) => ({ ...u, rot: want.current.rot })); }
      else if (isDown && (k2 === " " || k2 === "arrowdown")) { if (st.phase === "stack") want.current.drop = true; e.preventDefault(); }
      else if (isDown && k2 === "enter") want.current.go = true;
    };
    const kd = (e: KeyboardEvent) => key(e, true), ku = (e: KeyboardEvent) => key(e, false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    const tick = () => {
      prev = new Map(st.bodies.map((b) => [b.id, { x: b.x, y: b.y, c: b.c, s: b.s }]));
      const before = { status: [...st.status], broken: [...st.broken], phase: st.phase };
      let now: HaulInput[] = [];
      if (mode === "play") {
        const w = want.current;
        if (w.drop && canDrop(st, course)) now.push({ t: st.tick, k: "drop", x: w.aim, r: w.rot });
        if (w.go && st.phase === "stack" && st.next > 0) now.push({ t: st.tick, k: "go" });
        if (w.lean !== sentLean) { now.push({ t: st.tick, k: "lean", v: w.lean }); sentLean = w.lean; }
        w.drop = false; w.go = false;
        recorded.push(...now);
      } else if (inputs) {
        while (k < inputs.length && inputs[k].t < st.tick) k++;
        while (k < inputs.length && inputs[k].t === st.tick) now.push(inputs[k++]);
      }
      stepHaul(st, course, now);
      const t = performance.now(), snd = live.current.sound;
      st.status.forEach((s, i) => {
        if (s === "lost" && before.status[i] === "placed") {
          const b = prev?.get(i + 3);
          fx.push({ x: b?.x ?? st.bodies[0].x, y: b?.y ?? st.bodies[0].y, text: `💨 ${HAUL_ITEMS[course.items[i]].name}`, color: "#fff", at: t });
          if (snd) fallSound();
        }
      });
      st.broken.forEach((br, i) => {
        if (br && !before.broken[i]) {
          const b = st.bodies.find((x) => x.item === i);
          fx.push({ x: b?.x ?? st.bodies[0].x, y: b?.y ?? st.bodies[0].y, text: "crack!", color: "#ffd166", at: t });
          if (snd) crackSound();
        }
      });
      if (st.phase === "arrive" && before.phase !== "arrive" && snd) cheerSound();
      if (st.phase === "drive" && st.speed > 20 && t - hoofAt > 340 && snd) { hoofAt = t; hoofSound(); }
      if (st.phase !== before.phase || now.length) setUi({ phase: st.phase, rot: want.current.rot, canGo: st.phase === "stack" && st.next > 0 });
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
      const target = cameraTarget(st, course, want.current.aim, want.current.rot);
      cam = { x: cam.x + (target.x - cam.x) * 0.18, y: cam.y + (target.y - cam.y) * 0.12 };
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, -cam.x * scale * dpr, -cam.y * scale * dpr);
      ctx.imageSmoothingEnabled = false;
      const aim = mode === "play" && st.phase === "stack" ? { x: want.current.aim, r: want.current.rot } : null;
      drawHaul(ctx, course, st, going ? prev : null, a, img, cam, aim, t);
      while (fx.length && t - fx[0].at > 900) fx.shift();
      drawFx(ctx, fx, t);
      if (t - hudAt > 120 || st.done) {
        hudAt = t;
        const d = haulDetail(st);
        const onCart = st.status.filter((s) => s === "placed").length - d.broken;
        const left = Math.max(0, Math.round((marketX(course.road) - st.dist) / 10));
        const stacking = st.phase === "stack";
        const next = stacking && st.next < course.items.length ? course.items.slice(st.next, st.next + 3).map((k2) => HAUL_ITEMS[k2].icon).join(" ") : "";
        live.current.onHud?.({
          seconds: stacking ? Math.max(0, Math.ceil((STACK_TICKS - (st.tick - st.phaseAt)) / TICKS_PER_SEC)) : null,
          phase: PHASE_WORD[st.phase],
          chips: stacking
            ? [{ icon: "⏭", text: next || "–", title: "Next up" }, { icon: "🛒", text: `${st.next}/${course.items.length}`, title: "Loaded" }]
            : [
                { icon: "🛒", text: String(onCart), title: "On the cart" },
                { icon: "💔", text: String(d.broken), title: "Broken", warn: d.broken > 0 },
                { icon: "💨", text: String(d.lost), title: "Lost on the road", warn: d.lost > 0 },
                { icon: "📍", text: `${left} m`, title: "To market" },
              ],
        });
      }
      if (st.done && !finished) {
        finished = true;
        live.current.onDone?.(recorded, scoreHaul(st, course));
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, [course, mode, inputs, runKey]);

  const btn = "pointer-events-auto select-none rounded-lg border-2 border-amber-900/50 bg-amber-100/90 px-3 py-2 text-lg font-bold text-amber-950 shadow active:translate-y-px";
  const playing = mode === "play" && running;
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div ref={boxRef} style={{ position: "relative", borderRadius: 10, overflow: "hidden", boxShadow: "0 0 0 3px #4a2c18, 0 10px 30px rgba(0,0,0,.4)" }}>
        <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%", touchAction: "none", imageRendering: "pixelated", cursor: playing && ui.phase === "stack" ? "crosshair" : "default" }} />
        {playing && ui.phase === "stack" && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-2">
            <button className={btn} onClick={() => { want.current.rot = (want.current.rot + 1) % 4; setUi((u) => ({ ...u, rot: want.current.rot })); }} aria-label="Turn the next item">↻ Turn</button>
            {ui.canGo && <button className={`${btn} bg-emerald-500 text-white`} onClick={() => { want.current.go = true; }}>Go! ▶</button>}
          </div>
        )}
        {playing && (ui.phase === "drive" || ui.phase === "settle") && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-between px-3">
            {([-1, 1] as const).map((v) => (
              <button key={v} className={`${btn} px-6 text-2xl`} aria-label={v < 0 ? "Lean back" : "Lean forward"}
                onPointerDown={(e) => { e.preventDefault(); want.current.lean = v; }}
                onPointerUp={() => { want.current.lean = 0; }}
                onPointerLeave={() => { if (want.current.lean === v) want.current.lean = 0; }}
                onContextMenu={(e) => e.preventDefault()}>{v < 0 ? "◀" : "▶"}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
