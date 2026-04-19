/**
 * Pure interval-math utilities over half-open intervals [start, end).
 *
 * All functions here are deterministic, have no I/O, and treat Date values
 * as opaque timestamps (UTC under the hood). Callers are responsible for
 * whatever timezone-aware math they need before/after calling these.
 */
import type { Interval } from "@/types/schedule";

export function durationMinutes(i: Interval): number {
  return Math.max(0, Math.round((i.end.getTime() - i.start.getTime()) / 60_000));
}

/**
 * Intersection of two intervals, or null if they don't overlap.
 * Touching intervals ([0,5) and [5,10)) do NOT overlap.
 */
export function intersect(a: Interval, b: Interval): Interval | null {
  const start = new Date(Math.max(a.start.getTime(), b.start.getTime()));
  const end = new Date(Math.min(a.end.getTime(), b.end.getTime()));
  return start.getTime() < end.getTime() ? { start, end } : null;
}

/** Sort + merge a list of intervals. Touching intervals are coalesced. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals]
    .filter((i) => i.end.getTime() > i.start.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  if (sorted.length === 0) return [];

  const merged: Interval[] = [{ start: sorted[0].start, end: sorted[0].end }];
  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const cur = sorted[i];
    if (cur.start.getTime() <= prev.end.getTime()) {
      if (cur.end.getTime() > prev.end.getTime()) prev.end = cur.end;
    } else {
      merged.push({ start: cur.start, end: cur.end });
    }
  }
  return merged;
}

/**
 * Subtract `blockers` from `window`, returning the remaining free sub-intervals
 * within `window`. `blockers` may be unsorted and overlapping.
 */
export function subtract(window: Interval, blockers: Interval[]): Interval[] {
  const clipped = blockers
    .map((b) => intersect(b, window))
    .filter((x): x is Interval => x !== null);
  const merged = mergeIntervals(clipped);

  const free: Interval[] = [];
  let cursor = window.start;
  for (const b of merged) {
    if (b.start.getTime() > cursor.getTime()) {
      free.push({ start: cursor, end: b.start });
    }
    if (b.end.getTime() > cursor.getTime()) cursor = b.end;
  }
  if (cursor.getTime() < window.end.getTime()) {
    free.push({ start: cursor, end: window.end });
  }
  return free;
}

export function totalMinutes(intervals: Interval[]): number {
  return intervals.reduce((sum, i) => sum + durationMinutes(i), 0);
}
