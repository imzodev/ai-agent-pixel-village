// The numbers that say how the launch is going (GET /api/admin/stats):
// signups, daily players, visitors, retention, the tutorial funnel and
// sharing, from our own tables (src/lib/track.ts and the game's own data).

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { TUTORIAL_DONE, TUTORIAL_SKIPPED, TUTORIAL_STEPS } from "@/lib/tutorial";
import type { DayCount, StatsView } from "@/types/analytics";

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

  return {
    generatedAt: new Date(now).toISOString(),
    totals: { players: num(totals?.players), signups30d: num(totals?.signups30d), activeToday: num(totals?.active_today), active7d: num(totals?.active7d) },
    signups: series(signups, 30, now),
    daily: series(daily, 30, now),
    visitors: series(visitors, 30, now),
    retention,
    tutorial,
    sharing: { momentsCreated: sum("moment_created"), shareClicks, profileViews: sum("profile_view"), momentViews: sum("moment_view"), signupsFromShares: num(fromShares?.n) },
  };
}
