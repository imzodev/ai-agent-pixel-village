// The day's Marigold's Oven course as a 1200×630 picture: the page's preview on X, and
// for "today's course" posts. ?day=YYYY-MM-DD (today or earlier).
import { coursePngResponse } from "@/components/arcade/pages";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return coursePngResponse("oven", req);
}
