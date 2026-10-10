"use client";
import dynamic from "next/dynamic";
import Hud from "@/components/Hud";
import LoadingScreen from "@/components/LoadingScreen";

// The loading screen covers the page until the world is ready, so the canvas
// needs no placeholder of its own.
const GameCanvas = dynamic(() => import("@/components/GameCanvas"), { ssr: false, loading: () => null });

/** The game page; `walker` is the farm animal walking the loading bar (picked by page.tsx). */
export default function GamePage({ walker }: { walker: string }) {
  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#6fae5f]">
      <GameCanvas />
      <Hud />
      <LoadingScreen walker={walker} />
    </main>
  );
}
