import { Loader2, ShieldCheck, SlidersHorizontal, Timer } from "lucide-react";
import { priorityLabelForValue } from "../../shared/labels";

interface PrioritySliderProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  loading?: boolean;
}

const PRESETS = [
  { label: "Time first", value: 0.25 },
  { label: "Balanced", value: 0.6 },
  { label: "Safety first", value: 0.85 },
];

export default function PrioritySlider({
  value,
  onChange,
  disabled,
  loading,
}: PrioritySliderProps) {
  const percent = Math.round(value * 100);
  const label = priorityLabelForValue(value);
  return (
    <section className="priority-panel" aria-label="Route priority">
      <div className="priority-head">
        <div className="priority-title">
          <SlidersHorizontal size={15} />
          <span>Decision weighting</span>
        </div>
        <span className="priority-value">
          {loading ? <Loader2 size={13} className="spin" /> : null}
          {percent}% safety
        </span>
      </div>
      <div className="priority-scale">
        <span>
          <Timer size={13} /> Fastest
        </span>
        <strong>{label}</strong>
        <span>
          Safest <ShieldCheck size={13} />
        </span>
      </div>
      <input
        className="priority-range"
        type="range"
        min={0}
        max={100}
        step={1}
        value={percent}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        aria-label="Safety versus time weighting"
      />
      <div className="priority-presets">
        {PRESETS.map((preset) => (
          <button
            type="button"
            key={preset.label}
            className={`preset-button ${Math.abs(preset.value - value) < 0.04 ? "active" : ""}`}
            onClick={() => onChange(preset.value)}
            disabled={disabled}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </section>
  );
}
