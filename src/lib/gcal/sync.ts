/**
 * Pulls Google Calendar events for a user within a window, and upserts them
 * as `TimeBlock` rows with `source: GCAL`.
 *
 * Idempotency strategy: we delete all GCAL blocks inside the window for the
 * user, then insert the current set fresh. This keeps the sync simple
 * (no per-event diffing) and handles deletions/time-changes correctly at
 * demo scale. For a production system we'd switch to incremental sync
 * tokens (`syncToken` on events.list).
 *
 * The pure event-to-block transformation lives in `./transform.ts` so that
 * unit tests can exercise it without a DB. This file is the fetch + persist
 * glue.
 */
import type { calendar_v3 } from "googleapis";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getGoogleClient } from "./client";
import { eventsToBlocks } from "./transform";

export interface SyncWindow {
  start: Date;
  end: Date;
}

export interface SyncResult {
  fetched: number;
  imported: number;
  skipped: number;
}

/**
 * Google's events.list returns at most 2500 per page and we follow
 * `nextPageToken`. Cap total pages as a safety net against infinite loops.
 */
const MAX_PAGES = 10;

export async function syncGoogleCalendar(
  userId: string,
  window: SyncWindow,
): Promise<SyncResult> {
  if (window.end.getTime() <= window.start.getTime()) {
    throw new Error("Sync window is empty or inverted.");
  }

  const { calendar } = await getGoogleClient(userId);

  const allEvents: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await calendar.events.list({
      calendarId: "primary",
      timeMin: window.start.toISOString(),
      timeMax: window.end.toISOString(),
      singleEvents: true, // expand recurring events into individual instances
      orderBy: "startTime",
      maxResults: 2500,
      pageToken,
    });
    if (res.data.items) allEvents.push(...res.data.items);
    pageToken = res.data.nextPageToken ?? undefined;
    if (!pageToken) break;
  }

  const { imported, skipped } = eventsToBlocks(allEvents);

  // Replace the GCAL window atomically.
  await prisma.$transaction([
    prisma.timeBlock.deleteMany({
      where: {
        userId,
        source: "GCAL",
        start: { gte: window.start },
        end: { lte: window.end },
      },
    }),
    prisma.timeBlock.createMany({
      data: imported.map((i) => ({
        userId,
        source: "GCAL" as const,
        start: i.start,
        end: i.end,
        title: i.title,
        status: "PLANNED" as const,
        // i.metadata is produced by a pure function from well-formed strings
        // and nulls — it's JSON-safe by construction, but Prisma's typing
        // can't see that through Record<string, unknown>.
        metadata: i.metadata as Prisma.InputJsonValue,
      })),
    }),
  ]);

  return {
    fetched: allEvents.length,
    imported: imported.length,
    skipped,
  };
}
