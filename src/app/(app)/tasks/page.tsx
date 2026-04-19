/**
 * Task pool page. Runs Reality Check server-side against the user's current
 * tasks + GCAL busy blocks + constraints, and renders a banner summarizing
 * the result. Each create/delete server action revalidates this path so the
 * feasibility view stays in sync with the pool.
 */
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { realityCheck } from "@/lib/realityCheck";
import { TaskInput, type ExistingTask } from "@/components/TaskInput";
import type {
  ConstraintInput,
  TaskInput as TaskInputType,
  TimeBlockInput,
  WeeklyRecurrence,
} from "@/types/schedule";

export default async function TasksPage() {
  const session = await auth();
  const userId = session?.user?.id;
  const timezone = session?.user ? "America/New_York" : "UTC";

  if (!userId) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Tasks</h1>
        <p className="mt-2 text-sm text-zinc-600">Sign in to manage your task pool.</p>
      </div>
    );
  }

  const { start, end } = defaultWindow();

  const [taskRows, constraintRows, busyRows] = await Promise.all([
    prisma.task.findMany({
      where: { userId },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    }),
    prisma.constraint.findMany({ where: { userId } }),
    prisma.timeBlock.findMany({
      where: {
        userId,
        source: "GCAL",
        start: { lt: end },
        end: { gt: start },
      },
    }),
  ]);

  const tasksForUi: ExistingTask[] = taskRows.map((t) => ({
    id: t.id,
    title: t.title,
    estimatedMinutes: t.estimatedMinutes,
    completedMinutes: t.completedMinutes,
    priority: t.priority,
    preferredTimeOfDay: t.preferredTimeOfDay,
    preferredDaysOfWeek: t.preferredDaysOfWeek ?? [],
    energyType: t.energyType,
    deadline: t.deadline,
    status: t.status,
    notes: t.notes,
  }));

  // realityCheck inputs — reuse Prisma rows by narrowing shape.
  const tasksForCheck: TaskInputType[] = taskRows.map((t) => ({
    id: t.id,
    title: t.title,
    estimatedMinutes: t.estimatedMinutes,
    completedMinutes: t.completedMinutes,
    priority: t.priority,
    preferredTimeOfDay: t.preferredTimeOfDay,
    preferredDaysOfWeek: t.preferredDaysOfWeek ?? [],
    energyType: t.energyType,
    deadline: t.deadline,
    status: t.status,
  }));

  const constraintsForCheck: ConstraintInput[] = constraintRows.map((c) => ({
    id: c.id,
    type: c.type,
    label: c.label,
    schedule: c.schedule as unknown as WeeklyRecurrence,
    energyCost: c.energyCost,
  }));

  const busyForCheck: TimeBlockInput[] = busyRows.map((b) => ({
    id: b.id,
    taskId: b.taskId ?? null,
    source: b.source,
    start: b.start,
    end: b.end,
    title: b.title,
    status: b.status,
  }));

  const check = realityCheck({
    tasks: tasksForCheck,
    busyBlocks: busyForCheck,
    constraints: constraintsForCheck,
    window: { start, end },
    timezone,
  });

  return (
    <div className="mx-auto max-w-6xl px-3 py-4 md:px-6 md:py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Tasks</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Add everything you need to get done this week. ChronoFlow does a feasibility
          check against your GCal + constraints before the AI is allowed to plan.
        </p>
      </header>

      <FeasibilityBanner check={check} />

      <div className="mt-6">
        <TaskInput tasks={tasksForUi} />
      </div>
    </div>
  );
}

function FeasibilityBanner({
  check,
}: {
  check: ReturnType<typeof realityCheck>;
}) {
  const color = check.feasible
    ? "border-green-200 bg-green-50 text-green-900"
    : "border-red-200 bg-red-50 text-red-900";
  return (
    <div className={`rounded-xl border px-4 py-3 ${color}`}>
      <p className="text-sm font-medium">
        {check.feasible ? "Reality Check: feasible" : "Reality Check: infeasible"}
      </p>
      <p className="mt-1 text-xs">{check.recommendation}</p>
      <div className="mt-2 flex flex-wrap gap-4 text-[11px]">
        <Stat label="Available" value={`${check.availableMinutes} min`} />
        <Stat label="Requested" value={`${check.requestedMinutes} min`} />
        <Stat
          label="Slack"
          value={`${check.slackMinutes >= 0 ? "+" : ""}${check.slackMinutes} min`}
        />
        <Stat label="Free fragments" value={String(check.freeIntervals.length)} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="opacity-70">{label}:</span>{" "}
      <span className="font-medium">{value}</span>
    </span>
  );
}

function defaultWindow(): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}
