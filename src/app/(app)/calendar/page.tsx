/**
 * Calendar page — hydrates the Zustand store with TimeBlock rows and renders
 * the horizontal timeline calendar.
 *
 * Sleep constraints are passed as grayed-out background zones (not event blocks).
 * Other constraints (meals, hygiene, custom) are shown as ROUTINE event blocks.
 */
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { requireOnboarding } from "@/lib/requireOnboarding";
import { CalendarGrid } from "@/components/CalendarGrid";
import { DiffView } from "@/components/DiffView";
import { GcalSyncButton } from "@/components/GcalSyncButton";
import { GenerateButton } from "@/components/GenerateButton";
import { expandWeekly } from "@/lib/recurrence";
import type { Interval, TimeBlockInput, WeeklyRecurrence } from "@/types/schedule";

export default async function CalendarPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (userId) await requireOnboarding(userId);

  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setHours(0, 0, 0, 0);
  const windowEnd = new Date(windowStart);
  windowEnd.setDate(windowEnd.getDate() + 7);

  const [rows, constraintRows] = await Promise.all([
    userId
      ? prisma.timeBlock.findMany({
          where: { userId },
          orderBy: { start: "asc" },
          take: 500,
        })
      : [],
    userId ? prisma.constraint.findMany({ where: { userId } }) : [],
  ]);

  const blocks: TimeBlockInput[] = rows.map((r) => ({
    id: r.id,
    taskId: r.taskId ?? null,
    source: r.source,
    start: r.start,
    end: r.end,
    title: r.title,
    status: r.status,
  }));

  const timezone = "America/New_York";
  const window = { start: windowStart, end: windowEnd };

  // Separate sleep constraints (gray zones) from other constraints (ROUTINE blocks)
  const sleepIntervals: Interval[] = [];
  const routineBlocks: TimeBlockInput[] = [];

  for (const c of constraintRows) {
    const schedule = c.schedule as unknown as WeeklyRecurrence;
    const intervals = expandWeekly(schedule, window, timezone);

    if (c.type === "SLEEP") {
      sleepIntervals.push(...intervals);
    } else {
      routineBlocks.push(
        ...intervals.map((interval, ii) => ({
          id: `routine-${c.id}-${ii}`,
          taskId: null as string | null,
          source: "ROUTINE" as const,
          start: interval.start,
          end: interval.end,
          title: c.label,
          status: "PLANNED" as const,
        })),
      );
    }
  }

  const allBlocks = [...blocks, ...routineBlocks];

  // Serialize dates for client component
  const serializedSleep = sleepIntervals.map((s) => ({
    start: s.start.toISOString(),
    end: s.end.toISOString(),
  }));

  return (
    <div className="px-6 py-6">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            Welcome, {session?.user?.name ?? "there"}.
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            {blocks.length} block{blocks.length === 1 ? "" : "s"} on your schedule.
          </p>
        </div>
        <div className="flex items-end gap-3">
          <GcalSyncButton />
          <GenerateButton />
        </div>
      </div>

      <CalendarGrid
        initialBlocks={allBlocks}
        sleepIntervals={serializedSleep}
      />
      <DiffView />

      <div className="mt-4 flex flex-wrap gap-4 text-xs text-zinc-600">
        <Legend color="#a1a1aa" label="Google Cal" />
        <Legend color="#3b82f6" label="AI Task" />
        <Legend color="#f59e0b" label="Buffer" />
        <Legend color="#22c55e" label="Manual" />
        <Legend color="#8b5cf6" label="Routine" />
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="inline-block h-3 w-3 rounded-sm" style={{ background: "repeating-linear-gradient(45deg, #f4f4f5, #f4f4f5 2px, #e4e4e7 2px, #e4e4e7 4px)" }} />
          Sleep
        </span>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className="inline-block h-3 w-3 rounded-sm"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
