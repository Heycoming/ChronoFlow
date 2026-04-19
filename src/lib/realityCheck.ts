/**
 * Reality Check — pure, deterministic feasibility math.
 *
 * Given a scheduling window, a task pool, imported calendar events, and
 * recurring constraints (sleep/meals/hygiene), compute whether the tasks
 * can *mathematically* fit. Runs before any LLM call.
 *
 * CONTRACT:
 *   - Pure: no I/O, no clock reads, no randomness, no network.
 *   - Deterministic: same inputs always produce same output.
 *   - Defensive: does not mutate inputs.
 *
 * Fragmented time is preserved: the algorithm reports total available
 * minutes without collapsing sub-30-min gaps out of existence. The AI
 * decides how to *use* fragmented slots; Reality Check only counts them.
 */
import type {
  ConstraintInput,
  Interval,
  TaskInput,
  TimeBlockInput,
} from "@/types/schedule";
import { expandWeekly } from "./recurrence";
import { mergeIntervals, subtract, totalMinutes, intersect } from "./intervals";

export interface RealityCheckInput {
  tasks: TaskInput[];
  busyBlocks: TimeBlockInput[];
  constraints: ConstraintInput[];
  window: Interval;
  timezone: string;
}

export interface RealityCheckResult {
  feasible: boolean;
  availableMinutes: number;
  requestedMinutes: number;
  /** availableMinutes - requestedMinutes; negative ⇒ infeasible */
  slackMinutes: number;
  /** Total unblocked minutes in the window. */
  freeIntervals: Interval[];
  /** Single-line user-facing explanation of the result. */
  recommendation: string;
}

const MIN_USABLE_FRAGMENT = 15; // minutes; fragments below this are counted but flagged

export function realityCheck(input: RealityCheckInput): RealityCheckResult {
  const { tasks, busyBlocks, constraints, window, timezone } = input;

  if (window.end.getTime() <= window.start.getTime()) {
    return {
      feasible: false,
      availableMinutes: 0,
      requestedMinutes: 0,
      slackMinutes: 0,
      freeIntervals: [],
      recommendation: "Scheduling window is empty or inverted.",
    };
  }

  // 1. Collect every blocker interval: GCal events + expanded constraints.
  const busyIntervals: Interval[] = [];
  for (const b of busyBlocks) {
    const clipped = intersect({ start: b.start, end: b.end }, window);
    if (clipped) busyIntervals.push(clipped);
  }
  for (const c of constraints) {
    busyIntervals.push(...expandWeekly(c.schedule, window, timezone));
  }
  const blockers = mergeIntervals(busyIntervals);

  // 2. Compute free intervals and total available minutes.
  const freeIntervals = subtract(window, blockers);
  const availableMinutes = totalMinutes(freeIntervals);

  // 3. Sum remaining task effort (estimated minus already completed).
  const pending = tasks.filter(
    (t) => t.status === "PENDING" || t.status === "SCHEDULED",
  );
  const requestedMinutes = pending.reduce((sum, t) => {
    const remaining = Math.max(0, t.estimatedMinutes - (t.completedMinutes ?? 0));
    return sum + remaining;
  }, 0);

  const slackMinutes = availableMinutes - requestedMinutes;
  const feasible = slackMinutes >= 0;

  return {
    feasible,
    availableMinutes,
    requestedMinutes,
    slackMinutes,
    freeIntervals,
    recommendation: buildRecommendation({
      feasible,
      availableMinutes,
      requestedMinutes,
      slackMinutes,
      freeIntervals,
    }),
  };
}

function buildRecommendation(args: {
  feasible: boolean;
  availableMinutes: number;
  requestedMinutes: number;
  slackMinutes: number;
  freeIntervals: Interval[];
}): string {
  const { feasible, availableMinutes, requestedMinutes, slackMinutes, freeIntervals } = args;
  if (requestedMinutes === 0) {
    return `No pending tasks to schedule. ${availableMinutes} free minutes in window.`;
  }
  if (!feasible) {
    const deficit = -slackMinutes;
    return `Infeasible: requested ${requestedMinutes} min but only ${availableMinutes} min available (short by ${deficit} min). Consider deferring low-priority tasks or reducing estimates.`;
  }
  const usableFragments = freeIntervals.filter(
    (i) => (i.end.getTime() - i.start.getTime()) / 60_000 >= MIN_USABLE_FRAGMENT,
  ).length;
  return `Feasible with ${slackMinutes} min of slack across ${usableFragments} usable time fragments.`;
}
