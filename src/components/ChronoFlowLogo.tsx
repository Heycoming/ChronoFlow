/**
 * ChronoFlow logo — minimal clock face with a flowing wave through it.
 * Pure SVG, no external assets. Works on both dark and light backgrounds.
 *
 * Tick coordinates are pre-computed to avoid SSR/client hydration mismatch
 * from floating-point differences in Math.sin/cos.
 */

const TICKS: Array<{ x1: string; y1: string; x2: string; y2: string; major: boolean }> = [
  { x1: "32", y1: "9", x2: "32", y2: "4", major: true },        // 0° (12 o'clock)
  { x1: "44.5", y1: "18.35", x2: "46", y2: "17.75", major: false },  // 30°
  { x1: "50.65", y1: "29.5", x2: "52.25", y2: "29.5", major: false }, // 60°
  { x1: "55", y1: "32", x2: "60", y2: "32", major: true },       // 90° (3 o'clock)
  { x1: "50.65", y1: "34.5", x2: "52.25", y2: "34.5", major: false }, // 120°
  { x1: "44.5", y1: "45.65", x2: "46", y2: "46.25", major: false },  // 150°
  { x1: "32", y1: "55", x2: "32", y2: "60", major: true },       // 180° (6 o'clock)
  { x1: "19.5", y1: "45.65", x2: "18", y2: "46.25", major: false },  // 210°
  { x1: "13.35", y1: "34.5", x2: "11.75", y2: "34.5", major: false },// 240°
  { x1: "9", y1: "32", x2: "4", y2: "32", major: true },         // 270° (9 o'clock)
  { x1: "13.35", y1: "29.5", x2: "11.75", y2: "29.5", major: false },// 300°
  { x1: "19.5", y1: "18.35", x2: "18", y2: "17.75", major: false },  // 330°
];

export function ChronoFlowLogo({
  size = 32,
  className = "",
  style,
}: {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
    >
      <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="2.5" opacity="0.3" />
      {TICKS.map((t, i) => (
        <line
          key={i}
          x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
          stroke="currentColor"
          strokeWidth={t.major ? "2" : "1"}
          opacity={t.major ? "0.5" : "0.2"}
          strokeLinecap="round"
        />
      ))}
      <line x1="32" y1="32" x2="32" y2="18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
      <line x1="32" y1="32" x2="44" y2="26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <path
        d="M 8 36 C 16 28, 24 44, 32 36 C 40 28, 48 44, 56 36"
        stroke="url(#flow-gradient)"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="32" cy="32" r="2.5" fill="currentColor" opacity="0.6" />
      <defs>
        <linearGradient id="flow-gradient" x1="8" y1="36" x2="56" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="50%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
    </svg>
  );
}
