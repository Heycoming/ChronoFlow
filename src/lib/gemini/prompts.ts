/**
 * Prompt builders for Gemini schedule generation.
 *
 * Two modes:
 *   - Full week: generate a fresh schedule for [windowStart, windowEnd).
 *   - Partial reflow (48h default): rewrite only the near future in response
 *     to a check-in (EARLY/LATE/SKIPPED) or manual trigger.
 *
 * The prompts enforce the product's hard rules in natural language AND the
 * response is validated after the fact (src/lib/gemini/generate.ts). Prompt
 * rules are a first line of defense; post-validation is the last.
 */
import type {
  ConstraintInput,
  Interval,
  TaskInput,
  TimeBlockInput,
} from "@/types/schedule";

export interface PromptContext {
  timezone: string;
  windowStart: Date;
  windowEnd: Date;
  tasks: TaskInput[];
  busyBlocks: TimeBlockInput[]; // GCal + any user-manual blocks (immutable)
  constraints: ConstraintInput[];
  freeIntervals: Interval[]; // precomputed by Reality Check
  checkInNote?: string; // for partial reflows
  previousSchedule?: TimeBlockInput[]; // AI blocks before this reflow
}

const SYSTEM_RULES = `
You are ChronoFlow, a scheduling engine. Your output is parsed as JSON and used
to populate a user's calendar directly. Adherence to the rules below is
non-negotiable.

HARD RULES:
1. Every block MUST lie fully within one of the "Free Intervals" listed below.
   Never overlap a busy block or a constraint (sleep/meal/hygiene).
2. Never schedule any task during the user's sleep window.
3. No two HIGH-energy blocks in a row — insert at least one LOW/ADMIN/CREATIVE
   block or a buffer between them.
4. Insert 10–15 minute BUFFER blocks (isBuffer=true, taskId=null) between
   context switches (different energyType OR different task title family).
5. Respect priority: P0 tasks must be scheduled before P3 if there is time pressure.
6. Respect preferredTimeOfDay: place MORNING tasks before noon local,
   EVENING tasks after 17:00 local, etc., unless doing so would drop a P0 task.
7. Do NOT exceed a task's remaining estimatedMinutes. A task may be split across
   multiple blocks if helpful, but total scheduled minutes per task ≤ remaining.
8. Fragmented time is a feature: short free intervals (15–30 min) should be
   filled with LOW/ADMIN tasks when possible, not left idle.
9. Use ISO 8601 datetimes with timezone offsets (e.g. "2026-04-16T14:00:00-04:00").
   Do NOT emit "Z"-suffixed UTC unless the user's timezone is UTC.
10. Output JSON only. No prose, no markdown fences, no commentary outside the JSON.
11. STRICTLY respect preferDays (day-of-week preference): if a task has
    preferDays=[1,2,3,4,5], you MUST schedule ALL blocks for that task on one
    of those days ONLY. Never place it on a day not in the list.
    0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat.
    Example: preferDays=[1,2,3,4,5] means weekdays only — NEVER Saturday or Sunday.
    This is a HARD constraint, not a soft preference. Violating blocks will be dropped.
`.trim();

export function buildFullWeekPrompt(ctx: PromptContext): string {
  return [
    SYSTEM_RULES,
    "",
    `## Mode\nFULL_WEEK generation. Produce a complete schedule covering the Free Intervals below.`,
    renderContext(ctx),
    renderOutputContract(),
  ].join("\n\n");
}

export function buildPartialReflowPrompt(ctx: PromptContext): string {
  const checkInNote = ctx.checkInNote
    ? `\nReason for reflow: ${ctx.checkInNote}`
    : "";
  const prev = ctx.previousSchedule?.length
    ? `\n## Previous AI Schedule (to revise)\n${renderBlocks(ctx.previousSchedule)}`
    : "";
  return [
    SYSTEM_RULES,
    "",
    `## Mode\nPARTIAL_REFLOW over the next ~48 hours.${checkInNote}`,
    "Revise the upcoming schedule minimally — prefer keeping existing block times if they still fit; only move a block when necessary to absorb the disruption.",
    prev,
    renderContext(ctx),
    renderOutputContract(),
  ].join("\n\n");
}

function renderContext(ctx: PromptContext): string {
  return [
    `## User Timezone\n${ctx.timezone}`,
    `## Window\n${ctx.windowStart.toISOString()} → ${ctx.windowEnd.toISOString()} (UTC)`,
    `## Recurring Constraints\n${renderConstraints(ctx.constraints)}`,
    `## Busy Blocks (immovable)\n${renderBlocks(ctx.busyBlocks)}`,
    `## Free Intervals (you MUST fit blocks inside these)\n${renderIntervals(ctx.freeIntervals)}`,
    `## Task Pool\n${renderTasks(ctx.tasks)}`,
  ].join("\n\n");
}

function renderOutputContract(): string {
  return `## Output\nReturn a single JSON object:\n{\n  "blocks": [{ "taskId": string|null, "start": iso8601, "end": iso8601, "title": string, "energyType": "HIGH"|"LOW"|"CREATIVE"|"ADMIN", "isBuffer": boolean, "rationale": string (optional) }],\n  "summary": string (optional)\n}\nNo other keys. No prose outside the JSON.`;
}

function renderTasks(tasks: TaskInput[]): string {
  const pending = tasks.filter(
    (t) => t.status === "PENDING" || t.status === "SCHEDULED",
  );
  if (pending.length === 0) return "(no pending tasks)";
  return pending
    .map((t) => {
      const remaining = Math.max(0, t.estimatedMinutes - (t.completedMinutes ?? 0));
      const deadline = t.deadline ? ` deadline=${t.deadline.toISOString()}` : "";
      const dayPref =
        t.preferredDaysOfWeek && t.preferredDaysOfWeek.length > 0
          ? ` preferDays=[${t.preferredDaysOfWeek.join(",")}]`
          : "";
      return `- id=${t.id} "${t.title}" remaining=${remaining}min priority=${t.priority} energy=${t.energyType} preferToD=${t.preferredTimeOfDay}${dayPref}${deadline}`;
    })
    .join("\n");
}

function renderBlocks(blocks: TimeBlockInput[]): string {
  if (blocks.length === 0) return "(none)";
  return blocks
    .map(
      (b) =>
        `- ${b.source} "${b.title}" ${b.start.toISOString()} → ${b.end.toISOString()}` +
        (b.taskId ? ` taskId=${b.taskId}` : ""),
    )
    .join("\n");
}

function renderIntervals(intervals: Interval[]): string {
  if (intervals.length === 0) return "(none — no free time in window)";
  return intervals
    .map((i) => `- ${i.start.toISOString()} → ${i.end.toISOString()}`)
    .join("\n");
}

function renderConstraints(constraints: ConstraintInput[]): string {
  if (constraints.length === 0) return "(none)";
  return constraints
    .map((c) => {
      const s = c.schedule;
      const days = s.daysOfWeek.join(",");
      return `- ${c.type} "${c.label}" days=[${days}] window=${minsToClock(s.startMinuteOfDay)}→${minsToClock(s.endMinuteOfDay)} local`;
    })
    .join("\n");
}

function minsToClock(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}
