"use client";
import dynamic from "next/dynamic";
import Hud from "@/components/Hud";

const GameCanvas = dynamic(() => import("@/components/GameCanvas"), { ssr: false, loading: () => <div className="absolute inset-0 flex items-center justify-center bg-[#6fae5f] font-mono text-white">waking up the grove…</div> });

export default function Home() {
  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#6fae5f]">
      <GameCanvas />
      <Hud />
    </main>
  );
}
