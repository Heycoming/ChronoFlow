import { describe, it, expect, vi } from "vitest";
import { generateSchedule } from "@/lib/gemini/generate";
import type { GeminiClient } from "@/lib/gemini/client";
import type { PromptContext } from "@/lib/gemini/prompts";
import type { TaskInput, Interval } from "@/types/schedule";

const TZ = "America/New_York";

function makeTask(overrides: Partial<TaskInput> = {}): TaskInput {
  return {
    id: "task-1",
    title: "Write report",
    estimatedMinutes: 120,
    priority: "P1",
    preferredTimeOfDay: "ANY",
    energyType: "CREATIVE",
    status: "PENDING",
    ...overrides,
  };
}

/**
 * Build a PromptContext with a single free interval
 * 2026-04-16T10:00Z → 2026-04-16T18:00Z, no busy blocks, no constraints.
 */
function baseContext(overrides: Partial<PromptContext> = {}): PromptContext {
  const windowStart = new Date("2026-04-16T10:00:00Z");
  const windowEnd = new Date("2026-04-16T18:00:00Z");
  const freeIntervals: Interval[] = [{ start: windowStart, end: windowEnd }];
  return {
    timezone: TZ,
    windowStart,
    windowEnd,
    tasks: [makeTask()],
    busyBlocks: [],
    constraints: [],
    freeIntervals,
    ...overrides,
  };
}

/** Script a GeminiClient to return a queue of responses in order. */
function scriptedClient(responses: Array<string | Error>): GeminiClient & {
  calls: Array<{ prompt: string }>;
} {
  const calls: Array<{ prompt: string }> = [];
  let i = 0;
  return {
    calls,
    async generateJson({ prompt }) {
      calls.push({ prompt });
      if (i >= responses.length) {
        throw new Error("scriptedClient: out of responses");
      }
      const next = responses[i++];
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

const validBlockJson = JSON.stringify({
  blocks: [
    {
      taskId: "task-1",
      start: "2026-04-16T10:00:00Z",
      end: "2026-04-16T12:00:00Z",
      title: "Write report",
      energyType: "CREATIVE",
      isBuffer: false,
    },
  ],
  summary: "Two-hour focused block matches the task.",
});

describe("generateSchedule", () => {
  it("accepts valid Gemini output on the first try", async () => {
    const client = scriptedClient([validBlockJson]);
    const res = await generateSchedule({
      mode: "FULL_WEEK",
      context: baseContext(),
      client,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.attempts).toBe(1);
      expect(res.output.blocks).toHaveLength(1);
      expect(res.output.blocks[0].taskId).toBe("task-1");
    }
    expect(client.calls).toHaveLength(1);
  });

  it("retries once with error context when Zod fails, then succeeds", async () => {
    const bad = JSON.stringify({ blocks: [{ taskId: 123, start: "nope" }] });
    const client = scriptedClient([bad, validBlockJson]);
    const res = await generateSchedule({
      mode: "FULL_WEEK",
      context: baseContext(),
      client,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.attempts).toBe(2);
    expect(client.calls).toHaveLength(2);
    // The retry prompt must include the rejection notice.
    expect(client.calls[1].prompt).toMatch(/Previous Attempt Failed/);
    expect(client.calls[1].prompt).toMatch(/Schema validation failed/);
  });

  it("fails after two attempts when responses keep failing Zod", async () => {
    const bad = JSON.stringify({ blocks: [{ taskId: 123 }] });
    const client = scriptedClient([bad, bad]);
    const res = await generateSchedule({
      mode: "FULL_WEEK",
      context: baseContext(),
      client,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.attempts).toBe(2);
      expect(res.error).toMatch(/Schema validation failed/);
      expect(res.lastRawOutput).toBe(bad);
    }
  });

  it("rejects non-JSON output (treats as validation failure, retries)", async () => {
    const garbage = "```json\n{ not json }\n```";
    const client = scriptedClient([garbage, validBlockJson]);
    const res = await generateSchedule({
      mode: "FULL_WEEK",
      context: baseContext(),
      client,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.attempts).toBe(2);
    expect(client.calls[1].prompt).toMatch(/Response was not valid JSON/);
  });

  it("rejects a block that overlaps a busy block (semantic)", async () => {
    // Busy meeting 10:30–11:30; proposed block 10:00–12:00 overlaps it.
    const ctx = baseContext({
      busyBlocks: [
        {
          id: "mtg-1",
          source: "GCAL",
          title: "Standup",
          start: new Date("2026-04-16T10:30:00Z"),
          end: new Date("2026-04-16T11:30:00Z"),
          status: "PLANNED",
        },
      ],
      freeIntervals: [
        { start: new Date("2026-04-16T10:00:00Z"), end: new Date("2026-04-16T10:30:00Z") },
        { start: new Date("2026-04-16T11:30:00Z"), end: new Date("2026-04-16T18:00:00Z") },
      ],
    });
    const client = scriptedClient([validBlockJson, validBlockJson]);
    const res = await generateSchedule({
      mode: "FULL_WEEK",
      context: ctx,
      client,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/not fully inside any free interval|overlaps a busy/);
      expect(res.attempts).toBe(2);
    }
  });

  it("rejects a block that exceeds a task's remaining minutes", async () => {
    // Task has 30 min remaining (60 estimated − 30 completed) but block is 120 min.
    const ctx = baseContext({
      tasks: [makeTask({ estimatedMinutes: 60, completedMinutes: 30 })],
    });
    const client = scriptedClient([validBlockJson, validBlockJson]);
    const res = await generateSchedule({
      mode: "FULL_WEEK",
      context: ctx,
      client,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/only 30 min remain/);
    }
  });

  it("rejects a block that references an unknown taskId", async () => {
    const ctx = baseContext({ tasks: [] });
    const client = scriptedClient([validBlockJson, validBlockJson]);
    const res = await generateSchedule({
      mode: "FULL_WEEK",
      context: ctx,
      client,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/unknown taskId/);
    }
  });

  it("rejects a block that falls outside the scheduling window", async () => {
    const outOfWindow = JSON.stringify({
      blocks: [
        {
          taskId: "task-1",
          start: "2026-04-16T09:00:00Z", // before windowStart=10:00
          end: "2026-04-16T11:00:00Z",
          title: "Write report",
          energyType: "CREATIVE",
          isBuffer: false,
        },
      ],
    });
    const client = scriptedClient([outOfWindow, outOfWindow]);
    const res = await generateSchedule({
      mode: "FULL_WEEK",
      context: baseContext(),
      client,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/outside the scheduling window/);
    }
  });

  it("rejects two AI blocks that overlap each other", async () => {
    const overlapping = JSON.stringify({
      blocks: [
        {
          taskId: "task-1",
          start: "2026-04-16T10:00:00Z",
          end: "2026-04-16T11:30:00Z",
          title: "A",
          energyType: "CREATIVE",
          isBuffer: false,
        },
        {
          taskId: null,
          start: "2026-04-16T11:00:00Z",
          end: "2026-04-16T12:00:00Z",
          title: "Buffer",
          energyType: "LOW",
          isBuffer: true,
        },
      ],
    });
    const client = scriptedClient([overlapping, overlapping]);
    const res = await generateSchedule({
      mode: "FULL_WEEK",
      context: baseContext(),
      client,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/overlap each other/);
    }
  });

  it("surfaces a GeminiClient network error after retrying once", async () => {
    const client = scriptedClient([
      new Error("ECONNRESET"),
      new Error("timeout"),
    ]);
    const res = await generateSchedule({
      mode: "FULL_WEEK",
      context: baseContext(),
      client,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/Gemini call failed/);
      expect(res.attempts).toBe(2);
    }
  });

  it("uses the partial-reflow prompt when mode=PARTIAL_REFLOW", async () => {
    const spy = vi.fn().mockResolvedValue(validBlockJson);
    const client: GeminiClient = { generateJson: spy };
    const res = await generateSchedule({
      mode: "PARTIAL_REFLOW",
      context: {
        ...baseContext(),
        checkInNote: "LATE on morning block by 30 min",
      },
      client,
    });
    expect(res.ok).toBe(true);
    const firstCallPrompt = spy.mock.calls[0][0].prompt as string;
    expect(firstCallPrompt).toMatch(/PARTIAL_REFLOW/);
    expect(firstCallPrompt).toMatch(/LATE on morning block/);
  });

  it("accepts a block that exactly fills the window boundary", async () => {
    const fullWindow = JSON.stringify({
      blocks: [
        {
          taskId: "task-1",
          start: "2026-04-16T10:00:00Z",
          end: "2026-04-16T12:00:00Z",
          title: "Write report",
          energyType: "CREATIVE",
          isBuffer: false,
        },
      ],
    });
    const client = scriptedClient([fullWindow]);
    const res = await generateSchedule({
      mode: "FULL_WEEK",
      context: baseContext(),
      client,
    });
    expect(res.ok).toBe(true);
  });
});
