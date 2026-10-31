import type {
  LabChecks,
  LabScenarioSummary,
} from "../shared/types";
import { CITIES } from "./cities";
import {
  createLabRun,
  getLabRun,
  linkLabScenario,
  updateLabRun,
} from "./db";
import { clamp, randomSeed, rngFor, shuffled } from "./rng";
import { generateRandomScenario } from "./simulate";

interface InternalScenario {
  summary: LabScenarioSummary;
  weatherFingerprint: string;
  timestamp: string;
  seed: string;
  cityName: string;
}

const MAX_LAB_COUNT = 10;

function checksFor(
  scenarios: InternalScenario[],
  requestedCount: number,
): { checks: LabChecks; uniquePlaces: number; uniqueWeather: number } {
  const places = new Set(scenarios.map((item) => item.cityName));
  const weather = new Set(scenarios.map((item) => item.weatherFingerprint));
  const times = new Set(scenarios.map((item) => item.timestamp));
  const seeds = new Set(scenarios.map((item) => item.seed));
  const allScored = scenarios.every(
    (item) =>
      item.summary.safestScore >= 0 &&
      item.summary.safestScore <= 100 &&
      item.summary.recommendedScore >= 0 &&
      item.summary.recommendedScore <= 100,
  );
  const multiRoute = scenarios.every((item) => item.summary.routeCount >= 2);
  return {
    checks: {
      uniquePlaces:
        scenarios.length === requestedCount && places.size === scenarios.length,
      uniqueWeather:
        scenarios.length === requestedCount && weather.size === scenarios.length,
      uniqueTimes:
        scenarios.length === requestedCount && times.size === scenarios.length,
      uniqueSeeds:
        scenarios.length === requestedCount && seeds.size === scenarios.length,
      allRoutesScored: allScored,
      multiRouteScenarios: multiRoute,
    },
    uniquePlaces: places.size,
    uniqueWeather: weather.size,
  };
}

async function runLab(
  runId: string,
  count: number,
  priority: number,
  seedForOrder: string,
): Promise<void> {
  updateLabRun(runId, {
    status: "running",
    completedCount: 0,
  });
  const internal: InternalScenario[] = [];
  const ordered = shuffled(rngFor(seedForOrder, "lab-order"), CITIES);

  try {
    for (let index = 0; index < count; index += 1) {
      const city = ordered[index % ordered.length]!;
      let generated:
        | Awaited<ReturnType<typeof generateRandomScenario>>
        | null = null;
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const seed = randomSeed();
        try {
          const payload = await generateRandomScenario({
            cityId: city.id,
            seed,
            priority,
          });
          const weatherFingerprint = payload.scenario.weather.fingerprint;
          const duplicateWeather = internal.some(
            (item) => item.weatherFingerprint === weatherFingerprint,
          );
          const duplicateTime = internal.some(
            (item) =>
              item.timestamp === payload.scenario.simulatedAtUtc ||
              item.summary.localTime === payload.scenario.simulatedAtLocal,
          );
          const duplicateSeed = internal.some((item) => item.seed === seed);
          if (duplicateWeather || duplicateTime || duplicateSeed) {
            continue;
          }
          generated = payload;
          const safest = [...payload.routes].sort(
            (a, b) => b.safetyScore - a.safetyScore,
          )[0]!;
          const recommended =
            payload.routes.find((route) => route.isRecommended) ??
            payload.routes[0]!;
          internal.push({
            summary: {
              index: index + 1,
              scenarioId: payload.scenario.id,
              cityName: payload.scenario.cityName,
              country: payload.scenario.country,
              localTime: payload.scenario.simulatedAtLocal,
              weatherCondition: payload.scenario.weather.condition,
              temperatureC: payload.scenario.weather.temperatureC,
              routeCount: payload.routes.length,
              safestRouteName: safest.name,
              safestScore: safest.safetyScore,
              recommendedScore: recommended.overallScore,
              etaMinutes: Math.round(recommended.adjustedDurationS / 60),
              seed,
              createdAt: payload.scenario.createdAt,
            },
            weatherFingerprint,
            timestamp: payload.scenario.simulatedAtUtc,
            seed,
            cityName: payload.scenario.cityName,
          });
          linkLabScenario(runId, payload.scenario.id, index + 1);
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!generated) {
        throw lastError instanceof Error
          ? lastError
          : new Error(
              `Lab scenario ${index + 1} could not be generated after retries`,
            );
      }
      const { checks, uniquePlaces, uniqueWeather } = checksFor(
        internal,
        count,
      );
      updateLabRun(runId, {
        status: "running",
        completedCount: internal.length,
        checks,
        summaries: internal.map((item) => item.summary),
        uniquePlaces,
        uniqueWeather,
        allChecksPassed: Object.values(checks).every(Boolean),
      });
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    const { checks, uniquePlaces, uniqueWeather } = checksFor(
      internal,
      count,
    );
    updateLabRun(runId, {
      status: "completed",
      completedCount: internal.length,
      checks,
      summaries: internal.map((item) => item.summary),
      uniquePlaces,
      uniqueWeather,
      allChecksPassed: Object.values(checks).every(Boolean),
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    updateLabRun(runId, {
      status: "failed",
      error:
        error instanceof Error ? error.message : "The lab run failed unexpectedly",
      completedCount: internal.length,
      summaries: internal.map((item) => item.summary),
      completedAt: new Date().toISOString(),
    });
  }

  const finished = getLabRun(runId);
  if (finished?.status === "running") {
    updateLabRun(runId, {
      status: "failed",
      error: "The lab run stopped unexpectedly",
      completedAt: new Date().toISOString(),
    });
  }
}

export function startLabRun(
  requestedCount: number,
  priority = 0.8,
): string {
  const count = clamp(Math.round(requestedCount), 1, MAX_LAB_COUNT);
  const runId = `lab_${crypto.randomUUID().slice(0, 12)}`;
  createLabRun(runId, count, new Date().toISOString());
  const orderSeed = randomSeed();
  void runLab(runId, count, clamp(priority, 0, 1), orderSeed);
  return runId;
}

export const LAB_MAX_COUNT = MAX_LAB_COUNT;
