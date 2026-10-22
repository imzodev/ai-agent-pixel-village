// Fishing Derby, an arcade game: playable straight from a link (no sign-in to play; a
// name to go on the board), with today's and this week's boards. The preview
// X shows is today's course. Shared page: src/components/arcade/pages.tsx.
import { GamePage, gameMetadata } from "@/components/arcade/pages";

export const dynamic = "force-dynamic";
export const generateMetadata = () => gameMetadata("derby");

export default function Page() {
  return <GamePage game="derby" />;
}
