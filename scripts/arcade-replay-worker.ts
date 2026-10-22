// A background replay worker (started by src/lib/arcade/replayPool.ts): replays
// the arcade runs it's sent (src/lib/arcade/games.ts) and sends back the
// result, so the game server never runs a few thousand physics ticks itself.
import { ARCADE_GAMES } from "../src/lib/arcade/games";
import type { ArcadeReplayDone, ArcadeReplayJob } from "../src/types/arcade";

process.on("message", (job: ArcadeReplayJob) => {
  const reply = (r: ArcadeReplayDone) => process.send?.(r);
  try {
    reply({ id: job.id, result: ARCADE_GAMES[job.game].replay(job.course, job.inputs) });
  } catch (err) {
    reply({ id: job.id, result: null, error: err instanceof Error ? err.message : String(err) });
  }
});
// The server went away: so do we.
process.on("disconnect", () => process.exit(0));
