/**
 * Schedule diff — pure function. Compares two sets of TimeBlocks and
 * classifies the changes so the Diff View UI can render them GitHub-style.
 *
 * Identity model:
 *   - AI-generated blocks are keyed by `taskId` (a single task may move
 *     across versions; that's a *shift*, not a remove+add).
 *   - Blocks without `taskId` (GCAL, MANUAL, BUFFER) are keyed by `id`
 *     if present, falling back to `${source}:${title}:${start}` so that
 *     identical-looking buffers don't duplicate.
 *
 * PURE: no I/O, no clock, no randomness, no mutation of inputs.
 */
import type { TimeBlockInput } from "@/types/schedule";

export interface ShiftedBlock {
  before: TimeBlockInput;
  after: TimeBlockInput;
  startDeltaMinutes: number;
  durationDeltaMinutes: number;
}

export interface ScheduleDiff {
  added: TimeBlockInput[];
  removed: TimeBlockInput[];
  shifted: ShiftedBlock[];
  unchanged: TimeBlockInput[];
}

export function diffSchedule(
  before: TimeBlockInput[],
  after: TimeBlockInput[],
): ScheduleDiff {
  const beforeMap = indexByIdentity(before);
  const afterMap = indexByIdentity(after);

  const added: TimeBlockInput[] = [];
  const removed: TimeBlockInput[] = [];
  const shifted: ShiftedBlock[] = [];
  const unchanged: TimeBlockInput[] = [];

  for (const [key, b] of beforeMap) {
    const a = afterMap.get(key);
    if (!a) {
      removed.push(b);
      continue;
    }
    const startDelta = minutes(a.start.getTime() - b.start.getTime());
    const durBefore = minutes(b.end.getTime() - b.start.getTime());
    const durAfter = minutes(a.end.getTime() - a.start.getTime());
    const durDelta = durAfter - durBefore;
    if (startDelta === 0 && durDelta === 0) {
      unchanged.push(a);
    } else {
      shifted.push({
        before: b,
        after: a,
        startDeltaMinutes: startDelta,
        durationDeltaMinutes: durDelta,
      });
    }
  }

  for (const [key, a] of afterMap) {
    if (!beforeMap.has(key)) added.push(a);
  }

  return { added, removed, shifted, unchanged };
}

function minutes(ms: number): number {
  return Math.round(ms / 60_000);
}

function indexByIdentity(blocks: TimeBlockInput[]): Map<string, TimeBlockInput> {
  const m = new Map<string, TimeBlockInput>();
  for (const b of blocks) {
    const key = identityKey(b);
    // If two blocks collide on the fallback key, keep the first (deterministic).
    if (!m.has(key)) m.set(key, b);
  }
  return m;
}

function identityKey(b: TimeBlockInput): string {
  if (b.taskId) return `task:${b.taskId}`;
  if (b.id) return `id:${b.id}`;
  return `${b.source}:${b.title}:${b.start.toISOString()}`;
}
