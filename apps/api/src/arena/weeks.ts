// The Arena's weeks: Monday 00:00 UTC to the next Monday. Which challenge a city gets in a week is worked out, not
// stored anywhere in advance: the catalogue goes round, and each city starts at a different place in it, so two
// cities rarely have the same challenge in the same week.
import { CITIES } from "../chat/channels";
import { CATALOGUE, type CatalogueEntry } from "./catalogue";

export const DAY_MS = 86_400_000;
export const WEEK_MS = 7 * DAY_MS;
// Week 0: Monday 5 January 2026.
export const FIRST_WEEK = Date.UTC(2026, 0, 5);

/** The Monday 00:00 UTC that starts the week `at` is in. */
export function weekStartOf(at: Date): Date {
  const day = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
  // getUTCDay: Sunday 0, Monday 1 … so Monday is 0 days back, Sunday 6.
  const back = (new Date(day).getUTCDay() + 6) % 7;
  return new Date(day - back * DAY_MS);
}

/** "2026-10-12": the ISO date of a week's Monday, as weekStart reads everywhere. */
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** How many weeks after week 0 a Monday is (negative before it). */
export const weekIndex = (weekStart: Date) => Math.round((weekStart.getTime() - FIRST_WEEK) / WEEK_MS);

/**
 * A city's place in the rotation: its index in CITIES. A city only a house is in (not drawn on the map) gets a
 * steady number from its name, after the drawn ones.
 */
export function cityIndex(city: string): number {
  const i = CITIES.indexOf(city);
  if (i >= 0) return i;
  let hash = 0;
  for (const ch of city) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  return CITIES.length + hash;
}

/** The catalogue entry a city gets for the week starting on `weekStart`. */
export function entryFor(city: string, weekStart: Date): CatalogueEntry {
  const n = CATALOGUE.length;
  return CATALOGUE[(((weekIndex(weekStart) + cityIndex(city)) % n) + n) % n];
}

/** A challenge's id: one per city per week. */
export const challengeId = (city: string, weekStart: string) => `${city}:${weekStart}`;
