import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  Crosshair,
  FlaskConical,
  Info,
  Loader2,
  MapPin,
  Monitor,
  Moon,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  X,
} from "lucide-react";
import type {
  ConfigPayload,
  Place,
  ScenarioPayload,
} from "../shared/types";
import { priorityLabelForValue, routeColor } from "../shared/labels";
import { api, ApiError } from "./lib/api";
import {
  applyTheme,
  getStoredThemeMode,
  resolveTheme,
  storeThemeMode,
  type EffectiveTheme,
  type ThemeMode,
} from "./lib/theme";
import Brand from "./components/Brand";
import RouteCard from "./components/RouteCard";
import ScenarioSummary from "./components/ScenarioSummary";
import MapView, { type PickMode } from "./components/MapView";
import PlaceSearch from "./components/PlaceSearch";
import PrioritySlider from "./components/PrioritySlider";
import RouteDetails from "./components/RouteDetails";
import DrivingPanel from "./components/DrivingPanel";
import SimulationLab from "./components/SimulationLab";
import SettingsModal from "./components/SettingsModal";
import MethodologyModal from "./components/MethodologyModal";

type Toast = { message: string; type: "error" | "success" | "info" };

const PRIORITY_KEY = "routey.priority";

function readPriority(): number {
  const raw = window.localStorage.getItem(PRIORITY_KEY);
  const parsed = raw ? Number(raw) : 0.8;
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 0.8;
}

export default function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() =>
    getStoredThemeMode(),
  );
  const [theme, setTheme] = useState<EffectiveTheme>(() =>
    resolveTheme(getStoredThemeMode()),
  );
  const [config, setConfig] = useState<ConfigPayload | null>(null);
  const [payload, setPayload] = useState<ScenarioPayload | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [priority, setPriority] = useState<number>(() => readPriority());
  const [lastRankedPriority, setLastRankedPriority] = useState<number>(() =>
    readPriority(),
  );
  const [initialLoading, setInitialLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [ranking, setRanking] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [pickMode, setPickMode] = useState<PickMode>(null);
  const [originChoice, setOriginChoice] = useState<Place | null>(null);
  const [destinationChoice, setDestinationChoice] = useState<Place | null>(
    null,
  );
  const [customDirty, setCustomDirty] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [labOpen, setLabOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const [driving, setDriving] = useState(false);
  const [carPosition, setCarPosition] = useState<{
    lat: number;
    lon: number;
    bearing: number;
  } | null>(null);

  const rankSeqRef = useRef(0);
  const priorityRef = useRef(priority);
  priorityRef.current = priority;

  useEffect(() => {
    storeThemeMode(themeMode);
    setTheme(applyTheme(themeMode));
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      if (themeMode === "auto") setTheme(applyTheme("auto"));
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [themeMode]);

  useEffect(() => {
    window.localStorage.setItem(PRIORITY_KEY, String(priority));
  }, [priority]);

  useEffect(() => {
    api
      .getConfig()
      .then(setConfig)
      .catch(() => {
        /* The UI still works with local defaults. */
      });
  }, []);

  const applyPayload = useCallback((next: ScenarioPayload) => {
    rankSeqRef.current += 1;
    setRanking(false);
    setPayload(next);
    setSelectedRouteId(next.recommendedRouteId);
    setPriority(next.priority);
    setLastRankedPriority(next.priority);
    setOriginChoice(next.scenario.origin);
    setDestinationChoice(next.scenario.destination);
    setCustomDirty(false);
    setSearchExpanded(false);
    setPickMode(null);
    setDriving(false);
    setCarPosition(null);
    setDetailsOpen(false);
  }, []);

  const boot = useCallback(
    async (attempt = 0) => {
      setInitialLoading(true);
      setBootError(null);
      try {
        const next = await api.randomScenario({
          priority: priorityRef.current,
        });
        applyPayload(next);
      } catch (error) {
        if (attempt === 0) {
          try {
            const latest = await api.getLatestScenario();
            applyPayload(latest);
            setToast({
              message: "Live routing was slow; loaded the latest saved scenario.",
              type: "info",
            });
            return;
          } catch {
            /* fall through to the visible error */
          }
        }
        const message =
          error instanceof ApiError
            ? error.message
            : "Could not generate the first scenario";
        setBootError(message);
      } finally {
        setInitialLoading(false);
      }
    },
    [applyPayload],
  );

  useEffect(() => {
    void boot();
  }, [boot]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!payload) return;
    if (Math.abs(priority - lastRankedPriority) < 0.004) return;
    const scenarioId = payload.scenario.id;
    const sequence = ++rankSeqRef.current;
    setRanking(true);
    const timer = window.setTimeout(async () => {
      try {
        const updated = await api.rankScenario(scenarioId, priority);
        if (rankSeqRef.current !== sequence) return;
        const previousRecommended = payload.recommendedRouteId;
        setPayload(updated);
        setSelectedRouteId((current) =>
          !current || current === previousRecommended
            ? updated.recommendedRouteId
            : current,
        );
        setLastRankedPriority(updated.priority);
      } catch (error) {
        if (rankSeqRef.current === sequence) {
          setToast({
            message:
              error instanceof Error
                ? error.message
                : "Could not rerank the routes",
            type: "error",
          });
        }
      } finally {
        if (rankSeqRef.current === sequence) setRanking(false);
      }
    }, 380);
    return () => window.clearTimeout(timer);
  }, [priority, payload?.scenario.id, lastRankedPriority, payload]);

  useEffect(() => {
    if (driving && !payload) setDriving(false);
  }, [driving, payload]);

  const selectedRoute = useMemo(() => {
    if (!payload) return null;
    return (
      payload.routes.find((route) => route.id === selectedRouteId) ??
      payload.routes.find((route) => route.id === payload.recommendedRouteId) ??
      payload.routes[0] ??
      null
    );
  }, [payload, selectedRouteId]);

  const orderedRoutes = useMemo(() => {
    if (!payload) return [];
    return [...payload.routes].sort((a, b) => {
      if (a.isRecommended !== b.isRecommended) {
        return a.isRecommended ? -1 : 1;
      }
      if (a.isSafest !== b.isSafest) return a.isSafest ? -1 : 1;
      return b.overallScore - a.overallScore;
    });
  }, [payload]);

  const randomize = async () => {
    if (generating) return;
    setGenerating(true);
    setPickMode(null);
    try {
      const next = await api.randomScenario({ priority });
      applyPayload(next);
      setToast({
        message: `New scenario: ${next.scenario.cityName}, ${next.scenario.weather.condition.replace("-", " ")}.`,
        type: "success",
      });
    } catch (error) {
      setToast({
        message:
          error instanceof Error
            ? error.message
            : "Could not generate a new scenario",
        type: "error",
      });
    } finally {
      setGenerating(false);
    }
  };

  const compareCustom = async () => {
    if (!originChoice || !destinationChoice || generating) return;
    setGenerating(true);
    setPickMode(null);
    try {
      const next = await api.customScenario(
        originChoice,
        destinationChoice,
        priority,
      );
      applyPayload(next);
      setToast({
        message: "Compared routes for your two points.",
        type: "success",
      });
    } catch (error) {
      setToast({
        message:
          error instanceof Error
            ? error.message
            : "Could not route between those points",
        type: "error",
      });
    } finally {
      setGenerating(false);
    }
  };

  const onMapClick = useCallback(
    async (lat: number, lon: number) => {
      if (!pickMode) return;
      const target = pickMode;
      setPickMode(null);
      try {
        const result = await api.reversePlace(lat, lon);
        const place: Place = {
          label: result.shortLabel,
          lat,
          lon,
        };
        if (target === "origin") setOriginChoice(place);
        else setDestinationChoice(place);
        setCustomDirty(true);
        setToast({
          message: `${target === "origin" ? "Start" : "Destination"} set to ${result.shortLabel}.`,
          type: "success",
        });
      } catch {
        const place: Place = {
          label: `Dropped pin · ${lat.toFixed(4)}, ${lon.toFixed(4)}`,
          lat,
          lon,
        };
        if (target === "origin") setOriginChoice(place);
        else setDestinationChoice(place);
        setCustomDirty(true);
      }
    },
    [pickMode],
  );

  const onSelectRoute = useCallback(
    (id: string) => {
      if (driving) return;
      setSelectedRouteId(id);
    },
    [driving],
  );

  const startDriving = () => {
    if (!selectedRoute) return;
    setDetailsOpen(false);
    setPickMode(null);
    setDriving(true);
  };

  const onTelemetry = useCallback(
    (position: { lat: number; lon: number; bearing: number } | null) => {
      setCarPosition(position);
    },
    [],
  );

  const openSettings = () => {
    setLabOpen(false);
    setMethodologyOpen(false);
    setDetailsOpen(false);
    setSettingsOpen(true);
  };

  const openMethodology = () => {
    setSettingsOpen(false);
    setLabOpen(false);
    setDetailsOpen(false);
    setMethodologyOpen(true);
  };

  const openLab = () => {
    setSettingsOpen(false);
    setMethodologyOpen(false);
    setDetailsOpen(false);
    setLabOpen(true);
  };

  const cycleTheme = () => {
    setThemeMode((current) =>
      current === "auto" ? "light" : current === "light" ? "dark" : "auto",
    );
  };

  const ThemeIcon =
    themeMode === "auto" ? Monitor : themeMode === "light" ? Sun : Moon;
  const priorityLabel = priorityLabelForValue(priority);

  return (
    <div className="app-shell">
      <MapView
        scenario={payload?.scenario ?? null}
        routes={payload?.routes ?? []}
        selectedRouteId={selectedRoute?.id ?? null}
        onSelectRoute={onSelectRoute}
        pickMode={pickMode}
        onMapClick={onMapClick}
        theme={theme}
        carPosition={carPosition}
        driving={driving}
      />

      <div className="map-actions">
        <button
          type="button"
          className="map-action-button"
          onClick={cycleTheme}
          title={`Theme: ${themeMode}. Click to cycle.`}
          aria-label="Change theme"
        >
          <ThemeIcon size={17} />
        </button>
        <button
          type="button"
          className="map-action-button"
          onClick={openLab}
          title="Simulation Lab"
          aria-label="Open Simulation Lab"
        >
          <FlaskConical size={17} />
        </button>
        <button
          type="button"
          className="map-action-button"
          onClick={openSettings}
          title="Settings"
          aria-label="Open settings"
        >
          <Settings2 size={17} />
        </button>
      </div>

      {!driving ? (
        <div className="map-caption">
          <span className="live-dot" />
          Live OSM map
          <span className="caption-sep">·</span>
          simulated conditions
        </div>
      ) : null}

      {!driving && orderedRoutes.length > 0 ? (
        <div className="map-legend" aria-label="Routes on the map">
          {orderedRoutes.map((route) => (
            <button
              type="button"
              key={route.id}
              className={`map-legend-row ${route.id === selectedRoute?.id ? "active" : ""}`}
              onClick={() => setSelectedRouteId(route.id)}
              title={`${route.name} · ${Math.round(route.safetyScore)} safety`}
            >
              <span
                className="map-legend-dot"
                style={{ background: routeColor(route.ordinal) }}
              />
              <span>{route.name}</span>
              {route.isRecommended ? <em>best</em> : null}
              <strong>{Math.round(route.safetyScore)}</strong>
            </button>
          ))}
        </div>
      ) : null}

      <aside className={`sidebar ${driving ? "sidebar-driving" : ""}`}>
        <div className="sidebar-inner">
          <div className="sidebar-brand-row">
            <Brand />
            <div className="sidebar-brand-actions">
              <button
                type="button"
                className="icon-button"
                onClick={openLab}
                title="Simulation Lab"
                aria-label="Open Simulation Lab"
              >
                <FlaskConical size={17} />
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={openSettings}
                title="Settings"
                aria-label="Open settings"
              >
                <Settings2 size={17} />
              </button>
            </div>
          </div>

          {driving && selectedRoute && payload ? (
            <DrivingPanel
              key={selectedRoute.id}
              route={selectedRoute}
              scenario={payload.scenario}
              onExit={() => {
                setDriving(false);
                setCarPosition(null);
              }}
              onTelemetry={onTelemetry}
            />
          ) : (
            <>
              {payload ? (
                <>
                  <ScenarioSummary scenario={payload.scenario} />
                  <button
                    type="button"
                    className="button button-primary randomize-button"
                    onClick={randomize}
                    disabled={generating}
                  >
                    {generating ? (
                      <Loader2 size={16} className="spin" />
                    ) : (
                      <RefreshCw size={16} />
                    )}
                    New random scenario
                  </button>

                  <section
                    className={`search-panel ${searchExpanded ? "expanded" : "collapsed"}`}
                  >
                    <div className="panel-head-row">
                      <div className="custom-journey-summary">
                        <span className="eyebrow">
                          <MapPin size={12} /> Custom journey
                        </span>
                        <h3 title={`${originChoice?.label ?? "Start"} to ${destinationChoice?.label ?? "Destination"}`}>
                          {originChoice?.label ?? "Start"}
                          <span className="journey-arrow">→</span>
                          {destinationChoice?.label ?? "Destination"}
                        </h3>
                      </div>
                      <div className="panel-head-actions">
                        {searchExpanded ? (
                          <button
                            type="button"
                            className="icon-button"
                            onClick={() => {
                              setOriginChoice(destinationChoice);
                              setDestinationChoice(originChoice);
                              setCustomDirty(true);
                            }}
                            title="Swap start and destination"
                            aria-label="Swap start and destination"
                            disabled={!originChoice || !destinationChoice}
                          >
                            <ArrowUpDown size={15} />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="button button-ghost button-small"
                          onClick={() => {
                            setSearchExpanded((current) => !current);
                            if (searchExpanded) setPickMode(null);
                          }}
                          aria-expanded={searchExpanded}
                        >
                          {searchExpanded ? "Hide" : "Edit points"}
                          <ChevronDown
                            size={14}
                            className={searchExpanded ? "chevron-up" : ""}
                          />
                        </button>
                      </div>
                    </div>
                    {searchExpanded ? (
                      <>
                        <PlaceSearch
                          role="origin"
                          value={originChoice}
                          onSelect={(place) => {
                            setOriginChoice(place);
                            setCustomDirty(true);
                          }}
                          onPickOnMap={() =>
                            setPickMode((mode) =>
                              mode === "origin" ? null : "origin",
                            )
                          }
                          pickActive={pickMode === "origin"}
                          disabled={generating}
                        />
                        <PlaceSearch
                          role="destination"
                          value={destinationChoice}
                          onSelect={(place) => {
                            setDestinationChoice(place);
                            setCustomDirty(true);
                          }}
                          onPickOnMap={() =>
                            setPickMode((mode) =>
                              mode === "destination" ? null : "destination",
                            )
                          }
                          pickActive={pickMode === "destination"}
                          disabled={generating}
                        />
                        {pickMode ? (
                          <div className="map-pick-banner">
                            <Crosshair size={14} />
                            Click anywhere on the map to set the{" "}
                            {pickMode === "origin" ? "start" : "destination"}.
                            <button
                              type="button"
                              onClick={() => setPickMode(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : null}
                        <button
                          type="button"
                          className={`button button-secondary button-full ${customDirty ? "has-changes" : ""}`}
                          onClick={compareCustom}
                          disabled={
                            !originChoice || !destinationChoice || generating
                          }
                        >
                          {generating ? (
                            <Loader2 size={15} className="spin" />
                          ) : (
                            <Search size={15} />
                          )}
                          Compare routes for these points
                        </button>
                      </>
                    ) : null}
                  </section>

                  <PrioritySlider
                    value={priority}
                    onChange={setPriority}
                    disabled={generating || ranking}
                    loading={ranking}
                  />

                  <div className="route-list-head">
                    <div>
                      <h2>Route options</h2>
                      <span>
                        {payload.routes.length} live OSM route
                        {payload.routes.length === 1 ? "" : "s"} · AI ranked
                      </span>
                    </div>
                    <span className="ranking-pill">
                      <ShieldCheck size={12} />
                      {priorityLabel}
                    </span>
                  </div>

                  <div className={`route-list ${ranking ? "is-ranking" : ""}`}>
                    {orderedRoutes.map((route) => (
                      <RouteCard
                        key={route.id}
                        route={route}
                        selected={route.id === selectedRoute?.id}
                        onSelect={() => setSelectedRouteId(route.id)}
                        onDetails={() => {
                          setSelectedRouteId(route.id);
                          setDetailsOpen(true);
                        }}
                        onDrive={() => {
                          setSelectedRouteId(route.id);
                          setDetailsOpen(false);
                          setPickMode(null);
                          setDriving(true);
                        }}
                        disabled={generating}
                      />
                    ))}
                    {payload.routes.length === 1 ? (
                      <div className="single-route-note">
                        <Info size={14} />
                        Only one road route was returned for this pair. The safety
                        score still applies; try another scenario for alternatives.
                      </div>
                    ) : null}
                  </div>

                  <div className="sidebar-footer">
                    <button
                      type="button"
                      className="text-button"
                      onClick={openMethodology}
                    >
                      <Info size={13} /> How Routey decides
                    </button>
                    <span>
                      Real roads · simulated weather · {payload.routes.length} route
                      {payload.routes.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </>
              ) : initialLoading ? (
                <div className="sidebar-skeleton">
                  <div className="skeleton-block tall" />
                  <div className="skeleton-block" />
                  <div className="skeleton-block" />
                </div>
              ) : (
                <div className="sidebar-empty">
                  <AlertTriangle size={22} />
                  <h2>No scenario yet</h2>
                  <p>{bootError ?? "Generate a scenario to get started."}</p>
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => void boot()}
                  >
                    <RefreshCw size={15} /> Try again
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      {(initialLoading || generating) && (
        <div className={`loading-overlay ${payload ? "compact" : ""}`}>
          <div className="loading-card">
            <Brand compact={Boolean(payload)} />
            <div className="loading-route" aria-hidden="true">
              <span />
              <i />
            </div>
            <h2>
              {initialLoading
                ? "Building a fresh scenario…"
                : "Recalculating routes…"}
            </h2>
            <p>
              {initialLoading
                ? "Picking a real-world city, generating weather and traffic, then scoring live routes."
                : "Applying your safety weighting to every route."}
            </p>
            <div className="loading-chips">
              <span>
                <MapPin size={12} /> real place
              </span>
              <span>
                <Search size={12} /> live OSM routing
              </span>
              <span>
                <Sparkles size={12} /> explainable AI
              </span>
            </div>
          </div>
        </div>
      )}

      {bootError && !initialLoading && !payload ? (
        <div className="boot-error-banner">
          <AlertTriangle size={16} />
          <div>
            <strong>Live routing unavailable</strong>
            <span>{bootError}</span>
          </div>
          <button
            type="button"
            className="button button-primary button-small"
            onClick={() => void boot()}
          >
            Retry
          </button>
        </div>
      ) : null}

      <RouteDetails
        open={detailsOpen}
        payload={payload}
        route={selectedRoute}
        onClose={() => setDetailsOpen(false)}
        onDrive={startDriving}
        llmConfigured={config?.llmConfigured ?? false}
      />

      <SimulationLab
        open={labOpen}
        onClose={() => setLabOpen(false)}
        onOpenScenario={(next) => {
          applyPayload(next);
          setToast({
            message: `Opened ${next.scenario.cityName} from the Simulation Lab.`,
            type: "info",
          });
        }}
        priority={priority}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        themeMode={themeMode}
        onThemeChange={setThemeMode}
        config={config}
        onOpenMethodology={openMethodology}
      />

      <MethodologyModal
        open={methodologyOpen}
        onClose={() => setMethodologyOpen(false)}
        config={config}
      />

      {toast ? (
        <div className={`toast toast-${toast.type}`} role="status">
          {toast.type === "success" ? (
            <CheckCircle2 size={17} />
          ) : toast.type === "error" ? (
            <AlertTriangle size={17} />
          ) : (
            <Info size={17} />
          )}
          <span>{toast.message}</span>
          <button
            type="button"
            className="toast-close"
            onClick={() => setToast(null)}
            aria-label="Dismiss message"
          >
            <X size={14} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
