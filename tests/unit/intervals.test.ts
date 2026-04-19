import { describe, it, expect } from "vitest";
import {
  durationMinutes,
  intersect,
  mergeIntervals,
  subtract,
  totalMinutes,
} from "@/lib/intervals";

const D = (iso: string) => new Date(iso);
const I = (s: string, e: string) => ({ start: D(s), end: D(e) });

describe("durationMinutes", () => {
  it("returns minutes for a half-open interval", () => {
    expect(durationMinutes(I("2026-04-16T09:00:00Z", "2026-04-16T10:30:00Z"))).toBe(90);
  });
  it("returns 0 for zero-length", () => {
    expect(durationMinutes(I("2026-04-16T09:00:00Z", "2026-04-16T09:00:00Z"))).toBe(0);
  });
  it("returns 0 for inverted input rather than negative", () => {
    expect(durationMinutes(I("2026-04-16T10:00:00Z", "2026-04-16T09:00:00Z"))).toBe(0);
  });
});

describe("intersect", () => {
  it("returns the overlap", () => {
    const r = intersect(
      I("2026-04-16T09:00:00Z", "2026-04-16T11:00:00Z"),
      I("2026-04-16T10:00:00Z", "2026-04-16T12:00:00Z"),
    );
    expect(r).not.toBeNull();
    expect(r!.start.toISOString()).toBe("2026-04-16T10:00:00.000Z");
    expect(r!.end.toISOString()).toBe("2026-04-16T11:00:00.000Z");
  });
  it("returns null when intervals only touch", () => {
    expect(
      intersect(
        I("2026-04-16T09:00:00Z", "2026-04-16T10:00:00Z"),
        I("2026-04-16T10:00:00Z", "2026-04-16T11:00:00Z"),
      ),
    ).toBeNull();
  });
  it("returns null when disjoint", () => {
    expect(
      intersect(
        I("2026-04-16T09:00:00Z", "2026-04-16T10:00:00Z"),
        I("2026-04-16T11:00:00Z", "2026-04-16T12:00:00Z"),
      ),
    ).toBeNull();
  });
});

describe("mergeIntervals", () => {
  it("merges overlapping and touching intervals, sorts the result", () => {
    const merged = mergeIntervals([
      I("2026-04-16T11:00:00Z", "2026-04-16T12:00:00Z"),
      I("2026-04-16T09:00:00Z", "2026-04-16T10:30:00Z"),
      I("2026-04-16T10:00:00Z", "2026-04-16T11:00:00Z"),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].start.toISOString()).toBe("2026-04-16T09:00:00.000Z");
    expect(merged[0].end.toISOString()).toBe("2026-04-16T12:00:00.000Z");
  });
  it("keeps disjoint intervals separate", () => {
    const merged = mergeIntervals([
      I("2026-04-16T09:00:00Z", "2026-04-16T10:00:00Z"),
      I("2026-04-16T11:00:00Z", "2026-04-16T12:00:00Z"),
    ]);
    expect(merged).toHaveLength(2);
  });
  it("drops zero-length intervals", () => {
    expect(mergeIntervals([I("2026-04-16T09:00:00Z", "2026-04-16T09:00:00Z")])).toEqual([]);
  });
});

describe("subtract", () => {
  it("returns the whole window when no blockers", () => {
    const free = subtract(I("2026-04-16T09:00:00Z", "2026-04-16T17:00:00Z"), []);
    expect(free).toHaveLength(1);
    expect(totalMinutes(free)).toBe(8 * 60);
  });
  it("carves a single blocker out of the middle", () => {
    const free = subtract(I("2026-04-16T09:00:00Z", "2026-04-16T17:00:00Z"), [
      I("2026-04-16T12:00:00Z", "2026-04-16T13:00:00Z"),
    ]);
    expect(free).toHaveLength(2);
    expect(totalMinutes(free)).toBe(7 * 60);
  });
  it("clips blockers that exceed the window", () => {
    const free = subtract(I("2026-04-16T09:00:00Z", "2026-04-16T17:00:00Z"), [
      I("2026-04-16T08:00:00Z", "2026-04-16T10:00:00Z"),
      I("2026-04-16T16:30:00Z", "2026-04-16T18:00:00Z"),
    ]);
    expect(free).toHaveLength(1);
    expect(totalMinutes(free)).toBe(6 * 60 + 30);
  });
  it("returns empty when window is entirely covered", () => {
    const free = subtract(I("2026-04-16T09:00:00Z", "2026-04-16T17:00:00Z"), [
      I("2026-04-16T08:00:00Z", "2026-04-16T20:00:00Z"),
    ]);
    expect(free).toEqual([]);
  });
  it("does not collapse small fragments — preserves fragmented time", () => {
    // Two 5-minute gaps between three blockers; Reality Check must still see them.
    const free = subtract(I("2026-04-16T09:00:00Z", "2026-04-16T10:00:00Z"), [
      I("2026-04-16T09:05:00Z", "2026-04-16T09:25:00Z"),
      I("2026-04-16T09:30:00Z", "2026-04-16T09:50:00Z"),
    ]);
    // Free: [9:00, 9:05), [9:25, 9:30), [9:50, 10:00) => 5 + 5 + 10 = 20
    expect(totalMinutes(free)).toBe(20);
    expect(free).toHaveLength(3);
  });
});
