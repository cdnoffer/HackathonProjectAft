import { safetyColor } from "../../shared/labels";

interface ScoreRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  showMax?: boolean;
  label?: string;
}

export default function ScoreRing({
  score,
  size = 58,
  strokeWidth = 5,
  showMax = false,
  label,
}: ScoreRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const dash = (clamped / 100) * circumference;
  const color = safetyColor(clamped);
  return (
    <div
      className="score-ring"
      style={{ width: size, height: size }}
      aria-label={`Safety score ${Math.round(clamped)} out of 100`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          className="score-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="score-ring-value" style={{ color }}>
        {Math.round(clamped)}
        {showMax ? <span>/100</span> : null}
      </div>
      {label ? <span className="score-ring-label">{label}</span> : null}
    </div>
  );
}
