"use client";
// A stored Whistle run played back (the taps replay to exactly the same run),
// with replay and speed buttons.

import { useState } from "react";
import WhistleField from "./WhistleField";
import type { WhistleHud, WhistleRunView } from "@/types/whistle";

export default function WhistleReplay({ run }: { run: WhistleRunView }) {
  const [key, setKey] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [hud, setHud] = useState<WhistleHud | null>(null);
  const [done, setDone] = useState(false);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center justify-between rounded-lg bg-black/40 px-3 py-1.5 font-mono text-[13px] text-amber-50">
        <span>▶ replay</span>
        <span>🏠 {hud?.penned ?? 0}/{hud?.total ?? 30}</span>
        <span className={hud?.lost ? "text-red-300" : ""}>🐺 {hud?.lost ?? 0}</span>
        <span>⏱ {hud?.seconds ?? 75}s</span>
        <span className="flex gap-1">
          {[1, 2, 4].map((s) => (
            <button key={s} onClick={() => setSpeed(s)} className={`rounded px-1.5 ${speed === s ? "bg-amber-400 text-black" : "bg-white/10"}`}>{s}×</button>
          ))}
          <button onClick={() => { setDone(false); setKey(key + 1); }} className="rounded bg-white/10 px-1.5" aria-label="Replay from the start">↻</button>
        </span>
      </div>
      <div className="relative min-h-0 flex-1">
        <WhistleField course={run.course} mode="replay" inputs={run.inputs} running={!done} sound={false} speed={speed} runKey={key} onHud={setHud} onDone={() => setDone(true)} />
      </div>
    </div>
  );
}
