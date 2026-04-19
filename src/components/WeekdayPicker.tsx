"use client";

/**
 * Weekday picker — S M T W T F S pills. Used by:
 *   - OnboardingWizard (hygiene step) for custom recurrence
 *   - TaskInput for optional day-of-week preferences
 *
 * Accepts/returns a sorted number[] where 0=Sun ... 6=Sat.
 * Empty array means "no preference" / "every day" depending on caller intent —
 * the caller decides the semantics by its label.
 */
import { useCallback } from "react";

const DAYS = [
  { n: 0, short: "S", long: "Sun" },
  { n: 1, short: "M", long: "Mon" },
  { n: 2, short: "T", long: "Tue" },
  { n: 3, short: "W", long: "Wed" },
  { n: 4, short: "T", long: "Thu" },
  { n: 5, short: "F", long: "Fri" },
  { n: 6, short: "S", long: "Sat" },
];

const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [0, 6];
const ALL = [0, 1, 2, 3, 4, 5, 6];

export interface WeekdayPickerProps {
  value: number[];
  onChange: (days: number[]) => void;
  /** Show quick-pick buttons for Weekdays / Weekend / Every day. */
  withPresets?: boolean;
}

export function WeekdayPicker({ value, onChange, withPresets = true }: WeekdayPickerProps) {
  const toggle = useCallback(
    (d: number) => {
      const set = new Set(value);
      if (set.has(d)) set.delete(d);
      else set.add(d);
      onChange([...set].sort((a, b) => a - b));
    },
    [value, onChange],
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {DAYS.map((d) => {
          const on = value.includes(d.n);
          return (
            <button
              key={d.n}
              type="button"
              onClick={() => toggle(d.n)}
              title={d.long}
              className={
                "h-8 w-8 rounded-full text-xs font-medium transition " +
                (on
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200")
              }
            >
              {d.short}
            </button>
          );
        })}
      </div>
      {withPresets && (
        <div className="flex flex-wrap gap-1 text-[11px]">
          <Preset label="Every day" onClick={() => onChange(ALL)} />
          <Preset label="Weekdays" onClick={() => onChange(WEEKDAYS)} />
          <Preset label="Weekend" onClick={() => onChange(WEEKEND)} />
          <Preset label="Clear" onClick={() => onChange([])} />
        </div>
      )}
    </div>
  );
}

function Preset({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-zinc-600 hover:border-zinc-300 hover:text-zinc-900"
    >
      {label}
    </button>
  );
}

export function formatDays(days: number[]): string {
  if (days.length === 0) return "no preference";
  if (days.length === 7) return "every day";
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return "weekdays";
  if (days.length === 2 && days.includes(0) && days.includes(6)) return "weekend";
  return days.map((d) => DAYS[d]?.long ?? "?").join("/");
}
