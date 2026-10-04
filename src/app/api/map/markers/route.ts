// Everything the map draws over its tiles: waystones (attuned or not),
// inns / the forge / the cave, your lots, region names, the map version.

import { handleApiError, requireCharacter } from "@/lib/auth";
import { mapMarkers } from "@/lib/worldAtlasServer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const me = await requireCharacter();
    return Response.json(await mapMarkers(me.id));
  } catch (e) {
    return handleApiError(e);
  }
}
