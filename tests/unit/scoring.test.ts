import { describe, expect, it } from "bun:test";
import type {
  City,
  RouteData,
  Traffic,
  Weather,
} from "../../shared/types";
import type { RawRoute } from "../../server/routing";
import {
  applyPriority,
  scoreRoutes,
  type ScoringContext,
} from "../../server/scoring";

const city: City = {
  id: "test-city",
  name: "Test City",
  country: "Testland",
  lat: 51.5,
  lon: -0.1,
  bbox: { minLat: 51.4, maxLat: 51.6, minLon: -0.3, maxLon: 0.1 },
  timezone: "Europe/London",
  climate: "temperate",
};

const clearWeather: Weather = {
  condition: "clear",
  temperatureC: 18,
  feelsLikeC: 18,
  precipitationMmH: 0,
  precipitationType: "none",
  visibilityKm: 30,
  windKph: 6,
  gustKph: 10,
  humidityPct: 45,
  cloudCoverPct: 10,
  iceRisk: 0,
  roadState: "dry",
  solarElevationDeg: 40,
  phase: "day",
  localTimeLabel: "12:00",
  sunriseLocal: "07:00",
  sunsetLocal: "19:00",
  fingerprint: "clear-day",
};

const severeWeather: Weather = {
  condition: "snow",
  temperatureC: -4,
  feelsLikeC: -11,
  precipitationMmH: 4.2,
  precipitationType: "snow",
  visibilityKm: 0.5,
  windKph: 44,
  gustKph: 66,
  humidityPct: 94,
  cloudCoverPct: 100,
  iceRisk: 92,
  roadState: "snow-covered",
  solarElevationDeg: -22,
  phase: "night",
  localTimeLabel: "23:00",
  sunriseLocal: "08:00",
  sunsetLocal: "16:00",
  fingerprint: "snow-night",
};

const lightTraffic: Traffic = {
  level: "free",
  congestionPct: 5,
  delayFactor: 1.04,
  rushHour: false,
};

const heavyTraffic: Traffic = {
  level: "severe",
  congestionPct: 92,
  delayFactor: 1.7,
  rushHour: true,
};

const geometry: [number, number][] = [
  [-0.1, 51.5],
  [-0.095, 51.503],
  [-0.09, 51.506],
  [-0.085, 51.509],
  [-0.08, 51.512],
];

const rawRoute: RawRoute = {
  provider: "test",
  distanceM: 900,
  durationS: 150,
  geometry,
  maneuvers: [
    {
      index: 0,
      type: 1,
      instruction: "Drive north",
      streetName: "Test Road",
      distanceM: 450,
      durationS: 75,
      beginShapeIndex: 0,
      endShapeIndex: 2,
    },
    {
      index: 1,
      type: 15,
      instruction: "Turn right",
      streetName: "Second Street",
      distanceM: 450,
      durationS: 75,
      beginShapeIndex: 2,
      endShapeIndex: 4,
    },
  ],
};

function context(weather: Weather, traffic: Traffic): ScoringContext {
  return { seed: "scoring-seed", city, weather, traffic };
}

describe("safety scoring", () => {
  it("scores a clear daytime route above a snowy night route", () => {
    const clear = scoreRoutes(
      [rawRoute],
      context(clearWeather, lightTraffic),
      0.8,
    );
    const severe = scoreRoutes(
      [rawRoute],
      context(severeWeather, heavyTraffic),
      0.8,
    );
    expect(clear.routes[0]!.safetyScore).toBeGreaterThan(
      severe.routes[0]!.safetyScore + 15,
    );
    expect(clear.routes[0]!.safetyScore).toBeGreaterThanOrEqual(0);
    expect(clear.routes[0]!.safetyScore).toBeLessThanOrEqual(100);
    expect(severe.routes[0]!.safetyLabel).not.toBe("Very safe");
  });

  it("returns six explainable factors and reasons for every route", () => {
    const result = scoreRoutes(
      [rawRoute],
      context(clearWeather, lightTraffic),
      0.8,
    );
    const route = result.routes[0]!;
    expect(route.factors).toHaveLength(6);
    expect(route.factors.every((factor) => factor.risk >= 0 && factor.risk <= 100)).toBe(true);
    expect(route.factors.every((factor) => factor.description.length > 10)).toBe(true);
    expect(route.reasons.length).toBeGreaterThanOrEqual(3);
    expect(route.recommendation.length).toBeGreaterThan(20);
    expect(route.segments.length).toBeGreaterThan(0);
    expect(route.isRecommended).toBe(true);
    expect(route.isSafest).toBe(true);
    expect(route.isFastest).toBe(true);
    expect(result.recommendedRouteId).toBe(route.id);
  });

  it("switches recommendation when the safety weighting changes", () => {
    const base = (route: RouteData): RouteData => ({
      ...route,
      kind: "alternative",
      provider: "test",
      distanceM: 1000,
      durationS: 120,
      adjustedDurationS: 120,
      avgSpeedKph: 30,
      geometry,
      maneuvers: rawRoute.maneuvers,
      segments: [],
      safetyLabel: "Safe",
      factors: [],
      topRisks: [],
      reasons: [],
      recommendation: "",
      isSafest: false,
      isFastest: false,
      isRecommended: false,
    });
    const safer = base({
      id: "safer",
      ordinal: 0,
      name: "Route A",
      kind: "alternative",
      provider: "test",
      distanceM: 1000,
      durationS: 120,
      adjustedDurationS: 120,
      avgSpeedKph: 30,
      geometry,
      maneuvers: rawRoute.maneuvers,
      segments: [],
      safetyScore: 92,
      efficiencyScore: 40,
      overallScore: 0,
      safetyLabel: "Very safe",
      factors: [],
      topRisks: [],
      reasons: [],
      recommendation: "",
      isSafest: false,
      isFastest: false,
      isRecommended: false,
    });
    const faster = base({
      id: "faster",
      ordinal: 1,
      name: "Route B",
      kind: "alternative",
      provider: "test",
      distanceM: 1000,
      durationS: 100,
      adjustedDurationS: 100,
      avgSpeedKph: 36,
      geometry,
      maneuvers: rawRoute.maneuvers,
      segments: [],
      safetyScore: 62,
      efficiencyScore: 100,
      overallScore: 0,
      safetyLabel: "Moderate",
      factors: [],
      topRisks: [],
      reasons: [],
      recommendation: "",
      isSafest: false,
      isFastest: false,
      isRecommended: false,
    });
    const safetyFirst = applyPriority([safer, faster], 0.9);
    expect(safetyFirst.recommendedRouteId).toBe("safer");
    expect(safetyFirst.priorityLabel).toBe("Safety first");
    const timeFirst = applyPriority([safer, faster], 0.1);
    expect(timeFirst.recommendedRouteId).toBe("faster");
    expect(timeFirst.priorityLabel).toBe("Time first");
  });
});
