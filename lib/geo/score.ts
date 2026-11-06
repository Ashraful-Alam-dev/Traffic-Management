import { T } from "@/lib/config/thresholds";

// Trip score = max(0, 100 - penalties of non-cancelled events).
export function tripScore(events: { penalty: number; cancelled: boolean }[]): number {
  const total = events.filter((e) => !e.cancelled).reduce((s, e) => s + e.penalty, 0);
  return Math.max(0, 100 - total);
}

export type Rating =
  | { status: "OK"; rating: number; stars: number; tripsCounted: number }
  | { status: "NOT_ENOUGH_DATA"; rating: null; stars: null; tripsCounted: number };

// scores: completed-trip scores, newest first. Uses at most the last 30.
export function driverRating(scores: number[]): Rating {
  const used = scores.slice(0, T.RATING_WINDOW);
  if (used.length < T.RATING_MIN_TRIPS) {
    return { status: "NOT_ENOUGH_DATA", rating: null, stars: null, tripsCounted: used.length };
  }
  const rating = Math.round((used.reduce((s, x) => s + x, 0) / used.length) * 100) / 100;
  return { status: "OK", rating, stars: Math.round((rating / 20) * 10) / 10, tripsCounted: used.length };
}
