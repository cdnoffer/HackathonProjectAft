import type {
  City,
  Place,
  Scenario,
  ScenarioPayload,
} from "../shared/types";
import { haversineM } from "../shared/geo";
import { CITIES, climateForLatitude, findNearestCity, getCity } from "./cities";
import { DISCLAIMER } from "./config";
import { getRecentCityIds, saveScenario, updateRouteRanking } from "./db";
import { reversePlace } from "./geocode";
import { fetchRealRoutes } from "./routing";
import {
  clamp,
  rand,
  randomSeed,
  rngFor,
  round,
} from "./rng";
import { rerankRoutes, scoreRoutes, type ScoringContext } from "./scoring";
import { formatLocalDateTime, solarElevationDeg } from "./solar";
import { generateTraffic } from "./traffic";
import { generateWeather } from "./weather";

export interface GenerateRandomOptions {
  seed?: string;
  cityId?: string;
  priority?: number;
  simulatedAt?: string;
}

export interface GenerateCustomOptions {
  origin: Place;
  destination: Place;
  priority?: number;
  seed?: string;
  simulatedAt?: string;
}

const MAX_CUSTOM_ROUTE_M = 300_000;

const COMPASS = [
  "Central",
  "North",
  "North-east",
  "East",
  "South-east",
  "South",
  "South-west",
  "West",
  "North-west",
];

function endpointLabel(city: City, lat: number, lon: number): string {
  const distance = haversineM(city.lat, city.lon, lat, lon);
  if (distance < 500) return `Central ${city.name}`;
  const bearing =
    (Math.atan2(
      Math.cos((city.lat * Math.PI) / 180) *
        Math.sin(((lon - city.lon) * Math.PI) / 180),
      Math.cos((city.lat * Math.PI) / 180) *
        Math.sin((lat * Math.PI) / 180) -
        Math.sin((city.lat * Math.PI) / 180) *
          Math.cos((lat * Math.PI) / 180) *
          Math.cos(((lon - city.lon) * Math.PI) / 180),
    ) *
      180) /
    Math.PI;
  const normalized = (bearing + 360) % 360;
  const index = Math.round(normalized / 45) % 8;
  return `${COMPASS[index + 1] ?? "Near"} ${city.name}`;
}

function randomPoint(city: City, rng: () => number): Place {
  const lat = rand(rng, city.bbox.minLat, city.bbox.maxLat);
  const lon = rand(rng, city.bbox.minLon, city.bbox.maxLon);
  return {
    label: endpointLabel(city, lat, lon),
    lat: round(lat, 6),
    lon: round(lon, 6),
  };
}

function randomPair(
  city: City,
  seed: string,
  attempt: number,
): { origin: Place; destination: Place } {
  const rng = rngFor(seed, "endpoints", city.id, attempt);
  let origin = randomPoint(city, rng);
  let destination = randomPoint(city, rng);
  for (let i = 0; i < 28; i += 1) {
    const distance = haversineM(
      origin.lat,
      origin.lon,
      destination.lat,
      destination.lon,
    );
    if (distance >= 2_200 && distance <= 12_500) break;
    origin = randomPoint(city, rng);
    destination = randomPoint(city, rng);
  }
  return { origin, destination };
}

function pickScenarioDate(city: City, seed: string): Date {
  const rng = rngFor(seed, "time", city.id);
  const now = Date.now();
  let best = new Date(now + rand(rng, 8, 100) * 3_600_000);
  if (rng() < 0.62) {
    for (let attempt = 0; attempt < 14; attempt += 1) {
      const candidate = new Date(now + rand(rng, 8, 120) * 3_600_000);
      const elevation = solarElevationDeg(city.lat, city.lon, candidate);
      best = candidate;
      if (elevation > 3) break;
    }
  }
  return best;
}

function approximateTimezone(lon: number): string {
  const offset = clamp(Math.round(lon / 15), -12, 14);
  if (offset === 0) return "Etc/GMT";
  return `Etc/GMT${offset > 0 ? "-" : "+"}${Math.abs(offset)}`;
}

function customCity(origin: Place, destination: Place): City {
  const nearest = findNearestCity(
    (origin.lat + destination.lat) / 2,
    (origin.lon + destination.lon) / 2,
  );
  // Label threshold only; the route-length limit is MAX_CUSTOM_ROUTE_M.
  const close = nearest.distanceM < 120_000;
  const minLat = Math.min(origin.lat, destination.lat);
  const maxLat = Math.max(origin.lat, destination.lat);
  const minLon = Math.min(origin.lon, destination.lon);
  const maxLon = Math.max(origin.lon, destination.lon);
  const pad = 0.12;
  const name = close
    ? nearest.city.name
    : (origin.label.split(",")[0]?.trim() || "Custom area");
  return {
    id: close ? `custom-${nearest.city.id}` : "custom-route",
    name,
    country: close ? nearest.city.country : "Custom route",
    lat: (origin.lat + destination.lat) / 2,
    lon: (origin.lon + destination.lon) / 2,
    bbox: {
      minLat: minLat - pad,
      maxLat: maxLat + pad,
      minLon: minLon - pad,
      maxLon: maxLon + pad,
    },
    timezone: close ? nearest.city.timezone : approximateTimezone(destination.lon),
    climate: close ? nearest.city.climate : climateForLatitude(origin.lat),
  };
}

function pickCity(rng: () => number, avoid: Set<string>): City {
  const candidates = CITIES.filter((city) => !avoid.has(city.id));
  const pool = candidates.length > 0 ? candidates : CITIES;
  return pool[Math.floor(rng() * pool.length)]!;
}

function scenarioCityFromRecord(
  cityId: string,
  cityName: string,
  country: string,
  centerLat: number,
  centerLon: number,
  timezone: string,
  climate: City["climate"],
): City {
  return {
    id: cityId,
    name: cityName,
    country,
    lat: centerLat,
    lon: centerLon,
    bbox: {
      minLat: centerLat - 0.25,
      maxLat: centerLat + 0.25,
      minLon: centerLon - 0.25,
      maxLon: centerLon + 0.25,
    },
    timezone,
    climate,
  };
}

async function buildScenario(
  city: City,
  origin: Place,
  destination: Place,
  seed: string,
  priority: number,
  date: Date,
): Promise<ScenarioPayload> {
  const weather = generateWeather(city, date, seed);
  const traffic = generateTraffic(city, date, weather, seed);
  const context: ScoringContext = { seed, city, weather, traffic };
  let rawRoutes;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      rawRoutes = await fetchRealRoutes(origin, destination, city, seed);
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 650 + attempt * 900));
      }
    }
  }
  if (!rawRoutes || rawRoutes.length === 0) {
    throw lastError instanceof Error
      ? lastError
      : new Error("Could not find a drivable route for this scenario");
  }

  const ranked = scoreRoutes(rawRoutes, context, priority);
  const scenario: Scenario = {
    id: `scn_${crypto.randomUUID().slice(0, 12)}`,
    seed,
    cityId: city.id,
    cityName: city.name,
    country: city.country,
    centerLat: round(city.lat, 5),
    centerLon: round(city.lon, 5),
    timezone: city.timezone,
    climate: city.climate,
    origin,
    destination,
    simulatedAtUtc: date.toISOString(),
    simulatedAtLocal: formatLocalDateTime(date, city.timezone),
    weather,
    traffic,
    priority: ranked.priority,
    priorityLabel: ranked.priorityLabel,
    routeProvider: rawRoutes[0]!.provider,
    isFallback: false,
    createdAt: new Date().toISOString(),
  };
  saveScenario(scenario, ranked.routes, ranked.recommendedRouteId);
  return {
    scenario,
    routes: ranked.routes,
    recommendedRouteId: ranked.recommendedRouteId,
    priority: ranked.priority,
    priorityLabel: ranked.priorityLabel,
    disclaimer: DISCLAIMER,
  };
}

export async function generateRandomScenario(
  options: GenerateRandomOptions = {},
): Promise<ScenarioPayload> {
  const seed = options.seed?.trim() || randomSeed();
  const seedRng = rngFor(seed, "scenario");
  let city: City | undefined;
  if (options.cityId) {
    city = getCity(options.cityId);
    if (!city) throw new Error(`Unknown city: ${options.cityId}`);
  }
  if (!city) {
    const recent = new Set(getRecentCityIds(5));
    city = pickCity(seedRng, recent);
  }
  const date = options.simulatedAt
    ? new Date(options.simulatedAt)
    : pickScenarioDate(city, seed);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid simulatedAt timestamp");
  }

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const attemptSeed = attempt === 0 ? seed : `${seed}-retry-${attempt}`;
    const { origin, destination } = randomPair(city, attemptSeed, attempt);
    try {
      return await buildScenario(
        city,
        origin,
        destination,
        attemptSeed,
        options.priority ?? 0.8,
        date,
      );
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 700 + attempt * 900));
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("The simulator could not build a scenario");
}

export async function generateCustomScenario(
  options: GenerateCustomOptions,
): Promise<ScenarioPayload> {
  const origin = options.origin;
  const destination = options.destination;
  for (const place of [origin, destination]) {
    if (
      !Number.isFinite(place.lat) ||
      !Number.isFinite(place.lon) ||
      Math.abs(place.lat) > 90 ||
      Math.abs(place.lon) > 180
    ) {
      throw new Error("Origin and destination must be valid coordinates");
    }
  }
  const directDistance = haversineM(
    origin.lat,
    origin.lon,
    destination.lat,
    destination.lon,
  );
  if (directDistance < 120) {
    throw new Error("Choose two points at least 120 metres apart");
  }
  if (directDistance > MAX_CUSTOM_ROUTE_M) {
    throw new Error(
      `Custom routes are limited to ${MAX_CUSTOM_ROUTE_M / 1000} km; use the random simulator for longer trips`,
    );
  }

  const city = customCity(origin, destination);
  const seed = options.seed?.trim() || randomSeed();
  const date = options.simulatedAt
    ? new Date(options.simulatedAt)
    : pickScenarioDate(city, seed);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid simulatedAt timestamp");
  }
  return buildScenario(
    city,
    origin,
    destination,
    seed,
    options.priority ?? 0.8,
    date,
  );
}

export async function generateCustomScenarioWithLabels(
  origin: Place,
  destination: Place,
  priority = 0.8,
): Promise<ScenarioPayload> {
  let originLabel = origin.label;
  let destinationLabel = destination.label;
  if (!originLabel || originLabel === "Dropped pin") {
    originLabel = (await reversePlace(origin.lat, origin.lon)).shortLabel;
  }
  if (!destinationLabel || destinationLabel === "Dropped pin") {
    destinationLabel = (await reversePlace(destination.lat, destination.lon))
      .shortLabel;
  }
  return generateCustomScenario({
    origin: { ...origin, label: originLabel },
    destination: { ...destination, label: destinationLabel },
    priority,
  });
}

export function rerankScenario(
  payload: ScenarioPayload,
  priority: number,
): ScenarioPayload {
  const scenario = payload.scenario;
  const city = scenarioCityFromRecord(
    scenario.cityId,
    scenario.cityName,
    scenario.country,
    scenario.centerLat,
    scenario.centerLon,
    scenario.timezone,
    scenario.climate,
  );
  const context: ScoringContext = {
    seed: scenario.seed,
    city,
    weather: scenario.weather,
    traffic: scenario.traffic,
  };
  const ranked = rerankRoutes(payload.routes, clamp(priority, 0, 1), context);
  scenario.priority = ranked.priority;
  scenario.priorityLabel = ranked.priorityLabel;
  updateRouteRanking(
    scenario.id,
    ranked.routes,
    ranked.recommendedRouteId,
    ranked.priority,
    ranked.priorityLabel,
  );
  return {
    ...payload,
    scenario,
    routes: ranked.routes,
    recommendedRouteId: ranked.recommendedRouteId,
    priority: ranked.priority,
    priorityLabel: ranked.priorityLabel,
  };
}

