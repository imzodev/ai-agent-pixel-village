// The arcade's games, as the frame sees them (src/lib/arcadeServer.ts, the
// pages, the replay worker): each game's course for a day, how to check and
// replay a run, its prizes and how its result reads. Pure: the browser and
// the server both use it. A new game = its pure modules + an entry here
// (+ its screen, art and spot; see AGENTS.md "Arcade").

import { courseFor as whistleCourse } from "../whistle/course";
import { cleanInputs as whistleClean, replay as whistleReplay } from "../whistle/sim";
import * as whistle from "../whistle/rules";
import { haulCourseFor } from "../haul/course";
import { cleanHaulInputs, replayHaul } from "../haul/sim";
import * as haul from "../haul/rules";
import { derbyCourseFor } from "../derby/course";
import { cleanDerbyInputs, replayDerby } from "../derby/sim";
import * as derby from "../derby/rules";
import { ovenCourseFor } from "../oven/course";
import { cleanOvenInputs, replayOven } from "../oven/sim";
import * as oven from "../oven/rules";
import { dayNumber } from "./days";
import type { ArcadeGameDef, ArcadeGameKey, ArcadeResult } from "@/types/arcade";
import type { Course as WhistleCourse, RunResult, WhistleInput } from "@/types/whistle";
import type { HaulCourse, HaulInput } from "@/types/haul";
import type { DerbyCourse, DerbyInput } from "@/types/derby";
import type { OvenCourse, OvenInput } from "@/types/oven";

const n = (d: Record<string, number>, k: string) => d[k] ?? 0;

/** Whistle's result in the arcade's shape. */
export const whistleResult = (r: RunResult): ArcadeResult => ({ score: r.score, ticks: r.ticks, perfect: r.perfect, detail: { penned: r.penned, lost: r.lost } });

export const ARCADE_GAMES: Record<ArcadeGameKey, ArcadeGameDef> = {
  whistle: {
    key: "whistle", name: "Whistle", emoji: "🐑", tagline: "Herd 30 sheep past the wolves", path: "/whistle",
    epoch: whistle.WHISTLE_EPOCH, tickMs: whistle.TICK_MS,
    prize: { gems: whistle.WEEKLY_PRIZE_GEMS, title: whistle.PRIZE_TITLE, cosmetic: whistle.PRIZE_COSMETIC },
    courseFor: (day, salt) => whistleCourse(day, salt),
    cleanInputs: (raw) => whistleClean(raw),
    replay: (course, inputs) => whistleResult(whistleReplay(course as WhistleCourse, inputs as WhistleInput[]).result),
    describe: ({ detail: d }) => `${n(d, "penned")}/${whistle.SHEEP_COUNT} sheep penned${n(d, "lost") ? `, ${n(d, "lost")} taken by wolves` : ""}`,
  },
  haul: {
    key: "haul", name: "Harvest Haul", emoji: "🛒", tagline: "Stack the cart, make it to market", path: "/haul",
    epoch: haul.HAUL_EPOCH, tickMs: haul.TICK_MS,
    prize: { gems: haul.WEEKLY_PRIZE_GEMS, title: haul.PRIZE_TITLE, cosmetic: haul.PRIZE_COSMETIC },
    courseFor: (day, salt) => haulCourseFor(day, salt),
    cleanInputs: (raw) => cleanHaulInputs(raw),
    replay: (course, inputs) => replayHaul(course as HaulCourse, inputs as HaulInput[]).result,
    describe: ({ detail: d }) => {
      const total = n(d, "delivered") + n(d, "broken") + n(d, "lost");
      return `${n(d, "delivered")}/${total} delivered whole${n(d, "broken") ? `, ${n(d, "broken")} broken` : ""}${n(d, "lost") ? `, ${n(d, "lost")} lost on the road` : ""}`;
    },
  },
  derby: {
    key: "derby", name: "Fishing Derby", emoji: "🎣", tagline: "Land the biggest catch at the day's pond", path: "/derby",
    epoch: derby.DERBY_EPOCH, tickMs: derby.TICK_MS,
    prize: { gems: derby.WEEKLY_PRIZE_GEMS, title: derby.PRIZE_TITLE, cosmetic: derby.PRIZE_COSMETIC },
    courseFor: (day, salt) => derbyCourseFor(day, salt),
    cleanInputs: (raw) => cleanDerbyInputs(raw),
    replay: (course, inputs) => replayDerby(course as DerbyCourse, inputs as DerbyInput[]).result,
    describe: ({ detail: d }) =>
      `${n(d, "caught")} fish, ${(n(d, "grams") / 1000).toFixed(1)} kg${n(d, "trophy") ? ", the trophy landed" : ""}${n(d, "lost") ? `, ${n(d, "lost")} got away` : ""}`,
  },
  oven: {
    key: "oven", name: "Marigold's Oven", emoji: "🍞", tagline: "Bake it golden, never burnt", path: "/oven",
    epoch: oven.OVEN_EPOCH, tickMs: oven.TICK_MS,
    prize: { gems: oven.WEEKLY_PRIZE_GEMS, title: oven.PRIZE_TITLE, cosmetic: oven.PRIZE_COSMETIC },
    courseFor: (day, salt) => ovenCourseFor(day, salt),
    cleanInputs: (raw) => cleanOvenInputs(raw),
    replay: (course, inputs) => replayOven(course as OvenCourse, inputs as OvenInput[]).result,
    describe: ({ detail: d }) =>
      `${n(d, "served")} served${n(d, "perfect") ? `, ${n(d, "perfect")} perfect` : ""}${n(d, "spoiled") ? `, ${n(d, "spoiled")} spoiled` : ""}${n(d, "left") ? `, ${n(d, "left")} walked out` : ""}`,
  },
};

export const ARCADE_KEYS = Object.keys(ARCADE_GAMES) as ArcadeGameKey[];
export const isArcadeGame = (k: unknown): k is ArcadeGameKey => typeof k === "string" && k in ARCADE_GAMES;

/** A game's course number for a day (#1 on its first day). */
export const courseNumber = (game: ArcadeGameKey, day: string): number => dayNumber(ARCADE_GAMES[game].epoch, day);
