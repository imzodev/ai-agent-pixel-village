// The buildings in the world now (src/lib/buildingsServer.ts): the manifest
// without the homestead lots whose rows haven't opened. The client stamps
// these; when rows open, the WS server says `lotsOpened` and it asks again.

import { getBuildingsManifest } from "@/lib/buildingsServer";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getBuildingsManifest(), { headers: { "cache-control": "no-store" } });
}
