import { scoreHexColor } from "../lib/score";

interface Props {
  score: number;
}

/** Anneau de score qualité : rouge → ambre → vert. */
export function QualityScore({ score }: Props) {
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const color = scoreHexColor(score);

  return (
    <div
      className="relative h-12 w-12 shrink-0"
      title={`Score qualité des assets : ${score}/100`}
    >
      <svg viewBox="0 0 40 40" className="h-12 w-12 -rotate-90">
        <title>Score qualité des assets : {score}/100</title>
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke="#27272a"
          strokeWidth="4"
        />
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${(circumference * score) / 100} ${circumference}`}
          className="transition-all duration-700"
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-xs font-bold"
        style={{ color }}
      >
        {score}
      </span>
    </div>
  );
}
