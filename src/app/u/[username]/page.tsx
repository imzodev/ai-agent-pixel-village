// A player's public profile: their card (also the preview X shows), what
// they've won and found, who in the world calls them a friend, and their
// latest moments. src/lib/profileServer.ts gathers it; the card is og.png.

import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { loadProfile } from "@/lib/profileServer";
import { xShareUrl } from "@/lib/moments";
import { headers } from "next/headers";
import { track } from "@/lib/track";
import { isBot } from "@/lib/bots";
import RefMark from "@/components/RefMark";
import ShareLink from "@/components/ShareLink";

export const dynamic = "force-dynamic";

const PITCH = "Play free in your browser: a pixel village where the NPCs remember you.";
const LOT_NAMES: Record<string, string> = { home: "a cottage", land: "farm land", ranch: "a ranch", vineyard: "a vineyard", orchard: "an orchard", workshop: "a workshop" };
const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  const p = await loadProfile(username);
  if (!p) return { title: "thegroove" };
  const title = `${p.look.name}${p.look.title ? `, ${p.look.title}` : ""} · level ${p.look.level}`;
  const image = { url: `/u/${username}/og.png`, width: 1200, height: 630, type: "image/png", alt: `${p.look.name} on thegroove` };
  const url = `/u/${username}`;
  return {
    title: `${title} · thegroove`,
    description: PITCH,
    alternates: { canonical: url },
    openGraph: { type: "profile", siteName: "thegroove", locale: "en_US", url, title, description: PITCH, images: [image] },
    twitter: { card: "summary_large_image", title, description: PITCH, images: [{ url: image.url, alt: image.alt }] },
  };
}

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const p = await loadProfile(username);
  if (!p) {
    return (
      <main className="min-h-dvh bg-[#141c3c] px-4 py-6 text-white">
        <div className="mx-auto max-w-3xl">
          <Link href="/" className="text-lg font-extrabold text-amber-300">🌳 thegroove</Link>
          <div className="mt-4 text-xl font-bold">No such player: @{username}</div>
          <Link href="/" className="mt-4 inline-block rounded-xl bg-emerald-500 px-5 py-3 font-extrabold">▶ Play free</Link>
        </div>
      </main>
    );
  }
  if (!isBot((await headers()).get("user-agent"))) track("profile_view");
  const url = `${BASE}/u/${username}`;
  const shareText = `${p.look.name}${p.look.title ? `, ${p.look.title},` : ""} on thegroove: level ${p.look.level}${p.trophies.length ? `, ${p.trophies.length} trophies` : ""}`;
  const days = (d: Date) => d.toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" });
  return (
    <main className="min-h-dvh bg-[#141c3c] px-4 py-6 text-white">
      <RefMark from={`u:${username}`} />
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-lg font-extrabold text-amber-300">🌳 thegroove</Link>
        {/* eslint-disable-next-line @next/next/no-img-element -- a generated PNG, already sized */}
        <img src={`/u/${username}/og.png`} width={1200} height={630} alt={`${p.look.name} on thegroove`} className="mt-4 w-full rounded-xl border-4 border-amber-300/80 shadow-2xl" style={{ imageRendering: "pixelated" }} />
        <h1 className="mt-5 text-3xl font-extrabold">{p.look.name}</h1>
        <p className="text-stone-300">{p.look.title ? `${p.look.title} · ` : ""}level {p.look.level} · @{username} · playing since {days(p.memberSince)}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <ShareLink href={xShareUrl(shareText, url)} via="x" page="profile" className="rounded-xl bg-black px-5 py-3 font-extrabold ring-2 ring-white/30 hover:bg-stone-800">Share on 𝕏</ShareLink>
          <Link href="/" className="rounded-xl bg-emerald-500 px-5 py-3 font-extrabold shadow-lg hover:brightness-110">▶ Play free</Link>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Level" v={String(p.look.level)} />
          <Stat label="Collection" v={`${p.collectionPct}%`} />
          <Stat label="Achievements" v={`${p.achievements.filter((a) => a.done).length}/${p.achievements.length}`} />
          <Stat label="Trophies" v={String(p.trophies.length)} />
        </div>

        <Section title="🏅 Achievements">
          <ul className="grid gap-2 sm:grid-cols-2">
            {[...p.achievements].sort((a, b) => Number(b.done) - Number(a.done)).map((a) => (
              <li key={a.name} className={`rounded-lg p-2 ${a.done ? "bg-emerald-400/15 ring-1 ring-emerald-300/60" : "bg-white/5 opacity-50"}`}>
                <div className="font-bold">{a.done ? "🏅 " : "🔒 "}{a.name}</div>
                <div className="text-sm text-stone-300">{a.description}</div>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="📖 Collection book">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Fish caught" v={String(p.book.fishCaught)} />
            <Stat label="Creatures beaten" v={String(p.book.creaturesBeaten)} />
            <Stat label="Crops harvested" v={String(p.book.cropsHarvested)} />
            <Stat label="Towns visited" v={`${p.book.towns.visited}/${p.book.towns.total}`} />
            <Stat label="Folk met" v={`${p.book.folk.met}/${p.book.folk.total}`} />
            <Stat label="Chests dug" v={`${p.book.chestsDug}${p.book.lostCache ? " 👑" : ""}`} />
          </div>
          {p.book.rareFish.length > 0 && (
            <div className="mt-3">
              <div className="text-sm font-bold text-stone-300">Rarest catches</div>
              <div className="mt-1 flex flex-wrap gap-2">{p.book.rareFish.map((f) => <Chip key={f.name} gold={f.note === "legendary"}>{f.icon} {f.name} <span className="text-stone-400">· {f.note}</span></Chip>)}</div>
            </div>
          )}
          {p.book.toughest.length > 0 && (
            <div className="mt-3">
              <div className="text-sm font-bold text-stone-300">Toughest foes beaten</div>
              <div className="mt-1 flex flex-wrap gap-2">{p.book.toughest.map((f) => <Chip key={f.name} gold={f.note === "boss"}>{f.icon} {f.name} <span className="text-stone-400">· {f.note}</span></Chip>)}</div>
            </div>
          )}
          <ul className="mt-4 space-y-2">
            {p.bookPages.map((g) => (
              <li key={g.name}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-bold">{g.icon} {g.name}{g.claimed ? <span className="ml-1 text-emerald-300">✓ complete</span> : null}</span>
                  <span className="text-stone-400">{g.found}/{g.total}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded bg-white/10"><div className={`h-full ${g.claimed ? "bg-emerald-400" : "bg-amber-300"}`} style={{ width: `${g.total ? (100 * g.found) / g.total : 0}%` }} /></div>
              </li>
            ))}
          </ul>
        </Section>

        {p.trophies.length > 0 && (
          <Section title="🏆 Trophy shelf">
            <ul className="grid gap-2 sm:grid-cols-2">
              {p.trophies.map((t) => (
                <li key={t.itemKey} className={`rounded-lg p-2 ${t.legendary ? "bg-amber-400/20 ring-1 ring-amber-300" : "bg-white/5"}`}>
                  <div className="font-bold">{t.legendary ? "⚔️ " : ""}{t.name}</div>
                  <div className="text-sm text-stone-400">{t.from}</div>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {p.dearFriends.length > 0 && (
          <Section title="💛 Called a dear friend by">
            <p>{p.dearFriends.map((f) => `${f.name} (${f.role})`).join(", ")}. The villagers here remember who helps them.</p>
          </Section>
        )}

        {(p.reputation.length > 0 || p.lots.length > 0 || p.relicSets.length > 0) && (
          <Section title="🌍 Around the world">
            <ul className="space-y-1 text-stone-200">
              {p.reputation.map((r) => <li key={r.town}>{r.tier} in {r.town}</li>)}
              {p.lots.length > 0 && <li>Owns {p.lots.map((k) => LOT_NAMES[k] ?? k).join(", ")}{p.farmLevel ? ` · farm level ${p.farmLevel}` : ""}</li>}
              {p.relicSets.map((s) => <li key={s}>Found every one of the {s}</li>)}
            </ul>
          </Section>
        )}

        {p.moments.length > 0 && (
          <Section title="✨ Moments">
            <div className="grid gap-3 sm:grid-cols-2">
              {p.moments.map((m) => (
                <Link key={m.id} href={`/m/${m.id}`} className="block overflow-hidden rounded-lg border-2 border-white/10 hover:border-amber-300">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a generated card */}
                  <img src={`/m/${m.id}/card.png`} width={1200} height={630} alt={m.data.headline} className="w-full" style={{ imageRendering: "pixelated" }} />
                  <div className="p-2 text-sm font-bold">{m.data.headline}</div>
                </Link>
              ))}
            </div>
          </Section>
        )}

        <p className="mt-8 text-sm text-stone-400">Last seen {days(p.lastSeen)}. {PITCH}</p>
      </div>
    </main>
  );
}

function Stat({ label, v }: { label: string; v: string }) {
  return <div className="rounded-lg bg-white/5 p-3 text-center"><div className="text-[11px] uppercase tracking-wider text-stone-400">{label}</div><div className="text-2xl font-extrabold">{v}</div></div>;
}

function Chip({ gold, children }: { gold?: boolean; children: ReactNode }) {
  return <span className={`rounded-full px-3 py-1 text-sm font-bold ${gold ? "bg-amber-400/20 ring-1 ring-amber-300" : "bg-white/10"}`}>{children}</span>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="mt-6"><h2 className="mb-2 text-lg font-extrabold text-amber-300">{title}</h2>{children}</section>;
}
