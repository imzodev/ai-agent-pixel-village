"use client";
// How worn a tool is (src/lib/wear.ts): a small bar, green to red, and a word.
import { WEAR_MAX, wearLevel } from "@/lib/wear";

export default function WearBar({ wear }: { wear: number }) {
  const left = Math.max(0, WEAR_MAX - wear);
  const level = wearLevel(wear);
  const color = level === "dull" ? "bg-rose-600" : level === "worn" ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-1" title={`${Math.round(wear)}% worn`}>
      <div className="h-1.5 w-16 overflow-hidden rounded bg-stone-300"><div className={`h-full ${color}`} style={{ width: `${(100 * left) / WEAR_MAX}%` }} /></div>
      <span className={`text-[10px] ${level === "fine" ? "text-stone-500" : "font-bold text-rose-700"}`}>{level === "dull" ? "dull" : level === "worn" ? "worn" : `${Math.round(left)}%`}</span>
    </div>
  );
}
