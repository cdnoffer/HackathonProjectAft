import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Clock,
  Gauge,
  Loader2,
  Navigation,
  Play,
  Route as RouteIcon,
  ShieldCheck,
  Sparkles,
  Wand2,
} from "lucide-react";
import type {
  AiExplanation,
  RouteData,
  ScenarioPayload,
} from "../../shared/types";
import {
  ROAD_STATE_LABELS,
  SURFACE_LABELS,
  TRAFFIC_LABELS,
  WEATHER_LABELS,
  PHASE_LABELS,
  formatDistance,
  formatDuration,
  riskColor,
  safetyColor,
} from "../../shared/labels";
import { api } from "../lib/api";
import Modal from "./Modal";
import ScoreRing from "./ScoreRing";

interface RouteDetailsProps {
  open: boolean;
  payload: ScenarioPayload | null;
  route: RouteData | null;
  onClose: () => void;
  onDrive: () => void;
  llmConfigured: boolean;
}

export default function RouteDetails({
  open,
  payload,
  route,
  onClose,
  onDrive,
  llmConfigured,
}: RouteDetailsProps) {
  const [aiText, setAiText] = useState<AiExplanation | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    setAiText(null);
    setAiError(null);
    setAiLoading(false);
  }, [route?.id, open]);

  if (!payload || !route) return null;
  const { scenario } = payload;
  const topSegments = [...route.segments]
    .sort((a, b) => b.risk - a.risk)
    .slice(0, 5);

  const askAi = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const explanation = await api.explain(
        scenario.id,
        route.id,
        payload.priority,
      );
      setAiText(explanation);
    } catch (error) {
      setAiError(
        error instanceof Error ? error.message : "AI explanation unavailable",
      );
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      eyebrow="Route analysis"
      title={`${route.name} · ${route.safetyLabel}`}
      subtitle={`${formatDuration(route.adjustedDurationS)} · ${formatDistance(route.distanceM)} · ${scenario.cityName}`}
      footer={
        <div className="modal-footer-row">
          <span className="modal-footnote">
            Scores are explainable model output over simulated conditions.
          </span>
          <button
            type="button"
            className="button button-primary"
            onClick={onDrive}
          >
            <Play size={15} fill="currentColor" />
            Start driving this route
          </button>
        </div>
      }
    >
      <div className="details-overview">
        <div className="details-score-block">
          <ScoreRing score={route.safetyScore} size={94} strokeWidth={7} showMax />
          <div>
            <span className="eyebrow">Safety score</span>
            <h3 style={{ color: safetyColor(route.safetyScore) }}>
              {route.safetyLabel}
            </h3>
            <p>{route.recommendation}</p>
          </div>
        </div>
        <div className="details-metrics">
          <div>
            <Clock size={16} />
            <span>ETA</span>
            <strong>{formatDuration(route.adjustedDurationS)}</strong>
          </div>
          <div>
            <RouteIcon size={16} />
            <span>Distance</span>
            <strong>{formatDistance(route.distanceM)}</strong>
          </div>
          <div>
            <Gauge size={16} />
            <span>Efficiency</span>
            <strong>{Math.round(route.efficiencyScore)}/100</strong>
          </div>
          <div>
            <ShieldCheck size={16} />
            <span>Overall</span>
            <strong>{Math.round(route.overallScore)}/100</strong>
          </div>
        </div>
      </div>

      <div className="details-grid">
        <section className="detail-card ai-card">
          <div className="detail-card-head">
            <h3>
              <Sparkles size={16} /> Routey AI reasoning
            </h3>
            <span className={`ai-mode-pill ${aiText?.enhanced ? "enhanced" : ""}`}>
              {aiText?.enhanced ? "LLM enhanced" : "Local explainable model"}
            </span>
          </div>
          <div className="ai-reasons">
            {route.reasons.map((reason, index) => (
              <div className="ai-reason" key={`${reason}-${index}`}>
                <span>{index + 1}</span>
                <p>{reason}</p>
              </div>
            ))}
          </div>
          {aiText ? (
            <div className="ai-enhanced">
              <div className="ai-enhanced-label">
                <Wand2 size={13} /> Deeper explanation
                {aiText.model ? <small>{aiText.model}</small> : null}
              </div>
              <p>{aiText.text}</p>
            </div>
          ) : null}
          {aiError ? <div className="inline-error">{aiError}</div> : null}
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={askAi}
            disabled={aiLoading || !llmConfigured}
            title={
              llmConfigured
                ? "Ask the optional LLM layer to rewrite the explanation"
                : "Add LLM_API_KEY on the server to enable this"
            }
          >
            {aiLoading ? (
              <Loader2 size={14} className="spin" />
            ) : (
              <Wand2 size={14} />
            )}
            {llmConfigured ? "Ask Routey AI" : "LLM layer not configured"}
          </button>
        </section>

        <section className="detail-card">
          <div className="detail-card-head">
            <h3>
              <AlertTriangle size={16} /> Risk factors
            </h3>
            <span className="tiny-muted">Lower is safer</span>
          </div>
          <div className="factor-list">
            {route.factors.map((factor) => (
              <div className="factor-row" key={factor.key}>
                <div className="factor-row-head">
                  <span>{factor.label}</span>
                  <strong style={{ color: riskColor(factor.risk) }}>
                    {Math.round(factor.risk)}
                  </strong>
                </div>
                <div className="factor-track">
                  <div
                    className="factor-fill"
                    style={{
                      width: `${Math.max(3, factor.risk)}%`,
                      background: riskColor(factor.risk),
                    }}
                  />
                </div>
                <p>{factor.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="detail-card">
          <div className="detail-card-head">
            <h3>Conditions on this route</h3>
            <span className="tiny-muted">Simulated</span>
          </div>
          <div className="condition-grid">
            <div>
              <span>Weather</span>
              <strong>
                {WEATHER_LABELS[scenario.weather.condition]} ·{" "}
                {scenario.weather.temperatureC}°C
              </strong>
            </div>
            <div>
              <span>Visibility</span>
              <strong>
                {scenario.weather.visibilityKm} km ·{" "}
                {PHASE_LABELS[scenario.weather.phase]}
              </strong>
            </div>
            <div>
              <span>Road state</span>
              <strong>{ROAD_STATE_LABELS[scenario.weather.roadState]}</strong>
            </div>
            <div>
              <span>Traffic</span>
              <strong>
                {TRAFFIC_LABELS[scenario.traffic.level]} ·{" "}
                {scenario.traffic.congestionPct}%
              </strong>
            </div>
          </div>
          <div className="top-risks">
            <span className="eyebrow">Highest-impact risks</span>
            {route.topRisks.map((risk) => (
              <div className="top-risk-row" key={risk}>
                <AlertTriangle size={12} />
                <span>{risk}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="detail-card">
          <div className="detail-card-head">
            <h3>Riskiest segments</h3>
            <span className="tiny-muted">Simulated road attributes</span>
          </div>
          <div className="segment-list">
            {topSegments.map((segment) => (
              <div className="segment-row" key={segment.id}>
                <div
                  className="segment-score"
                  style={{ color: safetyColor(segment.safetyScore) }}
                >
                  {Math.round(segment.safetyScore)}
                </div>
                <div className="segment-main">
                  <strong>{segment.streetName}</strong>
                  <span>
                    {segment.roadClass} · {segment.widthM} m · {segment.lanes} lane
                    {segment.lanes === 1 ? "" : "s"} · {SURFACE_LABELS[segment.surface]}
                  </span>
                  <small>
                    {segment.gradePct}% grade · {segment.curvatureDegPerKm}°/km curves ·{" "}
                    {segment.lighting} · {ROAD_STATE_LABELS[segment.roadState]}
                  </small>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="detail-card detail-card-wide">
          <div className="detail-card-head">
            <h3>
              <Navigation size={16} /> Turn-by-turn
            </h3>
            <span className="tiny-muted">{route.maneuvers.length} steps</span>
          </div>
          <div className="maneuver-list">
            {route.maneuvers.map((maneuver, index) => (
              <div className="maneuver-row" key={`${maneuver.index}-${index}`}>
                <span className="maneuver-index">{index + 1}</span>
                <div>
                  <strong>{maneuver.instruction}</strong>
                  <span>
                    {maneuver.streetName} · {formatDistance(maneuver.distanceM)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Modal>
  );
}
