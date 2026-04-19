/**
 * Nightly Review page.
 *
 * Shows: unfinished blocks (PLANNED/IN_PROGRESS that are past their end time),
 * a "Defer & Reflow" button that batch-defers them and triggers a 48h partial
 * reflow, plus a summary of the day.
 */
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { NightlyReviewClient } from "@/components/NightlyReview";

export default async function ReviewPage() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Nightly Review</h1>
        <p className="mt-2 text-sm text-zinc-600">Sign in to review your day.</p>
      </div>
    );
  }

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const [blocks, pendingTasks] = await Promise.all([
    prisma.timeBlock.findMany({
      where: {
        userId,
        source: { in: ["AI", "BUFFER", "MANUAL"] },
        start: { gte: todayStart },
        end: { lte: todayEnd },
      },
      orderBy: { start: "asc" },
    }),
    prisma.task.findMany({
      where: { userId, status: { in: ["PENDING", "SCHEDULED"] } },
      orderBy: [{ priority: "asc" }, { deadline: "asc" }],
    }),
  ]);

  const overdue = blocks.filter(
    (b) => b.end <= now && (b.status === "PLANNED" || b.status === "IN_PROGRESS"),
  );
  const completed = blocks.filter((b) => b.status === "DONE");
  const skipped = blocks.filter((b) => b.status === "SKIPPED");

  return (
    <div className="mx-auto max-w-4xl px-3 py-4 md:px-6 md:py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Nightly Review</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Review today's progress and defer unfinished work to tomorrow.
        </p>
      </header>

      <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Completed"
          value={completed.length}
          color="text-green-700 bg-green-50 border-green-200"
        />
        <StatCard
          label="Skipped"
          value={skipped.length}
          color="text-zinc-700 bg-zinc-50 border-zinc-200"
        />
        <StatCard
          label="Overdue"
          value={overdue.length}
          color="text-red-700 bg-red-50 border-red-200"
        />
      </div>

      <NightlyReviewClient
        overdueBlocks={overdue.map((b) => ({
          id: b.id,
          taskId: b.taskId,
          title: b.title,
          start: b.start.toISOString(),
          end: b.end.toISOString(),
          source: b.source,
          status: b.status,
        }))}
        pendingTaskCount={pendingTasks.length}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="mt-0.5 text-xs font-medium">{label}</p>
    </div>
  );
}
