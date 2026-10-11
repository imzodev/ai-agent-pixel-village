// A shared moment: its card big, what happened, and a way into the game.
// This is where a link posted on X lands; its preview is the card itself.
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { momentById } from "@/lib/momentsServer";

export const dynamic = "force-dynamic";

const PITCH = "Play free in your browser: a pixel village where the NPCs remember you.";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const m = await momentById(id);
  if (!m) return { title: "thegroove" };
  const title = `${m.characterName}: ${m.data.headline}`;
  const image = { url: `/m/${m.id}/card.png`, width: 1200, height: 630, type: "image/png", alt: `${title}, on thegroove` };
  const url = `/m/${m.id}`;
  return {
    title: `${title} · thegroove`,
    description: `${m.data.sub}. ${PITCH}`,
    alternates: { canonical: url },
    openGraph: { type: "article", siteName: "thegroove", locale: "en_US", url, title, description: `${m.data.sub}. ${PITCH}`, images: [image] },
    twitter: { card: "summary_large_image", title, description: `${m.data.sub}. ${PITCH}`, images: [{ url: image.url, alt: image.alt }] },
  };
}

export default async function MomentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await momentById(id);
  if (!m) notFound();
  return (
    <main className="min-h-dvh bg-[#141c3c] px-4 py-6 text-white">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-lg font-extrabold text-amber-300">🌳 thegroove</Link>
        {/* eslint-disable-next-line @next/next/no-img-element -- a generated PNG, already sized */}
        <img src={`/m/${m.id}/card.png`} width={1200} height={630} alt={`${m.characterName}: ${m.data.headline}`} className="mt-4 w-full rounded-xl border-4 border-amber-300/80 shadow-2xl" style={{ imageRendering: "pixelated" }} />
        <h1 className="mt-5 text-2xl font-extrabold">{m.characterName}: {m.data.headline}</h1>
        <p className="mt-1 text-stone-300">{m.data.sub}{m.data.extra ? ` · ${m.data.extra}` : ""} · {m.createdAt.toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" })}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/" className="rounded-xl bg-emerald-500 px-5 py-3 text-lg font-extrabold text-white shadow-lg hover:brightness-110">▶ Play free</Link>
          {m.username && <Link href={`/u/${m.username}`} className="rounded-xl bg-white/10 px-5 py-3 text-lg font-bold text-white hover:bg-white/20">See {m.characterName}&apos;s profile</Link>}
        </div>
        <p className="mt-6 text-sm text-stone-400">{PITCH} Farm, build a homestead, explore twenty towns and face the lair bosses, with friends or on your own.</p>
      </div>
    </main>
  );
}
