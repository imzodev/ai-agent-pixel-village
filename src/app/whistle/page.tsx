// Whistle: the herding minigame, playable straight from a link (no sign-in
// to play; a name to go on the board). Today's and this week's boards beside
// it. The preview X shows is today's course (/whistle/course.png).
import type { Metadata } from "next";
import { getCurrentCharacter } from "@/lib/auth";
import { whistleView } from "@/lib/whistleServer";
import { whistleDay, whistleNumber } from "@/lib/whistle/course";
import WhistlePage from "@/components/whistle/WhistlePage";

export const dynamic = "force-dynamic";

const DESCRIPTION = "You're the shepherd's whistle: tap, and the sound pushes the flock away. Herd 30 sheep past the wolves into the pen. A new course every day, prizes every week. Free, in your browser.";

export async function generateMetadata(): Promise<Metadata> {
  const day = whistleDay(Date.now());
  const title = `Whistle #${whistleNumber(day)}: herd the flock · thegroove`;
  const image = { url: `/whistle/course.png?day=${day}`, width: 1200, height: 630, type: "image/png", alt: "Today's Whistle course" };
  return {
    title,
    description: DESCRIPTION,
    alternates: { canonical: "/whistle" },
    openGraph: { type: "website", siteName: "thegroove", url: "/whistle", title, description: DESCRIPTION, images: [image] },
    twitter: { card: "summary_large_image", title, description: DESCRIPTION, images: [{ url: image.url, alt: image.alt }] },
  };
}

export default async function Page() {
  const me = await getCurrentCharacter().catch(() => null);
  const view = await whistleView(me ? { id: me.id, name: me.name } : null);
  return <WhistlePage initial={view} />;
}
