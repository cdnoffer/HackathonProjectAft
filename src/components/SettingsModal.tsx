import {
  Database,
  ExternalLink,
  Info,
  Map,
  Monitor,
  Moon,
  Server,
  Sparkles,
  Sun,
} from "lucide-react";
import type { ConfigPayload } from "../../shared/types";
import type { ThemeMode } from "../lib/theme";
import Modal from "./Modal";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  config: ConfigPayload | null;
  onOpenMethodology: () => void;
}

const THEMES: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: "auto", label: "Auto", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

export default function SettingsModal({
  open,
  onClose,
  themeMode,
  onThemeChange,
  config,
  onOpenMethodology,
}: SettingsModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      eyebrow="Preferences"
      title="Routey settings"
      subtitle="Appearance, the optional LLM layer, and the data behind every simulated route."
    >
      <div className="settings-stack">
        <section className="settings-card">
          <div className="settings-head">
            <div>
              <h3>Appearance</h3>
              <p>Auto follows your operating system theme.</p>
            </div>
          </div>
          <div className="theme-options">
            {THEMES.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  type="button"
                  key={option.value}
                  className={`theme-option ${themeMode === option.value ? "active" : ""}`}
                  onClick={() => onThemeChange(option.value)}
                >
                  <Icon size={18} />
                  {option.label}
                </button>
              );
            })}
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-head">
            <div>
              <h3>
                <Sparkles size={16} /> AI explanation layer
              </h3>
              <p>
                The local explainable risk engine always decides the score and
                recommendation. An optional LLM can rewrite the explanation.
              </p>
            </div>
            <span className={`status-pill ${config?.llmConfigured ? "on" : ""}`}>
              {config?.llmConfigured ? "LLM connected" : "Local only"}
            </span>
          </div>
          <div className="settings-info-grid">
            <div>
              <span>Decision engine</span>
              <strong>Routey Risk Engine v1</strong>
            </div>
            <div>
              <span>LLM model</span>
              <strong>
                {config?.llmConfigured ? config.llmModel : "not configured"}
              </strong>
            </div>
          </div>
          <p className="settings-hint">
            Set <code>LLM_API_KEY</code> on the server (OpenAI-compatible) to
            enable richer explanations. The key never reaches the browser and
            the LLM is not allowed to change scores.
          </p>
        </section>

        <section className="settings-card">
          <div className="settings-head">
            <div>
              <h3>Data & infrastructure</h3>
              <p>What is live, what is simulated, and where it is stored.</p>
            </div>
          </div>
          <div className="source-list">
            <div>
              <span className="source-icon">
                <Map size={16} />
              </span>
              <div>
                <strong>Map tiles</strong>
                <span>OpenStreetMap standard basemap</span>
              </div>
              <em>live</em>
            </div>
            <div>
              <span className="source-icon">
                <Server size={16} />
              </span>
              <div>
                <strong>Routing & geocoding</strong>
                <span>OSM + Valhalla routing; Nominatim place search</span>
              </div>
              <em>live</em>
            </div>
            <div>
              <span className="source-icon">
                <Database size={16} />
              </span>
              <div>
                <strong>SQLite database</strong>
                <span>Scenarios, generated conditions, routes, map cache, Lab runs</span>
              </div>
              <em>local</em>
            </div>
            <div>
              <span className="source-icon">
                <Sparkles size={16} />
              </span>
              <div>
                <strong>Weather, traffic, road attributes</strong>
                <span>Deterministically generated from the scenario seed</span>
              </div>
              <em className="simulated">simulated</em>
            </div>
          </div>
        </section>

        <section className="settings-card notice-card">
          <Info size={17} />
          <div>
            <h3>Research demo, not navigation</h3>
            <p>{config?.disclaimer}</p>
          </div>
        </section>

        <div className="settings-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              onClose();
              onOpenMethodology();
            }}
          >
            <Info size={15} /> How scoring works
          </button>
          <a
            className="button button-ghost"
            href="https://github.com/cdnoffer/HackathonProjectAft"
            target="_blank"
            rel="noreferrer"
          >
            View repository <ExternalLink size={14} />
          </a>
        </div>
      </div>
    </Modal>
  );
}
