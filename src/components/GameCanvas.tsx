"use client";
import { useEffect, useRef } from "react";

export default function GameCanvas() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let game: import("phaser").Game | null = null;
    let cancelled = false;
    (async () => {
      const mod = await import("phaser");
      const Phaser = (mod.default ?? mod) as typeof import("phaser");
      const { WorldScene } = await import("@/game/WorldScene");
      if (cancelled || !ref.current) return;
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
    })();
    return () => {
      cancelled = true;
      game?.destroy(true);
    };
  }, []);
  return <div ref={ref} className="absolute inset-0 h-full w-full" />;
}
