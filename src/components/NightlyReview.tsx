"use client";

/**
 * Client portion of the nightly review page. Renders overdue blocks, a
 * "Defer & Reflow" button that marks all overdue blocks as SKIPPED and
 * triggers a 48h partial reflow, then shows the Diff View for approval.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useScheduleStore } from "@/store/scheduleStore";
import { DiffView } from "@/components/DiffView";
import type { TimeBlockInput } from "@/types/schedule";

interface OverdueBlock {
  id: string;
  taskId: string | null;
  title: string;
  start: string;
  end: string;
  source: string;
  status: string;
}

interface NightlyReviewClientProps {
  overdueBlocks: OverdueBlock[];
  pendingTaskCount: number;
}

export function NightlyReviewClient({
  overdueBlocks,
  pendingTaskCount,
}: NightlyReviewClientProps) {
  const router = useRouter();
  const setProposal = useScheduleStore((s) => s.setProposal);
  const proposal = useScheduleStore((s) => s.proposal);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function deferAndReflow() {
    setError(null);
    start(async () => {
      try {
        // Mark each overdue block as SKIPPED via individual check-in calls.
        for (const b of overdueBlocks) {
          await fetch("/api/checkin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              timeBlockId: b.id,
              outcome: "SKIPPED",
              note: "Batch-deferred via nightly review",
            }),
          });
        }

        // Trigger a 48h partial reflow.
        const res = await fetch("/api/schedule/reflow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            checkInNote: `Nightly review: ${overdueBlocks.length} block(s) deferred. Reschedule remaining work for tomorrow.`,
          }),
        });
        const json = await res.json();

        if (json.ok && json.versionId) {
          const toBlock = (b: {
            id: string;
            taskId: string | null;
            source: string;
            start: string;
            end: string;
            title: string;
            status: string;
          }): TimeBlockInput => ({
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
        } else {
          // Reflow failed or no tasks to schedule — just refresh.
          router.refresh();
        }
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  if (overdueBlocks.length === 0 && !proposal) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-5 text-sm text-green-900">
        <p className="font-medium">All clear for today!</p>
        <p className="mt-1 text-xs">
          {pendingTaskCount > 0
            ? `${pendingTaskCount} task${pendingTaskCount === 1 ? "" : "s"} pending for upcoming days.`
            : "No pending tasks. Take a break."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {overdueBlocks.length > 0 && (
        <section className="rounded-xl border border-red-200 bg-red-50 p-5">
          <h2 className="text-sm font-semibold text-red-900">
            {overdueBlocks.length} overdue block
            {overdueBlocks.length === 1 ? "" : "s"}
          </h2>
          <ul className="mt-2 space-y-1">
            {overdueBlocks.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between text-sm text-red-800"
              >
                <span className="font-medium">{b.title}</span>
                <span className="text-xs text-red-600">
                  {new Date(b.start).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}{" "}
                  –{" "}
                  {new Date(b.end).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={deferAndReflow}
            disabled={pending}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {pending ? "Deferring & reflowing…" : "Defer all & reflow tomorrow"}
          </button>
          {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
        </section>
      )}

      <DiffView />
    </div>
  );
}
