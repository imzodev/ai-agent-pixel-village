"use client";
// The story window (src/lib/story/): the story you're living, or a choice of
// one: tell the village who your hero is and it writes yours, or pick a
// hand-written tale. A finished story can be continued.
import { useCallback, useEffect, useState } from "react";
import { STORY_PROMPT_MAX } from "@/lib/story/rules";
import type { StoryState } from "@/types/story";

const EXAMPLES = [
  "A retired pirate who wants a quiet life but can't stop finding trouble",
  "A clumsy young wizard hiding from a famous family",
  "A baker's kid who dreams of becoming a legendary monster hunter",
  "A wandering bard collecting the grove's best stories",
];

async function call<T>(body?: unknown): Promise<T & { error?: string }> {
  try {
    const res = await fetch("/api/story", { method: body ? "POST" : "GET", headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    return await res.json();
  } catch {
    return { error: "Couldn't reach the village. Try again." } as T & { error?: string };
  }
}

export default function StoryPanel({ onMessage }: { onMessage: (text: string, kind: "good" | "bad" | "info") => void }) {
  const [state, setState] = useState<StoryState | null>(null);
  const [about, setAbout] = useState("");
  const [busy, setBusy] = useState<null | "write" | "pick" | "drop">(null);
  const [confirmDrop, setConfirmDrop] = useState(false);

  const load = useCallback(() => call<StoryState>().then((s) => { if (!s.error) setState(s); }), []);
  useEffect(() => {
    let alive = true;
    void call<StoryState>().then((s) => { if (alive && !s.error) setState(s); });
    return () => { alive = false; };
  }, []);
  // A story still being written (Play now's hero line): look again shortly.
  useEffect(() => {
    if (!state?.writing) return;
    const t = setTimeout(() => void load(), 4000);
    return () => clearTimeout(t);
  }, [state, load]);

  const run = async (kind: "write" | "pick" | "drop", body: Record<string, unknown>) => {
    setBusy(kind);
    const r = await call<{ message?: string }>(body);
    setBusy(null);
    setConfirmDrop(false);
    if (r.error) onMessage(r.error, "bad");
    else if (r.message) onMessage(r.message, kind === "drop" ? "info" : "good");
    await load();
  };

  if (!state) return <div className="p-3 text-center text-stone-500">Opening the storybook…</div>;
  const v = state.view;

  if (v) {
    return (
      <div className="space-y-2 text-amber-950">
        <div className="rounded-lg bg-violet-50 p-2 shadow">
          <div className="text-base font-bold text-violet-900">📜 {v.title}</div>
          <p className="mt-1 text-sm leading-snug">{v.premise}</p>
          <div className="mt-1 text-[11px] text-stone-500">{v.source === "ai" ? "Written for you by the village" : "A tale of the grove"} · chapter {v.step + 1} of {v.total}</div>
        </div>
        <div className="rounded-lg bg-white p-2 shadow">
          <div className="text-[11px] font-bold uppercase tracking-wide text-violet-800">Now</div>
          <div className="font-bold">{v.chapter.title}</div>
          <p className="text-sm leading-snug">{v.chapter.text}</p>
          <div className="mt-1 text-[11px] text-amber-900/80">🎁 {v.chapter.reward.coins} 🪙 · {v.chapter.reward.xp} XP</div>
        </div>
        <p className="text-[12px] text-stone-600">The people in your story know their part: talk to them and they&apos;ll play along.</p>
        {confirmDrop ? (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 p-2 text-sm">
            <span className="flex-1">Set this story aside for good?</span>
            <button className="pixel-btn bg-red-600 px-2 py-1 text-white" disabled={!!busy} onClick={() => void run("drop", { action: "abandon" })}>Yes</button>
            <button className="pixel-btn px-2 py-1" onClick={() => setConfirmDrop(false)}>No</button>
          </div>
        ) : (
          <button className="text-[12px] text-stone-500 underline hover:text-stone-800" onClick={() => setConfirmDrop(true)}>Set this story aside</button>
        )}
      </div>
    );
  }

  const out = state.startsLeft <= 0;
  return (
    <div className="space-y-3 text-amber-950">
      {state.writing || busy === "write" ? (
        <div className="rounded-lg bg-violet-50 p-3 text-center shadow">
          <div className="text-2xl">✍️</div>
          <div className="font-bold text-violet-900">The village is writing your story…</div>
          <div className="text-[12px] text-stone-600">This takes up to half a minute.</div>
        </div>
      ) : (
        <form className="rounded-lg bg-violet-50 p-2 shadow" onSubmit={(e) => { e.preventDefault(); if (about.trim().length >= 3) void run("write", { action: "write", about }); }}>
          <div className="font-bold text-violet-900">✨ Who is your hero?</div>
          <p className="text-[12px] leading-snug text-stone-600">One line is enough. The villagers will write a story around it, and play their parts in it.</p>
          <textarea value={about} onChange={(e) => setAbout(e.target.value)} maxLength={STORY_PROMPT_MAX} rows={3} placeholder={EXAMPLES[0]}
            className="mt-1 w-full resize-none rounded border-2 border-violet-900/30 bg-white px-2 py-1 text-sm outline-none focus:border-violet-700" />
          <div className="mt-1 flex flex-wrap gap-1">
            {EXAMPLES.slice(1).map((ex) => (
              <button key={ex} type="button" onClick={() => setAbout(ex)} className="rounded bg-white/70 px-1.5 py-0.5 text-[11px] text-violet-900 hover:bg-white">{ex}</button>
            ))}
          </div>
          <button type="submit" disabled={out || about.trim().length < 3 || !!busy} className="pixel-btn mt-2 w-full bg-violet-600 py-1.5 font-bold text-white hover:bg-violet-500 disabled:opacity-50">✨ Write my story</button>
        </form>
      )}
      {state.lastDone && !state.writing && (
        <button disabled={out || !!busy} onClick={() => void run("write", { action: "sequel", of: state.lastDone!.id, about })}
          className="pixel-btn w-full bg-amber-500 py-1.5 font-bold text-white hover:bg-amber-400 disabled:opacity-50">➜ Continue &ldquo;{state.lastDone.title}&rdquo;</button>
      )}
      <div className="text-[12px] text-stone-600">{out ? "That's all the new stories for today. Come back tomorrow." : `${state.startsLeft} new ${state.startsLeft === 1 ? "story" : "stories"} left today.`}</div>
      {state.picks.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-wide text-amber-900">Or pick a tale of the grove</div>
          {state.picks.map((p) => (
            <button key={p.key} disabled={out || !!busy} onClick={() => void run("pick", { action: "template", key: p.key })}
              className="flex w-full items-start gap-2 rounded-lg bg-white p-2 text-left shadow hover:bg-amber-50 disabled:opacity-50">
              <span className="text-2xl">{p.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{p.title}</span>
                <span className="block text-[12px] leading-snug text-stone-600">{p.blurb}</span>
                <span className="block text-[11px] text-stone-400">{p.chapters} chapters</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
