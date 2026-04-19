/**
 * Schedule orchestration — the glue between Reality Check, Gemini, and the
 * database layer. Consumed by the API routes `/api/schedule/generate` and
 * `/api/schedule/reflow`.
 *
 * Responsibilities:
 *   1. Gather inputs (tasks, constraints, GCAL blocks) from Prisma.
 *   2. Run Reality Check; bail if infeasible (for full-week only).
 *   3. Build PromptContext and call `generateSchedule`.
 *   4. Persist result: snapshot as ScheduleVersion (unapproved), return the
 *      proposed blocks so the UI can show the Diff View.
 */
import { prisma } from "@/lib/db";
import { realityCheck } from "@/lib/realityCheck";
import type { PromptContext } from "@/lib/gemini/prompts";
import {
  generateSchedule,
  type GenerateMode,
  type GenerateScheduleResult,
} from "@/lib/gemini/generate";
import type {
  ConstraintInput,
  Interval,
  TaskInput,
  TimeBlockInput,
  WeeklyRecurrence,
} from "@/types/schedule";
import type { Prisma } from "@prisma/client";

export interface OrchestrationInput {
  userId: string;
  mode: GenerateMode;
  windowStart: Date;
  windowEnd: Date;
  timezone: string;
  checkInNote?: string;
}

export type OrchestrationResult =
  | {
      ok: true;
      versionId: string;
      proposedBlocks: TimeBlockInput[];
      previousBlocks: TimeBlockInput[];
      summary?: string;
      attempts: number;
      realityCheck: { feasible: boolean; slackMinutes: number };
    }
  | {
      ok: false;
      error: string;
      realityCheck?: { feasible: boolean; slackMinutes: number };
    };

export async function orchestrateSchedule(
  input: OrchestrationInput,
): Promise<OrchestrationResult> {
  const { userId, mode, windowStart, windowEnd, timezone, checkInNote } = input;
  const window: Interval = { start: windowStart, end: windowEnd };

  // 1. Gather data
  const [taskRows, constraintRows, gcalRows, existingAiRows] = await Promise.all([
    prisma.task.findMany({
      where: { userId, status: { in: ["PENDING", "SCHEDULED"] } },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    }),
    prisma.constraint.findMany({ where: { userId } }),
    prisma.timeBlock.findMany({
      where: {
        userId,
        source: "GCAL",
        start: { lt: windowEnd },
        end: { gt: windowStart },
      },
    }),
    prisma.timeBlock.findMany({
      where: {
        userId,
        source: { in: ["AI", "BUFFER"] },
        start: { lt: windowEnd },
        end: { gt: windowStart },
      },
      orderBy: { start: "asc" },
    }),
  ]);

  const tasks: TaskInput[] = taskRows.map((t) => ({
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

  const constraints: ConstraintInput[] = constraintRows.map((c) => ({
    id: c.id,
    type: c.type,
    label: c.label,
    schedule: c.schedule as unknown as WeeklyRecurrence,
    energyCost: c.energyCost,
  }));

  const busyBlocks: TimeBlockInput[] = gcalRows.map((b) => ({
    id: b.id,
    taskId: b.taskId ?? null,
    source: b.source,
    start: b.start,
    end: b.end,
    title: b.title,
    status: b.status,
  }));

  const previousBlocks: TimeBlockInput[] = existingAiRows.map((b) => ({
    id: b.id,
    taskId: b.taskId ?? null,
    source: b.source,
    start: b.start,
    end: b.end,
    title: b.title,
    status: b.status,
  }));

  // 2. Reality Check
  console.log(`[orchestrate] ${mode} | ${tasks.length} tasks, ${constraints.length} constraints, ${busyBlocks.length} busy blocks`);
  const rc = realityCheck({ tasks, busyBlocks, constraints, window, timezone });
  console.log(`[orchestrate] Reality Check: feasible=${rc.feasible}, available=${rc.availableMinutes}min, requested=${rc.requestedMinutes}min, slack=${rc.slackMinutes}min`);

  if (mode === "FULL_WEEK" && !rc.feasible) {
    return {
      ok: false,
      error: rc.recommendation,
      realityCheck: { feasible: false, slackMinutes: rc.slackMinutes },
    };
  }

  if (tasks.length === 0) {
    return {
      ok: false,
      error: "No pending tasks to schedule.",
      realityCheck: { feasible: rc.feasible, slackMinutes: rc.slackMinutes },
    };
  }

  // 3. Build prompt context + call Gemini
  const promptContext: PromptContext = {
    timezone,
    windowStart,
    windowEnd,
    tasks,
    busyBlocks,
    constraints,
    freeIntervals: rc.freeIntervals,
    checkInNote,
    previousSchedule: mode === "PARTIAL_REFLOW" ? previousBlocks : undefined,
  };

  console.log(`[orchestrate] Calling Gemini (${mode})…`);
  const result: GenerateScheduleResult = await generateSchedule({
    mode,
    context: promptContext,
  });
  console.log(`[orchestrate] Gemini result: ok=${result.ok}, attempts=${result.attempts}${result.ok ? `, blocks=${result.output.blocks.length}` : `, error=${result.error}`}`);

  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      realityCheck: { feasible: rc.feasible, slackMinutes: rc.slackMinutes },
    };
  }

  // 4. Transform Gemini output into TimeBlockInput shapes
  const proposedBlocks: TimeBlockInput[] = result.output.blocks.map(
    (b, idx) => ({
      id: `proposed-${idx}`,
      taskId: b.taskId ?? null,
      source: b.isBuffer ? ("BUFFER" as const) : ("AI" as const),
      start: new Date(b.start),
      end: new Date(b.end),
      title: b.title,
      status: "PLANNED" as const,
    }),
  );

  // 5. Persist ScheduleVersion snapshot (unapproved) for Diff View
  const generatedBy =
    mode === "FULL_WEEK"
      ? ("FULL_WEEK" as const)
      : ("PARTIAL_48H" as const);

  const version = await prisma.scheduleVersion.create({
    data: {
      userId,
      generatedBy,
      snapshot: proposedBlocks.map((b) => ({
        taskId: b.taskId,
        source: b.source,
        start: b.start.toISOString(),
        end: b.end.toISOString(),
        title: b.title,
        status: b.status,
      })) as unknown as Prisma.InputJsonValue,
      approved: false,
      notes: result.output.summary ?? null,
    },
  });

  return {
    ok: true,
    versionId: version.id,
    proposedBlocks,
    previousBlocks,
    summary: result.output.summary,
    attempts: result.attempts,
    realityCheck: { feasible: rc.feasible, slackMinutes: rc.slackMinutes },
  };
}

/**
 * Approve a pending schedule version: delete existing AI/BUFFER blocks in
 * the window, create the proposed blocks, mark the version approved.
 */
export async function approveVersion(
  userId: string,
  versionId: string,
): Promise<{ ok: true; imported: number } | { ok: false; error: string }> {
  const version = await prisma.scheduleVersion.findUnique({
    where: { id: versionId },
  });
  if (!version || version.userId !== userId) {
    return { ok: false, error: "Version not found." };
  }
  if (version.approved) {
    return { ok: false, error: "Version already approved." };
  }

  const snapshot = version.snapshot as unknown as Array<{
    taskId: string | null;
    source: string;
    start: string;
    end: string;
    title: string;
    status: string;
  }>;

  if (!Array.isArray(snapshot) || snapshot.length === 0) {
    return { ok: false, error: "Snapshot is empty." };
  }

  // Determine the window covered by the snapshot.
  const starts = snapshot.map((b) => new Date(b.start).getTime());
  const ends = snapshot.map((b) => new Date(b.end).getTime());
  const windowStart = new Date(Math.min(...starts));
  const windowEnd = new Date(Math.max(...ends));

  await prisma.$transaction([
    // Clear existing AI + BUFFER blocks in the snapshot window.
    prisma.timeBlock.deleteMany({
      where: {
        userId,
        source: { in: ["AI", "BUFFER"] },
        start: { gte: windowStart },
        end: { lte: windowEnd },
      },
    }),
    // Insert proposed blocks.
    prisma.timeBlock.createMany({
      data: snapshot.map((b) => ({
        userId,
        taskId: b.taskId ?? null,
        source: b.source as "AI" | "BUFFER",
        start: new Date(b.start),
        end: new Date(b.end),
        title: b.title,
        status: "PLANNED" as const,
      })),
    }),
    // Mark approved.
    prisma.scheduleVersion.update({
      where: { id: versionId },
      data: { approved: true },
    }),
  ]);

  // Update scheduled tasks' status to SCHEDULED.
  const scheduledTaskIds = snapshot
    .filter((b) => b.taskId)
    .map((b) => b.taskId!);
  if (scheduledTaskIds.length > 0) {
    await prisma.task.updateMany({
      where: { id: { in: scheduledTaskIds }, userId },
      data: { status: "SCHEDULED" },
    });
  }

  return { ok: true, imported: snapshot.length };
}

/**
 * Reject a pending schedule version — just delete it.
 */
export async function rejectVersion(
  userId: string,
  versionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const version = await prisma.scheduleVersion.findUnique({
    where: { id: versionId },
  });
  if (!version || version.userId !== userId) {
    return { ok: false, error: "Version not found." };
  }
  if (version.approved) {
    return { ok: false, error: "Cannot reject an already-approved version." };
  }
  await prisma.scheduleVersion.delete({ where: { id: versionId } });
  return { ok: true };
}
