"use client";
// The Old Rootking's countdown (World panel): when it next rises, or that
// it's awake right now. Re-reads the schedule when a window starts or ends.
import { useEffect, useState } from "react";
import { countdownText } from "@/lib/countdown";

type Window = { active: boolean; at: number; endsAt: number };

export default function BossCountdown() {
  const [w, setW] = useState<Window | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let alive = true;
    const load = () => void fetch("/api/boss").then((r) => r.json()).then((d: Window) => { if (alive) setW(d); }).catch(() => {});
    load();
    const t = setInterval(() => setNow(Date.now()), 30_000);
    const r = setInterval(load, 10 * 60_000);
    return () => { alive = false; clearInterval(t); clearInterval(r); };
  }, []);
  if (!w) return null;
  const awake = w.active && now < w.endsAt;
  return (
    <div className={`rounded-lg px-2 py-1.5 text-[13px] font-bold ${awake ? "bg-red-100 text-red-800" : "bg-emerald-50 text-emerald-900"}`}>
      🌳 {awake
        ? <>The Old Rootking is awake in the north woods! {countdownText(w.endsAt - now)} left: bring friends.</>
        : <>The Old Rootking rises in {countdownText(w.at - now)} <span className="font-normal text-stone-600">({new Date(w.at).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}, your time)</span></>}
    </div>
  );
}
