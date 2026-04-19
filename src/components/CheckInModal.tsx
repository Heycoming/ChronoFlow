"use client";

/**
 * Check-in modal. Fires when the user clicks on an AI-scheduled time block
 * on the calendar. The user reports: ON_TIME, EARLY, LATE, or SKIPPED.
 *
 * EARLY/LATE outcomes hit POST /api/checkin which triggers a 48h partial
 * reflow; the resulting proposal is pushed into the Zustand store so the
 * DiffView renders automatically.
 *
 * ON_TIME/SKIPPED simply mark the block done/skipped with no reflow.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useScheduleStore } from "@/store/scheduleStore";
import type { TimeBlockInput } from "@/types/schedule";

export interface CheckInModalProps {
  block: TimeBlockInput;
  onClose: () => void;
}

type Outcome = "ON_TIME" | "EARLY" | "LATE" | "SKIPPED";

export function CheckInModal({ block, onClose }: CheckInModalProps) {
  const router = useRouter();
  const setProposal = useScheduleStore((s) => s.setProposal);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [actualMinutes, setActualMinutes] = useState(
    Math.round((block.end.getTime() - block.start.getTime()) / 60_000),
  );
  const [extraMinutes, setExtraMinutes] = useState(15);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!outcome) return;
    setError(null);
    start(async () => {
      try {
        const res = await fetch("/api/checkin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            timeBlockId: block.id,
            outcome,
            actualMinutes: outcome === "EARLY" ? actualMinutes : undefined,
            extraMinutes: outcome === "LATE" ? extraMinutes : undefined,
            note: note.trim() || undefined,
          }),
        });
        const json = await res.json();
        if (!json.ok) {
          setError(json.error ?? "Check-in failed");
          return;
        }

        // If reflow was triggered, push the proposal into the store.
        if (json.reflow && json.versionId) {
          const toBlock = (b: {
            id: string;
            taskId: string | null;
            source: string;
            start: string;
            end: string;
            title: string;
            status: string;
          }) => ({
            id: b.id,
            taskId: b.taskId ?? null,
            source: b.source as TimeBlockInput["source"],
            start: new Date(b.start),
            end: new Date(b.end),
            title: b.title,
            status: b.status as TimeBlockInput["status"],
          });

          setProposal({
            versionId: json.versionId,
            proposedBlocks: (json.proposedBlocks ?? []).map(toBlock),
            previousBlocks: (json.previousBlocks ?? []).map(toBlock),
          });
        }

        router.refresh();
        onClose();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold">Check in</h2>
        <p className="mt-1 text-sm text-zinc-600">
          <span className="font-medium">{block.title}</span>{" "}
          <span className="text-zinc-500">
            {fmtTime(block.start)} – {fmtTime(block.end)}
          </span>
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {(["ON_TIME", "EARLY", "LATE", "SKIPPED"] as Outcome[]).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setOutcome(o)}
              className={
                "rounded-lg border px-3 py-2 text-sm font-medium transition " +
                (outcome === o
                  ? OUTCOME_ACTIVE[o]
                  : "border-zinc-200 text-zinc-700 hover:bg-zinc-50")
              }
            >
              {OUTCOME_LABEL[o]}
            </button>
          ))}
        </div>

        {outcome === "EARLY" && (
          <div className="mt-3">
            <label className="block text-xs font-medium text-zinc-600">
              How many minutes did you actually spend?
            </label>
            <input
              type="number"
              min={0}
              value={actualMinutes}
              onChange={(e) => setActualMinutes(Number(e.target.value) || 0)}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
        )}

        {outcome === "LATE" && (
          <div className="mt-3">
            <label className="block text-xs font-medium text-zinc-600">
              How many extra minutes do you need?
            </label>
            <input
              type="number"
              min={1}
              value={extraMinutes}
              onChange={(e) => setExtraMinutes(Number(e.target.value) || 0)}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
        )}

        <div className="mt-3">
          <label className="block text-xs font-medium text-zinc-600">
            Note (optional)
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Any context for the AI..."
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>

        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!outcome || pending}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? "Submitting…" : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}

const OUTCOME_LABEL: Record<Outcome, string> = {
  ON_TIME: "On time",
  EARLY: "Finished early",
  LATE: "Running late",
  SKIPPED: "Skipped",
};

const OUTCOME_ACTIVE: Record<Outcome, string> = {
  ON_TIME: "border-green-300 bg-green-50 text-green-800",
  EARLY: "border-blue-300 bg-blue-50 text-blue-800",
  LATE: "border-amber-300 bg-amber-50 text-amber-800",
  SKIPPED: "border-red-300 bg-red-50 text-red-800",
};

function fmtTime(d: Date): string {
  return d.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}
