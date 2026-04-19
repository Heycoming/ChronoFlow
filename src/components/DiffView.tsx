"use client";

/**
 * GitHub-style Diff View for schedule proposals.
 *
 * Shows added (green), removed (red), and shifted (yellow) blocks side-by-side.
 * Two action buttons: Approve (commits the proposal) and Reject (discards it).
 *
 * Reads the pending proposal from the Zustand store, so any component can push
 * a proposal (GenerateButton, CheckInModal reflow) and this view picks it up.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useScheduleStore } from "@/store/scheduleStore";
import { diffSchedule, type ScheduleDiff } from "@/lib/diff";
import type { TimeBlockInput } from "@/types/schedule";

export function DiffView() {
  const router = useRouter();
  const proposal = useScheduleStore((s) => s.proposal);
  const setProposal = useScheduleStore((s) => s.setProposal);
  const setBlocks = useScheduleStore((s) => s.setBlocks);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!proposal) return null;

  const diff = diffSchedule(proposal.previousBlocks, proposal.proposedBlocks);

  const totalChanges =
    diff.added.length + diff.removed.length + diff.shifted.length;

  async function approve() {
    if (!proposal) return;
    setError(null);
    start(async () => {
      try {
        const res = await fetch("/api/schedule/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ versionId: proposal.versionId }),
        });
        const json = await res.json();
        if (!json.ok) {
          setError(json.error ?? "Approve failed");
          return;
        }
        // Update the live calendar with the approved blocks.
        setBlocks([
          ...useScheduleStore
            .getState()
            .blocks.filter(
              (b) => b.source !== "AI" && b.source !== "BUFFER",
            ),
          ...proposal.proposedBlocks,
        ]);
        setProposal(null);
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  async function reject() {
    if (!proposal) return;
    setError(null);
    start(async () => {
      try {
        await fetch("/api/schedule/reject", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ versionId: proposal.versionId }),
        });
        setProposal(null);
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <div className="mt-6 rounded-xl border-2 border-blue-200 bg-blue-50 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-blue-900">
            Schedule Proposal
          </h2>
          <p className="mt-0.5 text-xs text-blue-700">
            {totalChanges} change{totalChanges === 1 ? "" : "s"} ·{" "}
            {diff.added.length} added · {diff.removed.length} removed ·{" "}
            {diff.shifted.length} shifted · {diff.unchanged.length} unchanged
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={reject}
            disabled={pending}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={approve}
            disabled={pending}
            className="rounded-lg bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {pending ? "Applying…" : "Approve"}
          </button>
        </div>
      </div>

      {error && <p className="mb-3 text-xs text-red-600">{error}</p>}

      <div className="space-y-1">
        {diff.added.map((b) => (
          <DiffRow key={b.id} kind="added" block={b} />
        ))}
        {diff.shifted.map((s) => (
          <DiffRow
            key={s.after.id}
            kind="shifted"
            block={s.after}
            delta={`${fmtDelta(s.startDeltaMinutes)} start, ${fmtDelta(s.durationDeltaMinutes)} duration`}
          />
        ))}
        {diff.removed.map((b) => (
          <DiffRow key={b.id} kind="removed" block={b} />
        ))}
        {diff.unchanged.length > 0 && (
          <p className="pt-2 text-[11px] text-zinc-500">
            + {diff.unchanged.length} unchanged block
            {diff.unchanged.length === 1 ? "" : "s"} (hidden)
          </p>
        )}
      </div>
    </div>
  );
}

type DiffKind = "added" | "removed" | "shifted";

const ROW_STYLES: Record<DiffKind, string> = {
  added: "border-green-200 bg-green-50 text-green-900",
  removed: "border-red-200 bg-red-50 text-red-900 line-through",
  shifted: "border-amber-200 bg-amber-50 text-amber-900",
};

const KIND_BADGE: Record<DiffKind, string> = {
  added: "+ Added",
  removed: "− Removed",
  shifted: "↔ Shifted",
};

function DiffRow({
  kind,
  block,
  delta,
}: {
  kind: DiffKind;
  block: TimeBlockInput;
  delta?: string;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${ROW_STYLES[kind]}`}
    >
      <div className="min-w-0">
        <span className="mr-2 rounded bg-white/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase">
          {KIND_BADGE[kind]}
        </span>
        <span className="font-medium">{block.title}</span>
        <span className="ml-2 text-xs opacity-70">
          {fmtTime(block.start)} – {fmtTime(block.end)}
        </span>
        {delta && <span className="ml-2 text-xs opacity-60">({delta})</span>}
      </div>
      <span className="shrink-0 text-[10px] uppercase opacity-60">
        {block.source}
      </span>
    </div>
  );
}

function fmtTime(d: Date): string {
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDelta(mins: number): string {
  if (mins === 0) return "no change";
  const sign = mins > 0 ? "+" : "";
  return `${sign}${mins} min`;
}
