"use client";
import { useEffect, useRef } from "react";
import { inputRouter } from "@/game/input/router";
import { installDomKeyboard } from "@/game/input/domKeyboard";
import { bus } from "@/game/bus";

export default function GameCanvas() {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const disposers = useRef<Array<() => void>>([]);

  useEffect(() => {
    disposers.current = [];
    let game: import("phaser").Game | null = null;
    let input: { destroy(): void } | null = null;
    let cancelled = false;
    (async () => {
      const mod = await import("phaser");
      const Phaser = (mod.default ?? mod) as typeof import("phaser");
      const { WorldScene } = await import("@/game/WorldScene");
      if (cancelled || !ref.current || !inputRef.current) return;

      // Only show the joystick + buttons on coarse pointers (touch), and
      // only to players: a logged-out visitor has nobody to move.
      const isTouch = window.matchMedia("(pointer: coarse)").matches;
      inputRef.current.style.display = "none";
      disposers.current.push(bus.on("snapshot", (s) => {
        if (inputRef.current) inputRef.current.style.display = isTouch && s.me ? "block" : "none";
      }));

      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: ref.current,
        backgroundColor: "#6fae5f",
        pixelArt: true,
        roundPixels: true,
        scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
        scene: [WorldScene],
        input: { activePointers: 2 },
        // 120 Hz phones would otherwise draw twice as often for no gain in a pixel-art game.
        fps: { limit: 60 },
        render: { antialias: false },
      });

      // Keyboard is installed on every device (the touch fallback used to
      // provide B/Y/M only on touch — now they're real desktop shortcuts).
      disposers.current.push(installDomKeyboard(inputRouter, window));

      if (isTouch) {
        const { createInputSource } = await import("@/game/InputSource");
        const src = createInputSource({
          router: inputRouter,
          container: inputRef.current,
        });
        input = src;
      }
    })();
    return () => {
      cancelled = true;
      input?.destroy();
      for (const d of disposers.current) d();
      disposers.current = [];
      game?.destroy(true);
    };
  }, []);
  return (
    <div className="absolute inset-0 h-full w-screen overflow-hidden" style={{ backgroundColor: "#6fae5f" }}>
      <div ref={ref} className="absolute inset-0" />
      <div
        ref={inputRef}
        className="grove-input"
        style={{
          position: "absolute",
          inset: 0,
          // Above every HUD window (they go up to z 60): on a phone the stick
          // and the buttons, B to close above all, must always be reachable.
          zIndex: 70,
          pointerEvents: "none",
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
        }}
      />
      <style jsx global>{`
        .grove-input .grove-action-btn {
          pointer-events: auto;
          width: 52px;
          height: 52px;
          border-radius: 26px;
          border: 2px solid rgba(255, 255, 255, 0.55);
          background: rgba(20, 28, 50, 0.55);
          color: white;
          font-family: var(--font-ui), system-ui, sans-serif;
          font-size: 18px;
          font-weight: 700;
          /* No backdrop blur: over a canvas that changes every frame, phones
             redo the blur constantly. */
          touch-action: none;
        }
        .grove-input .grove-action-btn:active {
          background: rgba(255, 200, 80, 0.5);
        }
        /* Arrow pad (left thumb): arrows on a 3×3 cross, with an invisible
           16px margin that also takes touches, so a thumb that just misses
           an arrow still steers that way (the offsets keep the arrows put). */
        .grove-input .grove-dpad {
          position: absolute;
          left: 0;
          bottom: 2px;
          padding: 16px;
          display: grid;
          grid-template-columns: repeat(3, 42px);
          grid-template-rows: repeat(3, 42px);
          gap: 2px;
          pointer-events: auto;
          touch-action: none;
          user-select: none;
          -webkit-user-select: none;
        }
        .grove-input .grove-dpad-arrow {
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid rgba(255, 255, 255, 0.55);
          background: rgba(20, 28, 50, 0.55);
          color: white;
          font-size: 20px;
          touch-action: none;
        }
        .grove-input .grove-dpad-arrow {
          border-radius: 12px;
        }
        .grove-input .grove-dpad-arrow.active {
          background: rgba(255, 200, 80, 0.6);
          border-color: rgba(255, 230, 160, 0.9);
        }
        /* Pushed all the way out: running. The lit arrow glows hotter. */
        .grove-input .grove-dpad.running .grove-dpad-arrow.active {
          background: rgba(255, 150, 60, 0.75);
          border-color: rgba(255, 220, 140, 1);
          box-shadow: 0 0 12px rgba(255, 170, 70, 0.8);
        }
        /* A, the main button: bigger, warmer. */
        .grove-input .grove-action-btn.grove-big {
          width: 68px;
          height: 68px;
          border-radius: 34px;
          font-size: 24px;
          background: rgba(40, 110, 70, 0.6);
        }
        /* B held: a ring fills while the bike long-press charges. */
        .grove-input .grove-action-btn.charging {
          background: conic-gradient(rgba(255, 210, 90, 0.75) var(--fill, 0%), rgba(20, 28, 50, 0.55) 0);
          animation: grove-charge 450ms linear forwards;
        }
        @property --fill { syntax: "<percentage>"; inherits: false; initial-value: 0%; }
        @keyframes grove-charge { to { --fill: 100%; } }
        .grove-input .grove-btn-badge {
          position: absolute;
          right: -4px;
          bottom: -4px;
          font-size: 13px;
          line-height: 1;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
