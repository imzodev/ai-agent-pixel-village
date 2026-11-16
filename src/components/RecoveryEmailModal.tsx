"use client";
// Add a recovery email to a saved character (POST /api/auth/email), so a
// forgotten password can be reset (src/lib/passwordResetServer.ts).
import { useEffect, useState } from "react";
import { EMAIL_MAX } from "@/lib/passwordReset";

export default function RecoveryEmailModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [email, setEmail] = useState("");
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
    const res = await fetch("/api/auth/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) }).catch(() => null);
    const j = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    setBusy(false);
    if (!res?.ok) { setErr(j?.error ?? "Couldn't save, please try again."); return; }
    onSaved();
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Recovery email" onClick={onClose} className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
      <form onClick={(e) => e.stopPropagation()} onSubmit={save} className="w-[min(94vw,380px)] pixel-panel p-4 text-amber-950 shadow-2xl">
        <div className="flex items-start">
          <div className="flex-1 text-lg font-bold text-amber-900">📧 Recovery email</div>
          <button type="button" onClick={onClose} className="-m-2 p-2 text-lg text-stone-400 hover:text-stone-700" aria-label="Close">✕</button>
        </div>
        <p className="mt-1 text-sm leading-snug">If you ever forget your password, we&apos;ll send a reset link here. It&apos;s used for nothing else and never shown to anyone.</p>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" maxLength={EMAIL_MAX} placeholder="you@example.com"
          className="mt-3 w-full rounded border-2 border-amber-800/30 bg-white px-2 py-1.5 text-sm text-stone-800" />
        {err && <div className="mt-2 text-sm text-red-700">{err}</div>}
        <button type="submit" disabled={busy} className="pixel-btn mt-3 w-full bg-emerald-600 py-2 font-bold text-white hover:bg-emerald-500 disabled:opacity-60">{busy ? "Saving…" : "Save email"}</button>
      </form>
    </div>
  );
}
