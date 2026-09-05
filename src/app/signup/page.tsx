"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Appearance } from "@/db/schema";
import { CLOTH_COLORS, HAIR_COLORS, HAIR_STYLES, SKIN_TONES, drawPreview } from "@/game/lpc";

const NAMES = ["Fennel", "Juniper", "Bramble", "Sorrel", "Tansy", "Rowan", "Clover", "Basil", "Hazel", "Pip"];

export default function SignupPage() {
  const [a, setA] = useState<Appearance>({ body: "female", skin: "#f1c9a5", hair: "bob", hairColor: "#5a3a1a", shirtColor: "#4a7c59", pantsColor: "#3a3a4a" });
  const [name, setName] = useState(NAMES[Math.floor(Math.random() * NAMES.length)]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef(0);
  const [dir, setDir] = useState<"down" | "left" | "right" | "up">("down");

  useEffect(() => {
    let alive = true;
    const t = setInterval(() => {
      frame.current = (frame.current + 1) % 9;
      if (canvas.current && alive) void drawPreview(canvas.current, a, dir, frame.current === 0 ? 1 : frame.current, 3);
    }, 110);
    return () => { alive = false; clearInterval(t); };
  }, [a, dir]);

  const randomize = () => setA({
    body: Math.random() < 0.5 ? "male" : "female",
    skin: SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)],
    hair: HAIR_STYLES[Math.floor(Math.random() * HAIR_STYLES.length)],
    hairColor: HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)],
    shirtColor: CLOTH_COLORS[Math.floor(Math.random() * CLOTH_COLORS.length)],
    pantsColor: CLOTH_COLORS[Math.floor(Math.random() * CLOTH_COLORS.length)],
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    const res = await fetch("/api/auth/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password, name, appearance: a }) });
    const j = await res.json();
    if (!res.ok) { setErr(j.error ?? "Something went wrong"); setBusy(false); return; }
    location.href = "/";
  };

  return (
    <main className="min-h-dvh bg-[#6fae5f] p-4 font-mono text-stone-800" style={{ backgroundImage: "radial-gradient(#7fbf6d 2px, transparent 2px)", backgroundSize: "16px 16px" }}>
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="inline-block rounded-lg border-2 border-amber-900/60 bg-amber-100 px-3 py-1 font-bold text-amber-900">🌳 thegrove</Link>
        <div className="mt-4 grid gap-4 md:grid-cols-[320px_1fr]">
          <div className="rounded-xl border-4 border-amber-900/70 bg-amber-50 p-4 shadow-xl">
            <div className="text-lg font-bold text-amber-900">Your villager</div>
            <div className="mt-2 flex items-center justify-center rounded-lg bg-[#a8d99a] p-2" style={{ backgroundImage: "linear-gradient(#9ccf8e 1px, transparent 1px), linear-gradient(90deg, #9ccf8e 1px, transparent 1px)", backgroundSize: "16px 16px" }}>
              <canvas ref={canvas} width={192} height={192} className="[image-rendering:pixelated]" />
            </div>
            <div className="mt-2 flex justify-center gap-1">{(["down", "left", "up", "right"] as const).map((d) => <button key={d} onClick={() => setDir(d)} className={`rounded px-2 py-0.5 text-[11px] ${dir === d ? "bg-amber-700 text-white" : "bg-stone-200"}`}>{d}</button>)}</div>
            <div className="mt-3 text-center text-xl font-bold text-amber-900">{name || "…"}</div>
            <button onClick={randomize} className="mt-3 w-full rounded-lg bg-violet-600 px-3 py-2 font-bold text-white hover:bg-violet-500">🎲 Surprise me</button>
            <p className="mt-3 text-[11px] text-stone-500">Sprites: Universal LPC Spritesheet (CC-BY-SA / OGA-BY). Layers composited live in your browser.</p>
          </div>
          <form onSubmit={submit} className="space-y-4 rounded-xl border-4 border-amber-900/70 bg-amber-50 p-4 shadow-xl">
            <Section title="Body">
              <div className="flex gap-2">{(["female", "male"] as const).map((b) => <Chip key={b} active={a.body === b} on={() => setA({ ...a, body: b })}>{b === "female" ? "Slender" : "Broad"}</Chip>)}</div>
            </Section>
            <Section title="Skin"><Swatches colors={SKIN_TONES} value={a.skin} on={(c) => setA({ ...a, skin: c })} /></Section>
            <Section title="Hair">
              <div className="flex flex-wrap gap-1.5">{HAIR_STYLES.map((h) => <Chip key={h} active={a.hair === h} on={() => setA({ ...a, hair: h })}>{h}</Chip>)}</div>
              <div className="mt-2"><Swatches colors={HAIR_COLORS} value={a.hairColor} on={(c) => setA({ ...a, hairColor: c })} /></div>
            </Section>
            <Section title="Shirt"><Swatches colors={CLOTH_COLORS} value={a.shirtColor} on={(c) => setA({ ...a, shirtColor: c })} /></Section>
            <Section title="Trousers"><Swatches colors={CLOTH_COLORS} value={a.pantsColor} on={(c) => setA({ ...a, pantsColor: c })} /></Section>
            <Section title="Name & account">
              <div className="grid gap-2 sm:grid-cols-3">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Character name" maxLength={24} className="rounded-lg border-2 border-amber-900/40 bg-white px-2 py-1.5" required />
                <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username (login)" className="rounded-lg border-2 border-amber-900/40 bg-white px-2 py-1.5" required autoComplete="username" />
                <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="password (6+)" className="rounded-lg border-2 border-amber-900/40 bg-white px-2 py-1.5" required autoComplete="new-password" />
              </div>
            </Section>
            {err && <div className="rounded-lg bg-red-100 px-3 py-2 text-red-800">{err}</div>}
            <div className="flex items-center gap-3">
              <button disabled={busy} className="rounded-lg bg-emerald-600 px-4 py-2 text-base font-bold text-white hover:bg-emerald-500 disabled:opacity-50">{busy ? "Packing your bag…" : "Enter the grove →"}</button>
              <span className="text-stone-500">Already a villager? <Link href="/" className="underline">Sign in on the map</Link></span>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-amber-800">{title}</div>{children}</div>;
}
function Chip({ children, active, on }: { children: React.ReactNode; active: boolean; on: () => void }) {
  return <button type="button" onClick={on} className={`rounded-lg border-2 px-2 py-1 ${active ? "border-amber-800 bg-amber-200 font-bold" : "border-transparent bg-white hover:bg-stone-100"}`}>{children}</button>;
}
function Swatches({ colors, value, on }: { colors: readonly string[]; value: string; on: (c: string) => void }) {
  return <div className="flex flex-wrap gap-1.5">{colors.map((c) => <button type="button" key={c} onClick={() => on(c)} className={`h-8 w-8 rounded-lg border-4 ${value === c ? "border-stone-900" : "border-white"}`} style={{ background: c }} aria-label={c} />)}</div>;
}
