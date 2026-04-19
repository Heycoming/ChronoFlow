import { describe, it, expect } from "vitest";
import { eventsToBlocks } from "@/lib/gcal/transform";
import type { calendar_v3 } from "googleapis";

type Ev = calendar_v3.Schema$Event;

function ev(overrides: Partial<Ev>): Ev {
  return {
    id: "evt-1",
    status: "confirmed",
    summary: "Meeting",
    start: { dateTime: "2026-04-16T10:00:00-04:00" },
    end: { dateTime: "2026-04-16T11:00:00-04:00" },
    ...overrides,
  };
}

describe("eventsToBlocks", () => {
  it("converts a confirmed timed event to a block", () => {
    const { imported, skipped } = eventsToBlocks([ev({})]);
    expect(skipped).toBe(0);
    expect(imported).toHaveLength(1);
    expect(imported[0].title).toBe("Meeting");
    expect(imported[0].metadata.gcalEventId).toBe("evt-1");
  });

  it("skips cancelled events", () => {
    const { imported, skipped } = eventsToBlocks([ev({ status: "cancelled" })]);
    expect(imported).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it("skips all-day events (date without dateTime)", () => {
    const allDay = ev({
      start: { date: "2026-04-16" },
      end: { date: "2026-04-17" },
    });
    const { imported, skipped } = eventsToBlocks([allDay]);
    expect(imported).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it("skips events with zero or negative duration", () => {
    const bad = ev({
      start: { dateTime: "2026-04-16T10:00:00-04:00" },
      end: { dateTime: "2026-04-16T10:00:00-04:00" },
    });
    const { imported, skipped } = eventsToBlocks([bad]);
    expect(imported).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it("falls back to '(untitled)' when summary is missing", () => {
    const { imported } = eventsToBlocks([ev({ summary: undefined })]);
    expect(imported[0].title).toBe("(untitled)");
  });

  it("parses start/end into Date objects", () => {
    const { imported } = eventsToBlocks([ev({})]);
    expect(imported[0].start).toBeInstanceOf(Date);
    expect(imported[0].end).toBeInstanceOf(Date);
    expect(imported[0].end.getTime() - imported[0].start.getTime()).toBe(
      60 * 60 * 1000,
    );
  });

  it("preserves htmlLink and id in metadata", () => {
    const { imported } = eventsToBlocks([
      ev({
        id: "evt-99",
        htmlLink: "https://calendar.google.com/event?eid=xyz",
      }),
    ]);
    expect(imported[0].metadata.gcalEventId).toBe("evt-99");
    expect(imported[0].metadata.htmlLink).toBe(
      "https://calendar.google.com/event?eid=xyz",
    );
  });

  it("processes mixed events in a single call", () => {
    const { imported, skipped } = eventsToBlocks([
      ev({ id: "a" }),
      ev({ id: "b", status: "cancelled" }),
      ev({ id: "c", start: { date: "2026-04-16" }, end: { date: "2026-04-17" } }),
      ev({ id: "d", summary: "Focus" }),
    ]);
    expect(imported.map((b) => b.metadata.gcalEventId)).toEqual(["a", "d"]);
    expect(skipped).toBe(2);
  });

  it("handles an empty input list", () => {
    const { imported, skipped } = eventsToBlocks([]);
    expect(imported).toEqual([]);
    expect(skipped).toBe(0);
  });
});
