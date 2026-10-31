export type Climate =
  | "temperate"
  | "mediterranean"
  | "cold"
  | "tropical"
  | "arid"
  | "humid-subtropical"
  | "highland";

export type RoadSurface =
  | "asphalt"
  | "concrete"
  | "paved"
  | "cobblestone"
  | "gravel"
  | "unpaved";

export type RoadState = "dry" | "damp" | "wet" | "icy" | "snow-covered";

export type DayPhase =
  | "day"
  | "golden-hour"
  | "civil-twilight"
  | "night";

export type WeatherCondition =
  | "clear"
  | "partly-cloudy"
  | "overcast"
  | "mist"
  | "fog"
  | "drizzle"
  | "rain"
  | "heavy-rain"
  | "snow"
  | "sleet"
  | "thunderstorm";

export type TrafficLevel = "free" | "light" | "moderate" | "heavy" | "severe";

export type RiskFactorKey =
  | "weather"
  | "visibility"
  | "road"
  | "surface"
  | "traffic"
  | "context";

export type SafetyLabel =
  | "Very safe"
  | "Safe"
  | "Moderate"
  | "Risky"
  | "Very risky";

export type PriorityLabel = "Safety first" | "Balanced" | "Time first";

export interface City {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  bbox: {
    minLat: number;
    minLon: number;
    maxLat: number;
    maxLon: number;
  };
  timezone: string;
  climate: Climate;
}

export interface Place {
  label: string;
  lat: number;
  lon: number;
}

export interface Weather {
  condition: WeatherCondition;
  temperatureC: number;
  feelsLikeC: number;
  precipitationMmH: number;
  precipitationType: "none" | "rain" | "snow" | "sleet" | "hail";
  visibilityKm: number;
  windKph: number;
  gustKph: number;
  humidityPct: number;
  cloudCoverPct: number;
  iceRisk: number;
  roadState: RoadState;
  solarElevationDeg: number;
  phase: DayPhase;
  localTimeLabel: string;
  sunriseLocal: string | null;
  sunsetLocal: string | null;
  fingerprint: string;
}

export interface Traffic {
  level: TrafficLevel;
  congestionPct: number;
  delayFactor: number;
  rushHour: boolean;
}

export interface Maneuver {
  index: number;
  type: number;
  instruction: string;
  streetName: string;
  distanceM: number;
  durationS: number;
  beginShapeIndex: number;
  endShapeIndex: number;
}

export interface FactorScore {
  key: RiskFactorKey;
  label: string;
  weight: number;
  risk: number;
  impactPoints: number;
  description: string;
}

export interface RoadSegment {
  id: string;
  index: number;
  streetName: string;
  instruction: string;
  roadClass: string;
  surface: RoadSurface;
  surfaceQuality: number;
  widthM: number;
  lanes: number;
  shoulder: "none" | "narrow" | "wide";
  speedLimitKph: number;
  gradePct: number;
  curvatureDegPerKm: number;
  junctionDensity: number;
  lighting: "well-lit" | "partial" | "unlit";
  roadState: RoadState;
  iceRisk: number;
  accidentRisk: number;
  schoolZone: boolean;
  floodRisk: number;
  animalRisk: number;
  distanceM: number;
  durationS: number;
  startShapeIndex: number;
  endShapeIndex: number;
  safetyScore: number;
  risk: number;
}

export interface RouteData {
  id: string;
  ordinal: number;
  name: string;
  kind: "fastest" | "alternative" | "detour";
  provider: string;
  distanceM: number;
  durationS: number;
  adjustedDurationS: number;
  avgSpeedKph: number;
  geometry: [number, number][];
  maneuvers: Maneuver[];
  segments: RoadSegment[];
  safetyScore: number;
  efficiencyScore: number;
  overallScore: number;
  safetyLabel: SafetyLabel;
  factors: FactorScore[];
  topRisks: string[];
  reasons: string[];
  recommendation: string;
  isSafest: boolean;
  isFastest: boolean;
  isRecommended: boolean;
}

export interface Scenario {
  id: string;
  seed: string;
  cityId: string;
  cityName: string;
  country: string;
  centerLat: number;
  centerLon: number;
  timezone: string;
  climate: Climate;
  origin: Place;
  destination: Place;
  simulatedAtUtc: string;
  simulatedAtLocal: string;
  weather: Weather;
  traffic: Traffic;
  priority: number;
  priorityLabel: PriorityLabel;
  routeProvider: string;
  isFallback: boolean;
  createdAt: string;
}

export interface ScenarioPayload {
  scenario: Scenario;
  routes: RouteData[];
  recommendedRouteId: string;
  priority: number;
  priorityLabel: PriorityLabel;
  disclaimer: string;
}

export interface GeocodeResult {
  label: string;
  shortLabel: string;
  lat: number;
  lon: number;
  type: string;
  countryCode: string | null;
}

export interface ConfigPayload {
  version: string;
  router: string;
  llmConfigured: boolean;
  llmModel: string | null;
  tileProvider: string;
  disclaimer: string;
}

export interface LabChecks {
  uniquePlaces: boolean;
  uniqueWeather: boolean;
  uniqueTimes: boolean;
  uniqueSeeds: boolean;
  allRoutesScored: boolean;
  multiRouteScenarios: boolean;
}

export interface LabScenarioSummary {
  index: number;
  scenarioId: string;
  cityName: string;
  country: string;
  localTime: string;
  weatherCondition: WeatherCondition;
  temperatureC: number;
  routeCount: number;
  safestRouteName: string;
  safestScore: number;
  recommendedScore: number;
  etaMinutes: number;
  seed: string;
  createdAt: string;
}

export type LabRunStatus = "queued" | "running" | "completed" | "failed";

export interface LabRun {
  id: string;
  status: LabRunStatus;
  requestedCount: number;
  completedCount: number;
  checks: LabChecks;
  scenarios: LabScenarioSummary[];
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface LabRunSummary {
  id: string;
  status: LabRunStatus;
  requestedCount: number;
  completedCount: number;
  createdAt: string;
  completedAt: string | null;
  uniquePlaces: number;
  uniqueWeather: number;
  allChecksPassed: boolean;
}

export interface AiExplanation {
  text: string;
  enhanced: boolean;
  model: string | null;
}
