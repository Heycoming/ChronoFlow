"use client";

/**
 * Task-pool UI. Displays existing tasks and a form to add new ones.
 *
 * Reality Check is rendered server-side (see /tasks/page.tsx) rather than
 * re-running on every keystroke: every time a task is added or removed,
 * `createTask` / `deleteTask` call revalidatePath, which re-renders the
 * server component and refreshes the feasibility banner. This keeps the
 * check authoritative (same pure function, same inputs) without needing
 * a duplicate client-side implementation.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTask, deleteTask } from "@/app/(app)/tasks/actions";
import { WeekdayPicker, formatDays } from "@/components/WeekdayPicker";
import type {
  EnergyType,
  Priority,
  TaskStatus,
  TimeOfDay,
} from "@/types/schedule";

export interface ExistingTask {
  id: string;
  title: string;
  estimatedMinutes: number;
  completedMinutes: number;
  priority: Priority;
  preferredTimeOfDay: TimeOfDay;
  preferredDaysOfWeek: number[];
  energyType: EnergyType;
  deadline: Date | null;
  status: TaskStatus;
  notes: string | null;
}

export interface TaskInputProps {
  tasks: ExistingTask[];
}

const PRIORITIES: Priority[] = ["P0", "P1", "P2", "P3"];
const TOD: TimeOfDay[] = ["ANY", "MORNING", "AFTERNOON", "EVENING", "NIGHT"];
const ENERGY: EnergyType[] = ["HIGH", "LOW", "CREATIVE", "ADMIN"];

const PRIORITY_LABELS: Record<Priority, string> = {
  P0: "P0 · Critical",
  P1: "P1 · High",
  P2: "P2 · Normal",
  P3: "P3 · Low",
};

export function TaskInput({ tasks }: TaskInputProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [estimate, setEstimate] = useState(60);
  const [priority, setPriority] = useState<Priority>("P2");
  const [tod, setTod] = useState<TimeOfDay>("ANY");
  const [days, setDays] = useState<number[]>([]);
  const [energy, setEnergy] = useState<EnergyType>("ADMIN");
  const [deadline, setDeadline] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setErr(null);
    if (!title.trim()) {
      setErr("Title is required.");
      return;
    }
    start(async () => {
      const res = await createTask({
        title: title.trim(),
        estimatedMinutes: estimate,
        priority,
        preferredTimeOfDay: tod,
        preferredDaysOfWeek: days,
        energyType: energy,
        deadline: deadline || undefined,
        notes: notes.trim() || undefined,
      });
      if (!res.ok) {
        setErr(res.error ?? "Create failed");
        return;
      }
      // Reset and let server revalidation refresh the list + Reality Check.
      setTitle("");
      setNotes("");
      setDeadline("");
      setDays([]);
      router.refresh();
    });
  }

  function remove(id: string) {
    start(async () => {
      await deleteTask(id);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Your task pool</h2>
        {tasks.length === 0 ? (
          <p className="mt-3 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-500">
            No tasks yet. Add one on the right to get started.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-4 py-3 text-sm">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-zinc-900">{t.title}</span>
                    <Badge>{t.priority}</Badge>
                    <Badge>{t.energyType}</Badge>
                    {t.preferredTimeOfDay !== "ANY" && (
                      <Badge>{t.preferredTimeOfDay}</Badge>
                    )}
                    <span className="text-xs text-zinc-500">
                      {t.estimatedMinutes} min
                      {t.completedMinutes > 0 && ` (${t.completedMinutes} done)`}
                    </span>
                  </div>
                  {t.preferredDaysOfWeek?.length > 0 && (
                    <p className="mt-0.5 text-xs text-zinc-500">
                      Prefers: {formatDays(t.preferredDaysOfWeek)}
                    </p>
                  )}
                  {t.deadline && (
                    <p className="mt-0.5 text-xs text-zinc-500">
                      Due {t.deadline.toLocaleString()}
                    </p>
                  )}
                  {t.notes && (
                    <p className="mt-0.5 text-xs text-zinc-500 line-clamp-2">{t.notes}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(t.id)}
                  disabled={pending}
                  className="shrink-0 text-xs text-red-600 hover:underline disabled:opacity-40"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Add a task</h2>

        <div className="mt-4 space-y-3">
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              placeholder="Write lab report"
            />
          </Field>

          <Field label="Estimated minutes">
            <input
              type="number"
              min={5}
              max={720}
              value={estimate}
              onChange={(e) => setEstimate(Number(e.target.value) || 0)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </Field>

          <Field label="Priority">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Preferred time of day">
            <select
              value={tod}
              onChange={(e) => setTod(e.target.value as TimeOfDay)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            >
              {TOD.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Preferred days of week (optional)">
            <div className="rounded-lg border border-zinc-300 px-3 py-2">
              <WeekdayPicker value={days} onChange={setDays} />
              <p className="mt-1 text-[10px] text-zinc-500">
                {days.length === 0
                  ? "No day preference — AI may schedule any day."
                  : `AI will prefer: ${formatDays(days)}.`}
              </p>
            </div>
          </Field>

          <Field label="Energy type">
            <select
              value={energy}
              onChange={(e) => setEnergy(e.target.value as EnergyType)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            >
              {ENERGY.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Deadline (optional)">
            <input
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </Field>

          <Field label="Notes (optional)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              placeholder="Context the AI should know"
            />
          </Field>

          {err && <p className="text-xs text-red-600">{err}</p>}

          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? "Adding…" : "Add task"}
          </button>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-600">{label}</span>
      {children}
    </label>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600">
      {children}
    </span>
  );
}
