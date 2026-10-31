import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUp,
  Clock,
  CornerUpLeft,
  CornerUpRight,
  FastForward,
  Flag,
  Gauge,
  Navigation,
  Pause,
  Play,
  RotateCcw,
  Route as RouteIcon,
  ShieldCheck,
  Square,
  X,
} from "lucide-react";
import type { RouteData, Scenario } from "../../shared/types";
import {
  PHASE_LABELS,
  ROAD_STATE_LABELS,
  WEATHER_LABELS,
  formatDistance,
  formatDuration,
  safetyColor,
} from "../../shared/labels";
import { buildRouteTimeline, frameFor } from "../lib/driving";
import ScoreRing from "./ScoreRing";

interface DrivingPanelProps {
  route: RouteData;
  scenario: Scenario;
  onExit: () => void;
  onTelemetry: (position: { lat: number; lon: number; bearing: number } | null) => void;
}

const SPEEDS = [1, 2, 4] as const;

function clockToMinutes(clock: string): number {
  const [hours = "0", minutes = "0"] = clock.split(":");
  return Number(hours) * 60 + Number(minutes);
}

function phaseForClock(
  clock: string,
  sunrise: string | null,
  sunset: string | null,
  fallback: Scenario["weather"]["phase"],
): Scenario["weather"]["phase"] {
  if (!sunrise || !sunset) return fallback;
  const now = clockToMinutes(clock);
  const rise = clockToMinutes(sunrise);
  const set = clockToMinutes(sunset);
  if (now < rise - 30 || now > set + 30) return "night";
  if (now < rise + 30 || now > set - 30) return "civil-twilight";
  if (now < rise + 60 || now > set - 60) return "golden-hour";
  return "day";
}

function ManeuverGlyph({ instruction }: { instruction: string }) {
  const text = instruction.toLowerCase();
  if (text.includes("roundabout")) return <RotateCcw size={26} />;
  if (text.includes("left")) return <CornerUpLeft size={26} />;
  if (text.includes("right")) return <CornerUpRight size={26} />;
  if (text.includes("arrive") || text.includes("destination")) return <Flag size={26} />;
  return <ArrowUp size={26} />;
}

export default function DrivingPanel({
  route,
  scenario,
  onExit,
  onTelemetry,
}: DrivingPanelProps) {
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [finished, setFinished] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const lastTelemetryRef = useRef(0);
  const timeline = useMemo(() => buildRouteTimeline(route), [route]);
  const baseWallSeconds = Math.min(
    52,
    Math.max(18, route.adjustedDurationS / 60),
  );

  useEffect(() => {
    if (!playing || finished) {
      lastFrameRef.current = null;
      return;
    }
    const step = (time: number) => {
      const previous = lastFrameRef.current ?? time;
      const dt = Math.min(0.12, Math.max(0, (time - previous) / 1000));
      lastFrameRef.current = time;
      setProgress((current) => {
        const next = Math.min(1, current + (dt / baseWallSeconds) * speed);
        return next;
      });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      lastFrameRef.current = null;
    };
  }, [playing, finished, speed, baseWallSeconds]);

  useEffect(() => {
    if (progress >= 1 && !finished) {
      setFinished(true);
      setPlaying(false);
    }
  }, [progress, finished]);

  const simulatedDate = useMemo(() => {
    const start = new Date(scenario.simulatedAtUtc).getTime();
    return new Date(
      start + progress * route.adjustedDurationS * 1000,
    );
  }, [progress, route.adjustedDurationS, scenario.simulatedAtUtc]);

  const frame = useMemo(
    () =>
      frameFor(
        route,
        timeline,
        progress,
        simulatedDate,
        scenario.timezone,
      ),
    [route, timeline, progress, simulatedDate, scenario.timezone],
  );

  const phase = phaseForClock(
    frame.localClock,
    scenario.weather.sunriseLocal,
    scenario.weather.sunsetLocal,
    scenario.weather.phase,
  );
  const segment = frame.currentSegment;
  const currentRisk = segment?.risk ?? 0;
  const remainingSeconds = (1 - progress) * route.adjustedDurationS;

  useEffect(() => {
    const now = performance.now();
    if (
      now - lastTelemetryRef.current > 95 ||
      progress === 0 ||
      progress >= 1
    ) {
      lastTelemetryRef.current = now;
      onTelemetry({
        lat: frame.lat,
        lon: frame.lon,
        bearing: frame.bearing,
      });
    }
  }, [progress, frame.lat, frame.lon, frame.bearing, onTelemetry]);

  useEffect(() => {
    return () => onTelemetry(null);
  }, [onTelemetry]);

  const restart = () => {
    setProgress(0);
    setFinished(false);
    setPlaying(true);
  };

  const exit = () => {
    onTelemetry(null);
    onExit();
  };

  return (
    <div className="driving-panel">
      <div className="driving-head">
        <span className="live-dot" />
        <div>
          <h2>Drive simulation</h2>
          <span>{scenario.cityName} · simulated conditions</span>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={exit}
          aria-label="Exit drive simulation"
        >
          <X size={18} />
        </button>
      </div>

      <div className="driving-route-row">
        <ScoreRing score={route.safetyScore} size={52} strokeWidth={5} />
        <div className="driving-route-main">
          <div>
            <strong>{route.name}</strong>
            {route.isRecommended ? (
              <span className="mini-recommended">Recommended</span>
            ) : null}
          </div>
          <span>
            {formatDistance(route.distanceM)} · {formatDuration(route.adjustedDurationS)}
          </span>
        </div>
        <span
          className="driving-risk-pill"
          style={{ color: safetyColor(segment?.safetyScore ?? 100) }}
        >
          <ShieldCheck size={13} />
          {Math.round(segment?.safetyScore ?? 100)}
        </span>
      </div>

      {finished ? (
        <div className="arrival-card">
          <div className="arrival-icon">
            <Flag size={28} />
          </div>
          <span className="eyebrow">Arrival summary</span>
          <h2>You arrived.</h2>
          <p>
            {formatDistance(route.distanceM)} driven in{" "}
            {formatDuration(route.adjustedDurationS)} of simulated time through{" "}
            {WEATHER_LABELS[scenario.weather.condition].toLowerCase()} conditions.
          </p>
          <div className="arrival-stats">
            <div>
              <span>Route safety</span>
              <strong style={{ color: safetyColor(route.safetyScore) }}>
                {Math.round(route.safetyScore)}/100
              </strong>
            </div>
            <div>
              <span>Maneuvers</span>
              <strong>{route.maneuvers.length}</strong>
            </div>
            <div>
              <span>End road state</span>
              <strong>{ROAD_STATE_LABELS[scenario.weather.roadState]}</strong>
            </div>
          </div>
          <div className="arrival-actions">
            <button type="button" className="button button-primary" onClick={restart}>
              <RotateCcw size={15} /> Drive again
            </button>
            <button type="button" className="button button-ghost" onClick={exit}>
              Back to routes
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="maneuver-card">
            <div className="maneuver-glyph">
              <ManeuverGlyph
                instruction={
                  frame.nextManeuver?.instruction ?? "Arrive at destination"
                }
              />
            </div>
            <div className="maneuver-copy">
              <span>
                {frame.nextManeuver ? "Next maneuver" : "Final step"}
              </span>
              <strong>
                {frame.nextManeuver?.instruction ?? "Arrive at your destination"}
              </strong>
              <small>
                {frame.nextManeuver
                  ? `in ${formatDistance(frame.distanceToManeuverM)}`
                  : "You are nearly there"}
              </small>
            </div>
          </div>

          <div className="speed-cluster">
            <div className="speed-dial">
              <div>
                <strong>{Math.round(frame.speedKph)}</strong>
                <span>km/h</span>
              </div>
              <svg viewBox="0 0 120 66" aria-hidden="true">
                <path d="M 8 60 A 52 52 0 0 1 112 60" className="speed-track" />
                <path
                  d="M 8 60 A 52 52 0 0 1 112 60"
                  className="speed-fill"
                  style={{
                    strokeDasharray: `${Math.min(1, frame.speedKph / 120) * 163} 163`,
                  }}
                />
              </svg>
            </div>
            <div className="speed-meta">
              <span>
                <Gauge size={14} /> Speed limit{" "}
                <strong>{segment?.speedLimitKph ?? "—"} km/h</strong>
              </span>
              <span>
                <Clock size={14} /> Remaining{" "}
                <strong>{formatDuration(remainingSeconds)}</strong>
              </span>
              <span>
                <RouteIcon size={14} /> To go{" "}
                <strong>{formatDistance(frame.remainingM)}</strong>
              </span>
            </div>
          </div>

          <div className="drive-progress-block">
            <div className="drive-progress-labels">
              <span>{frame.localClock} local</span>
              <span>{Math.round(progress * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1000}
              value={Math.round(progress * 1000)}
              onChange={(event) => {
                setFinished(false);
                setProgress(Number(event.target.value) / 1000);
              }}
              className="drive-range"
              aria-label="Drive progress"
            />
            <div className="drive-progress-labels muted">
              <span>Start</span>
              <span>Destination</span>
            </div>
          </div>
        </>
      )}

      <div className="drive-conditions">
        <span>
          {WEATHER_LABELS[scenario.weather.condition]} ·{" "}
          {scenario.weather.temperatureC}°C
        </span>
        <span>{PHASE_LABELS[phase]}</span>
        <span>{ROAD_STATE_LABELS[scenario.weather.roadState]}</span>
        <span>{scenario.weather.visibilityKm} km visibility</span>
      </div>

      <div className="current-road-card">
        <div className="current-road-head">
          <span className="eyebrow">Current segment</span>
          <span
            className="segment-risk-badge"
            style={{ color: safetyColor(100 - currentRisk) }}
          >
            <AlertTriangle size={12} /> risk {Math.round(currentRisk)}
          </span>
        </div>
        <strong>{segment?.streetName ?? "Finishing route"}</strong>
        <span>
          {segment
            ? `${segment.roadClass} · ${segment.widthM} m · ${segment.gradePct}% grade · ${ROAD_STATE_LABELS[segment.roadState]}`
            : "Arrival"}
        </span>
      </div>

      {!finished ? (
        <div className="drive-controls">
          <button
            type="button"
            className="drive-play"
            onClick={() => setPlaying((current) => !current)}
            aria-label={playing ? "Pause drive" : "Play drive"}
          >
            {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
          </button>
          <div className="speed-selector" aria-label="Simulation speed">
            <FastForward size={14} />
            {SPEEDS.map((value) => (
              <button
                type="button"
                key={value}
                className={value === speed ? "active" : ""}
                onClick={() => setSpeed(value)}
              >
                {value}×
              </button>
            ))}
          </div>
          <button
            type="button"
            className="button button-ghost button-small"
            onClick={restart}
          >
            <RotateCcw size={14} /> Restart
          </button>
          <button
            type="button"
            className="button button-ghost button-small"
            onClick={exit}
          >
            <Square size={13} /> End
          </button>
        </div>
      ) : null}

      <div className="driving-footnote">
        <Navigation size={13} />
        Car moves on the real road geometry; speed, traffic and conditions are simulated.
      </div>
    </div>
  );
}
