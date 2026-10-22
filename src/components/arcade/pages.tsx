// The arcade's pages, server side, shared by every game's routes (/whistle,
// /haul and their replays and pictures): metadata for previews on X, the game
// page, a run's replay page, and the two pictures. Each route file just names its game.

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentCharacter } from "@/lib/auth";
import { arcadeView, runById } from "@/lib/arcadeServer";
import { ARCADE_GAMES, courseNumber } from "@/lib/arcade/games";
import { arcadeDay } from "@/lib/arcade/days";
import { arcadeCoursePng, arcadeRunPng } from "@/lib/cards/arcadeCard";
import RefMark from "@/components/RefMark";
import ArcadePage from "./ArcadePage";
import ArcadeReplay from "./ArcadeReplay";
import type { ArcadeGameKey } from "@/types/arcade";

const PITCH = "A new course every day, free in your browser, inside thegroove: a pixel village where the AI villagers keep shops, trade and remember you.";

function meta(title: string, description: string, url: string, image: string, alt: string, type: "website" | "article" = "website"): Metadata {
  const img = { url: image, width: 1200, height: 630, type: "image/png", alt };
  return {
    title: `${title} · thegroove`, description, alternates: { canonical: url },
    openGraph: { type, siteName: "thegroove", url, title, description, images: [img] },
    twitter: { card: "summary_large_image", title, description, images: [{ url: image, alt }] },
  };
}

export function gameMetadata(game: ArcadeGameKey): Metadata {
  const g = ARCADE_GAMES[game], day = arcadeDay(Date.now());
  return meta(`${g.name} #${courseNumber(game, day)}: ${g.tagline.toLowerCase()}`, `${g.tagline}. Prizes every week. ${PITCH}`, g.path, `${g.path}/course.png?day=${day}`, `Today's ${g.name} course`);
}

export async function GamePage({ game }: { game: ArcadeGameKey }) {
  const me = await getCurrentCharacter().catch(() => null);
  const view = await arcadeView(game, me ? { id: me.id, name: me.name } : null);
  return <ArcadePage game={game} initial={view} />;
}

export async function replayMetadata(game: ArcadeGameKey, id: string): Promise<Metadata> {
  const g = ARCADE_GAMES[game], run = await runById(game, id);
  if (!run) return { title: `${g.name} · thegroove` };
  const title = `${run.name}: ${run.score.toLocaleString("en-US")} pts in ${g.name} #${run.number}`;
  return meta(title, `${g.describe(run)}. ${g.tagline}. ${PITCH}`, `${g.path}/r/${run.id}`, `${g.path}/r/${run.id}/card.png`, title, "article");
}

export async function ReplayPage({ game, id }: { game: ArcadeGameKey; id: string }) {
  const g = ARCADE_GAMES[game], run = await runById(game, id);
  if (!run) notFound();
  return (
    <main className="min-h-dvh bg-[#141c3c] px-3 py-4 text-white">
      {run.username && <RefMark from={`u:${run.username}`} />}
      <div className="mx-auto flex max-w-3xl flex-col gap-4 md:flex-row md:items-start">
        <div className="flex w-full flex-col md:flex-1" style={{ height: "min(80dvh, 700px)", minHeight: 440 }}>
          <ArcadeReplay run={run} />
        </div>
        <div className="flex flex-col gap-3 md:w-72">
          <Link href="/" className="font-extrabold text-amber-300">🌳 thegroove</Link>
          <div>
            <div className="text-sm uppercase tracking-wide text-amber-200/80">{g.emoji} {g.name} #{run.number}</div>
            <h1 className="text-2xl font-extrabold">{run.name}</h1>
            <div className="text-4xl font-extrabold text-amber-300">{run.score.toLocaleString("en-US")} pts</div>
            <div className="text-stone-300">{g.describe(run)}</div>
          </div>
          <Link href={`${g.path}?ref=${game}`} className="rounded-xl bg-emerald-500 px-5 py-3 text-center text-lg font-extrabold text-white shadow-lg hover:brightness-110">{g.emoji} Beat it: play today&apos;s course</Link>
          <Link href="/play" className="text-center text-sm text-stone-300 underline">More games</Link>
          <p className="text-sm text-stone-400">{g.tagline}. {PITCH}</p>
        </div>
      </div>
    </main>
  );
}

/** GET /<game>/course.png?day=: today's or an earlier day's course (never one before its day). */
export async function coursePngResponse(game: ArcadeGameKey, req: Request): Promise<Response> {
  const today = arcadeDay(Date.now());
  const asked = new URL(req.url).searchParams.get("day") ?? today;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(asked) && asked <= today ? asked : today;
  const png = await arcadeCoursePng(game, day);
  const cache = day < today ? "public, max-age=31536000, immutable" : "public, max-age=3600";
  return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": cache } });
}

/** GET /<game>/r/<id>/card.png: a run never changes, so it's cached for good. */
export async function runCardResponse(game: ArcadeGameKey, id: string): Promise<Response> {
  const run = await runById(game, id);
  if (!run) return new Response("Not found", { status: 404 });
  const png = await arcadeRunPng(run);
  return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "public, max-age=31536000, immutable" } });
}
