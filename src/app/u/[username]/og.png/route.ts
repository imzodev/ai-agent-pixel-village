// A player's profile card (1200×630 PNG): the preview X shows for /u/<username>.
import { loadProfile } from "@/lib/profileServer";
import { profileCardPng } from "@/lib/cards/profileCard";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ username: string }> }) {
  const { username } = await ctx.params;
  const profile = await loadProfile(username);
  if (!profile) return new Response("Not found", { status: 404 });
  const png = await profileCardPng(profile);
  return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "public, max-age=300, s-maxage=300" } });
}
