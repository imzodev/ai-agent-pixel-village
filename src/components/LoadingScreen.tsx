"use client";
// The loading screen: covers the game from the first paint until the world is
// really there (map chunks, buildings, the first snapshot's villagers with
// their sprites), so nobody watches it being built square by square. Progress
// comes from WorldScene over the bus ("loading", then "worldReady"); a cap
// lets it go after MAX_WAIT_MS whatever happens.
import { useEffect, useState, useSyncExternalStore } from "react";
import { bus } from "@/game/bus";
import { ANIMAL_SPRITES } from "@/game/animalSprites";

const MAX_WAIT_MS = 15_000;
const LINE_EVERY_MS = 1800;
const TIP_EVERY_MS = 5000;
const HOLD_MS = 250;
const FADE_MS = 500;

const LINES = [
  "Kneading Marigold's dough…",
  "Teaching the chickens to cluck…",
  "Polishing Bjorn's anvil…",
  "Counting Hollis's flour sacks…",
  "Herding stray sheep…",
  "Tuning the crickets…",
  "Reticulating windmills…",
  "Brewing Hettie's tea…",
  "Waking up the villagers…",
  "Planting the pines…",
  "Untangling Marina's nets…",
  "Finding Tobin's other feather…",
  "Sweeping the plaza…",
  "Lighting the lanterns…",
];
const TIPS_DESKTOP = [
  "Tip: walk with WASD or the arrow keys; hold Shift to run.",
  "Tip: press E to talk to a villager or use what's in front of you.",
  "Tip: F sells, G buys, C crafts, when a villager is selected.",
  "Tip: waystones let you travel to any you've visited.",
  "Tip: villagers remember what you tell them.",
];
const TIPS_TOUCH = [
  "Tip: walk with the arrow pad; tap 🏃 to run.",
  "Tip: tap a villager, then Talk, Buy or Sell.",
  "Tip: waystones let you travel to any you've visited.",
  "Tip: villagers remember what you tell them.",
];

const subscribeTouch = (cb: () => void) => { const m = window.matchMedia("(pointer: coarse)"); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); };
const isTouch = () => window.matchMedia("(pointer: coarse)").matches;
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** How tall the walking animal's art is drawn (px, feet to top): the big farm animals a little bigger. */
const WALKER_ART_PX = 84;
const WALKER_BIG_ART_PX = 110;

/**
 * How to draw an animal walking right, from its sprite definition. Sized by
 * its art (`labelHeight`: feet to the top of the art), not its frame: the
 * big animals' 128 px frames are mostly empty. Also the walk row's offset,
 * how far the frames run and how fast, how far below its feet the frame
 * goes (so it stands on the bar) and how tall the art is (the space above).
 */
function walkerStyle(key: string) {
  const def = ANIMAL_SPRITES[key] ?? ANIMAL_SPRITES.chicken;
  const walk = def.actions.walk;
  const k = (def.frameHeight >= 64 ? WALKER_BIG_ART_PX : WALKER_ART_PX) / def.labelHeight;
  const h = Math.round(def.frameHeight * k);
  const w = Math.round(def.frameWidth * k);
  const row = walk.block * def.dirRows.length + def.dirRows.indexOf("right");
  return {
    w, h,
    below: Math.round(h * (1 - def.originY)),
    art: Math.round(def.labelHeight * k),
    vars: {
      width: w, height: h,
      backgroundImage: `url(${def.url})`,
      backgroundSize: `${def.columns * w}px auto`,
      backgroundPositionY: `${-row * h}px`,
      "--walk-end": `${-walk.frames * w}px`,
      "--walk-steps": walk.frames,
      "--walk-time": `${walk.frames / walk.frameRate}s`,
    } as React.CSSProperties,
  };
}

export default function LoadingScreen({ walker = "chicken" }: { walker?: string }) {
  const animal = walkerStyle(walker);
  const [progress, setProgress] = useState(0.03);
  const [line, setLine] = useState(0);
  const [tip, setTip] = useState(0);
  const [phase, setPhase] = useState<"loading" | "fading" | "gone">("loading");
  const touch = useSyncExternalStore(subscribeTouch, isTouch, () => false);
  const tips = touch ? TIPS_TOUCH : TIPS_DESKTOP;

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      setProgress(1);
      timers.push(setTimeout(() => setPhase("fading"), HOLD_MS));
      timers.push(setTimeout(() => setPhase("gone"), HOLD_MS + FADE_MS));
    };
    const offLoading = bus.on("loading", ({ progress: p }) => setProgress((cur) => Math.max(cur, Math.min(1, p))));
    const offReady = bus.on("worldReady", finish);
    timers.push(setTimeout(finish, MAX_WAIT_MS));
    const lines = setInterval(() => { if (!reducedMotion()) setLine((i) => (i + 1) % LINES.length); }, LINE_EVERY_MS);
    const tipTimer = setInterval(() => setTip((i) => i + 1), TIP_EVERY_MS);
    return () => { offLoading(); offReady(); clearInterval(lines); clearInterval(tipTimer); timers.forEach(clearTimeout); };
  }, []);

  if (phase === "gone") return null;
  const pct = Math.round(progress * 100);
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Loading the village: ${pct}%`}
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#5f9c50] px-6 text-white transition-opacity"
      style={{ opacity: phase === "fading" ? 0 : 1, transitionDuration: `${FADE_MS}ms`, backgroundImage: "radial-gradient(#6fae5f 2px, transparent 2px)", backgroundSize: "18px 18px" }}
    >
      <div className="rounded-lg border-2 border-amber-900/60 bg-amber-100 px-4 py-1.5 text-2xl font-extrabold tracking-tight text-amber-900 shadow-lg">🌳 thegroove</div>
      <div className="w-[min(80vw,420px)]" style={{ marginTop: animal.art + 16 }}>
        <div className="relative">
          {/* One of the village's own farm animals, walking the bar as it fills. */}
          <div
            className="loading-walker"
            role="img"
            aria-label={`A ${walker} walks the loading bar`}
            style={{ ...animal.vars, bottom: `calc(100% - ${animal.below + 2}px)`, left: `clamp(${-Math.round(animal.w / 4)}px, calc(${Math.max(3, pct)}% - ${Math.round(animal.w * 0.6)}px), calc(100% - ${Math.round(animal.w * 0.75)}px))` }}
          />
          <div className="pixel-panel h-6 overflow-hidden p-1">
            <div className="h-full rounded-sm bg-gradient-to-b from-amber-300 to-amber-500 transition-[width] duration-500 ease-out" style={{ width: `${Math.max(3, pct)}%` }} />
          </div>
        </div>
        <div key={line} className="loading-line mt-3 h-6 text-center text-base font-bold text-amber-50 drop-shadow">{LINES[line]}</div>
        <div className="mt-6 text-center text-[13px] text-emerald-50/90">{tips[tip % tips.length]}</div>
      </div>
      <style>{`
        /* A farm animal's sheet (src/game/animalSprites.ts), drawn crisp; its
           size, walk row, frame count and speed come in as inline values. */
        .loading-walker {
          position: absolute;
          background-repeat: no-repeat;
          background-position-x: 0;
          image-rendering: pixelated;
          transition: left .5s ease-out;
          animation: loading-walk var(--walk-time) steps(var(--walk-steps)) infinite;
        }
        @keyframes loading-walk { from { background-position-x: 0; } to { background-position-x: var(--walk-end); } }
        .loading-line { animation: loading-line-in .35s ease-out; }
        @keyframes loading-line-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) {
          .loading-walker, .loading-line { animation: none; }
        }
      `}</style>
    </div>
  );
}
