"use client";

/**
 * Horizontal timeline calendar.
 *
 * Layout:
 *   Y-axis = days of the week (rows)
 *   X-axis = hours 1:00 AM → 1:00 AM next day (24h span)
 *
 * Sleep zones are rendered as grayed-out background regions with a moon icon,
 * NOT as event blocks. All other blocks are positioned horizontally.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, addDays, startOfWeek, isSameDay } from "date-fns";

import { useScheduleStore } from "@/store/scheduleStore";
import { CheckInModal } from "@/components/CheckInModal";
import type { BlockSource, TimeBlockInput } from "@/types/schedule";

interface DateInterval {
  start: Date;
  end: Date;
}

// --- Constants ---------------------------------------------------------------

const DAY_START_HOUR = 1; // 1 AM
const TOTAL_HOURS = 24;
const HOUR_WIDTH_PX = 80;
const TIMELINE_WIDTH = TOTAL_HOURS * HOUR_WIDTH_PX; // 1920px
const ROW_HEIGHT = 90;
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LABEL_COL_WIDTH = 56;

const COLORS: Record<BlockSource, { bg: string; border: string; text: string }> = {
  GCAL: { bg: "#e4e4e7", border: "#a1a1aa", text: "#18181b" },
  AI: { bg: "#dbeafe", border: "#3b82f6", text: "#1e3a8a" },
  BUFFER: { bg: "#fef3c7", border: "#f59e0b", text: "#92400e" },
  MANUAL: { bg: "#dcfce7", border: "#22c55e", text: "#14532d" },
  ROUTINE: { bg: "#ede9fe", border: "#8b5cf6", text: "#5b21b6" },
};

const FILTER_LABELS: Record<BlockSource, string> = {
  GCAL: "Google Cal",
  AI: "AI Tasks",
  BUFFER: "Buffers",
  MANUAL: "Manual",
  ROUTINE: "Routines",
};

const ALL_SOURCES: BlockSource[] = ["GCAL", "AI", "BUFFER", "MANUAL", "ROUTINE"];

// --- Helpers -----------------------------------------------------------------

/** Convert an absolute Date into a pixel offset within a day row (1AM-based). */
function timeToPx(date: Date, dayAnchor1AM: Date): number {
  const ms = date.getTime() - dayAnchor1AM.getTime();
  const hours = ms / 3_600_000;
  return Math.max(0, Math.min(TOTAL_HOURS, hours)) * HOUR_WIDTH_PX;
}

function formatTime(d: Date): string {
  return format(d, "h:mm a");
}

// --- Component ---------------------------------------------------------------

export interface CalendarGridProps {
  initialBlocks: TimeBlockInput[];
  /** Sleep intervals (grayed zones, not event blocks). Serialized from server. */
  sleepIntervals?: Array<{ start: string; end: string }>;
}

export function CalendarGrid({ initialBlocks, sleepIntervals: rawSleep = [] }: CalendarGridProps) {
  const sleepIntervals = useMemo(
    () => rawSleep.map((s) => ({ start: new Date(s.start), end: new Date(s.end) })),
    [rawSleep],
  );
  const blocks = useScheduleStore((s) => s.blocks);
  const setBlocks = useScheduleStore((s) => s.setBlocks);
  const [checkInBlock, setCheckInBlock] = useState<TimeBlockInput | null>(null);
  const [hiddenSources, setHiddenSources] = useState<Set<BlockSource>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Next.js serializes Date objects to strings when passing from server → client.
    const hydrated = initialBlocks.map((b) => ({
      ...b,
      start: b.start instanceof Date ? b.start : new Date(b.start),
      end: b.end instanceof Date ? b.end : new Date(b.end),
    }));
    setBlocks(hydrated);
  }, [initialBlocks, setBlocks]);

  // Auto-scroll to ~current hour on mount
  useEffect(() => {
    if (scrollRef.current) {
      const now = new Date();
      const hoursSince1AM = now.getHours() - DAY_START_HOUR + now.getMinutes() / 60;
      const scrollTo = Math.max(0, hoursSince1AM - 2) * HOUR_WIDTH_PX;
      scrollRef.current.scrollLeft = scrollTo;
    }
  }, []);

  const toggleSource = useCallback((source: BlockSource) => {
    setHiddenSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  }, []);

  // Week starting Monday
  const weekStart = useMemo(() => {
    const ws = startOfWeek(new Date(), { weekStartsOn: 1 });
    return ws;
  }, []);

  // 7 day anchors at 1AM
  const dayAnchors = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(weekStart, i);
      d.setHours(DAY_START_HOUR, 0, 0, 0);
      return d;
    });
  }, [weekStart]);

  // Group blocks by day index
  const blocksByDay = useMemo(() => {
    const filtered = blocks.filter((b) => !hiddenSources.has(b.source));
    const grouped: TimeBlockInput[][] = Array.from({ length: 7 }, () => []);

    for (const b of filtered) {
      for (let di = 0; di < 7; di++) {
        const dayStart = dayAnchors[di];
        const dayEnd = new Date(dayStart.getTime() + TOTAL_HOURS * 3_600_000);
        if (b.start < dayEnd && b.end > dayStart) {
          grouped[di].push(b);
        }
      }
    }
    return grouped;
  }, [blocks, hiddenSources, dayAnchors]);

  // Group sleep intervals by day
  const sleepByDay = useMemo(() => {
    const grouped: DateInterval[][] = Array.from({ length: 7 }, () => []);
    for (const s of sleepIntervals) {
      for (let di = 0; di < 7; di++) {
        const dayStart = dayAnchors[di];
        const dayEnd = new Date(dayStart.getTime() + TOTAL_HOURS * 3_600_000);
        if (s.start < dayEnd && s.end > dayStart) {
          grouped[di].push({
            start: new Date(Math.max(s.start.getTime(), dayStart.getTime())),
            end: new Date(Math.min(s.end.getTime(), dayEnd.getTime())),
          });
        }
      }
    }
    return grouped;
  }, [sleepIntervals, dayAnchors]);

  const handleBlockClick = useCallback(
    (block: TimeBlockInput) => {
      if (block.source === "AI") setCheckInBlock(block);
    },
    [],
  );

  // Hour labels for 1AM → 12AM next day
  const hourLabels = useMemo(() => {
    return Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => {
      const h = (DAY_START_HOUR + i) % 24;
      if (h === 0) return "12 AM";
      if (h === 12) return "12 PM";
      if (h < 12) return `${h} AM`;
      return `${h - 12} PM`;
    });
  }, []);

  // "now" state — only set after mount to avoid SSR/client mismatch.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      {/* Category filter pills */}
      <div className="mb-3 flex flex-wrap gap-2">
        {ALL_SOURCES.map((src) => {
          const active = !hiddenSources.has(src);
          const c = COLORS[src];
          return (
            <button
              key={src}
              type="button"
              onClick={() => toggleSource(src)}
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all"
              style={{
                backgroundColor: active ? c.bg : "transparent",
                borderColor: active ? c.border : "#d4d4d8",
                color: active ? c.text : "#a1a1aa",
                opacity: active ? 1 : 0.5,
              }}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: active ? c.border : "#d4d4d8" }}
              />
              {FILTER_LABELS[src]}
            </button>
          );
        })}
      </div>

      {/* Timeline grid */}
      <div className="rounded-xl border border-zinc-200 bg-white">
        <div className="flex">
          {/* Day labels column (sticky) */}
          <div className="sticky left-0 z-20 flex-shrink-0 bg-white border-r border-zinc-200" style={{ width: LABEL_COL_WIDTH }}>
            {/* Corner cell for hour header */}
            <div className="h-6 border-b border-zinc-100" />
            {DAY_LABELS.map((label, di) => {
              const dayDate = addDays(weekStart, di);
              const isToday = now && isSameDay(dayDate, now);
              return (
                <div
                  key={label}
                  className="flex flex-col items-center justify-center border-b border-zinc-100 text-xs"
                  style={{ height: ROW_HEIGHT }}
                >
                  <span className={`font-medium ${isToday ? "text-blue-600" : "text-zinc-500"}`}>
                    {label}
                  </span>
                  <span className={`text-[10px] ${isToday ? "rounded-full bg-blue-600 text-white w-5 h-5 flex items-center justify-center" : "text-zinc-400"}`}>
                    {format(dayDate, "d")}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Scrollable timeline area */}
          <div ref={scrollRef} className="overflow-x-auto flex-1">
            <div style={{ width: TIMELINE_WIDTH, minWidth: "100%" }}>
              {/* Hour header */}
              <div className="flex h-6 border-b border-zinc-100">
                {hourLabels.map((label, i) => (
                  <div
                    key={i}
                    className="text-[10px] text-zinc-400 border-l border-zinc-100 pl-1 flex-shrink-0"
                    style={{ width: i < TOTAL_HOURS ? HOUR_WIDTH_PX : 0 }}
                  >
                    {label}
                  </div>
                ))}
              </div>

              {/* Day rows */}
              {dayAnchors.map((anchor, di) => (
                <div
                  key={di}
                  className="relative border-b border-zinc-100"
                  style={{ height: ROW_HEIGHT }}
                >
                  {/* Hour grid lines */}
                  {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 border-l border-zinc-50"
                      style={{ left: i * HOUR_WIDTH_PX }}
                    />
                  ))}

                  {/* Sleep zones (gray background) */}
                  {sleepByDay[di].map((s, si) => {
                    const left = timeToPx(s.start, anchor);
                    const right = timeToPx(s.end, anchor);
                    const width = right - left;
                    return (
                      <div
                        key={`sleep-${si}`}
                        className="absolute top-0 bottom-0 flex items-center justify-center"
                        style={{
                          left,
                          width,
                          background: "repeating-linear-gradient(45deg, #f4f4f5, #f4f4f5 4px, #e4e4e7 4px, #e4e4e7 8px)",
                          opacity: 0.5,
                        }}
                      >
                        {width > 40 && (
                          <span className="text-zinc-400 text-lg select-none" title="Sleep">
                            🌙
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {/* Event blocks */}
                  {blocksByDay[di].map((b) => {
                    const clampedStart = new Date(Math.max(b.start.getTime(), anchor.getTime()));
                    const dayEnd = new Date(anchor.getTime() + TOTAL_HOURS * 3_600_000);
                    const clampedEnd = new Date(Math.min(b.end.getTime(), dayEnd.getTime()));

                    const left = timeToPx(clampedStart, anchor);
                    const right = timeToPx(clampedEnd, anchor);
                    const width = right - left;
                    if (width < 2) return null;

                    const c = COLORS[b.source] ?? COLORS.GCAL;
                    const isBuffer = b.source === "BUFFER";
                    const isAI = b.source === "AI";
                    const durationMin = Math.round((clampedEnd.getTime() - clampedStart.getTime()) / 60_000);

                    return (
                      <div
                        key={b.id}
                        className="absolute rounded group"
                        style={{
                          left,
                          width: Math.max(width, 4),
                          top: 4,
                          bottom: 4,
                          backgroundColor: c.bg,
                          borderLeft: `3px solid ${c.border}`,
                          color: c.text,
                          cursor: isAI ? "pointer" : "default",
                          opacity: isBuffer ? 0.75 : 1,
                          overflow: "hidden",
                          zIndex: isBuffer ? 5 : 10,
                        }}
                        onClick={() => handleBlockClick(b)}
                        title={`${b.title}\n${formatTime(clampedStart)} – ${formatTime(clampedEnd)} (${durationMin}min)`}
                      >
                        <div className="px-1.5 py-0.5 h-full flex flex-col justify-center overflow-hidden">
                          <div
                            className="font-medium truncate leading-tight"
                            style={{ fontSize: isBuffer ? "9px" : width < 60 ? "9px" : "11px" }}
                          >
                            {b.title}
                          </div>
                          {!isBuffer && width > 80 && (
                            <div className="text-[9px] opacity-70 truncate leading-tight">
                              {formatTime(clampedStart)}–{formatTime(clampedEnd)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Now indicator (client-only to avoid hydration mismatch) */}
                  {now && isSameDay(addDays(weekStart, di), now) && (() => {
                    const nowPx = timeToPx(now, anchor);
                    if (nowPx > 0 && nowPx < TIMELINE_WIDTH) {
                      return (
                        <div
                          className="absolute top-0 bottom-0 z-30 pointer-events-none"
                          style={{ left: nowPx }}
                        >
                          <div className="w-0.5 h-full bg-red-500 opacity-70" />
                          <div className="absolute -top-0.5 -left-1 w-2.5 h-2.5 rounded-full bg-red-500" />
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {checkInBlock && (
        <CheckInModal
          block={checkInBlock}
          onClose={() => setCheckInBlock(null)}
        />
      )}
    </>
  );
}
