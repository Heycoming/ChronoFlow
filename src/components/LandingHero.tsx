"use client";

/**
 * Landing page — split layout:
 *   Left: 3D spatial scene with floating glassmorphism task cards
 *   Right: Hero text, tagline, CTA button
 *
 * Interactions: mouse-move parallax, scroll-to-zoom, hover focus.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChronoFlowLogo } from "./ChronoFlowLogo";

// --- Demo task data ----------------------------------------------------------

interface DemoTask {
  id: string;
  title: string;
  energy: "HIGH" | "LOW" | "CREATIVE" | "ADMIN";
  duration: string;
  priority: string;
  x: number;
  y: number;
  z: number;
}

const ENERGY_COLORS: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  HIGH: { bg: "rgba(59,130,246,0.10)", border: "rgba(59,130,246,0.30)", text: "#1e3a8a", badge: "#3b82f6" },
  LOW: { bg: "rgba(34,197,94,0.10)", border: "rgba(34,197,94,0.30)", text: "#14532d", badge: "#22c55e" },
  CREATIVE: { bg: "rgba(139,92,246,0.10)", border: "rgba(139,92,246,0.30)", text: "#5b21b6", badge: "#8b5cf6" },
  ADMIN: { bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.30)", text: "#92400e", badge: "#f59e0b" },
};

const DEMO_TASKS: DemoTask[] = [
  { id: "t1", title: "CS 511 Final Report", energy: "HIGH", duration: "3h", priority: "P0", x: -120, y: -100, z: 40 },
  { id: "t2", title: "Leetcode Daily", energy: "HIGH", duration: "1h", priority: "P1", x: 100, y: -60, z: 20 },
  { id: "t3", title: "Read Chapter 7", energy: "LOW", duration: "45m", priority: "P2", x: -40, y: 80, z: 60 },
  { id: "t4", title: "Team Meeting Notes", energy: "ADMIN", duration: "30m", priority: "P1", x: 180, y: 30, z: -10 },
  { id: "t5", title: "UI Mockup Design", energy: "CREATIVE", duration: "2h", priority: "P1", x: -200, y: 10, z: 10 },
  { id: "t6", title: "Database Migration", energy: "HIGH", duration: "1.5h", priority: "P0", x: 30, y: -160, z: 30 },
  { id: "t7", title: "Write Unit Tests", energy: "HIGH", duration: "2h", priority: "P1", x: -90, y: 160, z: 50 },
  { id: "t8", title: "Email Replies", energy: "ADMIN", duration: "20m", priority: "P3", x: 200, y: -140, z: -20 },
  { id: "t9", title: "Sketch Logo Ideas", energy: "CREATIVE", duration: "1h", priority: "P2", x: -250, y: -130, z: -30 },
  { id: "t10", title: "Review PR #42", energy: "LOW", duration: "30m", priority: "P1", x: 130, y: 140, z: 40 },
  { id: "t11", title: "Deploy to Staging", energy: "ADMIN", duration: "15m", priority: "P0", x: -10, y: -20, z: 70 },
  { id: "t12", title: "Brainstorm Features", energy: "CREATIVE", duration: "45m", priority: "P2", x: 260, y: -40, z: -15 },
  { id: "t13", title: "Fix Auth Bug", energy: "HIGH", duration: "1h", priority: "P0", x: -170, y: -220, z: 0 },
  { id: "t14", title: "Update Docs", energy: "LOW", duration: "40m", priority: "P3", x: 80, y: 220, z: 20 },
  { id: "t15", title: "API Integration", energy: "HIGH", duration: "2.5h", priority: "P1", x: -120, y: 250, z: 35 },
  { id: "t16", title: "Organize Backlog", energy: "ADMIN", duration: "25m", priority: "P2", x: 230, y: 160, z: -5 },
  { id: "t17", title: "Wireframe Flow", energy: "CREATIVE", duration: "1.5h", priority: "P1", x: -280, y: 110, z: 15 },
  { id: "t18", title: "Research Caching", energy: "LOW", duration: "50m", priority: "P2", x: 50, y: -250, z: 10 },
];

// --- Component ---------------------------------------------------------------

export function LandingHero() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(-250);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState({ x: 35, z: -10 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const dragRef = useRef<{ dragging: boolean; startX: number; startY: number }>({
    dragging: false, startX: 0, startY: 0,
  });

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragRef.current.dragging) {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setPan((p) => ({ x: p.x + dx * 0.5, y: p.y + dy * 0.5 }));
      dragRef.current.startX = e.clientX;
      dragRef.current.startY = e.clientY;
      return;
    }
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    setRotation({ x: 35 - y * 6, z: -10 + x * 6 });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".task-node")) return;
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY };
  }, []);

  const handleMouseUp = useCallback(() => {
    dragRef.current.dragging = false;
  }, []);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.max(-1000, Math.min(100, z - e.deltaY * 0.5)));
  }, []);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    vp.addEventListener("wheel", handleWheel, { passive: false });
    return () => vp.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  useEffect(() => {
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseUp]);

  const cameraTransform = `translateZ(${zoom}px) rotateX(${rotation.x}deg) rotateZ(${rotation.z}deg) translateX(${pan.x}px) translateY(${pan.y}px)`;

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-zinc-50">
      {/* Radial gradient background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 30% 50%, rgba(59,130,246,0.06) 0%, rgba(139,92,246,0.03) 40%, transparent 70%)",
        }}
      />

      {/* Top header bar */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-3">
          <ChronoFlowLogo size={36} />
          <span className="text-lg font-semibold tracking-tight text-zinc-900">
            ChronoFlow
          </span>
        </div>
        <Link
          href="/signin"
          className="rounded-full border border-zinc-300 bg-white px-5 py-2 text-sm font-medium text-zinc-900 shadow-sm transition-all hover:bg-zinc-50 hover:border-zinc-400"
        >
          Sign In
        </Link>
      </div>

      {/* LEFT: 3D Viewport */}
      <div
        ref={viewportRef}
        className="relative w-3/5 h-full cursor-grab active:cursor-grabbing"
        style={{ perspective: "800px", perspectiveOrigin: "55% 50%" }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
      >
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transformStyle: "preserve-3d",
            transform: cameraTransform,
            transition: dragRef.current.dragging ? "none" : "transform 0.15s ease-out",
          }}
        >
          {DEMO_TASKS.map((task) => {
            const colors = ENERGY_COLORS[task.energy];
            const isHovered = hoveredId === task.id;
            const isOther = hoveredId !== null && !isHovered;

            return (
              <div
                key={task.id}
                className="task-node absolute"
                style={{
                  transform: `translate3d(${task.x}px, ${task.y}px, ${task.z}px)`,
                  transformStyle: "preserve-3d",
                  transition: "filter 0.3s, opacity 0.3s, transform 0.3s",
                  filter: isOther ? "blur(3px)" : "",
                  opacity: isOther ? 0.25 : 1,
                  zIndex: isHovered ? 100 : 10 + task.z,
                }}
                onMouseEnter={() => setHoveredId(task.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <div
                  className="rounded-xl px-4 py-3 bg-white/80 backdrop-blur-md"
                  style={{
                    border: `1px solid ${colors.border}`,
                    boxShadow: isHovered
                      ? `0 0 24px ${colors.border}, 0 8px 32px rgba(0,0,0,0.1)`
                      : "0 4px 16px rgba(0,0,0,0.06)",
                    minWidth: "130px",
                    transform: isHovered ? "scale(1.08)" : "scale(1)",
                    transition: "transform 0.2s, box-shadow 0.2s",
                  }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: colors.badge }}
                    />
                    <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: colors.badge }}>
                      {task.energy}
                    </span>
                  </div>
                  <div className="text-sm font-medium leading-tight" style={{ color: colors.text }}>
                    {task.title}
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 text-[10px]" style={{ color: colors.text, opacity: 0.6 }}>
                    <span>{task.duration}</span>
                    <span className="opacity-60">{task.priority}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Interaction hint */}
        <div className="absolute bottom-6 left-0 right-0 z-10 text-center">
          <p className="text-xs text-zinc-400">
            Drag to pan &middot; Scroll to zoom &middot; Hover for details
          </p>
        </div>
      </div>

      {/* RIGHT: Hero text */}
      <div className="relative z-20 flex w-2/5 flex-col justify-center px-12">
        <h1 className="text-7xl font-bold tracking-tight leading-[1.08]">
          <span className="text-zinc-900">Schedule</span>
          <br />
          <span className="text-zinc-900">smarter.</span>
          <br />
          <span className="bg-gradient-to-r from-blue-500 via-purple-500 to-amber-500 bg-clip-text text-transparent">
            Flow naturally.
          </span>
        </h1>

        <p className="mt-6 max-w-lg text-xl leading-relaxed text-zinc-600">
          AI-powered scheduling that adapts to your energy, respects your
          routines, and dynamically reschedules when life happens.
        </p>

        <div className="mt-5 flex flex-wrap gap-5 text-sm text-zinc-600">
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
            Deep Work
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
            Light Tasks
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-purple-500" />
            Creative
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            Admin
          </span>
        </div>

        <div className="mt-10 flex items-center gap-4">
          <Link
            href="/signin"
            className="rounded-full bg-zinc-900 px-8 py-3.5 text-base font-semibold text-white transition-all hover:bg-zinc-800 hover:scale-105"
          >
            Get Started &rarr;
          </Link>
          <span className="text-sm text-zinc-400">Free &middot; No credit card</span>
        </div>

        <div className="mt-16 grid grid-cols-3 gap-8 border-t border-zinc-200 pt-8">
          <div>
            <div className="text-2xl font-bold text-zinc-900">48h</div>
            <div className="mt-1 text-xs text-zinc-500">Smart reflow window</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-zinc-900">Gemini</div>
            <div className="mt-1 text-xs text-zinc-500">AI-powered engine</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-zinc-900">Diff View</div>
            <div className="mt-1 text-xs text-zinc-500">Approve every change</div>
          </div>
        </div>
      </div>
    </div>
  );
}
