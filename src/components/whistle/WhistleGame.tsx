"use client";
// Whistle, playable: the how-to, a run (WhistleField), then the result. The
// run's taps go to the server, which replays them and keeps its own score
// (/api/whistle/submit). Not signed in? A name makes a "Play now" character
// first (/api/auth/quick), so every score has a villager behind it.
// Used by /whistle and the sheepfold in the village plaza.

import { useCallback, useState } from "react";
import Link from "next/link";
import WhistleField from "./WhistleField";
import { SHEEP_COUNT } from "@/lib/whistle/rules";
import { scoreOf } from "@/lib/whistle/sim";
import { xShareUrl } from "@/lib/moments";
import { trackShare } from "@/lib/shareTracking";
import type { Course, RunResult, WhistleHud, WhistleInput, WhistleStart, WhistleSubmitResult } from "@/types/whistle";

const fmt = (n: number) => n.toLocaleString("en-US");

export function whistleShareText(number: number, r: Pick<RunResult, "penned" | "lost" | "score">, rank?: number): string {
  const lost = r.lost ? `, ${r.lost} lost to wolves` : "";
  return `🐑 Whistle #${number}: ${r.penned}/${SHEEP_COUNT} sheep penned${lost}. ${fmt(r.score)} pts${rank ? `, #${rank} today` : ""}. Think you can herd better?`;
}

export default function WhistleGame({ today, signedIn, onSubmitted, compact = false }: {
  /** Today's course, from the server (a run plays the course its start returns). */
  today: Course;
  /** Whether there's a character to submit as (else a name is asked for). */
  signedIn: boolean;
  onSubmitted?: (r: WhistleSubmitResult) => void;
  /** In the village's window: no "Enter the village" link. */
  compact?: boolean;
}) {
  const [phase, setPhase] = useState<"intro" | "starting" | "playing" | "done">("intro");
  const [run, setRun] = useState<{ course: Course; token: string; key: number } | null>(null);
  const [hud, setHud] = useState<WhistleHud | null>(null);
  const [result, setResult] = useState<{ inputs: WhistleInput[]; r: RunResult } | null>(null);
  const [sent, setSent] = useState<WhistleSubmitResult | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sound, setSound] = useState(true);
  const [haveCharacter, setHaveCharacter] = useState(signedIn);

  const course = run?.course ?? today;

  const start = async () => {
    setPhase("starting"); setErr(""); setResult(null); setSent(null);
    const r = await fetch("/api/whistle/start", { method: "POST" }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as (Partial<WhistleStart> & { error?: string }) | null;
    if (!r?.ok || !j?.token || !j.course) { setErr(j?.error ?? "Couldn't start. Try again?"); setPhase("intro"); return; }
    setRun({ course: j.course, token: j.token, key: (run?.key ?? 0) + 1 });
    setPhase("playing");
  };

  const submit = useCallback(async (inputs: WhistleInput[], token: string) => {
    setBusy(true); setErr("");
    const r = await fetch("/api/whistle/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, inputs }) }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as (WhistleSubmitResult & { error?: string }) | null;
    setBusy(false);
    if (!r?.ok || !j || j.error) { setErr(j?.error ?? "Couldn't send your run in."); return; }
    setSent(j);
    onSubmitted?.(j);
  }, [onSubmitted]);

  const onDone = useCallback((inputs: WhistleInput[], st: Parameters<typeof scoreOf>[0]) => {
    setResult({ inputs, r: scoreOf(st) });
    setPhase("done");
    if (haveCharacter && run) void submit(inputs, run.token);
  }, [haveCharacter, run, submit]);

  const joinAndSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!result || !run) return;
    setBusy(true); setErr("");
    const r = await fetch("/api/auth/quick", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) }).catch(() => null);
    const j = (await r?.json().catch(() => ({}))) as { error?: string };
    if (!r?.ok) { setBusy(false); setErr(j.error ?? "Couldn't make your villager, try again."); return; }
    setHaveCharacter(true);
    await submit(result.inputs, run.token);
  };

  const shareUrl = sent ? `${location.origin}${sent.shareUrl}?ref=whistle` : "";
  const shareX = () => {
    if (!sent) return;
    trackShare("x", "whistle");
    window.open(xShareUrl(whistleShareText(course.number, sent, sent.rank), shareUrl), "_blank", "noopener");
  };
  const copy = async () => {
    if (!sent) return;
    trackShare("copy", "whistle");
    await navigator.clipboard?.writeText(`${whistleShareText(course.number, sent, sent.rank)} ${shareUrl}`).catch(() => undefined);
    setErr("Copied!");
  };

  const pips = hud ? [0, 1, 2].map((i) => Math.max(0, Math.min(1, hud.breath - i))) : [1, 1, 1];
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-2 select-none">
      <div className="flex w-full max-w-[430px] items-center justify-between gap-2 rounded-lg bg-black/40 px-3 py-1.5 font-mono text-[13px] text-amber-50">
        <span className="font-bold text-amber-300">🐑 Whistle #{course.number}</span>
        <span title="Penned">🏠 {hud?.penned ?? 0}/{SHEEP_COUNT}</span>
        <span title="Taken by wolves" className={hud?.lost ? "text-red-300" : ""}>🐺 {hud?.lost ?? 0}</span>
        <span title="Time left">⏱ {hud?.seconds ?? 75}s</span>
        <span title="Breath: a whistle each" className="flex gap-0.5">
          {pips.map((p, i) => <span key={i} className="inline-block h-2.5 w-2.5 rounded-full border border-amber-200" style={{ background: `rgba(255,209,102,${p})` }} />)}
        </span>
        <button onClick={() => setSound(!sound)} aria-label={sound ? "Sound off" : "Sound on"} className="text-[14px]">{sound ? "🔊" : "🔇"}</button>
      </div>

      <div className="relative min-h-0 w-full flex-1">
        <WhistleField course={course} mode="play" running={phase === "playing"} sound={sound} onHud={setHud} onDone={onDone} runKey={run?.key ?? 0} />

        {(phase === "intro" || phase === "starting") && (
          <Overlay>
            <div className="text-2xl font-bold text-amber-300">🐑 Whistle #{course.number}</div>
            <p className="mt-2 text-[15px] leading-snug">You&apos;re the shepherd&apos;s whistle. <b>Tap</b> and the sound pushes the flock <b>away</b> from that spot.</p>
            <ul className="mt-2 space-y-1 text-left text-[14px] leading-snug text-amber-50/90">
              <li>🏠 Herd all {SHEEP_COUNT} sheep into the pen through its gate.</li>
              <li>🐺 Wolves take stragglers: keep the flock together. A whistle scares wolves too.</li>
              <li>💨 Three whistles of breath, refilling. Spamming does nothing.</li>
              <li>📅 A new course every day; the week&apos;s best win prizes in the village.</li>
            </ul>
            <button onClick={() => void start()} disabled={phase === "starting"} className="pixel-btn mt-4 bg-emerald-600 px-6 py-2 text-lg font-bold text-white hover:bg-emerald-500 disabled:opacity-60">
              {phase === "starting" ? "…" : "▶ Start"}
            </button>
            {err && <div className="mt-2 text-sm text-red-300">{err}</div>}
          </Overlay>
        )}

        {phase === "done" && result && (
          <Overlay>
            <div className="text-sm uppercase tracking-wide text-amber-200/80">Whistle #{course.number}</div>
            <div className="text-5xl font-bold text-amber-300">{fmt(sent?.score ?? result.r.score)}</div>
            <div className="mt-1 text-[15px]">{result.r.penned}/{SHEEP_COUNT} penned{result.r.lost ? ` · ${result.r.lost} taken by wolves` : ""}{result.r.perfect ? " · ✨ perfect!" : ""}</div>
            {sent && <div className="mt-1 text-[15px] text-emerald-300">#{sent.rank} today · your best {fmt(sent.best)}</div>}
            {!haveCharacter && !sent && (
              <form onSubmit={joinAndSubmit} className="mt-3 w-full">
                <div className="mb-1 text-[14px]">Put your score on the board: pick a name.</div>
                <div className="flex gap-2">
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Your name" aria-label="Your name"
                    className="min-w-0 flex-1 rounded border-2 border-amber-800/40 bg-white px-2 py-2 text-sm text-stone-800" />
                  <button type="submit" disabled={busy} className="pixel-btn shrink-0 bg-emerald-600 px-3 py-2 font-bold text-white disabled:opacity-60">{busy ? "…" : "Submit"}</button>
                </div>
                <div className="mt-1 text-[11px] text-amber-50/70">This makes you a villager in thegroove too. Free, no email.</div>
              </form>
            )}
            {haveCharacter && !sent && busy && <div className="mt-2 text-sm">Checking your run…</div>}
            {sent && (
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <button onClick={shareX} className="pixel-btn bg-black px-4 py-2 font-bold text-white">Share on 𝕏</button>
                <button onClick={() => void copy()} className="pixel-btn bg-stone-600 px-3 py-2 font-bold text-white">Copy link</button>
              </div>
            )}
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button onClick={() => void start()} className="pixel-btn bg-emerald-600 px-4 py-2 font-bold text-white">↻ Play again</button>
              {!compact && <Link href="/" className="pixel-btn bg-amber-600 px-4 py-2 font-bold text-white">Enter the village →</Link>}
            </div>
            {err && <div className={`mt-2 text-sm ${err === "Copied!" ? "text-emerald-300" : "text-red-300"}`}>{err}</div>}
          </Overlay>
        )}
      </div>
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-3">
      <div className="flex max-w-[360px] flex-col items-center rounded-xl border-2 border-amber-700/60 bg-[#1a2238]/92 p-5 text-center text-amber-50 shadow-2xl">
        {children}
      </div>
    </div>
  );
}
