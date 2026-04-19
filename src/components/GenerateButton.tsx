"use client";

/**
 * "Generate Schedule" button on the calendar page. Calls POST /api/schedule/generate,
 * then pushes the proposal into the Zustand store so DiffView can render it.
 * Also shows errors and reality-check failure inline.
 */
import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useScheduleStore } from "@/store/scheduleStore";

interface GenerateResponse {
  ok: boolean;
  versionId?: string;
  proposedBlocks?: Array<{
    id: string;
    taskId: string | null;
    source: string;
    start: string;
    end: string;
    title: string;
    status: string;
  }>;
  previousBlocks?: Array<{
    id: string;
    taskId: string | null;
    source: string;
    start: string;
    end: string;
    title: string;
    status: string;
  }>;
  summary?: string;
  error?: string;
  realityCheck?: { feasible: boolean; slackMinutes: number };
}

export function GenerateButton() {
  const router = useRouter();
  const setProposal = useScheduleStore((s) => s.setProposal);
  const [isPending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isPending) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isPending]);

  function generate() {
    setError(null);
    start(async () => {
      try {
        const res = await fetch("/api/schedule/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const json: GenerateResponse = await res.json();

        if (!json.ok) {
          setError(json.error ?? "Generation failed");
          return;
        }

        const toBlock = (b: GenerateResponse["proposedBlocks"] extends (infer T)[] | undefined ? NonNullable<T> : never) => ({
          id: b.id,
          taskId: b.taskId ?? null,
          source: b.source as "AI" | "BUFFER" | "GCAL" | "MANUAL",
          start: new Date(b.start),
          end: new Date(b.end),
          title: b.title,
          status: b.status as "PLANNED" | "IN_PROGRESS" | "DONE" | "SKIPPED",
        });

        setProposal({
          versionId: json.versionId!,
          proposedBlocks: (json.proposedBlocks ?? []).map(toBlock),
          previousBlocks: (json.previousBlocks ?? []).map(toBlock),
        });

        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={generate}
        disabled={isPending}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? `Generating… ${elapsed}s` : "Generate Schedule"}
      </button>
      {error && (
        <p className="max-w-sm text-right text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
