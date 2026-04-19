"use client";

/**
 * Constraint setup wizard:
 *   Step 1 — Sleep (one nightly block, may wrap past midnight)
 *   Step 2 — Meals (quick-add defaults + custom)
 *   Step 3 — Hygiene / recurring routines (fully custom: label, time, weekdays)
 *   Summary — all-cards confirmation with fade-in animation, then redirect.
 *
 * Hygiene supports arbitrary weekday patterns via the `WeekdayPicker`, so a
 * user can encode "wash hair Mon/Wed/Fri" or "gym Tue/Thu/Sat" without
 * squeezing into the old fixed presets. True "every N days" that drifts
 * across weeks would need RRULE support in the schema — out of scope for v1.
 */
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addConstraint, deleteConstraint } from "@/app/(app)/onboarding/actions";
import { WeekdayPicker, formatDays } from "@/components/WeekdayPicker";

export interface ExistingConstraint {
  id: string;
  type: "SLEEP" | "MEAL" | "HYGIENE" | "CUSTOM";
  label: string;
  schedule: {
    daysOfWeek: number[];
    startMinuteOfDay: number;
    endMinuteOfDay: number;
  };
}

export interface OnboardingWizardProps {
  initial: ExistingConstraint[];
}

type Step = 1 | 2 | 3 | "summary";

const STEP_TITLES: Record<Exclude<Step, "summary">, string> = {
  1: "Sleep window",
  2: "Meal times",
  3: "Routines",
};

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export function OnboardingWizard({ initial }: OnboardingWizardProps) {
  const [step, setStep] = useState<Step>(1);
  const [items, setItems] = useState<ExistingConstraint[]>(initial);

  // Keep local mirror in sync when the server sends fresh data after revalidate.
  useEffect(() => setItems(initial), [initial]);

  if (step === "summary") {
    return <SummaryView items={items} onEdit={() => setStep(3)} />;
  }

  return (
    <div className="space-y-6">
      <Stepper step={step} setStep={setStep} />
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Step {step} · {STEP_TITLES[step]}</h2>
        {step === 1 && <SleepStep existing={items.filter((c) => c.type === "SLEEP")} />}
        {step === 2 && <MealStep existing={items.filter((c) => c.type === "MEAL")} />}
        {step === 3 && <HygieneStep existing={items.filter((c) => c.type === "HYGIENE")} />}

        <div className="mt-6 flex items-center justify-between border-t border-zinc-100 pt-4">
          <button
            type="button"
            onClick={() => setStep((s) => (s === 1 ? s : ((s as number) - 1) as Step))}
            disabled={step === 1}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
          >
            Back
          </button>
          {step < 3 ? (
            <button
              type="button"
              onClick={() => setStep(((step as number) + 1) as Step)}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep("summary")}
              disabled={items.length === 0}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
            >
              Finish setup
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-zinc-500">
        {items.length === 0
          ? "Add at least one constraint to enable Finish."
          : `${items.length} constraint${items.length === 1 ? "" : "s"} saved so far.`}
      </p>
    </div>
  );
}

// --- Stepper ---

function Stepper({ step, setStep }: { step: Exclude<Step, "summary">; setStep: (s: Step) => void }) {
  return (
    <ol className="flex items-center gap-3 text-sm">
      {[1, 2, 3].map((n) => (
        <li key={n}>
          <button
            type="button"
            onClick={() => setStep(n as Step)}
            className={
              "rounded-full px-3 py-1 transition " +
              (step === n
                ? "bg-zinc-900 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200")
            }
          >
            {n}. {STEP_TITLES[n as Exclude<Step, "summary">]}
          </button>
        </li>
      ))}
    </ol>
  );
}

// --- Step 1: Sleep ---

function SleepStep({ existing }: { existing: ExistingConstraint[] }) {
  const [bedtime, setBedtime] = useState("23:00");
  const [wake, setWake] = useState("07:00");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    setErr(null);
    const startMin = toMinutes(bedtime);
    const endMin = toMinutes(wake);
    if (startMin === endMin) {
      setErr("Bedtime and wake time can't be the same.");
      return;
    }
    start(async () => {
      const res = await addConstraint({
        type: "SLEEP",
        label: `Sleep ${bedtime}–${wake}`,
        schedule: {
          daysOfWeek: ALL_DAYS,
          startMinuteOfDay: startMin,
          endMinuteOfDay: endMin,
        },
        energyCost: 10,
      });
      if (!res.ok) setErr(res.error ?? "Save failed");
    });
  }

  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm text-zinc-600">
        When do you sleep? The AI will never schedule tasks during this window.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <TimeField label="Bedtime" value={bedtime} onChange={setBedtime} />
        <TimeField label="Wake time" value={wake} onChange={setWake} />
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save sleep window"}
        </button>
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <ExistingList items={existing} />
    </div>
  );
}

// --- Step 2: Meals ---

const MEAL_DEFAULTS = [
  { label: "Breakfast", start: "08:00", durationMin: 30 },
  { label: "Lunch", start: "12:30", durationMin: 45 },
  { label: "Dinner", start: "18:30", durationMin: 60 },
];

function MealStep({ existing }: { existing: ExistingConstraint[] }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [custom, setCustom] = useState({ label: "", startTime: "12:00", durationMin: 30 });

  function addMeal(label: string, startTime: string, durationMin: number) {
    setErr(null);
    const startMin = toMinutes(startTime);
    const endMin = startMin + durationMin;
    if (endMin > 1440) {
      setErr("Meal can't cross midnight into the next day.");
      return;
    }
    start(async () => {
      const res = await addConstraint({
        type: "MEAL",
        label,
        schedule: {
          daysOfWeek: ALL_DAYS,
          startMinuteOfDay: startMin,
          endMinuteOfDay: endMin,
        },
        energyCost: 2,
      });
      if (!res.ok) setErr(res.error ?? "Save failed");
    });
  }

  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm text-zinc-600">
        Add recurring meal blocks. Quick-add the typical three, or define your own.
      </p>
      <div className="flex flex-wrap gap-2">
        {MEAL_DEFAULTS.map((m) => (
          <button
            key={m.label}
            type="button"
            onClick={() => addMeal(m.label, m.start, m.durationMin)}
            disabled={pending}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
          >
            + {m.label} @ {m.start} ({m.durationMin} min)
          </button>
        ))}
      </div>
      <div className="rounded-lg border border-dashed border-zinc-300 p-4">
        <p className="mb-2 text-xs font-medium text-zinc-600">Or add a custom meal</p>
        <div className="flex flex-wrap items-end gap-3">
          <LabelField
            label="Name"
            value={custom.label}
            onChange={(v) => setCustom((c) => ({ ...c, label: v }))}
            placeholder="Snack"
          />
          <TimeField
            label="Start"
            value={custom.startTime}
            onChange={(v) => setCustom((c) => ({ ...c, startTime: v }))}
          />
          <NumberField
            label="Duration (min)"
            value={custom.durationMin}
            onChange={(v) => setCustom((c) => ({ ...c, durationMin: v }))}
          />
          <button
            type="button"
            onClick={() => {
              if (!custom.label.trim()) {
                setErr("Meal name is required.");
                return;
              }
              addMeal(custom.label.trim(), custom.startTime, custom.durationMin);
            }}
            disabled={pending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <ExistingList items={existing} />
    </div>
  );
}

// --- Step 3: Hygiene / recurring routines (fully custom) ---

const HYGIENE_PRESETS = [
  { label: "Morning routine", start: "07:00", durationMin: 30, days: ALL_DAYS },
  { label: "Evening routine", start: "22:00", durationMin: 30, days: ALL_DAYS },
  { label: "Shower", start: "07:30", durationMin: 20, days: ALL_DAYS },
  { label: "Wash hair", start: "21:00", durationMin: 30, days: [1, 3, 5] },
  { label: "Gym", start: "18:00", durationMin: 60, days: [1, 3, 5] },
  { label: "Commute prep", start: "08:30", durationMin: 15, days: [1, 2, 3, 4, 5] },
];

function HygieneStep({ existing }: { existing: ExistingConstraint[] }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [custom, setCustom] = useState({
    label: "",
    startTime: "20:00",
    durationMin: 30,
    days: [...ALL_DAYS],
  });

  function addHygiene(label: string, startTime: string, durationMin: number, days: number[]) {
    setErr(null);
    if (days.length === 0) {
      setErr("Pick at least one weekday.");
      return;
    }
    const startMin = toMinutes(startTime);
    const endMin = startMin + durationMin;
    if (endMin > 1440) {
      setErr("Routine can't cross midnight into the next day.");
      return;
    }
    start(async () => {
      const res = await addConstraint({
        type: "HYGIENE",
        label,
        schedule: {
          daysOfWeek: [...days].sort((a, b) => a - b),
          startMinuteOfDay: startMin,
          endMinuteOfDay: endMin,
        },
        energyCost: 1,
      });
      if (!res.ok) setErr(res.error ?? "Save failed");
    });
  }

  return (
    <div className="mt-4 space-y-5">
      <p className="text-sm text-zinc-600">
        Any recurring block that isn't a meal — shower, wash hair, workout, commute prep,
        meditation. Pick specific weekdays so "wash hair Mon/Wed/Fri" becomes a proper
        constraint.
      </p>

      {/* Quick-add */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Quick add
        </p>
        <div className="flex flex-wrap gap-2">
          {HYGIENE_PRESETS.map((h) => (
            <button
              key={h.label}
              type="button"
              onClick={() => addHygiene(h.label, h.start, h.durationMin, h.days)}
              disabled={pending}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
              title={`${h.start} · ${h.durationMin} min · ${formatDays(h.days)}`}
            >
              + {h.label}
              <span className="ml-1 text-[10px] text-zinc-500">
                ({formatDays(h.days)})
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Full custom form */}
      <div className="rounded-lg border border-dashed border-zinc-300 p-4">
        <p className="mb-3 text-xs font-medium text-zinc-600">Custom routine</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <LabelField
            label="Name"
            value={custom.label}
            onChange={(v) => setCustom((c) => ({ ...c, label: v }))}
            placeholder="Wash hair, gym, meditation..."
            fullWidth
          />
          <div className="flex items-end gap-3">
            <TimeField
              label="Start"
              value={custom.startTime}
              onChange={(v) => setCustom((c) => ({ ...c, startTime: v }))}
            />
            <NumberField
              label="Duration (min)"
              value={custom.durationMin}
              onChange={(v) => setCustom((c) => ({ ...c, durationMin: v }))}
            />
          </div>
        </div>
        <div className="mt-3">
          <p className="mb-1 text-xs font-medium text-zinc-600">Days of the week</p>
          <WeekdayPicker
            value={custom.days}
            onChange={(days) => setCustom((c) => ({ ...c, days }))}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            if (!custom.label.trim()) {
              setErr("Routine name is required.");
              return;
            }
            addHygiene(
              custom.label.trim(),
              custom.startTime,
              custom.durationMin,
              custom.days,
            );
          }}
          disabled={pending}
          className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Add routine"}
        </button>
      </div>

      {err && <p className="text-xs text-red-600">{err}</p>}
      <ExistingList items={existing} />
    </div>
  );
}

// --- Summary / confirmation view ---

function SummaryView({
  items,
  onEdit,
}: {
  items: ExistingConstraint[];
  onEdit: () => void;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<"cards" | "loading" | "done">("cards");

  // Staged choreography: cards fade in (index * 80ms), then brief "Setting up…"
  // spinner, then push the user to /tasks to start entering work.
  useEffect(() => {
    const cardsDoneAt = Math.max(600, items.length * 80 + 400);
    const t1 = setTimeout(() => setPhase("loading"), cardsDoneAt);
    const t2 = setTimeout(() => {
      setPhase("done");
      router.push("/tasks");
    }, cardsDoneAt + 1200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [items.length, router]);

  const grouped = {
    SLEEP: items.filter((i) => i.type === "SLEEP"),
    MEAL: items.filter((i) => i.type === "MEAL"),
    HYGIENE: items.filter((i) => i.type === "HYGIENE"),
    CUSTOM: items.filter((i) => i.type === "CUSTOM"),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold">Your weekly baseline</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Here's what ChronoFlow will protect when it schedules around your tasks.
          </p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="text-xs text-zinc-500 hover:text-zinc-900"
        >
          ← Edit
        </button>
      </div>

      {(["SLEEP", "MEAL", "HYGIENE", "CUSTOM"] as const).map((type) => {
        const group = grouped[type];
        if (group.length === 0) return null;
        return (
          <section key={type}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {typeLabel(type)}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.map((it, localIdx) => {
                const globalIdx = items.indexOf(it);
                return <ConstraintCard key={it.id} item={it} index={globalIdx} />;
              })}
            </div>
          </section>
        );
      })}

      <div className="flex items-center justify-center pt-4">
        {phase === "cards" && (
          <p className="text-xs text-zinc-500">Reviewing {items.length} constraints…</p>
        )}
        {phase === "loading" && (
          <div className="flex items-center gap-2 text-sm text-zinc-600">
            <Spinner />
            <span>Setting up your week…</span>
          </div>
        )}
        {phase === "done" && (
          <div className="flex items-center gap-2 text-sm text-green-700">
            <span>✓ Done. Redirecting to tasks…</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ConstraintCard({ item, index }: { item: ExistingConstraint; index: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), index * 80);
    return () => clearTimeout(t);
  }, [index]);

  const color = TYPE_COLORS[item.type] ?? TYPE_COLORS.CUSTOM;

  return (
    <div
      className={
        "rounded-xl border p-4 shadow-sm transition-all duration-500 ease-out " +
        color +
        " " +
        (visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3")
      }
    >
      <p className="text-sm font-medium">{item.label}</p>
      <p className="mt-1 text-xs text-zinc-600">
        {formatMinutes(item.schedule.startMinuteOfDay)} –{" "}
        {formatMinutes(item.schedule.endMinuteOfDay)}
      </p>
      <p className="mt-0.5 text-[11px] text-zinc-500">{formatDays(item.schedule.daysOfWeek)}</p>
    </div>
  );
}

const TYPE_COLORS: Record<ExistingConstraint["type"], string> = {
  SLEEP: "border-indigo-200 bg-indigo-50",
  MEAL: "border-amber-200 bg-amber-50",
  HYGIENE: "border-emerald-200 bg-emerald-50",
  CUSTOM: "border-zinc-200 bg-zinc-50",
};

function typeLabel(t: ExistingConstraint["type"]): string {
  return { SLEEP: "Sleep", MEAL: "Meals", HYGIENE: "Routines", CUSTOM: "Custom" }[t];
}

function Spinner() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700"
      aria-hidden
    />
  );
}

// --- Shared ---

function ExistingList({ items }: { items: ExistingConstraint[] }) {
  const [pending, start] = useTransition();

  if (items.length === 0) {
    return (
      <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
        No entries yet.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
      {items.map((it) => (
        <li key={it.id} className="flex items-center justify-between px-3 py-2 text-sm">
          <span>
            <span className="font-medium">{it.label}</span>{" "}
            <span className="text-zinc-500">
              · {formatMinutes(it.schedule.startMinuteOfDay)}–
              {formatMinutes(it.schedule.endMinuteOfDay)} · {formatDays(it.schedule.daysOfWeek)}
            </span>
          </span>
          <button
            type="button"
            onClick={() => start(() => deleteConstraint(it.id).then(() => undefined))}
            disabled={pending}
            className="text-xs text-red-600 hover:underline disabled:opacity-40"
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-600">
      {label}
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-zinc-300 px-2 py-1 text-sm text-zinc-900"
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-600">
      {label}
      <input
        type="number"
        min={5}
        max={240}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-24 rounded-lg border border-zinc-300 px-2 py-1 text-sm text-zinc-900"
      />
    </label>
  );
}

function LabelField({
  label,
  value,
  onChange,
  placeholder,
  fullWidth = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  fullWidth?: boolean;
}) {
  return (
    <label className={`flex flex-col gap-1 text-xs text-zinc-600 ${fullWidth ? "w-full" : ""}`}>
      {label}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={
          "rounded-lg border border-zinc-300 px-2 py-1 text-sm text-zinc-900 " +
          (fullWidth ? "w-full" : "w-40")
        }
      />
    </label>
  );
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function formatMinutes(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${pad(h)}:${pad(m)}`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
