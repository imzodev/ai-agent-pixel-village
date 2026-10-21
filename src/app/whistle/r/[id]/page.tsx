// A shared Whistle run: it plays back exactly as it went (the stored taps,
// replayed), with the score and a way to try today's course. Where a link
// posted on X lands; its preview is the run's card.
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { runById } from "@/lib/whistleServer";
import { SHEEP_COUNT } from "@/lib/whistle/rules";
import RefMark from "@/components/RefMark";
import WhistleReplay from "@/components/whistle/WhistleReplay";

export const dynamic = "force-dynamic";

const PITCH = "Whistle: tap to herd 30 sheep past the wolves. A new course every day, free in your browser.";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const run = await runById(id);
  if (!run) return { title: "Whistle · thegroove" };
  const title = `${run.name}: ${run.score.toLocaleString("en-US")} pts in Whistle #${run.number}`;
  const description = `${run.penned}/${SHEEP_COUNT} sheep penned${run.lost ? `, ${run.lost} taken by wolves` : ""}. ${PITCH}`;
  const image = { url: `/whistle/r/${run.id}/card.png`, width: 1200, height: 630, type: "image/png", alt: title };
  return {
    title: `${title} · thegroove`,
    description,
    alternates: { canonical: `/whistle/r/${run.id}` },
    openGraph: { type: "article", siteName: "thegroove", url: `/whistle/r/${run.id}`, title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [{ url: image.url, alt: title }] },
  };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await runById(id);
  if (!run) notFound();
  return (
    <main className="min-h-dvh bg-[#141c3c] px-3 py-4 text-white">
      {run.username && <RefMark from={`u:${run.username}`} />}
      <div className="mx-auto flex max-w-3xl flex-col gap-4 md:flex-row md:items-start">
        <div className="flex w-full flex-col md:flex-1" style={{ height: "min(80dvh, 700px)", minHeight: 440 }}>
          <WhistleReplay run={run} />
        </div>
        <div className="flex flex-col gap-3 md:w-72">
          <Link href="/" className="font-extrabold text-amber-300">🌳 thegroove</Link>
          <div>
            <div className="text-sm uppercase tracking-wide text-amber-200/80">Whistle #{run.number}</div>
            <h1 className="text-2xl font-extrabold">{run.name}</h1>
            <div className="text-4xl font-extrabold text-amber-300">{run.score.toLocaleString("en-US")} pts</div>
            <div className="text-stone-300">{run.penned}/{SHEEP_COUNT} sheep penned{run.lost ? ` · ${run.lost} taken by wolves` : ""}</div>
          </div>
          <Link href="/whistle?ref=whistle" className="rounded-xl bg-emerald-500 px-5 py-3 text-center text-lg font-extrabold text-white shadow-lg hover:brightness-110">🐑 Beat it: play today&apos;s course</Link>
          <p className="text-sm text-stone-400">{PITCH} It&apos;s a game inside thegroove, a pixel village where the AI villagers keep shops, trade and remember you.</p>
        </div>
      </div>
    </main>
  );
}
