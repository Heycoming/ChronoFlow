/**
 * Expand a weekly-recurring constraint into concrete intervals within a given
 * window, in a specific IANA timezone.
 *
 * This is the one piece of non-trivial date math in the scheduler: SLEEP and
 * MEAL windows are authored in *local* wall-clock time ("22:00 → 07:00 in
 * America/New_York"), but the rest of the system reasons in absolute Date
 * objects. We expand once, here, and hand the result off as plain intervals.
 *
 * Pure function: deterministic, no clock reads.
 */
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { addDays, startOfDay } from "date-fns";
import type { Interval, WeeklyRecurrence } from "@/types/schedule";

/**
 * Expand `recurrence` into intervals whose union intersects `window`.
 *
 * @param recurrence  weekly rule authored in local wall-clock time
 * @param window      half-open absolute interval to expand within
 * @param timezone    IANA zone (e.g. "America/New_York") the rule is authored in
 */
export function expandWeekly(
  recurrence: WeeklyRecurrence,
  window: Interval,
  timezone: string,
): Interval[] {
  const { daysOfWeek, startMinuteOfDay, endMinuteOfDay } = recurrence;
  if (daysOfWeek.length === 0) return [];
  if (startMinuteOfDay < 0 || startMinuteOfDay > 1440) return [];
  if (endMinuteOfDay < 0 || endMinuteOfDay > 1440) return [];

  // Walk every local-tz day whose midnight falls in a safe envelope around the window,
  // so a "22:00→07:00" block starting on the day BEFORE the window still counts.
  const envelopeStart = addDays(window.start, -1);
  const envelopeEnd = addDays(window.end, 1);

  const results: Interval[] = [];

  // Step in 1-day increments using the LOCAL zone so DST transitions don't drop a day.
  let cursorZoned = startOfDay(toZonedTime(envelopeStart, timezone));
  const endZoned = toZonedTime(envelopeEnd, timezone);

  while (cursorZoned.getTime() <= endZoned.getTime()) {
    const dow = cursorZoned.getDay();
    if (daysOfWeek.includes(dow)) {
      const startWall = addMinutesToZoned(cursorZoned, startMinuteOfDay);
      const wraps = endMinuteOfDay <= startMinuteOfDay;
      const endWall = wraps
        ? addMinutesToZoned(cursorZoned, endMinuteOfDay + 24 * 60)
        : addMinutesToZoned(cursorZoned, endMinuteOfDay);

      // Convert back to absolute Dates via the zone, then clip to the window.
      const absStart = fromZonedTime(startWall, timezone);
      const absEnd = fromZonedTime(endWall, timezone);
      if (absEnd.getTime() > absStart.getTime()) {
        const clipStart = new Date(Math.max(absStart.getTime(), window.start.getTime()));
        const clipEnd = new Date(Math.min(absEnd.getTime(), window.end.getTime()));
        if (clipEnd.getTime() > clipStart.getTime()) {
          results.push({ start: clipStart, end: clipEnd });
        }
      }
    }
    cursorZoned = addDays(cursorZoned, 1);
  }

  return results;
}

function addMinutesToZoned(zoned: Date, minutes: number): Date {
  // Manipulate the zoned Date in local fields, then reconstruct.
  // `zoned` is already the local wall-clock representation with UTC machinery.
  const d = new Date(zoned.getTime());
  d.setMinutes(d.getMinutes() + minutes);
  return d;
}
