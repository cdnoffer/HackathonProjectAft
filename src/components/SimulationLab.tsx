import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Cloud,
  Database,
  FlaskConical,
  History,
  Loader2,
  MapPin,
  Play,
  Route as RouteIcon,
  Server,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type {
  LabChecks,
  LabRun,
  LabRunSummary,
  ScenarioPayload,
} from "../../shared/types";
import { WEATHER_LABELS } from "../../shared/labels";
import { api } from "../lib/api";
import Modal from "./Modal";
import { WeatherIcon } from "./WeatherIcon";

interface SimulationLabProps {
  open: boolean;
  onClose: () => void;
  onOpenScenario: (payload: ScenarioPayload) => void;
  priority: number;
}

const CHECK_LABELS: { key: keyof LabChecks; label: string }[] = [
  { key: "uniquePlaces", label: "Unique real-world places" },
  { key: "uniqueWeather", label: "Unique weather signatures" },
  { key: "uniqueTimes", label: "Unique simulated times" },
  { key: "uniqueSeeds", label: "Unique scenario seeds" },
  { key: "allRoutesScored", label: "All routes scored" },
  { key: "multiRouteScenarios", label: "Multiple routes per test" },
];

function statusIcon(status: LabRun["status"]) {
  if (status === "completed") return <CheckCircle2 size={14} />;
  if (status === "failed") return <XCircle size={14} />;
  return <Loader2 size={14} className="spin" />;
}

export default function SimulationLab({
  open,
  onClose,
  onOpenScenario,
  priority,
}: SimulationLabProps) {
  const [count, setCount] = useState(5);
  const [run, setRun] = useState<LabRun | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [history, setHistory] = useState<LabRunSummary[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const refreshHistory = async () => {
    try {
      const result = await api.listLabRuns();
      setHistory(result.runs);
    } catch {
      // History is secondary; the run itself still works.
    }
  };

  useEffect(() => {
    if (!open) return;
    void refreshHistory();
  }, [open]);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const next = await api.getLabRun(runId);
        if (cancelled) return;
        setRun(next);
        if (next.status === "completed" || next.status === "failed") {
          setRunId(null);
          void refreshHistory();
        }
      } catch (pollError) {
        if (!cancelled) {
          setError(
            pollError instanceof Error
              ? pollError.message
              : "Could not read the lab run",
          );
          setRunId(null);
        }
      }
    };
    void poll();
    const interval = window.setInterval(poll, 850);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [runId]);

  const start = async () => {
    setStarting(true);
    setError(null);
    setRun(null);
    try {
      const created = await api.startLabRun(count, priority);
      setRun(created.run);
      setRunId(created.runId);
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : "Could not start the lab run",
      );
    } finally {
      setStarting(false);
    }
  };

  const openScenario = async (scenarioId: string) => {
    setOpeningId(scenarioId);
    try {
      const payload = await api.getScenario(scenarioId);
      onOpenScenario(payload);
      onClose();
    } catch (openError) {
      setError(
        openError instanceof Error
          ? openError.message
          : "Could not open that scenario",
      );
    } finally {
      setOpeningId(null);
    }
  };

  const running = Boolean(runId);
  const progress = run ? run.completedCount / Math.max(1, run.requestedCount) : 0;
  const checks = run?.checks;
  const allPassed = checks ? Object.values(checks).every(Boolean) : false;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      eyebrow="Backend test harness"
      title="Simulation Lab"
      subtitle="Generate fresh real-world scenarios on the server and verify that every test uses different places, times, weather and seeds."
    >
      <div className="lab-top">
        <div className="lab-run-controls">
          <div className="lab-count">
            <span>Scenarios per run</span>
            <div className="segmented">
              {[3, 5, 8].map((value) => (
                <button
                  type="button"
                  key={value}
                  className={count === value ? "active" : ""}
                  onClick={() => setCount(value)}
                  disabled={running}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="button button-primary"
            onClick={start}
            disabled={starting || running}
          >
            {starting || running ? (
              <Loader2 size={15} className="spin" />
            ) : (
              <Play size={15} fill="currentColor" />
            )}
            {running ? "Running…" : "Run simulation test"}
          </button>
        </div>
        <div className="lab-note">
          <Server size={14} />
          The backend samples cities without replacement, fetches live OSM routes, scores
          them, and persists every test in SQLite.
        </div>
      </div>

      {error ? <div className="inline-error lab-error">{error}</div> : null}

      {run ? (
        <>
          <div className="lab-progress-row">
            <div className="lab-status">
              {statusIcon(run.status)}
              <span>
                {run.status === "running"
                  ? "Generating scenarios"
                  : run.status === "completed"
                    ? "Run complete"
                    : run.status === "failed"
                      ? "Run failed"
                      : "Queued"}
              </span>
              <strong>
                {run.completedCount}/{run.requestedCount}
              </strong>
            </div>
            <div className="lab-progress-track">
              <div
                className="lab-progress-fill"
                style={{ width: `${Math.max(4, progress * 100)}%` }}
              />
            </div>
            {run.status === "completed" ? (
              <span className={`lab-verdict ${allPassed ? "pass" : "warn"}`}>
                {allPassed ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                {allPassed ? "All uniqueness checks passed" : "One or more checks need attention"}
              </span>
            ) : null}
          </div>

          <div className="lab-checks">
            {CHECK_LABELS.map((item) => {
              const passed = checks?.[item.key] ?? false;
              return (
                <div
                  className={`lab-check ${passed ? "pass" : ""}`}
                  key={item.key}
                >
                  {passed ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                  <span>{item.label}</span>
                </div>
              );
            })}
          </div>

          <div className="lab-table-wrap">
            <table className="lab-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Place</th>
                  <th>Local time</th>
                  <th>Weather</th>
                  <th>Routes</th>
                  <th>Safest</th>
                  <th>Recommended</th>
                  <th>ETA</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {run.scenarios.map((scenario) => (
                  <tr key={scenario.scenarioId}>
                    <td className="mono">{scenario.index}</td>
                    <td>
                      <span className="lab-place">
                        <MapPin size={12} />
                        <span>
                          <strong>{scenario.cityName}</strong>
                          <small>{scenario.country}</small>
                        </span>
                      </span>
                    </td>
                    <td>
                      <span className="lab-time">
                        <Clock size={12} /> {scenario.localTime}
                      </span>
                    </td>
                    <td>
                      <span className="lab-weather">
                        <WeatherIcon
                          condition={scenario.weatherCondition}
                          size={14}
                        />
                        {WEATHER_LABELS[scenario.weatherCondition]} ·{" "}
                        {Math.round(scenario.temperatureC)}°
                      </span>
                    </td>
                    <td className="mono">{scenario.routeCount}</td>
                    <td>
                      <span className="lab-safest">
                        <ShieldCheck size={12} />
                        {scenario.safestRouteName} ·{" "}
                        {Math.round(scenario.safestScore)}
                      </span>
                    </td>
                    <td className="mono">{Math.round(scenario.recommendedScore)}</td>
                    <td className="mono">{scenario.etaMinutes} min</td>
                    <td>
                      <button
                        type="button"
                        className="lab-open"
                        onClick={() => openScenario(scenario.scenarioId)}
                        disabled={Boolean(openingId)}
                        aria-label={`Open ${scenario.cityName} scenario`}
                      >
                        {openingId === scenario.scenarioId ? (
                          <Loader2 size={13} className="spin" />
                        ) : (
                          <ArrowUpRight size={14} />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
                {run.scenarios.length === 0 ? (
                  <tr>
                    <td colSpan={9}>
                      <div className="lab-empty">
                        <Loader2 size={16} className="spin" />
                        Waiting for the first scenario…
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {run.error ? <div className="inline-error">{run.error}</div> : null}
        </>
      ) : (
        <div className="lab-empty-state">
          <div className="lab-empty-icon">
            <FlaskConical size={30} />
          </div>
          <h3>No test running</h3>
          <p>
            Each run asks the backend to pick new real-world cities, generate weather,
            daylight, traffic and road conditions, fetch live routes, and verify that
            no place or simulated dataset repeats.
          </p>
          <div className="lab-empty-pills">
            <span>
              <MapPin size={13} /> Real OSM places
            </span>
            <span>
              <Cloud size={13} /> Random weather
            </span>
            <span>
              <RouteIcon size={13} /> Live routes
            </span>
            <span>
              <Database size={13} /> SQLite history
            </span>
          </div>
        </div>
      )}

      <section className="lab-history">
        <div className="lab-history-head">
          <h3>
            <History size={15} /> Recent runs
          </h3>
          <button type="button" className="text-button" onClick={() => void refreshHistory()}>
            Refresh
          </button>
        </div>
        {history.length === 0 ? (
          <p className="empty-copy">Previous backend test runs will appear here.</p>
        ) : (
          <div className="history-list">
            {history.map((item) => (
              <div className="history-row" key={item.id}>
                <span className={`history-status ${item.status}`}>
                  {statusIcon(item.status)}
                  {item.status}
                </span>
                <span className="mono">{item.requestedCount} scenarios</span>
                <span>
                  {item.uniquePlaces}/{item.requestedCount} unique places
                </span>
                <span>
                  {item.uniqueWeather}/{item.requestedCount} weather sets
                </span>
                <span className={item.allChecksPassed ? "history-pass" : "history-warn"}>
                  {item.allChecksPassed ? "checks passed" : "checks pending"}
                </span>
                <span className="history-time">
                  {new Date(item.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </Modal>
  );
}
