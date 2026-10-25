// /play: the arcade, every minigame with today's course number, its leader and
// how many have played today. Each links to its own page.
import Link from "next/link";
import type { Metadata } from "next";
import { arcadeHub } from "@/lib/arcadeServer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The arcade · thegroove",
  description: "Quick skill games with a new course every day and prizes every week: herd the flock in Whistle, get the load to market in Harvest Haul, land the trophy in the Fishing Derby, keep up with Marigold's Oven, fill Della's honeycomb, steer Ansel's logs down the flume. Free, in your browser.",
  alternates: { canonical: "/play" },
};

export default async function Page() {
  const games = await arcadeHub();
  return (
    <main className="min-h-dvh bg-[#141c3c] px-4 py-6 text-white">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="font-extrabold text-amber-300">🌳 thegroove</Link>
        <h1 className="mt-3 text-3xl font-extrabold">🕹 The arcade</h1>
        <p className="mt-1 text-stone-300">A new course every day, the same for everyone. Your week is your best score each day added up; every Monday each game&apos;s top three win prizes in the village.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {games.map((g) => (
            <Link key={g.key} href={g.path} className="block rounded-2xl border-2 border-amber-700/50 bg-black/30 p-4 hover:bg-black/50">
              <div className="text-5xl">{g.emoji}</div>
              <div className="mt-2 text-xl font-extrabold text-amber-300">{g.name} #{g.number}</div>
              <div className="text-stone-200">{g.tagline}</div>
              <div className="mt-2 text-sm text-stone-400">
                {g.leader ? <>🥇 {g.leader.name} · {g.leader.score.toLocaleString("en-US")} pts · {g.players} played today</> : "Nobody's played today's course yet."}
              </div>
              <div className="mt-3 inline-block rounded-lg bg-emerald-600 px-4 py-2 font-bold">▶ Play</div>
            </Link>
          ))}
        </div>
        <p className="mt-6 text-sm text-stone-400">You can also find them in the village: the sheepfold in the plaza, and Della&apos;s cart by the Village Ranch. Prizes are in-game only.</p>
      </div>
    </main>
  );
}
