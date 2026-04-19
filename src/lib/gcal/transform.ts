/**
 * Pure transformation: Google Calendar events → TimeBlock-shaped inserts.
 *
 * CONTRACT: no I/O, no network, no DB. Lives in its own file so unit tests
 * can import it without pulling in the Prisma client.
 *
 * Skipped events:
 *   - status === "cancelled"
 *   - all-day (no dateTime on start/end) — not actionable as a blocker for
 *     a time-of-day scheduler
 *   - zero or negative duration
 */
import type { calendar_v3 } from "googleapis";

export interface ImportedBlock {
  start: Date;
  end: Date;
  title: string;
  metadata: Record<string, unknown>;
}

export function eventsToBlocks(events: calendar_v3.Schema$Event[]): {
  imported: ImportedBlock[];
  skipped: number;
} {
  const imported: ImportedBlock[] = [];
  let skipped = 0;
  for (const ev of events) {
    if (ev.status === "cancelled") {
      skipped++;
      continue;
    }
    const startIso = ev.start?.dateTime;
    const endIso = ev.end?.dateTime;
    if (!startIso || !endIso) {
      skipped++;
      continue;
    }
    const start = new Date(startIso);
    const end = new Date(endIso);
    if (!(end.getTime() > start.getTime())) {
      skipped++;
      continue;
    }
    imported.push({
      start,
      end,
      title: ev.summary ?? "(untitled)",
      metadata: {
        gcalEventId: ev.id ?? null,
        htmlLink: ev.htmlLink ?? null,
        calendarId: "primary",
      },
    });
  }
  return { imported, skipped };
}
