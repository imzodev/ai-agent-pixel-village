// Billboards for advertisers (src/lib/billboardServer.ts).
//   GET                         spots, prices, which are free
//   GET ?token[&session_id]     the advertiser's dashboard
//   POST (multipart)            rent a spot: spot, email, title, link, image[, sponsorToken]
//   PATCH (multipart, token)    a new poster / title / link (reviewed again), or cancel=1
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sponsors } from "@/db/schema";
import { BILLBOARD_TIERS, cleanAdLink } from "@/lib/billboards";
import { BillboardError, cancelAtPeriodEnd, createRental, dashboard, proposeChange, publicSpots } from "@/lib/billboardServer";
import { POSTER_MAX_BYTES, savePoster } from "@/lib/billboardPoster";
import { checkoutOpen, paymentsLive } from "@/lib/payments";
import { SlidingWindowLimiter, clientIp } from "@/lib/rateLimit";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

const uploadLimiter = new SlidingWindowLimiter({ max: 5, windowMs: 600_000 });
const MAX_BODY = POSTER_MAX_BYTES + 512 * 1024;

const baseUrl = (req: Request) => process.env.NEXT_PUBLIC_BASE_URL || new URL(req.url).origin;
const fail = (error: string, status = 400) => Response.json({ error }, { status });

function errorResponse(e: unknown): Response {
  if (e instanceof BillboardError) return fail(e.message, e.status);
  log.error({ err: e }, "billboards");
  return fail("Something went wrong. Please try again.", 500);
}

/** The multipart body, refused before reading when it's too big or too frequent. */
async function readForm(req: Request): Promise<FormData | Response> {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return fail("That image is too big (2 MB at most).", 413);
  const ip = clientIp(req);
  if (ip && !uploadLimiter.allow(ip)) return fail("Too many uploads. Try again in a few minutes.", 429);
  return req.formData().catch(() => fail("Couldn't read the form."));
}

const text = (f: FormData, k: string, max: number) => String(f.get(k) ?? "").trim().slice(0, max);
const cleanTitle = (t: string) => t.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 40);

async function posterFrom(f: FormData): Promise<{ file: string } | Response | null> {
  const img = f.get("image");
  if (!(img instanceof Blob) || img.size === 0) return null;
  const r = await savePoster(Buffer.from(await img.arrayBuffer()));
  return r.ok ? { file: r.file } : fail(r.error);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) return Response.json({ tiers: BILLBOARD_TIERS, spots: await publicSpots(), open: checkoutOpen(), paymentsConfigured: paymentsLive() });
    const d = await dashboard(token, url.searchParams.get("session_id"));
    return d ? Response.json(d) : fail("Unknown billboard.", 404);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    if (!checkoutOpen()) return fail("Billboards open soon.", 503);
    const f = await readForm(req);
    if (f instanceof Response) return f;
    const email = text(f, "email", 120);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Add an email we can reach you at.");
    const title = cleanTitle(text(f, "title", 60));
    if (!title) return fail("Give the billboard a short title (what players see when they look at it).");
    const link = cleanAdLink(text(f, "link", 300));
    if (!link.ok) return fail(link.error);
    let sponsorId: number | null = null;
    const sponsorToken = text(f, "sponsorToken", 80);
    if (sponsorToken) {
      const [sp] = await db.select({ id: sponsors.id }).from(sponsors).where(eq(sponsors.ownerToken, sponsorToken));
      if (!sp) return fail("That sponsor token isn't right.");
      sponsorId = sp.id;
    }
    const poster = await posterFrom(f);
    if (poster instanceof Response) return poster;
    if (!poster) return fail("Choose an image for the poster.");
    const r = await createRental({
      spotKey: text(f, "spot", 60), contactEmail: email, title, linkUrl: link.url, posterFile: poster.file, sponsorId, baseUrl: baseUrl(req),
    });
    return Response.json(r);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const f = await readForm(req);
    if (f instanceof Response) return f;
    const token = text(f, "token", 80);
    if (f.get("cancel") === "1") {
      await cancelAtPeriodEnd(token);
      return Response.json({ ok: true });
    }
    const change: { title?: string; linkUrl?: string; posterFile?: string } = {};
    const title = cleanTitle(text(f, "title", 60));
    if (title) change.title = title;
    const rawLink = text(f, "link", 300);
    if (rawLink) {
      const link = cleanAdLink(rawLink);
      if (!link.ok) return fail(link.error);
      change.linkUrl = link.url;
    }
    const poster = await posterFrom(f);
    if (poster instanceof Response) return poster;
    if (poster) change.posterFile = poster.file;
    if (!Object.keys(change).length) return fail("Nothing to change.");
    await proposeChange(token, change);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
