// The day's Whistle course as a 1200×630 picture: the /whistle preview on X,
// and for "today's course" posts. ?day=YYYY-MM-DD (today or earlier; a course
// isn't shown before its day).
import { whistleCoursePng } from "@/lib/cards/whistleCard";
import { whistleDay } from "@/lib/whistle/course";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const today = whistleDay(Date.now());
  const asked = new URL(req.url).searchParams.get("day") ?? today;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(asked) && asked <= today ? asked : today;
  const png = await whistleCoursePng(day);
  const cache = day < today ? "public, max-age=31536000, immutable" : "public, max-age=3600";
  return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": cache } });
}
