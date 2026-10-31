import type {
  DayPhase,
  RiskFactorKey,
  RoadState,
  RoadSurface,
  SafetyLabel,
  TrafficLevel,
  WeatherCondition,
} from "./types";

export const WEATHER_LABELS: Record<WeatherCondition, string> = {
  clear: "Clear",
  "partly-cloudy": "Partly cloudy",
  overcast: "Overcast",
  mist: "Mist",
  fog: "Fog",
  drizzle: "Drizzle",
  rain: "Rain",
  "heavy-rain": "Heavy rain",
  snow: "Snow",
  sleet: "Sleet",
  thunderstorm: "Thunderstorm",
};

export const PHASE_LABELS: Record<DayPhase, string> = {
  day: "Daylight",
  "golden-hour": "Low sun",
  "civil-twilight": "Twilight",
  night: "Night",
};

export const TRAFFIC_LABELS: Record<TrafficLevel, string> = {
  free: "Free flowing",
  light: "Light traffic",
  moderate: "Moderate traffic",
  heavy: "Heavy traffic",
  severe: "Severe congestion",
};

export const SURFACE_LABELS: Record<RoadSurface, string> = {
  asphalt: "Asphalt",
  concrete: "Concrete",
  paved: "Paved",
  cobblestone: "Cobblestone",
  gravel: "Gravel",
  unpaved: "Unpaved",
};

export const ROAD_STATE_LABELS: Record<RoadState, string> = {
  dry: "Dry",
  damp: "Damp",
  wet: "Wet",
  icy: "Icy",
  "snow-covered": "Snow-covered",
};

export const FACTOR_LABELS: Record<RiskFactorKey, string> = {
  weather: "Weather",
  visibility: "Visibility",
  road: "Road geometry",
  surface: "Surface",
  traffic: "Traffic",
  context: "Road context",
};

export function weatherLabel(condition: WeatherCondition): string {
  return WEATHER_LABELS[condition];
}

export function phaseLabel(phase: DayPhase): string {
  return PHASE_LABELS[phase];
}

export function safetyLabelForScore(score: number): SafetyLabel {
  if (score >= 85) return "Very safe";
  if (score >= 72) return "Safe";
  if (score >= 58) return "Moderate";
  if (score >= 44) return "Risky";
  return "Very risky";
}

export function priorityLabelForValue(
  priority: number,
): "Safety first" | "Balanced" | "Time first" {
  if (priority >= 0.75) return "Safety first";
  if (priority <= 0.4) return "Time first";
  return "Balanced";
}

export const ROUTE_COLORS = ["#14b8a6", "#3b82f6", "#a855f7"] as const;

export function routeColor(ordinal: number): string {
  return ROUTE_COLORS[Math.abs(ordinal) % ROUTE_COLORS.length]!;
}

export function safetyColor(score: number): string {
  if (score >= 85) return "#34d399";
  if (score >= 72) return "#a3e635";
  if (score >= 58) return "#fbbf24";
  if (score >= 44) return "#fb923c";
  return "#f87171";
}

export function riskColor(risk: number): string {
  if (risk < 22) return "#34d399";
  if (risk < 38) return "#a3e635";
  if (risk < 55) return "#fbbf24";
  if (risk < 72) return "#fb923c";
  return "#f87171";
}

export function formatDuration(seconds: number): string {
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters >= 10_000 ? 0 : 1)} km`;
}
