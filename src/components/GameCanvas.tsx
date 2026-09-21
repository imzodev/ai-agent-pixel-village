"use client";
import { useEffect, useRef } from "react";
import { inputRouter } from "@/game/input/router";
import { installDomKeyboard } from "@/game/input/domKeyboard";

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

      // Only show the joystick + buttons on coarse pointers (touch).
      const isTouch = window.matchMedia("(pointer: coarse)").matches;
      inputRef.current.style.display = isTouch ? "block" : "none";

      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: ref.current,
        backgroundColor: "#6fae5f",
        pixelArt: true,
        roundPixels: true,
        scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
        scene: [WorldScene],
        input: { activePointers: 2 },
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
          width: 56px;
          height: 56px;
          border-radius: 28px;
          border: 2px solid rgba(255, 255, 255, 0.55);
          background: rgba(20, 28, 50, 0.45);
          color: white;
          font-family: monospace;
          font-size: 18px;
          font-weight: 700;
          backdrop-filter: blur(2px);
          touch-action: none;
        }
        .grove-input .grove-action-btn:active {
          background: rgba(255, 200, 80, 0.5);
        }
        .grove-input .nipple {
          pointer-events: auto;
        }
      `}</style>
    </div>
  );
}
