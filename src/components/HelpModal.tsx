"use client";
// How to play: the controls for this device (from the real bindings and touch
// buttons) and what there is to do. Opened from the menu (❓ Help).
import { useEffect } from "react";
import { inputRouter } from "@/game/input/router";
import { formatBinding, prettyKey } from "@/game/input/bindings";
import { TOUCH_KEYS } from "@/lib/keyHints";
import { TOUCH_BUTTONS, TOUCH_LABEL } from "@/game/input/touchButtons";
import type { CommandId } from "@/types/input";

const CONTROLS: readonly [CommandId | "move", string][] = [
  ["move", "Walk (hold Shift to run)"],
  ["player.interact", "Talk, pick up, use, enter"],
  ["player.attack", "Attack or chop (hold to keep going)"],
  ["player.dodge", "Dodge roll: a quick dash that avoids hits"],
  ["player.fish", "Cast and strike, facing deep water with a rod"],
  ["player.bike", "Get on or off your bike"],
  ["player.sell", "Sell to the villager you've selected"],
  ["player.buy", "Buy from them"],
  ["player.craft", "Craft with them"],
  ["player.orders", "Their weekly orders"],
  ["ui.bag", "Your bag"],
  ["ui.map", "The map"],
  ["ui.close", "Close a window"],
];

const TODO: readonly [string, string][] = [
  ["🌱", "Farm: claim a field south of the village (free), plant seeds, water and harvest. Gather wheat in the Common Field to the north."],
  ["🏡", "Homesteads south of the village: claim one free at its sign, buy the land next to it, and make each parcel a field, pasture, vineyard, orchard, barn or workshop."],
  ["🐄", "The Village Ranch, east of the village: everyone's. Visit the animals, pick radishes, carrots, tomatoes, wheat and pumpkins in its garden and honey from the hives (each comes back for you after a while), and pick up the hens' eggs."],
  ["🎣", "Fish: rods from Pip. Some fish only bite at night or in certain waters."],
  ["💬", "Talk to villagers: they remember you. Gold ! means a mission, ? means it's ready to turn in."],
  ["📜", "Bounties: every town has a board with paid jobs."],
  ["🧭", "Explore: 20 towns across the continent. Touch waystones to travel back fast. Further out is tougher (⚠️ danger levels)."],
  ["☠️", "Bosses: four lair beasts in the far lands, and the Old Rootking in the north woods once a week. Bring friends."],
  ["📖", "Your book: collect fish, crops, creatures, places and relics for coins and titles."],
];

export default function HelpModal({ touch, onClose }: { touch: boolean; onClose: () => void }) {
  useEffect(() => inputRouter.pushKeymap({
    label: "help",
    bindings: [{ keys: ["escape"], command: "ui.close" as const, mode: "press" as const }],
    handlers: [{ id: "ui.close" as const, scope: "ui" as const, run: () => { onClose(); } }],
  }), [onClose]);

  const keyFor = (c: CommandId | "move"): string => {
    if (c === "move") return touch ? "Stick" : "WASD / arrows";
    const k = formatBinding(c);
    if (!k) return "";
    const shown = prettyKey(k);
    if (!touch) return shown;
    // The touch control for this command: its own button, a shared one (B, A), or by key.
    return TOUCH_BUTTONS.find((b) => b.id === c)?.label ?? TOUCH_LABEL[c] ?? TOUCH_KEYS[shown] ?? "Buttons on the villager's card";
  };
  const whatFor = (c: CommandId | "move", what: string): string => (touch && c === "move" ? "Walk (push it all the way out to run)" : what);

  return (
    <div role="dialog" aria-modal="true" aria-label="How to play" onClick={onClose} className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[min(85dvh,calc(100dvh-1.5rem))] w-[min(94vw,560px)] flex-col pixel-panel p-4 shadow-2xl">
        <div className="flex shrink-0 items-start">
          <div className="flex-1 text-lg font-bold text-amber-900">❓ How to play</div>
          <button onClick={onClose} className="-m-2 p-2 text-lg text-stone-400 hover:text-stone-700" aria-label="Close">✕</button>
        </div>
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain text-sm text-stone-800">
          <h3 className="font-bold text-amber-900">Controls {touch ? "(touch)" : "(keyboard)"}</h3>
          <table className="mt-1 w-full">
            <tbody>
              {CONTROLS.filter(([c]) => keyFor(c)).map(([c, what]) => (
                <tr key={c} className="border-t border-amber-900/10">
                  <td className="w-32 py-1 pr-2 align-top"><span className="rounded bg-amber-100 px-1.5 py-0.5 font-bold">{keyFor(c)}</span></td>
                  <td className="py-1">{whatFor(c, what)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!touch && <p className="mt-1 text-[12px] text-stone-500">You can also click on things and people to select them, and click the ground to walk there.</p>}
          <h3 className="mt-4 font-bold text-amber-900">What to do</h3>
          <ul className="mt-1 space-y-1.5">{TODO.map(([icon, text]) => <li key={icon} className="flex gap-2"><span>{icon}</span><span>{text}</span></li>)}</ul>
          <h3 className="mt-4 font-bold text-amber-900">Good to know</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>The 🧭 Journey card (top left) always has a good next goal, with a reward.</li>
            <li>Knocked out? You wake in the village and lose a tenth of the coins you carry.</li>
            <li>Food heals: eat it from your bag. You also heal slowly over time.</li>
            <li>Daily quests (⚡) reset every day; keep a streak for bonuses.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
