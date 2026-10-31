import type { City, Maneuver, Place } from "../shared/types";
import { bearingDeg, destinationPoint, haversineM, midpoint } from "../shared/geo";
import { config } from "./config";
import { getAnyCache, getCache, setCache } from "./db";
import { clamp, rngFor, round } from "./rng";

export interface RawRoute {
  provider: string;
  distanceM: number;
  durationS: number;
  geometry: [number, number][];
  maneuvers: Maneuver[];
  kindHint?: "fastest" | "alternative" | "detour";
}

interface ValhallaManeuver {
  type: number;
  instruction: string;
  street_names?: string[];
  length: number;
  time: number;
  begin_shape_index: number;
  end_shape_index: number;
}

interface ValhallaLeg {
  shape: string;
  maneuvers: ValhallaManeuver[];
  summary?: { length: number; time: number };
}

interface ValhallaTrip {
  summary: { length: number; time: number };
  legs: ValhallaLeg[];
}

interface ValhallaResponse {
  trip: ValhallaTrip;
  alternates?: { trip: ValhallaTrip }[];
}

interface ValhallaRequest {
  locations: { lat: number; lon: number }[];
  costing: string;
  directions_options: { units: string; language: string };
  alternates?: number;
}

let fetchQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const next = fetchQueue.then(task, task);
  fetchQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function decodePolyline6(encoded: string): [number, number][] {
  const coordinates: [number, number][] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    latitude += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    longitude += result & 1 ? ~(result >> 1) : result >> 1;

    coordinates.push([longitude / 1e6, latitude / 1e6]);
  }
  return coordinates;
}

function streetName(maneuver: ValhallaManeuver): string {
  const names = maneuver.street_names?.filter(Boolean) ?? [];
  if (names.length > 0) return names.slice(0, 2).join(" / ");
  const onto = maneuver.instruction.match(
    /\bonto\s+(.+?)(?:\.|$)/i,
  )?.[1];
  if (onto && onto.length < 90) return onto.trim();
  if (/roundabout/i.test(maneuver.instruction)) return "Roundabout";
  return "Unnamed road";
}

function tripToRaw(
  trip: ValhallaTrip,
  jobIndex: number,
  kindHint?: RawRoute["kindHint"],
): RawRoute {
  const geometry: [number, number][] = [];
  const maneuvers: Maneuver[] = [];
  for (const leg of trip.legs) {
    const legCoordinates = decodePolyline6(leg.shape);
    if (legCoordinates.length === 0) continue;
    let offset = 0;
    if (geometry.length === 0) {
      geometry.push(...legCoordinates);
      offset = 0;
    } else {
      const first = legCoordinates[0]!;
      const last = geometry[geometry.length - 1]!;
      const samePoint =
        Math.abs(first[0] - last[0]) < 1e-7 &&
        Math.abs(first[1] - last[1]) < 1e-7;
      const skip = samePoint ? 1 : 0;
      geometry.push(...legCoordinates.slice(skip));
      offset = geometry.length - legCoordinates.length;
    }
    for (const maneuver of leg.maneuvers) {
      const begin = clamp(
        offset + maneuver.begin_shape_index,
        0,
        Math.max(0, geometry.length - 1),
      );
      const end = clamp(
        offset + maneuver.end_shape_index,
        begin,
        Math.max(0, geometry.length - 1),
      );
      maneuvers.push({
        index: maneuvers.length,
        type: maneuver.type,
        instruction: maneuver.instruction,
        streetName: streetName(maneuver),
        distanceM: round(maneuver.length * 1000, 0),
        durationS: round(maneuver.time, 0),
        beginShapeIndex: begin,
        endShapeIndex: end,
      });
    }
  }

  if (maneuvers.length === 0 && geometry.length > 1) {
    maneuvers.push({
      index: 0,
      type: 1,
      instruction: "Follow the road",
      streetName: "Unnamed road",
      distanceM: round(trip.summary.length * 1000, 0),
      durationS: round(trip.summary.time, 0),
      beginShapeIndex: 0,
      endShapeIndex: geometry.length - 1,
    });
  }

  const geometryDistance = geometry.reduce((total, coord, index) => {
    if (index === 0) return total;
    const previous = geometry[index - 1]!;
    return total + haversineM(previous[1], previous[0], coord[1], coord[0]);
  }, 0);

  return {
    provider: "valhalla",
    distanceM:
      geometryDistance > 0
        ? round(geometryDistance, 0)
        : round(trip.summary.length * 1000, 0),
    durationS: round(trip.summary.time, 0),
    geometry,
    maneuvers,
    kindHint: kindHint ?? (jobIndex === 0 ? "fastest" : "alternative"),
  };
}

function routeSignature(route: RawRoute): string {
  const first = route.geometry[0] ?? [0, 0];
  const last = route.geometry[route.geometry.length - 1] ?? [0, 0];
  const middle = route.geometry[Math.floor(route.geometry.length / 2)] ?? [0, 0];
  return [
    Math.round(route.distanceM / 20),
    first[0].toFixed(4),
    first[1].toFixed(4),
    middle[0].toFixed(4),
    middle[1].toFixed(4),
    last[0].toFixed(4),
    last[1].toFixed(4),
  ].join("|");
}

function dedupeRoutes(routes: RawRoute[]): RawRoute[] {
  const seen = new Set<string>();
  const output: RawRoute[] = [];
  for (const route of routes) {
    if (!route.geometry || route.geometry.length < 2) continue;
    if (route.distanceM < 30) continue;
    const signature = routeSignature(route);
    if (seen.has(signature)) continue;
    seen.add(signature);
    output.push(route);
  }
  return output;
}

async function requestValhalla(
  body: ValhallaRequest,
): Promise<ValhallaResponse> {
  const key = [
    "valhalla",
    body.locations.map((loc) => `${loc.lat.toFixed(5)},${loc.lon.toFixed(5)}`).join(";"),
    body.alternates ?? 0,
  ].join(":");
  const fresh = getCache(key);
  if (fresh) return fresh.payload as ValhallaResponse;

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(config.valhallaUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": config.nominatimUserAgent,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(28_000),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `Valhalla responded ${response.status}: ${text.slice(0, 240)}`,
        );
      }
      const json = (await response.json()) as ValhallaResponse;
      if (!json.trip?.legs?.length) {
        throw new Error("Valhalla returned no usable trip");
      }
      setCache(key, "valhalla", json, 7 * 24 * 3_600_000);
      return json;
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise((resolve) =>
          setTimeout(resolve, 700 + attempt * 1_100),
        );
      }
    }
  }

  const stale = getAnyCache(key);
  if (stale) return stale.payload as ValhallaResponse;
  throw lastError instanceof Error
    ? lastError
    : new Error("Routing provider is unavailable");
}

async function fetchTrip(
  locations: { lat: number; lon: number }[],
  alternates: number,
  kindHint?: RawRoute["kindHint"],
): Promise<RawRoute[]> {
  const body: ValhallaRequest = {
    locations,
    costing: "auto",
    directions_options: { units: "kilometers", language: "en-US" },
    alternates,
  };
  const response = await enqueue(() => requestValhalla(body));
  const routes: RawRoute[] = [tripToRaw(response.trip, 0, kindHint)];
  for (let i = 0; i < (response.alternates?.length ?? 0); i += 1) {
    const alternate = response.alternates![i]!;
    routes.push(tripToRaw(alternate.trip, i + 1, "alternative"));
  }
  return routes;
}

function detourWaypoint(
  origin: Place,
  destination: Place,
  side: 1 | -1,
  seed: string,
): { lat: number; lon: number } {
  const rng = rngFor(seed, "detour-waypoint", side);
  const center = midpoint(origin, destination);
  const span = haversineM(origin.lat, origin.lon, destination.lat, destination.lon);
  const bearing = bearingDeg(origin.lat, origin.lon, destination.lat, destination.lon);
  const offset = clamp(span * 0.16 + rng() * 420, 260, 2_100);
  return destinationPoint(center.lat, center.lon, offset, bearing + side * 90);
}

export async function fetchRealRoutes(
  origin: Place,
  destination: Place,
  city: City,
  seed: string,
): Promise<RawRoute[]> {
  const direct = await fetchTrip(
    [
      { lat: origin.lat, lon: origin.lon },
      { lat: destination.lat, lon: destination.lon },
    ],
    2,
  );
  let routes = dedupeRoutes(direct);

  if (routes.length < 2) {
    for (const side of [1, -1] as const) {
      const waypoint = detourWaypoint(origin, destination, side, seed);
      const inBbox =
        waypoint.lat >= city.bbox.minLat &&
        waypoint.lat <= city.bbox.maxLat &&
        waypoint.lon >= city.bbox.minLon &&
        waypoint.lon <= city.bbox.maxLon;
      if (!inBbox) continue;
      try {
        const via = await fetchTrip(
          [
            { lat: origin.lat, lon: origin.lon },
            { lat: waypoint.lat, lon: waypoint.lon },
            { lat: destination.lat, lon: destination.lon },
          ],
          0,
          "detour",
        );
        routes = dedupeRoutes([...routes, ...via]);
        if (routes.length >= 2) break;
      } catch {
        // A detour is a bonus; the direct route is still valid.
      }
    }
  }

  if (routes.length === 0) {
    throw new Error("No road route could be found for this scenario");
  }

  return routes.slice(0, 3).map((route, index) => ({
    ...route,
    kindHint: index === 0 ? "fastest" : route.kindHint ?? "alternative",
  }));
}

