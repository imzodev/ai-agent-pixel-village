"use client";
// "Play now": a character from just a name (or none), saved with a password
// later (POST /api/auth/quick). Used by the pitch card and the busy screen.
import { useState } from "react";
import Link from "next/link";
import { STORY_PROMPT_MAX } from "@/lib/story/rules";

export default function PlayNowForm({ onLogin }: { onLogin?: () => void }) {
  const [name, setName] = useState("");
  const [hero, setHero] = useState("");
  const [joining, setJoining] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const playNow = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoining(true);
    setErr(null);
    const res = await fetch("/api/auth/quick", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, hero }) }).catch(() => null);
    const j = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    if (!res?.ok) { setErr(j?.error ?? "Couldn't get you in, please try again."); setJoining(false); return; }
    location.href = "/";
  };

  return (
    <>
      <form onSubmit={playNow} className="mt-3">
        {/* One line about their hero: the AI villagers write a story around it (src/lib/story/). */}
        <input value={hero} onChange={(e) => setHero(e.target.value)} maxLength={STORY_PROMPT_MAX} placeholder="✨ Who is your hero? e.g. a retired pirate looking for a quiet life"
          aria-label="Describe your hero in one line, and the village writes your story"
          className="mb-2 w-full rounded border-2 border-violet-700/30 bg-white px-2 py-2 text-sm text-stone-800" />
        <div className="flex items-stretch gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Your name (optional)" aria-label="Your character's name"
            className="min-w-0 flex-1 rounded border-2 border-amber-800/30 bg-white px-2 py-2 text-sm text-stone-800" />
          <button type="submit" disabled={joining} className="pixel-btn shrink-0 bg-emerald-600 px-4 py-2 text-base font-bold text-white hover:bg-emerald-500 disabled:opacity-60">{joining ? "Joining…" : "▶ Play now"}</button>
        </div>
      </form>
      {err && <div className="mt-1 text-[12px] text-red-700">{err}</div>}
      <div className="mt-1.5 text-[12px] text-stone-600">
        Free, no email. The villagers are AI: tell them who you are and they&apos;ll write your story. <Link href="/signup" className="underline hover:text-stone-900">Pick your look and username first</Link>
        {" · "}
        {onLogin ? <button className="underline hover:text-stone-900" onClick={onLogin}>I have a character</button> : <Link href="/login" className="underline hover:text-stone-900">I have a character</Link>}
      </div>
    </>
  );
}
