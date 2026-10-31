import { AlertTriangle, Sparkles } from "lucide-react";
import type { ConfigPayload } from "../../shared/types";
import Modal from "./Modal";

interface MethodologyModalProps {
  open: boolean;
  onClose: () => void;
  config: ConfigPayload | null;
}

const FACTORS = [
  {
    label: "Weather",
    weight: 27,
    detail: "Rain, snow, ice, wind, temperature extremes and visibility loss.",
  },
  {
    label: "Visibility & daylight",
    weight: 16,
    detail: "Fog, precipitation, solar elevation and how much of the route is lit.",
  },
  {
    label: "Road geometry",
    weight: 21,
    detail: "Width, lanes, grade, curvature, shoulders and junction density.",
  },
  {
    label: "Surface",
    weight: 10,
    detail: "Asphalt, gravel or unpaved surface, quality and wet/icy state.",
  },
  {
    label: "Traffic",
    weight: 13,
    detail: "Simulated congestion, junction exposure and speed environment.",
  },
  {
    label: "Road context",
    weight: 13,
    detail: "Crash-history index, school zones, flood exposure and animal risk.",
  },
];

export default function MethodologyModal({
  open,
  onClose,
  config,
}: MethodologyModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      eyebrow="Explainability"
      title="How Routey decides"
      subtitle="A transparent local risk engine decides every score. The map is real; the conditions are simulated."
    >
      <div className="method-grid">
        <section className="method-card">
          <span className="eyebrow">The safety score</span>
          <h3>Start at 100, subtract weighted risk.</h3>
          <p>
            Each road segment gets a risk profile from six factor groups.
            Distance-weighted averages are combined with an extra penalty for
            the worst segment on the route. The result is a 0–100 safety score;
            higher is safer. Compounding hazards such as ice on a steep bend or
            fog on an unlit road add extra risk.
          </p>
          <div className="method-factors">
            {FACTORS.map((factor) => (
              <div className="method-factor" key={factor.label}>
                <div className="method-factor-head">
                  <strong>{factor.label}</strong>
                  <span>{factor.weight}%</span>
                </div>
                <div className="method-factor-track">
                  <div style={{ width: `${factor.weight * 3.2}%` }} />
                </div>
                <p>{factor.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="method-card">
          <span className="eyebrow">The recommendation</span>
          <h3>Safety and efficiency stay separate.</h3>
          <p>
            Safety measures simulated risk. Efficiency compares simulated ETA,
            distance and traffic exposure with the fastest option. The
            <strong> decision weighting</strong> slider combines the two. At a
            high safety weight the safest route usually wins; at a low weight
            the quickest route can win even with more risk.
          </p>
          <div className="method-callout">
            <Sparkles size={16} />
            <div>
              <strong>Why every path gets a reason</strong>
              <p>
                The engine compares factor contributions, safety gaps, ETA gaps
                and the worst segments, then generates a local explanation under
                every route. If an LLM layer is configured, it can rewrite that
                explanation, but it cannot invent or change scores.
              </p>
            </div>
          </div>
          <div className="method-formula">
            <code>
              overall = weight × safety + (1 − weight) × efficiency
            </code>
            <span>
              Default weighting: 80% safety, 20% efficiency. Adjustable in the
              sidebar.
            </span>
          </div>
        </section>

        <section className="method-card">
          <span className="eyebrow">The simulation</span>
          <h3>Real places, generated conditions.</h3>
          <p>
            The simulator picks a real city from a curated global catalogue,
            samples two points on real roads, and asks a live OSM router for
            route geometry and maneuvers. It then generates a seed-specific
            story: local time, solar position, weather, traffic, road width,
            grade, surface, lighting, crash history and more.
          </p>
          <ul className="method-list">
            <li>
              <strong>Real:</strong> map tiles, place search, road geometry,
              turn maneuvers, distances and base travel times.
            </li>
            <li>
              <strong>Simulated:</strong> weather, traffic, road attributes,
              safety scores and recommendations.
            </li>
            <li>
              <strong>Verified:</strong> the Simulation Lab runs the backend
              tester and checks that places, weather signatures, times and seeds
              never repeat inside a run.
            </li>
          </ul>
        </section>

        <section className="method-card">
          <span className="eyebrow">The AI layer</span>
          <h3>Explainable by construction.</h3>
          <p>
            Routey's local risk engine is the decision-maker. It is a
            deterministic, weighted expert model — no hidden model weights, no
            training data required. The optional LLM is an explanation layer
            only. It receives a compact summary of the already-decided route and
            is instructed not to change scores or claim real-world conditions.
          </p>
          <div className={`method-status ${config?.llmConfigured ? "on" : ""}`}>
            <Sparkles size={15} />
            <div>
              <strong>
                {config?.llmConfigured
                  ? "Optional LLM layer connected"
                  : "Local explainable model active"}
              </strong>
              <span>
                {config?.llmConfigured
                  ? config?.llmModel
                  : "Set LLM_API_KEY on the server to enable richer narrative output."}
              </span>
            </div>
          </div>
          <div className="method-warning">
            <AlertTriangle size={16} />
            <p>
              Routey is a simulation and research demo. It must never be used
              for real navigation or safety decisions. Road, weather and traffic
              data are simulated; routing availability depends on public OSM
              services.
            </p>
          </div>
        </section>
      </div>
    </Modal>
  );
}
