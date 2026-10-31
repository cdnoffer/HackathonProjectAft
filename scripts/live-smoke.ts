import { countMapCache, countScenarios } from "../server/db";
import { generateRandomScenario } from "../server/simulate";
import { randomSeed, rngFor, shuffled } from "../server/rng";
import { CITIES } from "../server/cities";

const TARGET = 4;

async function main(): Promise<void> {
  const orderSeed = randomSeed();
  const cities = shuffled(rngFor(orderSeed, "smoke"), CITIES);
  const scenarios = [];
  const failures: string[] = [];

  for (const city of cities) {
    if (scenarios.length >= TARGET) break;
    const seed = randomSeed();
    try {
      const started = Date.now();
      const payload = await generateRandomScenario({
        cityId: city.id,
        seed,
        priority: 0.8,
      });
      const elapsed = Date.now() - started;
      const recommended =
        payload.routes.find((route) => route.isRecommended) ??
        payload.routes[0];
      if (!recommended) throw new Error("No recommended route");
      if (payload.routes.length < 1) throw new Error("No routes");
      for (const route of payload.routes) {
        if (
          !Number.isFinite(route.safetyScore) ||
          route.safetyScore < 0 ||
          route.safetyScore > 100
        ) {
          throw new Error(`Invalid safety score on ${route.name}`);
        }
        if (route.reasons.length < 3) {
          throw new Error(`Missing reasons on ${route.name}`);
        }
        if (route.segments.length === 0) {
          throw new Error(`Missing segments on ${route.name}`);
        }
      }
      scenarios.push(payload);
      console.log(
        `✓ ${payload.scenario.cityName.padEnd(16)} ${String(payload.scenario.weather.condition).padEnd(15)} ` +
          `${String(payload.scenario.weather.temperatureC).padStart(5)}°C  ` +
          `${payload.routes.length} routes  safest=${Math.round(
            Math.max(...payload.routes.map((route) => route.safetyScore)),
          )}  rec=${Math.round(recommended.safetyScore)}  ${elapsed}ms`,
      );
    } catch (error) {
      failures.push(
        `${city.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
      console.warn(`✗ ${city.name}: ${failures[failures.length - 1]}`);
    }
  }

  if (scenarios.length < TARGET) {
    throw new Error(
      `Only ${scenarios.length}/${TARGET} scenarios generated. Failures: ${failures.join(" | ")}`,
    );
  }

  const citiesSeen = new Set(scenarios.map((item) => item.scenario.cityName));
  const seedsSeen = new Set(scenarios.map((item) => item.scenario.seed));
  const weatherSeen = new Set(
    scenarios.map((item) => item.scenario.weather.fingerprint),
  );
  const timesSeen = new Set(
    scenarios.map((item) => item.scenario.simulatedAtUtc),
  );
  if (citiesSeen.size !== TARGET) throw new Error("City uniqueness failed");
  if (seedsSeen.size !== TARGET) throw new Error("Seed uniqueness failed");
  if (weatherSeen.size !== TARGET) throw new Error("Weather uniqueness failed");
  if (timesSeen.size !== TARGET) throw new Error("Time uniqueness failed");

  console.log("");
  console.log(`Unique places:   ${citiesSeen.size}/${TARGET}`);
  console.log(`Unique seeds:    ${seedsSeen.size}/${TARGET}`);
  console.log(`Unique weather:  ${weatherSeen.size}/${TARGET}`);
  console.log(`Unique times:    ${timesSeen.size}/${TARGET}`);
  console.log(`Scenarios in DB: ${countScenarios()}`);
  console.log(`Cached map data: ${countMapCache()}`);
  console.log("Live smoke test passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
