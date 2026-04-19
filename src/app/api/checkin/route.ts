/**
 * POST /api/checkin
 *
 * Records a check-in for a time block. ON_TIME simply marks the block DONE.
 * EARLY/LATE trigger a partial reflow (48h) and return the proposal for
 * Diff View rendering. SKIPPED marks the block SKIPPED with no reflow.
 *
 * Body:
 *   { timeBlockId, outcome: "ON_TIME"|"EARLY"|"LATE"|"SKIPPED",
 *     actualMinutes?: number, extraMinutes?: number, note?: string }
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { orchestrateSchedule } from "@/lib/schedule/orchestrate";

const BodySchema = z.object({
  timeBlockId: z.string().min(1),
  outcome: z.enum(["ON_TIME", "EARLY", "LATE", "SKIPPED"]),
  actualMinutes: z.number().int().min(0).optional(),
  extraMinutes: z.number().int().min(0).optional(),
  note: z.string().max(300).optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { timeBlockId, outcome, actualMinutes, extraMinutes, note } =
    parsed.data;

  // Verify block belongs to user.
  const block = await prisma.timeBlock.findUnique({
    where: { id: timeBlockId },
  });
  if (!block || block.userId !== session.user.id) {
    return NextResponse.json({ error: "Block not found" }, { status: 404 });
  }

  // Persist the check-in.
  await prisma.checkIn.create({
    data: { timeBlockId, outcome, actualMinutes, extraMinutes, note },
  });

  // Update block status.
  const blockStatus =
    outcome === "SKIPPED"
      ? ("SKIPPED" as const)
      : ("DONE" as const);
  await prisma.timeBlock.update({
    where: { id: timeBlockId },
    data: { status: blockStatus },
  });

  // Update task completedMinutes if applicable.
  if (block.taskId && actualMinutes != null) {
    await prisma.task.update({
      where: { id: block.taskId },
      data: { completedMinutes: { increment: actualMinutes } },
    });
  }

  // ON_TIME and SKIPPED don't trigger reflow.
  if (outcome === "ON_TIME" || outcome === "SKIPPED") {
    return NextResponse.json({ ok: true, reflow: false });
  }

  // EARLY or LATE — trigger a 48h partial reflow.
  const checkInNote =
    outcome === "EARLY"
      ? `Finished "${block.title}" early by ~${actualMinutes ?? "?"} min. Free up the remaining time.`
      : `Running late on "${block.title}" — need ${extraMinutes ?? "?"} more minutes. Shift subsequent blocks.`;

  try {
    const now = new Date();
    const reflowEnd = new Date(now);
    reflowEnd.setUTCHours(reflowEnd.getUTCHours() + 48);

    const result = await orchestrateSchedule({
      userId: session.user.id,
      mode: "PARTIAL_REFLOW",
      windowStart: now,
      windowEnd: reflowEnd,
      timezone: "America/New_York",
      checkInNote,
    });

    if (!result.ok) {
      return NextResponse.json({
        ok: true,
        reflow: false,
        reflowError: result.error,
      });
    }

    return NextResponse.json({
      ok: true,
      reflow: true,
      versionId: result.versionId,
      proposedBlocks: result.proposedBlocks,
      previousBlocks: result.previousBlocks,
      summary: result.summary,
    });
  } catch (err) {
    console.error("[checkin] Reflow failed", err);
    return NextResponse.json({
      ok: true,
      reflow: false,
      reflowError: (err as Error).message,
    });
  }
}
