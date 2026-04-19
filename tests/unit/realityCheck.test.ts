import { describe, it, expect } from "vitest";
import { realityCheck } from "@/lib/realityCheck";
import type {
  ConstraintInput,
  TaskInput,
  TimeBlockInput,
} from "@/types/schedule";

const TZ = "America/New_York";

function makeTask(overrides: Partial<TaskInput> = {}): TaskInput {
  return {
    id: `task-${Math.random().toString(36).slice(2, 8)}`,
    title: "Sample",
    estimatedMinutes: 60,
    priority: "P2",
    preferredTimeOfDay: "ANY",
    energyType: "ADMIN",
    status: "PENDING",
    ...overrides,
  };
}

function makeBusy(start: string, end: string): TimeBlockInput {
  return {
    id: `blk-${start}`,
    source: "GCAL",
    start: new Date(start),
    end: new Date(end),
    title: "busy",
    status: "PLANNED",
  };
}

function sleepConstraint(): ConstraintInput {
  // 23:00 → 07:00 local, every night
  return {
    id: "c-sleep",
    type: "SLEEP",
    label: "Sleep",
    schedule: {
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startMinuteOfDay: 23 * 60,
      endMinuteOfDay: 7 * 60,
    },
  };
}

describe("realityCheck", () => {
  it("rejects inverted/empty windows", () => {
    const r = realityCheck({
      tasks: [],
      busyBlocks: [],
      constraints: [],
      window: { start: new Date("2026-04-16T10:00:00Z"), end: new Date("2026-04-16T09:00:00Z") },
      timezone: TZ,
    });
    expect(r.feasible).toBe(false);
    expect(r.recommendation).toMatch(/empty|inverted/i);
  });

  it("reports feasibility when tasks fit comfortably", () => {
    // 8-hour window, 1h of busy, 2h of task work → should be feasible with 5h slack.
    const r = realityCheck({
      tasks: [makeTask({ estimatedMinutes: 60 }), makeTask({ estimatedMinutes: 60 })],
      busyBlocks: [makeBusy("2026-04-16T17:00:00Z", "2026-04-16T18:00:00Z")],
      constraints: [],
      window: { start: new Date("2026-04-16T13:00:00Z"), end: new Date("2026-04-16T21:00:00Z") },
      timezone: TZ,
    });
    expect(r.feasible).toBe(true);
    expect(r.availableMinutes).toBe(7 * 60);
    expect(r.requestedMinutes).toBe(120);
    expect(r.slackMinutes).toBe(7 * 60 - 120);
  });

  it("flags infeasibility with a precise deficit", () => {
    // 2-hour window, 3h of task work → infeasible by 60 min.
    const r = realityCheck({
      tasks: [makeTask({ estimatedMinutes: 180 })],
      busyBlocks: [],
      constraints: [],
      window: { start: new Date("2026-04-16T13:00:00Z"), end: new Date("2026-04-16T15:00:00Z") },
      timezone: TZ,
    });
    expect(r.feasible).toBe(false);
    expect(r.slackMinutes).toBe(-60);
    expect(r.recommendation).toMatch(/short by 60 min/);
  });

  it("subtracts completedMinutes from task effort", () => {
    const r = realityCheck({
      tasks: [makeTask({ estimatedMinutes: 120, completedMinutes: 90 })],
      busyBlocks: [],
      constraints: [],
      window: { start: new Date("2026-04-16T13:00:00Z"), end: new Date("2026-04-16T14:00:00Z") },
      timezone: TZ,
    });
    expect(r.requestedMinutes).toBe(30);
    expect(r.feasible).toBe(true);
  });

  it("ignores DONE and DEFERRED tasks", () => {
    const r = realityCheck({
      tasks: [
        makeTask({ estimatedMinutes: 500, status: "DONE" }),
        makeTask({ estimatedMinutes: 500, status: "DEFERRED" }),
        makeTask({ estimatedMinutes: 30 }),
      ],
      busyBlocks: [],
      constraints: [],
      window: { start: new Date("2026-04-16T13:00:00Z"), end: new Date("2026-04-16T14:00:00Z") },
      timezone: TZ,
    });
    expect(r.requestedMinutes).toBe(30);
    expect(r.feasible).toBe(true);
  });

  it("expands recurring SLEEP constraint and subtracts it", () => {
    // 24h window on 2026-04-16 in NY local time. Sleep 23:00→07:00 covers
    // 16th 23:00→17th 07:00 local = 8 hours of the 17th morning, AND
    // the window may also contain part of the previous night's sleep.
    // We just check that sleep reduces the available minutes.
    const windowStart = new Date("2026-04-16T04:00:00Z"); // ~midnight NY
    const windowEnd = new Date("2026-04-17T04:00:00Z");
    const noSleep = realityCheck({
      tasks: [],
      busyBlocks: [],
      constraints: [],
      window: { start: windowStart, end: windowEnd },
      timezone: TZ,
    });
    const withSleep = realityCheck({
      tasks: [],
      busyBlocks: [],
      constraints: [sleepConstraint()],
      window: { start: windowStart, end: windowEnd },
      timezone: TZ,
    });
    expect(noSleep.availableMinutes).toBe(24 * 60);
    // Sleep should carve out ~8 hours
    expect(withSleep.availableMinutes).toBeLessThanOrEqual(16 * 60);
    expect(withSleep.availableMinutes).toBeGreaterThanOrEqual(15 * 60);
  });

  it("does not double-count overlapping blockers", () => {
    // Two overlapping GCal events should be merged; free time = 4h, not 3h.
    const r = realityCheck({
      tasks: [],
      busyBlocks: [
        makeBusy("2026-04-16T14:00:00Z", "2026-04-16T16:00:00Z"),
        makeBusy("2026-04-16T15:00:00Z", "2026-04-16T17:00:00Z"),
      ],
      constraints: [],
      window: { start: new Date("2026-04-16T13:00:00Z"), end: new Date("2026-04-16T18:00:00Z") },
      timezone: TZ,
    });
    // Busy union = [14:00, 17:00) = 3h; free = 5h - 3h = 2h
    expect(r.availableMinutes).toBe(2 * 60);
  });

  it("clips busy blocks that start before the window", () => {
    const r = realityCheck({
      tasks: [],
      busyBlocks: [makeBusy("2026-04-16T08:00:00Z", "2026-04-16T14:00:00Z")],
      constraints: [],
      window: { start: new Date("2026-04-16T13:00:00Z"), end: new Date("2026-04-16T18:00:00Z") },
      timezone: TZ,
    });
    // Busy clipped to [13:00,14:00) = 1h; free = 5h - 1h = 4h
    expect(r.availableMinutes).toBe(4 * 60);
  });

  it("returns a helpful message when no tasks are pending", () => {
    const r = realityCheck({
      tasks: [makeTask({ status: "DONE", estimatedMinutes: 60 })],
      busyBlocks: [],
      constraints: [],
      window: { start: new Date("2026-04-16T13:00:00Z"), end: new Date("2026-04-16T14:00:00Z") },
      timezone: TZ,
    });
    expect(r.requestedMinutes).toBe(0);
    expect(r.feasible).toBe(true);
    expect(r.recommendation).toMatch(/No pending tasks/);
  });
});
