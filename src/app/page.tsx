import { randomLoadingWalker } from "@/lib/loadingWalkers";
import { getCurrentUser } from "@/lib/auth";
import TractionBadge from "@/components/TractionBadge";
import GamePage from "./GamePage";

export const dynamic = "force-dynamic"; // a new farm animal on the loading screen every visit

export default async function Home() {
  // The Proof of Traction badge is for visitors only, never over the game.
  const signedIn = !!(await getCurrentUser());
  return (
    <>
      <GamePage walker={randomLoadingWalker()} />
      {!signedIn && <TractionBadge />}
    </>
  );
}
