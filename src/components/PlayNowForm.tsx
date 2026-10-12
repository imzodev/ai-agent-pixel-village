"use client";
// "Play now": a character from just a name (or none), saved with a password
// later (POST /api/auth/quick). Used by the pitch card and the busy screen.
import { useState } from "react";
import Link from "next/link";

export default function PlayNowForm({ onLogin }: { onLogin?: () => void }) {
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const playNow = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoining(true);
    setErr(null);
    const res = await fetch("/api/auth/quick", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) }).catch(() => null);
    const j = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    if (!res?.ok) { setErr(j?.error ?? "Couldn't get you in, please try again."); setJoining(false); return; }
    location.href = "/";
  };

  return (
    <>
      <form onSubmit={playNow} className="mt-3 flex items-stretch gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Your name (optional)" aria-label="Your character's name"
          className="min-w-0 flex-1 rounded border-2 border-amber-800/30 bg-white px-2 py-2 text-sm text-stone-800" />
        <button type="submit" disabled={joining} className="pixel-btn shrink-0 bg-emerald-600 px-4 py-2 text-base font-bold text-white hover:bg-emerald-500 disabled:opacity-60">{joining ? "Joining…" : "▶ Play now"}</button>
      </form>
      {err && <div className="mt-1 text-[12px] text-red-700">{err}</div>}
      <div className="mt-1.5 text-[12px] text-stone-600">
        Free, no email. <Link href="/signup" className="underline hover:text-stone-900">Pick your look and username first</Link>
        {" · "}
        {onLogin ? <button className="underline hover:text-stone-900" onClick={onLogin}>I have a character</button> : <Link href="/login" className="underline hover:text-stone-900">I have a character</Link>}
      </div>
    </>
  );
}
