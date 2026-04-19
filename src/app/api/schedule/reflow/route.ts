/**
 * POST /api/schedule/reflow
 *
 * Partial 48h reflow triggered by a check-in (EARLY/LATE) or manual request.
 * Does NOT enforce Reality Check feasibility — partial reflows are allowed
 * to over-commit and let the Diff View surface the compromise.
 *
 * Body:
 *   { checkInNote?: string, timezone?: string,
 *     start?: ISO8601, end?: ISO8601 }
 *
 * Default window: now → now + 48 hours.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { orchestrateSchedule } from "@/lib/schedule/orchestrate";

const BodySchema = z
  .object({
    checkInNote: z.string().max(300).optional(),
    timezone: z.string().optional(),
    start: z.iso.datetime().optional(),
    end: z.iso.datetime().optional(),
  })
  .optional();

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : undefined;
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

  const now = new Date();
  const defaultEnd = new Date(now);
  defaultEnd.setUTCHours(defaultEnd.getUTCHours() + 48);

  const windowStart = parsed.data?.start ? new Date(parsed.data.start) : now;
  const windowEnd = parsed.data?.end
    ? new Date(parsed.data.end)
    : defaultEnd;
  const timezone = parsed.data?.timezone ?? "America/New_York";

  try {
    const result = await orchestrateSchedule({
      userId: session.user.id,
      mode: "PARTIAL_REFLOW",
      windowStart,
      windowEnd,
      timezone,
      checkInNote: parsed.data?.checkInNote,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, realityCheck: result.realityCheck },
        { status: 422 },
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[schedule/reflow] Failed", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "Reflow failed" },
      { status: 500 },
    );
  }
}
