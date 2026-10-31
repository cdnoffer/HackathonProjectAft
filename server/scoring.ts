import type {
  City,
  FactorScore,
  Maneuver,
  RoadSegment,
  RoadState,
  RoadSurface,
  RouteData,
  Traffic,
  Weather,
} from "../shared/types";
import {
  ROAD_STATE_LABELS,
  SURFACE_LABELS,
  TRAFFIC_LABELS,
  PHASE_LABELS,
  WEATHER_LABELS,
  formatDuration,
  priorityLabelForValue,
  safetyLabelForScore,
} from "../shared/labels";
import { haversineM } from "../shared/geo";
import type { RawRoute } from "./routing";
import {
  chance,
  clamp,
  rand,
  rngFor,
  round,
  type Rng,
} from "./rng";

export interface ScoringContext {
  seed: string;
  city: City;
  weather: Weather;
  traffic: Traffic;
}

const FACTOR_WEIGHTS = {
  weather: 0.27,
  visibility: 0.16,
  road: 0.21,
  surface: 0.1,
  traffic: 0.13,
  context: 0.13,
} as const;

type FactorRisks = Record<keyof typeof FACTOR_WEIGHTS, number>;

interface ScoredSegment {
  segment: RoadSegment;
  factors: FactorRisks;
}

interface RouteStats {
  avgWidthM: number;
  narrowestM: number;
  avgCurvature: number;
  maxCurvature: number;
  steepestPct: number;
  worstQuality: number;
  dominantSurface: RoadSurface;
  avgJunction: number;
  maxAccident: number;
  schoolZones: number;
  maxFlood: number;
  unlitSharePct: number;
  worstSegment: RoadSegment | null;
  worstSegmentFactors: FactorRisks | null;
}

const CONDITION_PENALTY: Record<Weather["condition"], number> = {
  clear: 0,
  "partly-cloudy": 2,
  overcast: 5,
  mist: 16,
  fog: 30,
  drizzle: 11,
  rain: 22,
  "heavy-rain": 41,
  snow: 40,
  sleet: 45,
  thunderstorm: 49,
};

const TRAFFIC_BASE: Record<Traffic["level"], number> = {
  free: 4,
  light: 12,
  moderate: 24,
  heavy: 40,
  severe: 58,
};

const SURFACE_BASE: Record<RoadSurface, number> = {
  asphalt: 4,
  concrete: 7,
  paved: 10,
  cobblestone: 22,
  gravel: 38,
  unpaved: 48,
};

const ROAD_STATE_PENALTY: Record<RoadState, number> = {
  dry: 0,
  damp: 8,
  wet: 18,
  icy: 45,
  "snow-covered": 38,
};

function chooseSurface(rng: Rng, urbanity: number): RoadSurface {
  const roll = rng();
  if (urbanity > 0.65) {
    if (roll < 0.79) return "asphalt";
    if (roll < 0.89) return "concrete";
    if (roll < 0.96) return "paved";
    return "cobblestone";
  }
  if (urbanity > 0.35) {
    if (roll < 0.74) return "asphalt";
    if (roll < 0.83) return "concrete";
    if (roll < 0.91) return "paved";
    if (roll < 0.97) return "gravel";
    return "cobblestone";
  }
  if (roll < 0.62) return "asphalt";
  if (roll < 0.72) return "paved";
  if (roll < 0.88) return "gravel";
  if (roll < 0.96) return "unpaved";
  return "concrete";
}

function chooseGrade(rng: Rng): number {
  const roll = rng();
  if (roll < 0.58) return rand(rng, 0, 2.5);
  if (roll < 0.86) return rand(rng, 2.5, 6);
  return rand(rng, 6, 12);
}

function chooseLighting(
  rng: Rng,
  urbanity: number,
): RoadSegment["lighting"] {
  const roll = rng();
  if (urbanity > 0.65) {
    if (roll < 0.72) return "well-lit";
    if (roll < 0.93) return "partial";
    return "unlit";
  }
  if (roll < 0.13) return "well-lit";
  if (roll < 0.47) return "partial";
  return "unlit";
}

function chooseShoulder(
  rng: Rng,
  speedKph: number,
  urbanity: number,
): RoadSegment["shoulder"] {
  const roll = rng();
  if (speedKph > 75) {
    if (roll < 0.45) return "wide";
    if (roll < 0.86) return "narrow";
    return "none";
  }
  if (urbanity > 0.65) {
    if (roll < 0.66) return "none";
    if (roll < 0.96) return "narrow";
    return "wide";
  }
  if (roll < 0.35) return "none";
  if (roll < 0.82) return "narrow";
  return "wide";
}

function roadClassFor(
  speedKph: number,
  urbanity: number,
  instruction: string,
): string {
  if (/roundabout/i.test(instruction)) return "Roundabout";
  if (speedKph > 78) return "Highway";
  if (speedKph > 55) return "Arterial road";
  if (urbanity > 0.66) return speedKph < 28 ? "Residential street" : "Urban street";
  return "Rural road";
}

function segmentGeometry(
  geometry: [number, number][],
  beginIndex: number,
  endIndex: number,
): [number, number][] {
  const begin = clamp(beginIndex, 0, Math.max(0, geometry.length - 1));
  const end = clamp(endIndex, begin, Math.max(0, geometry.length - 1));
  if (begin === end) {
    const before = geometry[Math.max(0, begin - 1)];
    const point = geometry[begin];
    if (before && point) return [before, point];
    if (point) return [point, point];
  }
  return geometry.slice(begin, end + 1);
}

function curvatureFor(coords: [number, number][], distanceM: number): number {
  if (coords.length < 3 || distanceM < 8) return 0;
  let turnDegrees = 0;
  let previousBearing: number | null = null;
  for (let i = 1; i < coords.length; i += 1) {
    const a = coords[i - 1]!;
    const b = coords[i]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) continue;
    const bearing =
      (Math.atan2(dx, dy) * 180) / Math.PI;
    if (previousBearing !== null) {
      const delta = Math.abs(((bearing - previousBearing + 540) % 360) - 180);
      if (delta > 4) turnDegrees += delta;
    }
    previousBearing = bearing;
  }
  return Math.min(900, turnDegrees / Math.max(0.12, distanceM / 1000));
}

function computeSegmentFactors(
  segment: RoadSegment,
  weather: Weather,
  traffic: Traffic,
): { factors: FactorRisks; interaction: number } {
  const weatherRisk = clamp(
    CONDITION_PENALTY[weather.condition] +
      weather.precipitationMmH * 2.2 +
      Math.max(0, weather.windKph - 10) * 0.35 +
      weather.iceRisk * 0.34 +
      (weather.temperatureC < -5
        ? Math.abs(weather.temperatureC + 5) * 1.4
        : 0) +
      (weather.temperatureC > 34 ? (weather.temperatureC - 34) * 1.4 : 0),
    0,
    100,
  );

  let nightPenalty = 0;
  if (weather.phase === "night") {
    nightPenalty =
      segment.lighting === "unlit" ? 38 : segment.lighting === "partial" ? 20 : 5;
  } else if (weather.phase === "civil-twilight") {
    nightPenalty =
      segment.lighting === "unlit" ? 22 : segment.lighting === "partial" ? 12 : 2;
  } else if (weather.phase === "golden-hour") {
    nightPenalty =
      segment.lighting === "unlit" ? 12 : segment.lighting === "partial" ? 6 : 0;
  }
  const visibilityRisk = clamp(
    Math.max(0, 65 - weather.visibilityKm * 4.2) +
      nightPenalty +
      weather.precipitationMmH * 1.5 +
      (weather.condition === "fog" || weather.condition === "mist" ? 10 : 0),
    0,
    100,
  );

  const roadRisk = clamp(
    Math.max(0, 9 - segment.widthM) * 5.5 +
      Math.min(30, segment.curvatureDegPerKm / 35) +
      segment.gradePct * 3.2 +
      (segment.shoulder === "none" ? 8 : segment.shoulder === "narrow" ? 4 : 0) +
      (segment.lanes === 1 ? 8 : segment.lanes === 2 ? 2 : 0),
    0,
    100,
  );

  const surfaceRisk = clamp(
    SURFACE_BASE[segment.surface] +
      (100 - segment.surfaceQuality) * 0.35 +
      ROAD_STATE_PENALTY[segment.roadState],
    0,
    100,
  );

  const trafficRisk = clamp(
    TRAFFIC_BASE[traffic.level] +
      segment.junctionDensity * 1.8 +
      Math.max(0, segment.speedLimitKph - 80) * 0.25 +
      traffic.congestionPct * 0.15,
    0,
    100,
  );

  const contextRisk = clamp(
    segment.accidentRisk * 0.45 +
      (segment.schoolZone ? 12 : 0) +
      segment.floodRisk * 0.3 +
      segment.animalRisk * 0.22,
    0,
    100,
  );

  let interaction = 0;
  if (
    segment.roadState === "icy" &&
    (segment.gradePct > 3 || segment.curvatureDegPerKm > 300)
  ) {
    interaction += 9;
  }
  if (weather.precipitationMmH > 1 && segment.widthM < 5.5) {
    interaction += 6;
  }
  if (weather.visibilityKm < 1 && segment.lighting === "unlit") {
    interaction += 7;
  }
  if (weather.windKph > 45 && segment.speedLimitKph > 85) {
    interaction += 4;
  }
  if (segment.roadState === "snow-covered" && segment.gradePct > 4) {
    interaction += 8;
  }

  return {
    factors: {
      weather: weatherRisk,
      visibility: visibilityRisk,
      road: roadRisk,
      surface: surfaceRisk,
      traffic: trafficRisk,
      context: contextRisk,
    },
    interaction,
  };
}

function buildSegments(
  route: RawRoute,
  context: ScoringContext,
): ScoredSegment[] {
  const routeDistance = Math.max(
    1,
    route.geometry.reduce((total, coord, index) => {
      if (index === 0) return total;
      const previous = route.geometry[index - 1]!;
      return total + haversineM(previous[1], previous[0], coord[1], coord[0]);
    }, 0),
  );
  const maneuversPerKm = route.maneuvers.length / (routeDistance / 1000);
  const segments: ScoredSegment[] = [];

  const addSegment = (maneuver: Maneuver, index: number) => {
    const coords = segmentGeometry(
      route.geometry,
      maneuver.beginShapeIndex,
      maneuver.endShapeIndex,
    );
    let distanceM = 0;
    for (let i = 1; i < coords.length; i += 1) {
      const a = coords[i - 1]!;
      const b = coords[i]!;
      distanceM += haversineM(a[1], a[0], b[1], b[0]);
    }
    if (distanceM < 5) distanceM = Math.max(5, maneuver.distanceM);
    const durationS =
      maneuver.durationS > 0
        ? maneuver.durationS
        : (distanceM / Math.max(8, routeDistance / Math.max(1, route.durationS))) *
          1;
    const averageSpeed = clamp((distanceM / Math.max(1, durationS)) * 3.6, 8, 135);
    const urbanity = clamp(
      maneuversPerKm / 6 + (45 - averageSpeed) / 65,
      0.12,
      1,
    );
    const rng = rngFor(
      context.seed,
      "road",
      context.city.id,
      maneuver.streetName,
      coords[0]?.[0]?.toFixed(4) ?? "0",
      coords[0]?.[1]?.toFixed(4) ?? "0",
    );
    const curvature = curvatureFor(coords, distanceM);
    const widthM = clamp(
      3.2 +
        averageSpeed / 17 +
        (urbanity < 0.4 ? 1.2 : 0) +
        rand(rng, -0.9, 0.9),
      3.2,
      16,
    );
    const lanes = clamp(Math.round(widthM / 3.1), 1, 4);
    const surface = chooseSurface(rng, urbanity);
    const surfaceQuality =
      surface === "asphalt" || surface === "concrete"
        ? rand(rng, 66, 99)
        : surface === "paved"
          ? rand(rng, 58, 92)
          : surface === "cobblestone"
            ? rand(rng, 45, 80)
            : rand(rng, 30, 70);
    const gradePct = chooseGrade(rng);
    const speedLimitKph = clamp(
      Math.round((averageSpeed * rand(rng, 1.08, 1.28)) / 10) * 10,
      averageSpeed < 15 ? 20 : 30,
      130,
    );
    const lighting = chooseLighting(rng, urbanity);
    const junctionDensity = clamp(
      urbanity * 5.2 + curvature / 620 + rand(rng, -0.7, 1.4),
      0,
      11,
    );
    const shoulder = chooseShoulder(rng, speedLimitKph, urbanity);
    const iceRisk = clamp(
      context.weather.iceRisk +
        gradePct * 1.8 +
        (lighting === "unlit" ? 4 : 0) +
        rand(rng, -8, 8),
      0,
      100,
    );
    let roadState = context.weather.roadState;
    if (iceRisk > 68 && (roadState === "wet" || roadState === "damp")) {
      roadState = "icy";
    }
    const accidentRisk = clamp(
      5 +
        averageSpeed * 0.11 +
        curvature / 80 +
        junctionDensity * 1.0 +
        (widthM < 6 ? 4 : 0) +
        rand(rng, -5, 7),
      0,
      88,
    );
    const schoolZone = urbanity > 0.62 && chance(rng, 0.075);
    const floodRisk = clamp(
      rand(rng, 0, 24) +
        context.weather.precipitationMmH * 2.6 +
        (roadState === "wet" || roadState === "icy" ? 7 : 0),
      0,
      100,
    );
    const animalRisk = clamp(
      (1 - urbanity) * 57 + rand(rng, -12, 12),
      0,
      100,
    );
    const segment: RoadSegment = {
      id: `${route.provider}-${index}-${maneuver.beginShapeIndex}-${maneuver.endShapeIndex}`,
      index,
      streetName: maneuver.streetName,
      instruction: maneuver.instruction,
      roadClass: roadClassFor(speedLimitKph, urbanity, maneuver.instruction),
      surface,
      surfaceQuality: round(surfaceQuality, 0),
      widthM: round(widthM, 1),
      lanes,
      shoulder,
      speedLimitKph,
      gradePct: round(gradePct, 1),
      curvatureDegPerKm: round(curvature, 0),
      junctionDensity: round(junctionDensity, 1),
      lighting,
      roadState,
      iceRisk: round(iceRisk, 0),
      accidentRisk: round(accidentRisk, 0),
      schoolZone,
      floodRisk: round(floodRisk, 0),
      animalRisk: round(animalRisk, 0),
      distanceM: round(distanceM, 0),
      durationS: round(durationS, 0),
      startShapeIndex: maneuver.beginShapeIndex,
      endShapeIndex: maneuver.endShapeIndex,
      safetyScore: 0,
      risk: 0,
    };
    const { factors, interaction } = computeSegmentFactors(
      segment,
      context.weather,
      context.traffic,
    );
    const weighted =
      factors.weather * FACTOR_WEIGHTS.weather +
      factors.visibility * FACTOR_WEIGHTS.visibility +
      factors.road * FACTOR_WEIGHTS.road +
      factors.surface * FACTOR_WEIGHTS.surface +
      factors.traffic * FACTOR_WEIGHTS.traffic +
      factors.context * FACTOR_WEIGHTS.context;
    const risk = clamp(weighted + interaction, 0, 100);
    segment.risk = round(risk, 1);
    segment.safetyScore = round(clamp(100 - risk, 1, 100), 1);
    segments.push({ segment, factors });
  };

  route.maneuvers.forEach((maneuver, index) => {
    if (maneuver.endShapeIndex <= maneuver.beginShapeIndex && route.maneuvers.length > 1) {
      return;
    }
    addSegment(maneuver, segments.length);
  });

  if (segments.length === 0) {
    addSegment(
      {
        index: 0,
        type: 1,
        instruction: "Follow the route",
        streetName: "Unnamed road",
        distanceM: route.distanceM,
        durationS: route.durationS,
        beginShapeIndex: 0,
        endShapeIndex: Math.max(0, route.geometry.length - 1),
      },
      0,
    );
  }
  return segments;
}

export function statsFromSegments(segments: RoadSegment[]): RouteStats {
  const zeroFactors: FactorRisks = {
    weather: 0,
    visibility: 0,
    road: 0,
    surface: 0,
    traffic: 0,
    context: 0,
  };
  return summarizeSegments(
    segments.map((segment) => ({ segment, factors: zeroFactors })),
  );
}

function summarizeSegments(segments: ScoredSegment[]): RouteStats {
  if (segments.length === 0) {
    return {
      avgWidthM: 0,
      narrowestM: 0,
      avgCurvature: 0,
      maxCurvature: 0,
      steepestPct: 0,
      worstQuality: 0,
      dominantSurface: "asphalt",
      avgJunction: 0,
      maxAccident: 0,
      schoolZones: 0,
      maxFlood: 0,
      unlitSharePct: 0,
      worstSegment: null,
      worstSegmentFactors: null,
    };
  }
  const totalDistance = segments.reduce(
    (total, item) => total + item.segment.distanceM,
    0,
  );
  const weight = (item: ScoredSegment) =>
    item.segment.distanceM / Math.max(1, totalDistance);
  const surfaceDistance = new Map<RoadSurface, number>();
  for (const item of segments) {
    surfaceDistance.set(
      item.segment.surface,
      (surfaceDistance.get(item.segment.surface) ?? 0) + item.segment.distanceM,
    );
  }
  let dominantSurface: RoadSurface = "asphalt";
  let dominantDistance = -1;
  for (const [surface, distance] of surfaceDistance) {
    if (distance > dominantDistance) {
      dominantSurface = surface;
      dominantDistance = distance;
    }
  }
  let worst = segments[0]!;
  for (const item of segments) {
    if (item.segment.risk > worst.segment.risk) worst = item;
  }
  return {
    avgWidthM: round(
      segments.reduce((total, item) => total + item.segment.widthM * weight(item), 0),
      1,
    ),
    narrowestM: round(Math.min(...segments.map((item) => item.segment.widthM)), 1),
    avgCurvature: round(
      segments.reduce(
        (total, item) => total + item.segment.curvatureDegPerKm * weight(item),
        0,
      ),
      0,
    ),
    maxCurvature: round(
      Math.max(...segments.map((item) => item.segment.curvatureDegPerKm)),
      0,
    ),
    steepestPct: round(
      Math.max(...segments.map((item) => item.segment.gradePct)),
      1,
    ),
    worstQuality: round(
      Math.min(...segments.map((item) => item.segment.surfaceQuality)),
      0,
    ),
    dominantSurface,
    avgJunction: round(
      segments.reduce(
        (total, item) => total + item.segment.junctionDensity * weight(item),
        0,
      ),
      1,
    ),
    maxAccident: round(
      Math.max(...segments.map((item) => item.segment.accidentRisk)),
      0,
    ),
    schoolZones: segments.filter((item) => item.segment.schoolZone).length,
    maxFlood: round(
      Math.max(...segments.map((item) => item.segment.floodRisk)),
      0,
    ),
    unlitSharePct: round(
      segments.reduce(
        (total, item) =>
          total +
          (item.segment.lighting === "unlit" ? weight(item) : 0) * 100,
        0,
      ),
      0,
    ),
    worstSegment: worst.segment,
    worstSegmentFactors: worst.factors,
  };
}

function factorDescription(
  key: keyof typeof FACTOR_WEIGHTS,
  stats: RouteStats,
  context: ScoringContext,
): string {
  const weather = context.weather;
  switch (key) {
    case "weather":
      return `${WEATHER_LABELS[weather.condition]}, ${weather.temperatureC}°C, ${weather.precipitationMmH} mm/h, ${weather.windKph} km/h wind`;
    case "visibility":
      return `${weather.visibilityKm} km visibility · ${PHASE_LABELS[weather.phase]} · ${stats.unlitSharePct}% of route unlit`;
    case "road":
      return `Narrowest ${stats.narrowestM} m · ${stats.steepestPct}% steepest grade · ${stats.avgCurvature}°/km average curves`;
    case "surface":
      return `${SURFACE_LABELS[stats.dominantSurface]} dominant · ${stats.worstQuality}/100 minimum quality · ${ROAD_STATE_LABELS[weather.roadState]}`;
    case "traffic":
      return `${TRAFFIC_LABELS[context.traffic.level]} · ${stats.avgJunction}/km junctions · ${context.traffic.congestionPct}% congestion`;
    case "context":
      return `${stats.maxAccident}/100 peak crash index · ${stats.schoolZones} school zone${stats.schoolZones === 1 ? "" : "s"} · ${stats.maxFlood}/100 flood exposure`;
  }
}

function buildFactors(
  segments: ScoredSegment[],
  stats: RouteStats,
  context: ScoringContext,
): FactorScore[] {
  const totalDistance = segments.reduce(
    (total, item) => total + item.segment.distanceM,
    0,
  );
  const keys = Object.keys(FACTOR_WEIGHTS) as (keyof typeof FACTOR_WEIGHTS)[];
  return keys.map((key) => {
    const risk =
      segments.reduce(
        (total, item) =>
          total +
          item.factors[key] * (item.segment.distanceM / Math.max(1, totalDistance)),
        0,
      ) || 0;
    return {
      key,
      label:
        key === "road"
          ? "Road geometry"
          : key === "context"
            ? "Road context"
            : key.charAt(0).toUpperCase() + key.slice(1),
      weight: FACTOR_WEIGHTS[key],
      risk: round(risk, 1),
      impactPoints: round(risk * FACTOR_WEIGHTS[key], 1),
      description: factorDescription(key, stats, context),
    };
  });
}

function positiveReason(
  route: RouteData,
  stats: RouteStats,
  context: ScoringContext,
): string {
  const factors = new Map(route.factors.map((factor) => [factor.key, factor]));
  if ((factors.get("visibility")?.risk ?? 100) < 24) {
    return `Visibility is strong (${context.weather.visibilityKm} km) and ${100 - stats.unlitSharePct}% of the route is lit.`;
  }
  if ((factors.get("surface")?.risk ?? 100) < 24) {
    return `The surface profile is favorable: mainly ${SURFACE_LABELS[stats.dominantSurface].toLowerCase()} with a ${stats.worstQuality}/100 minimum quality score.`;
  }
  if ((factors.get("road")?.risk ?? 100) < 32) {
    return `The route favors easier geometry: ${stats.avgWidthM} m average width and ${stats.avgCurvature}°/km of curvature.`;
  }
  if ((factors.get("traffic")?.risk ?? 100) < 30) {
    return `${TRAFFIC_LABELS[context.traffic.level]} keeps traffic exposure comparatively low.`;
  }
  if (route.safetyScore >= 80) {
    return "No dominant hazard stands out in the simulated profile.";
  }
  return "The route avoids the worst segment-level hazards, though conditions remain mixed.";
}

function comparisonReason(
  route: RouteData,
  recommended: RouteData,
  routes: RouteData[],
  priority: number,
): string {
  const pct = Math.round(priority * 100);
  const safest = routes.reduce(
    (best, item) => (item.safetyScore > best.safetyScore ? item : best),
    routes[0]!,
  );
  const fastest = routes.reduce(
    (best, item) =>
      item.adjustedDurationS < best.adjustedDurationS ? item : best,
    routes[0]!,
  );
  const safetyGap = Math.max(0, safest.safetyScore - route.safetyScore);
  const minutes = (seconds: number) =>
    Math.max(0, Math.round(seconds / 60));
  if (route.id === recommended.id) {
    if (route.isSafest && route.isFastest) {
      return `At ${pct}% safety weighting it is both the safest and quickest option (${Math.round(route.safetyScore)}/100, ${formatDuration(route.adjustedDurationS)}).`;
    }
    if (route.isFastest) {
      if (safetyGap < 0.6) {
        return `At ${pct}% safety weighting it is the quickest option and effectively tied on safety (${Math.round(route.safetyScore)}/100).`;
      }
      return `At ${pct}% safety weighting it saves ${minutes(safest.adjustedDurationS - route.adjustedDurationS)} min versus the safest option, with a ${Math.round(safetyGap)}-point safety trade-off.`;
    }
    if (route.isSafest) {
      const cost = minutes(route.adjustedDurationS - fastest.adjustedDurationS);
      return cost === 0
        ? `At ${pct}% safety weighting it is the safest option and just as quick as the fastest.`
        : `At ${pct}% safety weighting the safest option wins, accepting ${cost} min over the quickest route.`;
    }
    return `At ${pct}% safety weighting it has the best combined safety and efficiency profile.`;
  }
  const roundedSafetyGap = Math.round(safetyGap);
  if (route.isFastest) {
    return roundedSafetyGap === 0
      ? "Quickest option, but effectively tied on safety with the recommended balance."
      : `Quickest option, but ${roundedSafetyGap} safety points below the recommendation.`;
  }
  if (route.isSafest) {
    const cost = minutes(route.adjustedDurationS - recommended.adjustedDurationS);
    return `Safest profile, but ${cost === 0 ? "effectively tied on time" : `${cost} min slower`} than the recommendation at this weighting.`;
  }
  const timeDifference = Math.round(
    Math.abs(route.adjustedDurationS - recommended.adjustedDurationS) / 60,
  );
  if (timeDifference === 0) {
    return roundedSafetyGap === 0
      ? "Alternative with effectively the same safety and timing."
      : `Alternative: effectively the same time, but ${roundedSafetyGap} safety points below the recommended balance.`;
  }
  return route.adjustedDurationS >= recommended.adjustedDurationS
    ? `Alternative: ${timeDifference} min slower${roundedSafetyGap === 0 ? " with effectively the same safety score" : ` and ${roundedSafetyGap} safety points below the recommended balance`}.`
    : `Alternative: ${timeDifference} min quicker${roundedSafetyGap === 0 ? " with effectively the same safety score" : ` but ${roundedSafetyGap} safety points below the recommended balance`}.`;
}

function assignKindsAndReasons(
  routes: RouteData[],
  priority: number,
  rawRoutes: RawRoute[] | undefined,
  context: ScoringContext,
  statsById: Map<string, RouteStats>,
): void {
  const recommended =
    routes.find((route) => route.isRecommended) ?? routes[0]!;
  for (const route of routes) {
    if (route.isFastest) route.kind = "fastest";
    else if (
      rawRoutes?.[route.ordinal]?.kindHint === "detour" ||
      route.kind === "detour"
    ) {
      route.kind = "detour";
    } else route.kind = "alternative";
    const stats = statsById.get(route.id);
    if (!stats) continue;
    const factorList = [...route.factors].sort(
      (a, b) => b.impactPoints - a.impactPoints,
    );
    route.topRisks = factorList
      .filter((factor) => factor.risk >= 28)
      .slice(0, 3)
      .map((factor) => `${factor.label}: ${factor.description}`);
    if (route.topRisks.length === 0) {
      route.topRisks = factorList
        .slice(0, 2)
        .map((factor) => `${factor.label}: ${factor.description}`);
    }
    const top = factorList[0];
    route.reasons = [
      positiveReason(route, stats, context),
      top
        ? `Main simulated concern: ${top.label.toLowerCase()} — ${top.description}.`
        : "No dominant hazard was found in the simulated profile.",
      comparisonReason(route, recommended, routes, priority),
    ];
    route.recommendation = comparisonReason(
      route,
      recommended,
      routes,
      priority,
    );
  }
}

export function applyPriority(
  routes: RouteData[],
  priority: number,
  rawRoutes?: RawRoute[],
  context?: ScoringContext,
  statsById?: Map<string, RouteStats>,
): { routes: RouteData[]; recommendedRouteId: string; priority: number; priorityLabel: ReturnType<typeof priorityLabelForValue> } {
  const normalizedPriority = clamp(priority, 0, 1);
  const safest = Math.max(...routes.map((route) => route.safetyScore));
  const fastestDuration = Math.min(
    ...routes.map((route) => route.adjustedDurationS),
  );
  for (const route of routes) {
    route.overallScore = round(
      normalizedPriority * route.safetyScore +
        (1 - normalizedPriority) * route.efficiencyScore,
      1,
    );
    route.isSafest = Math.abs(route.safetyScore - safest) < 0.05;
    route.isFastest =
      Math.abs(route.adjustedDurationS - fastestDuration) < 0.5;
  }
  let recommended = routes[0]!;
  for (const route of routes) {
    if (route.overallScore > recommended.overallScore) recommended = route;
  }
  for (const route of routes) {
    route.isRecommended = route.id === recommended.id;
  }
  if (context && statsById) {
    assignKindsAndReasons(
      routes,
      normalizedPriority,
      rawRoutes,
      context,
      statsById,
    );
  }
  return {
    routes,
    recommendedRouteId: recommended.id,
    priority: normalizedPriority,
    priorityLabel: priorityLabelForValue(normalizedPriority),
  };
}

export function rerankRoutes(
  routes: RouteData[],
  priority: number,
  context: ScoringContext,
): ReturnType<typeof applyPriority> {
  const statsById = new Map(
    routes.map((route) => [route.id, statsFromSegments(route.segments)]),
  );
  return applyPriority(
    routes,
    priority,
    undefined,
    context,
    statsById,
  );
}

export function scoreRoutes(
  rawRoutes: RawRoute[],
  context: ScoringContext,
  priority = 0.8,
): {
  routes: RouteData[];
  recommendedRouteId: string;
  priority: number;
  priorityLabel: ReturnType<typeof priorityLabelForValue>;
} {
  const routes: RouteData[] = [];
  const statsById = new Map<string, RouteStats>();

  rawRoutes.forEach((raw, index) => {
    const scoredSegments = buildSegments(raw, context);
    const stats = summarizeSegments(scoredSegments);
    const totalDistance = scoredSegments.reduce(
      (total, item) => total + item.segment.distanceM,
      0,
    );
    const avgFactor = (key: keyof FactorRisks): number =>
      scoredSegments.reduce(
        (total, item) =>
          total +
          item.factors[key] *
            (item.segment.distanceM / Math.max(1, totalDistance)),
        0,
      );
    const avgRisk = scoredSegments.reduce(
        (total, item) =>
          total +
          item.segment.risk *
            (item.segment.distanceM / Math.max(1, totalDistance)),
        0,
      );
    const maxRisk = Math.max(...scoredSegments.map((item) => item.segment.risk));
    const routeRisk = clamp(avgRisk + 0.12 * (maxRisk - avgRisk), 0, 100);
    const safetyScore = clamp(100 - routeRisk, 1, 99);
    const avgTrafficRisk = avgFactor("traffic");
    const trafficMultiplier = clamp(
      1 +
        (context.traffic.delayFactor - 1) * 0.55 +
        (avgTrafficRisk / 100) * 0.35,
      1,
      1.8,
    );
    const adjustedDurationS = raw.durationS * trafficMultiplier;
    const factors = buildFactors(scoredSegments, stats, context);
    const route: RouteData = {
      id: `rt_${context.seed}_${index}_${Math.round(raw.distanceM)}`,
      ordinal: index,
      name: `Route ${String.fromCharCode(65 + index)}`,
      kind: "alternative",
      provider: raw.provider,
      distanceM: round(raw.distanceM, 0),
      durationS: round(raw.durationS, 0),
      adjustedDurationS: round(adjustedDurationS, 0),
      avgSpeedKph: round((raw.distanceM / Math.max(1, raw.durationS)) * 3.6, 1),
      geometry: raw.geometry,
      maneuvers: raw.maneuvers,
      segments: scoredSegments.map((item) => item.segment),
      safetyScore: round(safetyScore, 1),
      efficiencyScore: 0,
      overallScore: 0,
      safetyLabel: safetyLabelForScore(safetyScore),
      factors,
      topRisks: [],
      reasons: [],
      recommendation: "",
      isSafest: false,
      isFastest: false,
      isRecommended: false,
    };
    routes.push(route);
    statsById.set(route.id, stats);
  });

  const fastestAdjusted = Math.min(
    ...routes.map((route) => route.adjustedDurationS),
  );
  const shortestDistance = Math.min(...routes.map((route) => route.distanceM));
  for (const route of routes) {
    const timeScore =
      (fastestAdjusted / Math.max(1, route.adjustedDurationS)) * 100;
    const distanceScore =
      (shortestDistance / Math.max(1, route.distanceM)) * 100;
    const trafficFactor =
      route.factors.find((factor) => factor.key === "traffic")?.risk ?? 0;
    route.efficiencyScore = round(
      clamp(
        0.68 * timeScore + 0.22 * distanceScore + 0.1 * (100 - trafficFactor),
        0,
        100,
      ),
      1,
    );
  }

  return applyPriority(routes, priority, rawRoutes, context, statsById);
}
