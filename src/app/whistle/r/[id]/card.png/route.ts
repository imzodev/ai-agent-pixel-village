// A Whistle run's share card (1200×630 PNG), the preview X shows for its replay page.
import { runCardResponse } from "@/components/arcade/pages";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return runCardResponse("whistle", (await ctx.params).id);
}
