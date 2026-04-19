/**
 * Shared domain types for the scheduler. These mirror (but do not depend on)
 * the Prisma-generated types so that pure functions in `src/lib/` can be tested
 * without pulling in the Prisma runtime.
 *
 * When persistence types from @prisma/client are more convenient in callers,
 * they are structurally compatible with the shapes below.
 */

export type Priority = "P0" | "P1" | "P2" | "P3";
export type TimeOfDay = "ANY" | "MORNING" | "AFTERNOON" | "EVENING" | "NIGHT";
export type EnergyType = "HIGH" | "LOW" | "CREATIVE" | "ADMIN";
export type TaskStatus = "PENDING" | "SCHEDULED" | "DONE" | "DEFERRED";
export type BlockSource = "GCAL" | "AI" | "MANUAL" | "BUFFER" | "ROUTINE";
export type BlockStatus = "PLANNED" | "IN_PROGRESS" | "DONE" | "SKIPPED";
export type ConstraintType = "SLEEP" | "MEAL" | "HYGIENE" | "CUSTOM";

export interface TaskInput {
  id: string;
  title: string;
  estimatedMinutes: number;
  completedMinutes?: number;
  priority: Priority;
  preferredTimeOfDay: TimeOfDay;
  /** 0 = Sunday ... 6 = Saturday. Empty array = no preference. */
  preferredDaysOfWeek?: number[];
  energyType: EnergyType;
  deadline?: Date | null;
  status: TaskStatus;
}

export interface TimeBlockInput {
  id: string;
  taskId?: string | null;
  source: BlockSource;
  start: Date;
  end: Date;
  title: string;
  status: BlockStatus;
}

/**
 * A constraint expressed as a recurring weekly schedule:
 *   - `daysOfWeek`: 0 = Sunday ... 6 = Saturday
 *   - `startMinuteOfDay`, `endMinuteOfDay`: minutes from local midnight [0, 1440]
 *     If `endMinuteOfDay < startMinuteOfDay`, the block wraps past midnight
 *     (e.g., sleep 23:00 → 07:00).
 *
 * We use this instead of RRULE for simplicity; the Gemini prompt consumes the
 * expanded interval list, not the recurrence rule.
 */
export interface WeeklyRecurrence {
  daysOfWeek: number[];
  startMinuteOfDay: number;
  endMinuteOfDay: number;
}

export interface ConstraintInput {
  id: string;
  type: ConstraintType;
  label: string;
  schedule: WeeklyRecurrence;
  energyCost?: number;
}

/** Half-open interval [start, end). Used internally for interval math. */
export interface Interval {
  start: Date;
  end: Date;
}
