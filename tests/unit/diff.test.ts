import { describe, it, expect } from "vitest";
import { diffSchedule } from "@/lib/diff";
import type { TimeBlockInput } from "@/types/schedule";

function blk(overrides: Omit<Partial<TimeBlockInput>, "start" | "end"> & {
  taskId?: string | null;
  start: string;
  end: string;
  id?: string;
}): TimeBlockInput {
  return {
    id: overrides.id ?? `blk-${overrides.taskId ?? overrides.start}`,
    taskId: overrides.taskId ?? null,
    source: overrides.source ?? "AI",
    title: overrides.title ?? "task",
    start: new Date(overrides.start),
    end: new Date(overrides.end),
    status: overrides.status ?? "PLANNED",
  };
}

describe("diffSchedule", () => {
  it("reports no changes for identical schedules", () => {
    const a = blk({ taskId: "t1", start: "2026-04-16T10:00:00Z", end: "2026-04-16T11:00:00Z" });
    const d = diffSchedule([a], [a]);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
    expect(d.shifted).toEqual([]);
    expect(d.unchanged).toHaveLength(1);
  });

  it("classifies a new block as added", () => {
    const a = blk({ taskId: "t1", start: "2026-04-16T10:00:00Z", end: "2026-04-16T11:00:00Z" });
    const b = blk({ taskId: "t2", start: "2026-04-16T13:00:00Z", end: "2026-04-16T14:00:00Z" });
    const d = diffSchedule([a], [a, b]);
    expect(d.added).toHaveLength(1);
    expect(d.added[0].taskId).toBe("t2");
    expect(d.removed).toEqual([]);
    expect(d.shifted).toEqual([]);
  });

  it("classifies a missing block as removed", () => {
    const a = blk({ taskId: "t1", start: "2026-04-16T10:00:00Z", end: "2026-04-16T11:00:00Z" });
    const b = blk({ taskId: "t2", start: "2026-04-16T13:00:00Z", end: "2026-04-16T14:00:00Z" });
    const d = diffSchedule([a, b], [a]);
    expect(d.removed).toHaveLength(1);
    expect(d.removed[0].taskId).toBe("t2");
  });

  it("classifies a moved same-task block as shifted with correct delta", () => {
    const before = blk({
      taskId: "t1",
      start: "2026-04-16T10:00:00Z",
      end: "2026-04-16T11:00:00Z",
    });
    const after = blk({
      taskId: "t1",
      start: "2026-04-16T11:30:00Z",
      end: "2026-04-16T12:30:00Z",
    });
    const d = diffSchedule([before], [after]);
    expect(d.shifted).toHaveLength(1);
    expect(d.shifted[0].startDeltaMinutes).toBe(90);
    expect(d.shifted[0].durationDeltaMinutes).toBe(0);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
  });

  it("reports duration changes separately from start shifts", () => {
    const before = blk({
      taskId: "t1",
      start: "2026-04-16T10:00:00Z",
      end: "2026-04-16T11:00:00Z",
    });
    const after = blk({
      taskId: "t1",
      start: "2026-04-16T10:00:00Z",
      end: "2026-04-16T12:00:00Z", // extended by 60 min
    });
    const d = diffSchedule([before], [after]);
    expect(d.shifted).toHaveLength(1);
    expect(d.shifted[0].startDeltaMinutes).toBe(0);
    expect(d.shifted[0].durationDeltaMinutes).toBe(60);
  });

  it("uses taskId as identity for AI blocks, not id", () => {
    // Same taskId but different row ids (new ScheduleVersion regenerates blocks).
    const before = blk({
      id: "row-A",
      taskId: "t1",
      start: "2026-04-16T10:00:00Z",
      end: "2026-04-16T11:00:00Z",
    });
    const after = blk({
      id: "row-B",
      taskId: "t1",
      start: "2026-04-16T10:00:00Z",
      end: "2026-04-16T11:00:00Z",
    });
    const d = diffSchedule([before], [after]);
    // No add/remove — same task, same times.
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
    expect(d.unchanged).toHaveLength(1);
  });

  it("uses id as identity for non-task blocks (GCal, manual)", () => {
    const before = blk({
      id: "gcal-1",
      source: "GCAL",
      title: "Meeting",
      start: "2026-04-16T15:00:00Z",
      end: "2026-04-16T16:00:00Z",
    });
    const afterMoved = blk({
      id: "gcal-1",
      source: "GCAL",
      title: "Meeting",
      start: "2026-04-16T16:00:00Z",
      end: "2026-04-16T17:00:00Z",
    });
    const d = diffSchedule([before], [afterMoved]);
    expect(d.shifted).toHaveLength(1);
    expect(d.shifted[0].startDeltaMinutes).toBe(60);
  });

  it("handles empty inputs", () => {
    expect(diffSchedule([], [])).toEqual({ added: [], removed: [], shifted: [], unchanged: [] });
    const a = blk({ taskId: "t1", start: "2026-04-16T10:00:00Z", end: "2026-04-16T11:00:00Z" });
    const d1 = diffSchedule([], [a]);
    expect(d1.added).toHaveLength(1);
    const d2 = diffSchedule([a], []);
    expect(d2.removed).toHaveLength(1);
  });

  it("detects a moved-AND-resized block as a single shift entry", () => {
    const before = blk({
      taskId: "t1",
      start: "2026-04-16T10:00:00Z",
      end: "2026-04-16T11:00:00Z",
    });
    const after = blk({
      taskId: "t1",
      start: "2026-04-16T14:00:00Z",
      end: "2026-04-16T15:30:00Z",
    });
    const d = diffSchedule([before], [after]);
    expect(d.shifted).toHaveLength(1);
    expect(d.shifted[0].startDeltaMinutes).toBe(240);
    expect(d.shifted[0].durationDeltaMinutes).toBe(30);
  });

  it("does not mutate inputs", () => {
    const before = [
      blk({ taskId: "t1", start: "2026-04-16T10:00:00Z", end: "2026-04-16T11:00:00Z" }),
    ];
    const after = [
      blk({ taskId: "t1", start: "2026-04-16T12:00:00Z", end: "2026-04-16T13:00:00Z" }),
    ];
    const beforeSnapshot = JSON.stringify(before);
    const afterSnapshot = JSON.stringify(after);
    diffSchedule(before, after);
    expect(JSON.stringify(before)).toBe(beforeSnapshot);
    expect(JSON.stringify(after)).toBe(afterSnapshot);
  });
});
