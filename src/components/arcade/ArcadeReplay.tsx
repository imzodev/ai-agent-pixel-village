"use client";
// A stored arcade run played back (its inputs replay to exactly the same run),
// with speed and replay buttons.

import { useState } from "react";
import { CLIENT_GAMES } from "./clientGames";
import type { ArcadeHud, ArcadeRunView } from "@/types/arcade";

export default function ArcadeReplay({ run }: { run: ArcadeRunView }) {
  const { Field } = CLIENT_GAMES[run.game];
  const [key, setKey] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [hud, setHud] = useState<ArcadeHud | null>(null);
  const [done, setDone] = useState(false);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center justify-between gap-2 rounded-lg bg-black/40 px-3 py-1.5 font-mono text-[13px] text-amber-50">
        <span>▶ replay</span>
        {(hud?.chips ?? []).map((c) => <span key={c.title} title={c.title} className={c.warn ? "text-red-300" : ""}>{c.icon} {c.text}</span>)}
        {hud?.seconds != null && <span>⏱ {hud.seconds}s</span>}
        <span className="flex gap-1">
          {[1, 2, 4].map((s) => (
            <button key={s} onClick={() => setSpeed(s)} className={`rounded px-1.5 ${speed === s ? "bg-amber-400 text-black" : "bg-white/10"}`}>{s}×</button>
          ))}
          <button onClick={() => { setDone(false); setKey(key + 1); }} className="rounded bg-white/10 px-1.5" aria-label="Replay from the start">↻</button>
        </span>
      </div>
      <div className="relative min-h-0 flex-1">
        <Field course={run.course} mode="replay" inputs={run.inputs} running={!done} sound={false} speed={speed} runKey={key} onHud={setHud} onDone={() => setDone(true)} />
      </div>
    </div>
  );
}
