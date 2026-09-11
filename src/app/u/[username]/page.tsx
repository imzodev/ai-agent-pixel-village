// Public profile page. SSR with the character's basic info + meta tags
// pointing at the OG image route. The OG image route renders an LPC sprite
// baked into a PNG via sharp.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { characters, users } from "@/db/schema";
import Link from "next/link";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

async function loadProfile(username: string) {
  const [row] = await db
    .select({ user: users, character: characters })
    .from(users)
    .leftJoin(characters, eq(characters.userId, users.id))
    .where(eq(users.username, username))
    .limit(1);
  return row ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  const profile = await loadProfile(username);
  const name = profile?.character?.name ?? username;
  return {
    title: `${name} on thegrove`,
    description: profile?.character
      ? `${name} · lv ${profile.character.level} · ${profile.character.coins} coins · ${profile.character.gems} gems`
      : `thegrove — a persistent pixel-art village where humans and AI agents share one world.`,
    openGraph: {
      title: `${name} on thegrove`,
      description: profile?.character ? `Lv ${profile.character.level} · ${profile.character.coins}🪙 · ${profile.character.gems}💎` : "A village that keeps going without you.",
      images: [`/u/${username}/og.png`],
    },
  };
}

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const profile = await loadProfile(username);
  if (!profile || !profile.character) {
    return (
      <main className="min-h-dvh bg-stone-100 p-4 font-mono">
        <div className="mx-auto max-w-md rounded-xl border-4 border-amber-900/70 bg-amber-50 p-4">
          <Link href="/" className="font-bold text-amber-900">🌳 thegrove</Link>
          <div className="mt-2 text-lg font-bold">No such player: @{username}</div>
        </div>
      </main>
    );
  }
  const c = profile.character;
  return (
    <main className="min-h-dvh bg-stone-100 p-4 font-mono text-stone-800">
      <div className="mx-auto max-w-md rounded-xl border-4 border-amber-900/70 bg-amber-50 p-4">
        <Link href="/" className="font-bold text-amber-900">🌳 thegrove</Link>
        <div className="mt-2 flex items-center gap-3">
          <img src={`/u/${username}/og.png`} width={96} height={96} alt="" className="rounded-lg border-2 border-amber-900/40" />
          <div>
            <div className="text-xl font-bold">{c.name}</div>
            <div className="text-[12px] text-stone-500">@{username} · lv {c.level}</div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="coins" v={`${c.coins}🪙`} />
          <Stat label="gems" v={`${c.gems}💎`} />
          <Stat label="xp" v={`${c.xp}`} />
        </div>
        <div className="mt-3 text-[12px] text-stone-600">Last seen {new Date(c.lastSeenAt).toLocaleString()}</div>
        <Link href="/" className="mt-3 inline-block rounded-lg bg-emerald-500 px-3 py-1 font-bold text-white">Visit the grove →</Link>
      </div>
    </main>
  );
}

function Stat({ label, v }: { label: string; v: string }) {
  return <div className="rounded bg-white/70 p-2"><div className="text-[10px] uppercase text-stone-500">{label}</div><div className="text-lg font-bold">{v}</div></div>;
}
