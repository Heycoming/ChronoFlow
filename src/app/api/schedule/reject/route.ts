/**
 * POST /api/schedule/reject
 *
 * Rejects (deletes) a pending ScheduleVersion without persisting the
 * proposed blocks.
 *
 * Body: { versionId: string }
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { rejectVersion } from "@/lib/schedule/orchestrate";

const BodySchema = z.object({
  versionId: z.string().min(1),
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

  try {
    const result = await rejectVersion(session.user.id, parsed.data.versionId);
    if (!result.ok) {
      return NextResponse.json(result, { status: 422 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[schedule/reject] Failed", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "Reject failed" },
      { status: 500 },
    );
  }
}
