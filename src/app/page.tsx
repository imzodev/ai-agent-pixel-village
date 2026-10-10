import { randomLoadingWalker } from "@/lib/loadingWalkers";
import GamePage from "./GamePage";

export const dynamic = "force-dynamic"; // a new farm animal on the loading screen every visit

export default function Home() {
  return <GamePage walker={randomLoadingWalker()} />;
}
