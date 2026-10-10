"use client";
// What a logged-out visitor sees over the live village: the pitch (live
// numbers, a ticker of what just happened, why to join, the join button)
// and a slow camera tour past the villagers until they take the camera.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { bus, type Snapshot } from "@/game/bus";
import { positionAt } from "@/lib/motion";
import { VISITOR_VIEW as VIEW } from "@/lib/visitorView";

const MIN_KEY = "grove.pitchMinimized";
const TOUR_EVERY_MS = 8000;
const TOUR_PAN_MS = 2600;
const TICKER_EVERY_MS = 4500;
// Tour stops stay inside the visitor's view, a little in from its edges.
const MARGIN = 120;
const inView = (x: number, y: number) => x > VIEW.x0 + MARGIN && x < VIEW.x1 - MARGIN && y > VIEW.y0 + MARGIN && y < VIEW.y1 - MARGIN;

const PERKS = [
  ["🤖", "Talk to villagers who remember you", "AI villagers with moods, shops and errands of their own."],
  ["🌾", "Farm, ranch and build your homestead", "Claim a lot, raise animals, grow vines and orchards."],
  ["⚔", "Explore 20 towns and face lair bosses", "Bounties, treasure maps and far lands full of foes."],
] as const;

export default function PitchCard({ snap, onLogin }: { snap: Snapshot; onLogin: () => void }) {
  const [minimized, setMinimized] = useState(() => {
    try { return typeof window !== "undefined" && localStorage.getItem(MIN_KEY) === "1"; } catch { return false; }
  });
  const [perksOpen, setPerksOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const snapRef = useRef(snap);
  useEffect(() => { snapRef.current = snap; }, [snap]);

  const minimize = (v: boolean) => {
    setMinimized(v);
    try { localStorage.setItem(MIN_KEY, v ? "1" : "0"); } catch { /* storage blocked */ }
  };

  // Ticker: step through the latest happenings.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), TICKER_EVERY_MS);
    return () => clearInterval(t);
  }, []);

  // Camera tour: glide to a villager (or a shop door) every few seconds,
  // and stop for good the moment the visitor drags, scrolls or taps.
  useEffect(() => {
    let stop = false;
    let n = 0;
    const next = () => {
      if (stop) return;
      const s = snapRef.current;
      const now = Date.now();
      const people = s.npcs.map((v) => (v.move ? positionAt(v.move, now) : v)).filter((p) => inView(p.x, p.y));
      const doors = s.buildings.filter((b) => b.kind !== "home" && inView(b.doorX, b.doorY)).map((b) => ({ x: b.doorX, y: b.doorY }));
      // Mostly people, now and then a shop.
      const pool = n % 3 === 2 && doors.length ? doors : people.length ? people : doors;
      n++;
      if (!pool.length) return;
      const at = pool[Math.floor(Math.random() * pool.length)];
      bus.emit("focus", { x: at.x, y: at.y, ms: TOUR_PAN_MS });
    };
    const first = setTimeout(next, 1500);
    const t = setInterval(next, TOUR_EVERY_MS);
    const takeOver = () => { stop = true; clearTimeout(first); clearInterval(t); };
    const evs = ["pointerdown", "wheel", "keydown"] as const;
    for (const e of evs) window.addEventListener(e, takeOver, { once: true, passive: true });
    return () => { takeOver(); for (const e of evs) window.removeEventListener(e, takeOver); };
  }, []);

  const villagers = snap.npcs.length;
  const playing = snap.onlineCount ?? snap.players.length;
  const events = snap.events.slice(0, 8);
  const event = events.length ? events[tick % events.length] : null;

  if (minimized) {
    return (
      <button onClick={() => minimize(false)} className="pixel-btn pointer-events-auto absolute bottom-3 left-3 bg-emerald-600 px-3 py-2 font-bold text-white shadow-xl hover:bg-emerald-500">
        ▶ Join the village
      </button>
    );
  }

  return (
    <div className="pointer-events-auto absolute bottom-2 left-2 right-2 pixel-panel p-3 shadow-2xl sm:bottom-4 sm:left-4 sm:right-auto sm:w-[420px] sm:p-4">
      <button onClick={() => minimize(true)} className="absolute right-2 top-1.5 px-1 text-stone-400 hover:text-stone-700" aria-label="Minimise">—</button>
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
        <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" /></span>
        Live now · 🤖 {villagers} villagers · 👥 {playing} playing
      </div>
      <h1 className="mt-1 pr-4 text-lg font-extrabold leading-snug text-amber-900 sm:text-xl">A village run by AI villagers, and it keeps going without you.</h1>
      {event && (
        <div key={event.id} className="mt-2 truncate rounded bg-white/70 px-2 py-1 text-[12px] text-stone-700 [animation:pitch-fade_.5s_ease-out]" title={event.text}>
          📰 {event.text}
        </div>
      )}
      <ul className={`mt-2 space-y-1.5 ${perksOpen ? "" : "hidden sm:block"}`}>
        {PERKS.map(([icon, title, sub]) => (
          <li key={title} className="flex gap-2">
            <span className="text-lg leading-6">{icon}</span>
            <div><div className="font-bold text-stone-800">{title}</div><div className="text-[12px] text-stone-600">{sub}</div></div>
          </li>
        ))}
      </ul>
      <button onClick={() => setPerksOpen((o) => !o)} className="mt-1 text-[12px] font-bold text-amber-800 underline sm:hidden">{perksOpen ? "Show less" : "What can I do here? ▾"}</button>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link href="/signup" className="pixel-btn flex-1 bg-emerald-600 px-3 py-2 text-center text-base font-bold text-white hover:bg-emerald-500">Create your character, it&apos;s free →</Link>
        <button className="rounded-lg px-2 py-2 text-stone-600 underline hover:text-stone-900" onClick={onLogin}>I have one</button>
      </div>
      <style>{`@keyframes pitch-fade { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
}
