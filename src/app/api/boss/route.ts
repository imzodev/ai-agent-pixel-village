// When the Old Rootking is (or next will be) awake, for the HUD's countdown.
// The schedule is a server setting (BOSS_SCHEDULE, default Saturday 18:00 UTC).
import { BOSS_WINDOW_MS, nextBossWindow } from "@/lib/progression";

export const dynamic = "force-dynamic";

export async function GET() {
  const w = nextBossWindow(Date.now(), process.env.BOSS_SCHEDULE ?? "6@18", process.env.BOSS_FORCE === "1");
  return Response.json({ active: w.active, at: w.at, endsAt: w.at + BOSS_WINDOW_MS });
}
