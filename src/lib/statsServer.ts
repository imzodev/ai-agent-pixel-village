// The numbers that say how the launch is going (GET /api/admin/stats):
// signups, daily players, visitors, retention, the tutorial funnel,
// sharing and where people come from, from our own tables (src/lib/track.ts and the game's own data).

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { TUTORIAL_DONE, TUTORIAL_SKIPPED, TUTORIAL_STEPS } from "@/lib/tutorial";
import { BILLBOARD_SPOTS, BILLBOARD_TIERS } from "@/lib/billboards";
import { GEM_PACKS } from "@/types/cosmetic";
import { MEMBERSHIP_PLANS } from "@/lib/membership";
import type { BillboardTier } from "@/types/billboard";
import type { DayCount, RevenueView, SourceRow, StatsView, WhistleStats } from "@/types/analytics";

const DAY_MS = 86_400_000;
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
type Row = Record<string, unknown>;
const rows = async (q: ReturnType<typeof sql>): Promise<Row[]> => (await db.execute(q)).rows as Row[];
const num = (v: unknown) => Number(v ?? 0);

/** Fill in the days with nothing, oldest first. */
function series(list: Row[], days: number, now: number): DayCount[] {
  const by = new Map(list.map((r) => [String(r.day), num(r.n)]));
  return Array.from({ length: days }, (_, i) => { const day = dayOf(now - (days - 1 - i) * DAY_MS); return { day, n: by.get(day) ?? 0 }; });
}

export async function statsView(now = Date.now()): Promise<StatsView> {
  const today = dayOf(now), since30 = new Date(now - 30 * DAY_MS), week = dayOf(now - 6 * DAY_MS);
  const [totals] = await rows(sql`
    select (select count(*) from characters) as players,
           (select count(*) from characters where created_at >= ${since30}) as signups30d,
           (select count(*) from active_days where day = ${today}) as active_today,
           (select count(distinct character_id) from active_days where day >= ${week}) as active7d`);
  const signups = await rows(sql`select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as day, count(*) as n from characters where created_at >= ${since30} group by 1`);
  const daily = await rows(sql`select day, count(*) as n from active_days where day >= ${dayOf(now - 30 * DAY_MS)} group by day`);
  const visitors = await rows(sql`select to_char(at at time zone 'UTC', 'YYYY-MM-DD') as day, count(*) as n from events where kind = 'visitor' and at >= ${since30} group by 1`);

  // Retention: of each day's new players, how many played again 1 and 7 days later.
  const cohorts = await rows(sql`
    select to_char(c.created_at at time zone 'UTC', 'YYYY-MM-DD') as day, count(*) as cohort,
      count(*) filter (where exists (select 1 from active_days a where a.character_id = c.id and a.day = to_char((c.created_at at time zone 'UTC') + interval '1 day', 'YYYY-MM-DD'))) as d1,
      count(*) filter (where exists (select 1 from active_days a where a.character_id = c.id and a.day = to_char((c.created_at at time zone 'UTC') + interval '7 day', 'YYYY-MM-DD'))) as d7
    from characters c where c.created_at >= ${new Date(now - 21 * DAY_MS)} group by 1 order by 1`);
  const retention = cohorts.map((r) => {
    const day = String(r.day), age = Math.floor((Date.parse(today) - Date.parse(day)) / DAY_MS);
    return { day, cohort: num(r.cohort), d1: age >= 1 ? num(r.d1) : null, d7: age >= 7 ? num(r.d7) : null };
  });

  // The tutorial: of the last 30 days' players, how many got through each step.
  const steps = await rows(sql`select tutorial_step as step, count(*) as n from characters where created_at >= ${since30} group by 1`);
  const atStep = steps.map((r) => ({ step: num(r.step), n: num(r.n) }));
  const total = atStep.reduce((s, r) => s + r.n, 0);
  const skipped = atStep.filter((r) => r.step === TUTORIAL_SKIPPED).reduce((s, r) => s + r.n, 0);
  const reached = (i: number) => atStep.filter((r) => r.step !== TUTORIAL_SKIPPED && (r.step === TUTORIAL_DONE || r.step >= i)).reduce((s, r) => s + r.n, 0);
  const tutorial = [{ step: "Signed up", n: total }, ...TUTORIAL_STEPS.map((s, i) => ({ step: s.title, n: reached(i + 1) })), { step: "Skipped it", n: skipped }];

  const share = await rows(sql`
    select kind, coalesce(meta->>'via', '') as via, count(*) as n from events
    where at >= ${since30} and kind in ('moment_created', 'share_click', 'profile_view', 'moment_view') group by 1, 2`);
  const [fromShares] = await rows(sql`select count(*) as n from events where kind = 'signup' and at >= ${since30} and meta ? 'ref'`);
  const shareClicks: Record<string, number> = {};
  for (const r of share.filter((x) => x.kind === "share_click")) shareClicks[String(r.via)] = num(r.n);
  const sum = (kind: string) => share.filter((r) => r.kind === kind).reduce((s, r) => s + num(r.n), 0);

  // By source (src/lib/acquisition.ts): first visits, signups, and how many of those came back.
  const landings = await rows(sql`select coalesce(meta->>'src', 'direct') as src, count(*) as n, array_remove(array_agg(distinct nullif(meta->>'campaign', '')), null) as campaigns
    from events where kind = 'landing' and at >= ${since30} group by 1`);
  const bySignup = await rows(sql`
    select coalesce(e.meta->>'src', 'unknown') as src, count(*) as signups,
      count(*) filter (where e.at < ${new Date(now - DAY_MS)}) as d1_of,
      count(*) filter (where e.at < ${new Date(now - DAY_MS)} and exists (select 1 from active_days a where a.character_id = e.character_id and a.day = to_char((e.at at time zone 'UTC') + interval '1 day', 'YYYY-MM-DD'))) as d1,
      count(*) filter (where e.at < ${new Date(now - 7 * DAY_MS)}) as d7_of,
      count(*) filter (where e.at < ${new Date(now - 7 * DAY_MS)} and exists (select 1 from active_days a where a.character_id = e.character_id and a.day = to_char((e.at at time zone 'UTC') + interval '7 day', 'YYYY-MM-DD'))) as d7
    from events e where e.kind = 'signup' and e.at >= ${since30} group by 1`);
  const sources = new Map<string, SourceRow>();
  const row = (src: string) => sources.get(src) ?? sources.set(src, { src, landings: 0, signups: 0, d1: 0, d1Of: 0, d7: 0, d7Of: 0, campaigns: [] }).get(src)!;
  for (const r of landings) Object.assign(row(String(r.src)), { landings: num(r.n), campaigns: (r.campaigns as string[] | null) ?? [] });
  for (const r of bySignup) Object.assign(row(String(r.src)), { signups: num(r.signups), d1: num(r.d1), d1Of: num(r.d1_of), d7: num(r.d7), d7Of: num(r.d7_of) });
  const bySource = [...sources.values()].sort((a, b) => b.landings + b.signups - (a.landings + a.signups));

  return {
    generatedAt: new Date(now).toISOString(),
    totals: { players: num(totals?.players), signups30d: num(totals?.signups30d), activeToday: num(totals?.active_today), active7d: num(totals?.active7d) },
    signups: series(signups, 30, now),
    daily: series(daily, 30, now),
    visitors: series(visitors, 30, now),
    retention,
    tutorial,
    sharing: { momentsCreated: sum("moment_created"), shareClicks, profileViews: sum("profile_view"), momentViews: sum("moment_view"), signupsFromShares: num(fromShares?.n) },
    bySource,
    revenue: await revenueView(now),
    whistle: await whistleStats(now),
  };
}

/** Whistle: plays, runs sent in, who joined through it, and today's top runs. */
async function whistleStats(now: number): Promise<WhistleStats> {
  const since7 = new Date(now - 7 * DAY_MS), since30 = new Date(now - 30 * DAY_MS);
  const [t] = await rows(sql`
    select (select count(*) from events where kind = 'whistle_play' and at >= ${since7}) as plays,
           (select count(*) from whistle_runs where created_at >= ${since7}) as runs,
           (select count(distinct character_id) from whistle_runs where created_at >= ${since7}) as players,
           (select count(*) from characters c where c.created_at >= ${since30}
              and exists (select 1 from whistle_runs r where r.character_id = c.id and r.created_at < c.created_at + interval '15 minutes')) as joined,
           (select count(*) from events where kind = 'share_click' and meta->>'page' = 'whistle' and at >= ${since30}) as shares`);
  const daily = await rows(sql`select to_char(at at time zone 'UTC', 'YYYY-MM-DD') as day, count(*) as n from events where kind = 'whistle_play' and at >= ${since30} group by 1`);
  const top = await rows(sql`
    select r.id, c.name, r.score, r.penned, r.lost, jsonb_array_length(r.inputs) as whistles from whistle_runs r
    join characters c on c.id = r.character_id where r.day = ${dayOf(now)} and not r.hidden order by r.score desc limit 10`);
  return {
    plays7d: num(t?.plays), runs7d: num(t?.runs), players7d: num(t?.players), joined30d: num(t?.joined), shares30d: num(t?.shares),
    playsDaily: series(daily, 30, now),
    topToday: top.map((r) => ({ id: String(r.id), name: String(r.name), score: num(r.score), penned: num(r.penned), lost: num(r.lost), whistles: num(r.whistles) })),
  };
}

/** Recurring revenue (sponsors' rent, billboards) and the last 30 days' gem sales. */
async function revenueView(now: number): Promise<RevenueView> {
  const since30 = new Date(now - 30 * DAY_MS);
  const [sp] = await rows(sql`select count(*) as n, coalesce(sum(rent_cents), 0) as cents from sponsors where status = 'active'`);
  const bb = await rows(sql`
    select tier, status, count(*) as n, coalesce(sum(price_cents), 0) as cents,
      count(*) filter (where pending_image_path is not null or pending_title is not null or pending_link_url is not null) as changes,
      coalesce(sum(price_cents) filter (where cancel_at_period_end), 0) as cancelling
    from billboard_rentals where status in ('review', 'active') group by 1, 2`);
  const [leads] = await rows(sql`select coalesce(sum(fee_cents), 0) as cents from leads where created_at >= ${since30}`);
  // Members paid up now (the same test as memberNow, src/lib/membership.ts, without the grace days).
  const mem = await rows(sql`
    select plan, count(*) as n, count(*) filter (where cancel_at_period_end) as ending from memberships
    where status = 'active' and (current_period_end is null or current_period_end > now()) group by 1`);
  const [memMoves] = await rows(sql`
    select count(*) filter (where kind = 'membership_started') as joined, count(*) filter (where kind = 'membership_ended') as ended
    from events where at >= ${since30} and kind in ('membership_started', 'membership_ended')`);
  const memN = (plan: string) => num(mem.find((r) => r.plan === plan)?.n);
  const memMrr = memN("monthly") * MEMBERSHIP_PLANS.monthly.priceCents + Math.round((memN("yearly") * MEMBERSHIP_PLANS.yearly.priceCents) / 12);
  // Real purchases only: the dev sandbox logs credits without a Stripe session.
  const packs = await rows(sql`
    select pack_key, count(*) as n, count(distinct character_id) as payers from gem_transactions
    where source = 'purchase' and stripe_session_id is not null and created_at >= ${since30} group by 1`);
  const [payers] = await rows(sql`select count(distinct character_id) as n from gem_transactions where source = 'purchase' and stripe_session_id is not null and created_at >= ${since30}`);
  const gemDays = await rows(sql`
    select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as day, pack_key, count(*) as n from gem_transactions
    where source = 'purchase' and stripe_session_id is not null and created_at >= ${since30} group by 1, 2`);
  const [ads] = await rows(sql`select coalesce(sum(impressions), 0) as i, coalesce(sum(clicks), 0) as c from billboard_daily where day >= ${dayOf(now - 30 * DAY_MS)}`);
  const funnel = await rows(sql`
    select kind, count(distinct character_id) as n from events
    where at >= ${since30}
      and kind in ('shop_view', 'gem_checkout_started', 'gem_purchase_fulfilled', 'membership_checkout_started', 'membership_started')
      and (kind <> 'gem_purchase_fulfilled' or (meta->>'cents')::int > 0)
    group by 1`);
  const [players30] = await rows(sql`select count(distinct character_id) as n from active_days where day >= ${dayOf(now - 30 * DAY_MS)}`);
  const step = (kind: string) => num(funnel.find((r) => r.kind === kind)?.n);

  const price = (key: unknown) => GEM_PACKS.find((p) => p.key === key)?.priceCents ?? 0;
  const byPack = packs.map((r) => ({ packKey: String(r.pack_key), n: num(r.n), cents: num(r.n) * price(r.pack_key) }));
  const centsByDay = new Map<string, number>();
  for (const r of gemDays) centsByDay.set(String(r.day), (centsByDay.get(String(r.day)) ?? 0) + num(r.n) * price(r.pack_key));
  const bbCents = bb.reduce((s, r) => s + num(r.cents), 0);
  const tiers = Object.keys(BILLBOARD_TIERS) as BillboardTier[];
  return {
    mrrCents: memMrr + num(sp?.cents) + bbCents,
    cancellingCents: bb.reduce((s, r) => s + num(r.cancelling), 0), // sponsors end at once, so only billboards
    sponsors: { active: num(sp?.n), mrrCents: num(sp?.cents) },
    members: { active: memN("monthly") + memN("yearly"), monthly: memN("monthly"), yearly: memN("yearly"), mrrCents: memMrr, joined30d: num(memMoves?.joined), ended30d: num(memMoves?.ended) },
    billboards: {
      paid: bb.reduce((s, r) => s + num(r.n), 0),
      inReview: bb.filter((r) => r.status === "review").reduce((s, r) => s + num(r.n), 0),
      changesWaiting: bb.filter((r) => r.status === "active").reduce((s, r) => s + num(r.changes), 0),
      mrrCents: bbCents,
      byTier: tiers.map((tier) => ({
        tier, priceCents: BILLBOARD_TIERS[tier].priceCents,
        held: bb.filter((r) => r.tier === tier).reduce((s, r) => s + num(r.n), 0),
        total: BILLBOARD_SPOTS.filter((s) => s.tier === tier).length,
      })),
    },
    leadFees30dCents: num(leads?.cents),
    gems30d: { cents: byPack.reduce((s, p) => s + p.cents, 0), purchases: byPack.reduce((s, p) => s + p.n, 0), payers: num(payers?.n), byPack },
    gemDaily: series([...centsByDay].map(([day, n]) => ({ day, n })), 30, now),
    ads30d: { impressions: num(ads?.i), clicks: num(ads?.c) },
    funnel30d: [
      { step: "Played", players: num(players30?.n) },
      { step: "Opened the shop", players: step("shop_view") },
      { step: "Started a gem checkout", players: step("gem_checkout_started") },
      { step: "Paid for gems", players: step("gem_purchase_fulfilled") },
      { step: "Started a membership checkout", players: step("membership_checkout_started") },
      { step: "Became a member", players: step("membership_started") },
    ],
  };
}
