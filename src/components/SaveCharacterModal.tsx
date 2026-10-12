"use client";
// Save a "Play now" character: pick a username and password, so it can be
// logged into anywhere (POST /api/auth/claim). Opened from the HUD nudge,
// the menu, and Sign out (which would otherwise lose the character).
import { useEffect, useState } from "react";

export default function SaveCharacterModal({ name, suggested, leaving, onClose, onSaved, onSignOut }: {
  name: string;
  /** The automatic username, offered as a starting point. */
  suggested: string;
  /** Opened from Sign out: warn, and offer to leave anyway. */
  leaving: boolean;
  onClose: () => void;
  onSaved: (username: string) => void;
  onSignOut: () => void;
}) {
  const [username, setUsername] = useState(suggested);
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/auth/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: username.trim().toLowerCase(), password }) }).catch(() => null);
    const j = (await res?.json().catch(() => ({}))) as { error?: string; username?: string } | undefined;
    setBusy(false);
    if (!res?.ok || !j?.username) { setErr(j?.error ?? "Couldn't save, please try again."); return; }
    onSaved(j.username);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Save your character" onClick={onClose} className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
      <form onClick={(e) => e.stopPropagation()} onSubmit={save} className="w-[min(94vw,400px)] pixel-panel p-4 text-amber-950 shadow-2xl">
        <div className="flex items-start">
          <div className="flex-1 text-lg font-bold text-amber-900">💾 Save {name}</div>
          <button type="button" onClick={onClose} className="-m-2 p-2 text-lg text-stone-400 hover:text-stone-700" aria-label="Close">✕</button>
        </div>
        <p className="mt-1 text-sm leading-snug">
          {leaving
            ? `${name} only lives in this browser for now. If you sign out without saving, you can't get back in.`
            : `Pick a username and password so you can play as ${name} on any device.`}
        </p>
        <label className="mt-3 block text-xs font-bold text-amber-900">Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" maxLength={24} required
            className="mt-1 w-full rounded border-2 border-amber-800/30 bg-white px-2 py-1.5 text-sm font-normal text-stone-800" />
        </label>
        <div className="mt-0.5 text-[11px] text-amber-900/70">Also your profile link: thegroove.fun/u/{username.trim().toLowerCase() || "…"}</div>
        <label className="mt-2 block text-xs font-bold text-amber-900">Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required placeholder="8 characters or more"
            className="mt-1 w-full rounded border-2 border-amber-800/30 bg-white px-2 py-1.5 text-sm font-normal text-stone-800" />
        </label>
        {err && <div className="mt-2 text-sm text-red-700">{err}</div>}
        <button type="submit" disabled={busy} className="pixel-btn mt-3 w-full bg-emerald-600 py-2 font-bold text-white hover:bg-emerald-500 disabled:opacity-60">{busy ? "Saving…" : "Save character"}</button>
        {leaving && <button type="button" onClick={onSignOut} className="mt-2 w-full text-center text-[12px] text-stone-500 underline hover:text-stone-800">Sign out anyway and lose {name}</button>}
      </form>
    </div>
  );
}
