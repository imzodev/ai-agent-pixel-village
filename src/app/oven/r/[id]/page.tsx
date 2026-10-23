// A shared Marigold's Oven run: it plays back exactly as it went (the stored inputs,
// replayed), with the score and a way to try today's course. Where a link
// posted on X lands; its preview is the run's card.
import { ReplayPage, replayMetadata } from "@/components/arcade/pages";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return replayMetadata("oven", (await params).id);
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ReplayPage game="oven" id={(await params).id} />;
}
