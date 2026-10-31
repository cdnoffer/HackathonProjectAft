import {
  AlertTriangle,
  ChevronRight,
  Clock,
  Gauge,
  Play,
  Route as RouteIcon,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import type { RouteData } from "../../shared/types";
import {
  formatDistance,
  formatDuration,
  routeColor,
  safetyColor,
} from "../../shared/labels";
import ScoreRing from "./ScoreRing";

interface RouteCardProps {
  route: RouteData;
  selected: boolean;
  onSelect: () => void;
  onDetails: () => void;
  onDrive: () => void;
  disabled?: boolean;
}

export default function RouteCard({
  route,
  selected,
  onSelect,
  onDetails,
  onDrive,
  disabled,
}: RouteCardProps) {
  return (
    <article
      className={`route-card ${selected ? "selected" : ""} ${route.isRecommended ? "recommended" : ""}`}
      onClick={onSelect}
      aria-label={`${route.name}, safety score ${Math.round(route.safetyScore)}`}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onSelect();
      }}
    >
      <div className="route-card-head">
        <ScoreRing score={route.safetyScore} size={58} strokeWidth={5} />
        <div className="route-card-title">
          <div className="route-name-row">
            <span
              className="route-color-dot"
              style={{ background: routeColor(route.ordinal) }}
              aria-hidden="true"
            />
            <h3>{route.name}</h3>
            {route.isRecommended ? (
              <span className="recommended-ribbon">
                <Sparkles size={11} /> Recommended
              </span>
            ) : null}
          </div>
          <div className="route-tags">
            {route.isSafest ? (
              <span className="tag tag-safest">
                <ShieldCheck size={11} /> Safest
              </span>
            ) : null}
            {route.isFastest ? (
              <span className="tag tag-fastest">
                <Zap size={11} /> Fastest
              </span>
            ) : null}
            {route.kind === "detour" ? (
              <span className="tag tag-detour">Real detour</span>
            ) : null}
            <span
              className="tag tag-safety-label"
              style={{ color: safetyColor(route.safetyScore) }}
            >
              {route.safetyLabel}
            </span>
          </div>
          <div className="route-metrics">
            <span>
              <Clock size={13} />
              {formatDuration(route.adjustedDurationS)}
            </span>
            <span>
              <RouteIcon size={13} />
              {formatDistance(route.distanceM)}
            </span>
            <span>
              <Gauge size={13} />
              {Math.round(route.avgSpeedKph)} km/h
            </span>
          </div>
        </div>
      </div>

      <div className="route-ai-note">
        <Sparkles size={14} className="ai-spark" />
        <p>{route.recommendation}</p>
      </div>

      {route.topRisks[0] ? (
        <div className="route-risk-note">
          <AlertTriangle size={12} />
          <span>{route.topRisks[0]}</span>
        </div>
      ) : null}

      <div className="route-actions">
        <button
          type="button"
          className="button button-primary button-small"
          onClick={(event) => {
            event.stopPropagation();
            onDrive();
          }}
          disabled={disabled}
        >
          <Play size={14} fill="currentColor" />
          Start driving
        </button>
        <button
          type="button"
          className="button button-ghost button-small"
          onClick={(event) => {
            event.stopPropagation();
            onDetails();
          }}
        >
          Details
          <ChevronRight size={14} />
        </button>
      </div>
    </article>
  );
}
