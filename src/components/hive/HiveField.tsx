"use client";
// Beehive Builder's field: runs the game (src/lib/hive/sim.ts) at its fixed tick
// and draws it in between (draw.ts). "play": drag a piece from the tray onto the
// comb (a ghost shows where it lands) and let go, or tap a piece and then a cell.
// The placements that took effect are recorded for the server to replay.
// "replay": the stored inputs play back. The arcade shell
// (src/components/arcade/ArcadeShell.tsx) hosts it.

import { useEffect, useRef } from "react";
import { CELLS } from "@/lib/hive/board";
import { PIECES, RUN_TICKS, TICKS_PER_SEC, TICK_MS } from "@/lib/hive/rules";
import { canPlace, hiveDetail, initHive, scoreHive, stepHive, trayPiece } from "@/lib/hive/sim";
import { VIEW_H, VIEW_W, cellCentre, drawFx, drawHeld, drawHive, hexAt, pieceMiddle, slotAt } from "./draw";
import { buzzSound, chimeSound, tockSound, unlockSound } from "../arcade/sound";
import type { ArcadeFieldProps } from "@/types/arcade";
import type { HiveCourse, HiveFx, HiveInput } from "@/types/hive";

/** On a touch screen the dragged piece rides this far above the finger, so it can be seen. */
const TOUCH_LIFT = 46;

export default function HiveField({ course: anyCourse, mode, running, inputs: anyInputs, sound = true, speed = 1, onHud, onDone, runKey = 0 }: ArcadeFieldProps) {
  const course = anyCourse as HiveCourse, inputs = anyInputs as readonly HiveInput[] | undefined;
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ running, sound, speed, onHud, onDone });
  useEffect(() => { live.current = { running, sound, speed, onHud, onDone }; });

  useEffect(() => {
    const canvas = canvasRef.current, box = boxRef.current;
    if (!canvas || !box) return;
    const ctx = canvas.getContext("2d")!;
    const st = initHive(course);
    const recorded: HiveInput[] = [];
    const fx: HiveFx[] = [];
    const flash: { cells: number[]; at: number }[] = [];
    // Placements asked for; the next tick turns them into inputs.
    const want: { slot: number; q: number; r: number }[] = [];
    // A piece picked up from the tray: by a drag (it follows the pointer) or a tap (it waits for a cell).
    let held: { slot: number; x: number; y: number; moved: boolean; lift: number } | null = null;
    let picked: number | null = null;
    let k = 0, acc = 0, last = performance.now(), raf = 0, hudAt = 0, seen = 0, finished = false, buzzAt = 0;
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
    /** Where the held piece would land: the cell under its anchor, given the pointer holds it by its middle. */
    const landing = (slot: number, x: number, y: number) => {
      const shape = trayPiece(st, course, slot);
      if (!shape) return null;
      const m = pieceMiddle(shape);
      const cell = hexAt(x - m.x, y - m.y);
      return cell ? { slot, q: cell[0], r: cell[1], ok: canPlace(st, course, slot, cell[0], cell[1]) } : null;
    };
    const playing = () => mode === "play" && live.current.running && !finished;
    const down = (e: PointerEvent) => {
      if (!playing()) return;
      e.preventDefault(); unlockSound();
      canvas.setPointerCapture(e.pointerId);
      const p = at(e), slot = slotAt(p.x, p.y);
      if (slot !== null && trayPiece(st, course, slot)) { held = { slot, x: p.x, y: p.y, moved: false, lift: e.pointerType === "touch" ? TOUCH_LIFT : 0 }; return; }
      // A tapped piece goes where you tap next.
      const cell = hexAt(p.x, p.y);
      if (picked !== null && cell) want.push({ slot: picked, q: cell[0], r: cell[1] });
    };
    const move = (e: PointerEvent) => {
      if (!held) return;
      const p = at(e);
      if (Math.abs(p.x - held.x) + Math.abs(p.y - held.y) > 8) held.moved = true;
      held.x = p.x; held.y = p.y;
    };
    const up = () => {
      if (!held) return;
      if (held.moved) {
        const l = landing(held.slot, held.x, held.y - held.lift);
        if (l?.ok) want.push(l);
        picked = null;
      } else picked = picked === held.slot ? null : held.slot;
      held = null;
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);

    const tick = () => {
      const now: HiveInput[] = [];
      if (mode === "play") {
        for (const w of want.splice(0)) if (canPlace(st, course, w.slot, w.q, w.r)) now.push({ t: st.tick, k: "place", slot: w.slot, q: w.q, r: w.r });
        if (now.length) picked = null;
        recorded.push(...now);
      } else if (inputs) {
        while (k < inputs.length && inputs[k].t < st.tick) k++;
        while (k < inputs.length && inputs[k].t === st.tick) now.push(inputs[k++]);
      }
      stepHive(st, course, now);
      const t = performance.now(), snd = live.current.sound;
      for (; seen < st.log.length; seen++) {
        const ev = st.log[seen];
        if (ev.k === "place" && snd) tockSound();
        else if (ev.k === "clear") {
          flash.push({ cells: ev.cells, at: t });
          let x = 0, y = 0;
          for (const i of ev.cells) { const c = cellCentre(CELLS[i][0], CELLS[i][1]); x += c.x; y += c.y; }
          const words = `+${ev.points}${ev.lines > 1 ? ` ×${ev.lines}!` : ""}${ev.flowers ? " 🌼" : ""}${ev.jelly ? " 👑" : ""}`;
          fx.push({ x: x / ev.cells.length, y: y / ev.cells.length, text: words, color: "#fff6a0", at: t });
          if (snd) chimeSound(ev.lines);
        } else if (ev.k === "end") {
          const text = ev.why === "full" ? "the comb is full!" : ev.why === "done" ? "every piece placed! 🍯" : "the bees are restless…";
          fx.push({ x: VIEW_W / 2, y: 150, text, color: "#ffffff", at: t });
        }
      }
      // A soft buzz in the last ten seconds.
      if (!st.done && RUN_TICKS - st.tick <= 10 * TICKS_PER_SEC && t - buzzAt > 1000 && snd) { buzzAt = t; buzzSound(); }
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
      const ghost = held?.moved ? landing(held.slot, held.x, held.y - held.lift) : null;
      drawHive(ctx, course, st, t, { ghost, held: held?.slot ?? picked, flash });
      // The dragged piece: snapped onto its landing cells over the comb, under the pointer elsewhere.
      const shape = held?.moved ? trayPiece(st, course, held.slot) : null;
      if (held && shape) {
        const m = pieceMiddle(shape), a = ghost ? cellCentre(ghost.q, ghost.r) : null;
        drawHeld(ctx, shape, a ? a.x + m.x : held.x, a ? a.y + m.y : held.y - held.lift, a ? 0.45 : 0.75);
      }
      while (fx.length && t - fx[0].at > 1300) fx.shift();
      while (flash.length && t - flash[0].at > 600) flash.shift();
      drawFx(ctx, fx, t);
      if (t - hudAt > 150 || st.done) {
        hudAt = t;
        const d = hiveDetail(st);
        live.current.onHud?.({
          seconds: Math.max(0, Math.ceil((RUN_TICKS - st.tick) / TICKS_PER_SEC)),
          phase: picked !== null && mode === "play" ? "tap a cell" : undefined,
          chips: [
            { icon: "🍯", text: d.honey.toLocaleString("en-US"), title: "Honey" },
            { icon: "〰", text: String(d.lines), title: "Lines turned to honey" },
            { icon: "🧩", text: `${d.placed}/${PIECES}`, title: "Pieces placed" },
            { icon: "🌼", text: String(d.flowers), title: "Flower lines" },
          ],
        });
      }
      if (st.done && !finished) {
        finished = true;
        live.current.onDone?.(recorded, scoreHive(st));
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
