// The buildings in the world (src/lib/buildingsServer.ts), for the client to stamp.

import { getBuildingsManifest } from "@/lib/buildingsServer";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getBuildingsManifest(), { headers: { "cache-control": "no-store" } });
}
