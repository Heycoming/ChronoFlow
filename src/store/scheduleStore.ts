/**
 * Zustand store — single source of truth for rendered schedule state.
 *
 * The store holds the *merged* view: GCAL + AI + MANUAL + BUFFER blocks all
 * live together, distinguished by `source`. Server components fetch the
 * initial blocks and pass them down; client components mutate via the
 * setters below and subscribe for re-renders.
 *
 * Deliberately minimal: no async fetch logic here. Components call fetch()
 * themselves and push the results into `setBlocks`. This keeps the store
 * trivially testable and avoids entangling React Query-style concerns.
 */
import { create } from "zustand";
import type { TimeBlockInput } from "@/types/schedule";

export interface ProposedChange {
  /** The ScheduleVersion id from the server, used when the user approves. */
  versionId: string;
  /** The blocks the user would see if they approve. */
  proposedBlocks: TimeBlockInput[];
  /** The blocks currently on the calendar (for diff rendering). */
  previousBlocks: TimeBlockInput[];
}

export interface ScheduleState {
  blocks: TimeBlockInput[];
  windowStart: Date;
  windowEnd: Date;
  /** Pending AI proposal awaiting Diff View approval. */
  proposal: ProposedChange | null;

  setBlocks: (blocks: TimeBlockInput[]) => void;
  setWindow: (start: Date, end: Date) => void;
  upsertBlock: (block: TimeBlockInput) => void;
  removeBlock: (id: string) => void;
  setProposal: (proposal: ProposedChange | null) => void;
}

function defaultWindow(): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

export const useScheduleStore = create<ScheduleState>((set) => {
  const { start, end } = defaultWindow();
  return {
    blocks: [],
    windowStart: start,
    windowEnd: end,
    proposal: null,

    setBlocks: (blocks) => set({ blocks }),
    setWindow: (start, end) => set({ windowStart: start, windowEnd: end }),
    upsertBlock: (block) =>
      set((s) => {
        const idx = s.blocks.findIndex((b) => b.id === block.id);
        if (idx === -1) return { blocks: [...s.blocks, block] };
        const next = s.blocks.slice();
        next[idx] = block;
        return { blocks: next };
      }),
    removeBlock: (id) =>
      set((s) => ({ blocks: s.blocks.filter((b) => b.id !== id) })),
    setProposal: (proposal) => set({ proposal }),
  };
});
