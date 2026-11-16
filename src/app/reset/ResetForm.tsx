"use client";
// Set a new password from a reset link (POST /api/auth/reset), then into the game, signed in.
import { useState } from "react";
import Link from "next/link";

export default function ResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== again) { setErr("The two passwords don't match."); return; }
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/auth/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password }) }).catch(() => null);
    const j = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    if (!res?.ok) { setErr(j?.error ?? "Couldn't reach the village. Try again."); setBusy(false); return; }
    location.href = "/";
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#6fae5f] p-4 font-mono text-stone-800" style={{ backgroundImage: "radial-gradient(#7fbf6d 2px, transparent 2px)", backgroundSize: "16px 16px" }}>
      <form onSubmit={submit} className="w-[min(94vw,380px)] rounded-xl border-4 border-amber-900/70 bg-amber-50 p-4 shadow-xl">
        <Link href="/" className="inline-block rounded-lg border-2 border-amber-900/60 bg-amber-100 px-3 py-1 font-bold text-amber-900">🌳 thegroove</Link>
        <h1 className="mt-3 text-xl font-bold text-amber-900">Set a new password</h1>
        {!token ? (
          <p className="mt-2 text-sm">This link is missing its code. Open the link from the email again, or ask for a new one from Sign in → Forgot password.</p>
        ) : (
          <>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required placeholder="new password (8+)" autoComplete="new-password"
              className="mt-3 w-full rounded-lg border-2 border-amber-900/40 bg-white px-2 py-1.5" />
            <input type="password" value={again} onChange={(e) => setAgain(e.target.value)} minLength={8} required placeholder="the same again" autoComplete="new-password"
              className="mt-2 w-full rounded-lg border-2 border-amber-900/40 bg-white px-2 py-1.5" />
            {err && <div className="mt-2 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">{err}</div>}
            <button disabled={busy} className="mt-3 w-full rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-500 disabled:opacity-50">{busy ? "Saving…" : "Save and play"}</button>
            <p className="mt-2 text-[12px] text-stone-500">This signs you out everywhere else.</p>
          </>
        )}
      </form>
    </main>
  );
}
