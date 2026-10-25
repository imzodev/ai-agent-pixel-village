// A Bjorn's Forge run's share card (1200×630 PNG), the preview X shows for its replay page.
import { runCardResponse } from "@/components/arcade/pages";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return runCardResponse("forge", (await ctx.params).id);
}
