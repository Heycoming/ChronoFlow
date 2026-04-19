/**
 * Orchestrator for Gemini schedule generation.
 *
 * Responsibilities (in order):
 *   1. Build the prompt (full-week or partial-reflow) from PromptContext.
 *   2. Call the injected GeminiClient with the JSON Schema constraint.
 *   3. Parse + Zod-validate the raw response.
 *   4. Run semantic post-validation (bounds, overlap, task-minutes).
 *   5. On ANY failure, retry ONCE with the error appended to the prompt.
 *      On second failure, return a structured error — never silently coerce.
 *
 * The client is dependency-injected so unit tests can drive the full
 * validation + retry path without hitting the network.
 */
import type { GeminiClient } from "./client";
import { defaultGeminiClient } from "./client";
import {
  GEMINI_RESPONSE_JSON_SCHEMA,
  ScheduleOutputSchema,
  type PlannedBlock,
  type ScheduleOutput,
} from "./schema";
import {
  buildFullWeekPrompt,
  buildPartialReflowPrompt,
  type PromptContext,
} from "./prompts";
import { expandWeekly } from "@/lib/recurrence";
import { intersect, mergeIntervals } from "@/lib/intervals";
import type { Interval } from "@/types/schedule";

export type GenerateMode = "FULL_WEEK" | "PARTIAL_REFLOW";

export interface GenerateScheduleInput {
  mode: GenerateMode;
  context: PromptContext;
  client?: GeminiClient;
  model?: string;
  temperature?: number;
}

export type GenerateScheduleResult =
  | {
      ok: true;
      output: ScheduleOutput;
      attempts: number;
      promptUsed: string;
    }
  | {
      ok: false;
      error: string;
      attempts: number;
      lastRawOutput?: string;
    };

const MAX_ATTEMPTS = 2;

export async function generateSchedule(
  input: GenerateScheduleInput,
): Promise<GenerateScheduleResult> {
  const client = input.client ?? defaultGeminiClient;
  const basePrompt =
    input.mode === "FULL_WEEK"
      ? buildFullWeekPrompt(input.context)
      : buildPartialReflowPrompt(input.context);

  let prompt = basePrompt;
  let lastError = "";
  let lastRaw: string | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let raw: string;
    try {
      raw = await client.generateJson({
        prompt,
        responseJsonSchema: GEMINI_RESPONSE_JSON_SCHEMA,
        model: input.model,
        temperature: input.temperature,
      });
    } catch (e) {
      lastError = `Gemini call failed: ${(e as Error).message}`;
      lastRaw = undefined;
      prompt = appendRetryNotice(basePrompt, lastError);
      continue;
    }
    lastRaw = raw;

    const parsed = parseAndValidate(raw);
    if (!parsed.ok) {
      lastError = parsed.error;
      prompt = appendRetryNotice(basePrompt, lastError);
      continue;
    }

    const semantic = semanticValidate(parsed.value, input.context);
    if (!semantic.ok) {
      lastError = semantic.error;
      prompt = appendRetryNotice(basePrompt, lastError);
      continue;
    }

    return {
      ok: true,
      output: {
        blocks: semantic.filtered,
        summary: parsed.value.summary,
      },
      attempts: attempt,
      promptUsed: prompt,
    };
  }

  return {
    ok: false,
    error: lastError || "Unknown Gemini failure",
    attempts: MAX_ATTEMPTS,
    lastRawOutput: lastRaw,
  };
}

// --- Parsing + Zod validation ---------------------------------------------

type Parsed =
  | { ok: true; value: ScheduleOutput }
  | { ok: false; error: string };

function parseAndValidate(raw: string): Parsed {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return {
      ok: false,
      error: `Response was not valid JSON: ${(e as Error).message}`,
    };
  }
  const result = ScheduleOutputSchema.safeParse(json);
  if (!result.success) {
    // Compact the Zod issues into a single actionable string.
    const issues = result.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { ok: false, error: `Schema validation failed: ${issues}` };
  }
  return { ok: true, value: result.data };
}

// --- Semantic post-validation (lenient) ------------------------------------
//
// Instead of rejecting the entire schedule when one block violates a
// constraint, we **filter out** bad blocks and keep the valid ones. This is
// pragmatic: Gemini frequently schedules 1-2 blocks that overlap dinner or
// sleep. Dropping them and keeping the rest is better than showing the user
// an error after a 30s wait.

type Semantic =
  | { ok: true; filtered: PlannedBlock[]; droppedCount: number }
  | { ok: false; error: string };

function semanticValidate(
  output: ScheduleOutput,
  ctx: PromptContext,
): Semantic {
  const freeIntervals = ctx.freeIntervals;
  const busyIntervals = collectBusyIntervals(ctx);
  const taskIndex = new Map(ctx.tasks.map((t) => [t.id, t]));

  // Pass 1: keep only blocks that are valid.
  const valid: PlannedBlock[] = [];
  let dropped = 0;

  for (const b of output.blocks) {
    const start = new Date(b.start);
    const end = new Date(b.end);

    // Non-positive duration → drop.
    if (!(start.getTime() < end.getTime())) {
      console.warn(`[semantic] Dropped "${b.title}": non-positive duration`);
      dropped++;
      continue;
    }
    // Outside window → drop.
    if (
      start.getTime() < ctx.windowStart.getTime() ||
      end.getTime() > ctx.windowEnd.getTime()
    ) {
      console.warn(`[semantic] Dropped "${b.title}": outside window`);
      dropped++;
      continue;
    }

    const blockInterval: Interval = { start, end };

    // Not inside any free interval → drop.
    if (!containedInAny(blockInterval, freeIntervals)) {
      console.warn(`[semantic] Dropped "${b.title}": overlaps constraint/busy block`);
      dropped++;
      continue;
    }
    // Direct overlap with busy → drop.
    let overlaps = false;
    for (const busy of busyIntervals) {
      if (intersect(blockInterval, busy)) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) {
      console.warn(`[semantic] Dropped "${b.title}": direct busy overlap`);
      dropped++;
      continue;
    }

    // Unknown taskId → drop.
    if (b.taskId && !taskIndex.has(b.taskId)) {
      console.warn(`[semantic] Dropped "${b.title}": unknown taskId=${b.taskId}`);
      dropped++;
      continue;
    }

    // Violates preferDays → drop.
    if (b.taskId) {
      const task = taskIndex.get(b.taskId);
      if (task?.preferredDaysOfWeek && task.preferredDaysOfWeek.length > 0) {
        const blockDay = start.getDay();
        if (!task.preferredDaysOfWeek.includes(blockDay)) {
          console.warn(`[semantic] Dropped "${b.title}": scheduled on day ${blockDay}, but preferDays=[${task.preferredDaysOfWeek}]`);
          dropped++;
          continue;
        }
      }
    }

    valid.push(b);
  }

  // Pass 2: remove inter-block overlaps (keep earliest).
  const deduped = removeInterBlockOverlaps(valid);
  dropped += valid.length - deduped.length;

  // Pass 3: cap per-task minutes (drop excess blocks).
  const capped: PlannedBlock[] = [];
  const scheduledMinutesByTask = new Map<string, number>();
  for (const b of deduped) {
    if (b.taskId) {
      const task = taskIndex.get(b.taskId);
      if (!task) continue;
      const remaining = Math.max(0, task.estimatedMinutes - (task.completedMinutes ?? 0));
      const alreadyScheduled = scheduledMinutesByTask.get(b.taskId) ?? 0;
      const dur = Math.round(
        (new Date(b.end).getTime() - new Date(b.start).getTime()) / 60_000,
      );
      if (alreadyScheduled + dur > remaining) {
        console.warn(`[semantic] Dropped "${b.title}": exceeds remaining minutes`);
        dropped++;
        continue;
      }
      scheduledMinutesByTask.set(b.taskId, alreadyScheduled + dur);
    }
    capped.push(b);
  }

  if (capped.length === 0) {
    return {
      ok: false,
      error: `All ${output.blocks.length} blocks were invalid (overlapping constraints, outside window, or exceeding task minutes). The AI failed to respect your schedule.`,
    };
  }

  if (dropped > 0) {
    console.log(`[semantic] Kept ${capped.length}/${output.blocks.length} blocks (dropped ${dropped})`);
  }

  return { ok: true, filtered: capped, droppedCount: dropped };
}

function removeInterBlockOverlaps(blocks: PlannedBlock[]): PlannedBlock[] {
  const sorted = [...blocks].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );
  const result: PlannedBlock[] = [];
  for (const b of sorted) {
    const start = new Date(b.start).getTime();
    const prev = result[result.length - 1];
    if (prev && start < new Date(prev.end).getTime()) {
      console.warn(`[semantic] Dropped "${b.title}": overlaps previous block "${prev.title}"`);
      continue;
    }
    result.push(b);
  }
  return result;
}

function collectBusyIntervals(ctx: PromptContext): Interval[] {
  const out: Interval[] = [];
  for (const b of ctx.busyBlocks) {
    const clipped = intersect(
      { start: b.start, end: b.end },
      { start: ctx.windowStart, end: ctx.windowEnd },
    );
    if (clipped) out.push(clipped);
  }
  for (const c of ctx.constraints) {
    out.push(
      ...expandWeekly(
        c.schedule,
        { start: ctx.windowStart, end: ctx.windowEnd },
        ctx.timezone,
      ),
    );
  }
  return mergeIntervals(out);
}

function containedInAny(block: Interval, intervals: Interval[]): boolean {
  for (const f of intervals) {
    if (
      f.start.getTime() <= block.start.getTime() &&
      f.end.getTime() >= block.end.getTime()
    ) {
      return true;
    }
  }
  return false;
}


function appendRetryNotice(basePrompt: string, error: string): string {
  return `${basePrompt}\n\n## Previous Attempt Failed\nYour last response was rejected: ${error}\nReturn ONLY a single valid JSON object per the schema above, fully inside the listed Free Intervals, and satisfying every hard rule.`;
}
