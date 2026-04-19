/**
 * POST /api/gcal/sync
 *
 * Pulls the authenticated user's Google Calendar events for a given window
 * and upserts them into the TimeBlock table. Default window: today (in UTC)
 * through 7 days from now. Callers may override via JSON body:
 *   { "start": "2026-04-16T00:00:00Z", "end": "2026-04-23T00:00:00Z" }
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { syncGoogleCalendar } from "@/lib/gcal/sync";
import { GoogleAuthError } from "@/lib/gcal/client";

const BodySchema = z
  .object({
    start: z.iso.datetime().optional(),
    end: z.iso.datetime().optional(),
  })
  .optional();

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Default: today → today + 7 days (UTC boundaries). Caller can override.
  const now = new Date();
  const defaultStart = new Date(now);
  defaultStart.setUTCHours(0, 0, 0, 0);
  const defaultEnd = new Date(defaultStart);
  defaultEnd.setUTCDate(defaultEnd.getUTCDate() + 7);

  let body: unknown = undefined;
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

  const windowStart = parsed.data?.start ? new Date(parsed.data.start) : defaultStart;
  const windowEnd = parsed.data?.end ? new Date(parsed.data.end) : defaultEnd;

  try {
    const result = await syncGoogleCalendar(session.user.id, {
      start: windowStart,
      end: windowEnd,
    });
    return NextResponse.json({
      ok: true,
      window: { start: windowStart.toISOString(), end: windowEnd.toISOString() },
      ...result,
    });
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("[gcal/sync] Failed", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "Sync failed" },
      { status: 500 },
    );
  }
}
