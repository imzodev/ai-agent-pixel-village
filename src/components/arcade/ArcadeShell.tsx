"use client";
// An arcade game, playable: the how-to, a run (the game's field), then the
// result. The run's inputs go to the server, which replays them and keeps its
// own score (/api/arcade/<game>/submit). Not signed in? A name makes a "Play
// now" character first (/api/auth/quick), so every score has a villager
// behind it. Used by the game pages and the arcade spots in the village.

import { useCallback, useState } from "react";
import Link from "next/link";
import { ARCADE_GAMES } from "@/lib/arcade/games";
import { xShareUrl } from "@/lib/moments";
import { trackShare } from "@/lib/shareTracking";
import { CLIENT_GAMES } from "./clientGames";
import type { ArcadeGameKey, ArcadeHud, ArcadeResult, ArcadeStart, ArcadeSubmitResult } from "@/types/arcade";

const fmt = (n: number) => n.toLocaleString("en-US");

/** What a player posts: the game and course, how it went, the score and rank. */
export function arcadeShareText(game: ArcadeGameKey, number: number, r: Pick<ArcadeResult, "detail" | "score">, rank?: number): string {
  const g = ARCADE_GAMES[game];
  return `${g.emoji} ${g.name} #${number}: ${g.describe(r)}. ${fmt(r.score)} pts${rank ? `, #${rank} today` : ""}. Think you can beat it?`;
}

export default function ArcadeShell({ game, today, number, signedIn, onSubmitted, compact = false }: {
  game: ArcadeGameKey;
  /** Today's course, from the server (a run plays the course its start returns). */
  today: unknown;
  number: number;
  /** Whether there's a character to submit as (else a name is asked for). */
  signedIn: boolean;
  onSubmitted?: (r: ArcadeSubmitResult) => void;
  /** In the village's window: no "Enter the village" link. */
  compact?: boolean;
}) {
  const g = ARCADE_GAMES[game], ui = CLIENT_GAMES[game];
  const [phase, setPhase] = useState<"intro" | "starting" | "playing" | "done">("intro");
  const [run, setRun] = useState<{ course: unknown; token: string; key: number } | null>(null);
  const [hud, setHud] = useState<ArcadeHud | null>(null);
  const [result, setResult] = useState<{ inputs: unknown[]; r: ArcadeResult } | null>(null);
  const [sent, setSent] = useState<ArcadeSubmitResult | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sound, setSound] = useState(true);
  const [haveCharacter, setHaveCharacter] = useState(signedIn);
  const course = run?.course ?? today;

  const start = async () => {
    setPhase("starting"); setErr(""); setResult(null); setSent(null); setHud(null);
    const r = await fetch(`/api/arcade/${game}/start`, { method: "POST" }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as (Partial<ArcadeStart> & { error?: string }) | null;
    if (!r?.ok || !j?.token || !j.course) { setErr(j?.error ?? "Couldn't start. Try again?"); setPhase("intro"); return; }
    setRun({ course: j.course, token: j.token, key: (run?.key ?? 0) + 1 });
    setPhase("playing");
  };

  const submit = useCallback(async (inputs: unknown[], token: string) => {
    setBusy(true); setErr("");
    const r = await fetch(`/api/arcade/${game}/submit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, inputs }) }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as (ArcadeSubmitResult & { error?: string }) | null;
    setBusy(false);
    if (!r?.ok || !j || j.error) { setErr(j?.error ?? "Couldn't send your run in."); return; }
    setSent(j);
    onSubmitted?.(j);
  }, [game, onSubmitted]);

  const onDone = useCallback((inputs: unknown[], r: ArcadeResult) => {
    // In development, the browser's own result (to check the server's replay agrees).
    if (process.env.NODE_ENV !== "production") (window as unknown as Record<string, unknown>).__arcadeLast = { result: r, inputs };
    setResult({ inputs, r });
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

  const shareUrl = sent ? `${location.origin}${sent.shareUrl}?ref=${game}` : "";
  const shareX = () => {
    if (!sent) return;
    trackShare("x", game);
    window.open(xShareUrl(arcadeShareText(game, number, sent, sent.rank), shareUrl), "_blank", "noopener");
  };
  const copy = async () => {
    if (!sent) return;
    trackShare("copy", game);
    await navigator.clipboard?.writeText(`${arcadeShareText(game, number, sent, sent.rank)} ${shareUrl}`).catch(() => undefined);
    setErr("Copied!");
  };

  const shown = sent ?? result?.r;
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-2 select-none">
      <div className="flex w-full max-w-[430px] items-center justify-between gap-2 rounded-lg bg-black/40 px-3 py-1.5 font-mono text-[13px] text-amber-50">
        <span className="font-bold text-amber-300">{g.emoji} {g.name} #{number}</span>
        {hud?.phase && <span className="hidden text-amber-100/80 sm:inline">{hud.phase}</span>}
        {(hud?.chips ?? []).map((c) => <span key={c.title} title={c.title} className={c.warn ? "text-red-300" : ""}>{c.icon} {c.text}</span>)}
        {hud?.seconds != null && <span title="Time left">⏱ {hud.seconds}s</span>}
        {hud?.pips && (
          <span title="Breath" className="flex gap-0.5">
            {hud.pips.map((p, i) => <span key={i} className="inline-block h-2.5 w-2.5 rounded-full border border-amber-200" style={{ background: `rgba(255,209,102,${p})` }} />)}
          </span>
        )}
        <button onClick={() => setSound(!sound)} aria-label={sound ? "Sound off" : "Sound on"} className="text-[14px]">{sound ? "🔊" : "🔇"}</button>
      </div>

      <div className="relative min-h-0 w-full flex-1">
        <ui.Field course={course} mode="play" running={phase === "playing"} sound={sound} onHud={setHud} onDone={onDone} runKey={run?.key ?? 0} />

        {(phase === "intro" || phase === "starting") && (
          <Overlay>
            <div className="text-2xl font-bold text-amber-300">{g.emoji} {g.name} #{number}</div>
            <p className="mt-2 text-[15px] leading-snug">{ui.pitch}</p>
            <ul className="mt-2 space-y-1 text-left text-[14px] leading-snug text-amber-50/90">
              {ui.howTo.map(([icon, text]) => <li key={text}>{icon} {text}</li>)}
            </ul>
            <button onClick={() => void start()} disabled={phase === "starting"} className="pixel-btn mt-4 bg-emerald-600 px-6 py-2 text-lg font-bold text-white hover:bg-emerald-500 disabled:opacity-60">
              {phase === "starting" ? "…" : "▶ Start"}
            </button>
            {err && <div className="mt-2 text-sm text-red-300">{err}</div>}
          </Overlay>
        )}

        {phase === "done" && result && shown && (
          <Overlay>
            <div className="text-sm uppercase tracking-wide text-amber-200/80">{g.name} #{number}</div>
            <div className="text-5xl font-bold text-amber-300">{fmt(shown.score)}</div>
            <div className="mt-1 text-[15px]">{g.describe(shown)}{shown.perfect ? " · ✨ perfect!" : ""}</div>
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
