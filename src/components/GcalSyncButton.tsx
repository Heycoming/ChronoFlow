"use client";

/**
 * Dev/debug button that triggers POST /api/gcal/sync and surfaces the
 * response. The real CalendarGrid (task 8) will run this silently on
 * mount; this component just makes the flow observable while we're
 * building out the pipeline.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type SyncResponse =
  | { ok: true; window: { start: string; end: string }; fetched: number; imported: number; skipped: number }
  | { error: string };

export function GcalSyncButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<SyncResponse | null>(null);

  async function sync() {
    setResult(null);
    const res = await fetch("/api/gcal/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const json = (await res.json()) as SyncResponse;
    setResult(json);
    if ("ok" in json && json.ok) {
      startTransition(() => router.refresh());
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={sync}
        disabled={isPending}
        className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
      >
        {isPending ? "Syncing…" : "Sync Google Calendar"}
      </button>
      {result && "ok" in result && result.ok && (
        <span className="text-xs text-zinc-500">
          Fetched {result.fetched}, imported {result.imported}, skipped {result.skipped}
        </span>
      )}
      {result && "error" in result && (
        <span className="text-xs text-red-600">{result.error}</span>
      )}
    </div>
  );
}
