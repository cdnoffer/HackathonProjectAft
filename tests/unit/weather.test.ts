import { describe, expect, it } from "bun:test";
import type { City, WeatherCondition } from "../../shared/types";
import { generateTraffic } from "../../server/traffic";
import { generateWeather } from "../../server/weather";

const london: City = {
  id: "london",
  name: "London",
  country: "United Kingdom",
  lat: 51.5074,
  lon: -0.1278,
  bbox: { minLat: 51.4, maxLat: 51.6, minLon: -0.3, maxLon: 0.05 },
  timezone: "Europe/London",
  climate: "temperate",
};

const singapore: City = {
  ...london,
  id: "singapore",
  name: "Singapore",
  country: "Singapore",
  lat: 1.3521,
  lon: 103.8198,
  timezone: "Asia/Singapore",
  climate: "tropical",
};

const conditions: WeatherCondition[] = [
  "clear",
  "partly-cloudy",
  "overcast",
  "mist",
  "fog",
  "drizzle",
  "rain",
  "heavy-rain",
  "snow",
  "sleet",
  "thunderstorm",
];

describe("weather simulation", () => {
  it("is deterministic for the same seed and timestamp", () => {
    const date = new Date("2026-11-04T09:30:00Z");
    const a = generateWeather(london, date, "seed-123");
    const b = generateWeather(london, date, "seed-123");
    expect(a).toEqual(b);
  });

  it("varies with the seed", () => {
    const date = new Date("2026-11-04T09:30:00Z");
    const a = generateWeather(london, date, "seed-a");
    const b = generateWeather(london, date, "seed-b");
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it("keeps all generated fields physically plausible", () => {
    const base = new Date("2026-01-10T00:00:00Z").getTime();
    for (let index = 0; index < 80; index += 1) {
      const city = index % 2 === 0 ? london : singapore;
      const weather = generateWeather(
        city,
        new Date(base + index * 5_400_000),
        `weather-${index}`,
      );
      expect(conditions).toContain(weather.condition);
      expect(weather.visibilityKm).toBeGreaterThan(0);
      expect(weather.humidityPct).toBeGreaterThanOrEqual(0);
      expect(weather.humidityPct).toBeLessThanOrEqual(100);
      expect(weather.iceRisk).toBeGreaterThanOrEqual(0);
      expect(weather.iceRisk).toBeLessThanOrEqual(100);
      if (weather.condition === "snow" || weather.condition === "sleet") {
        expect(weather.temperatureC).toBeLessThanOrEqual(1.8);
      }
      if (weather.condition === "fog") {
        expect(weather.visibilityKm).toBeLessThanOrEqual(0.8);
      }
      expect(["dry", "damp", "wet", "icy", "snow-covered"]).toContain(
        weather.roadState,
      );
      expect(weather.fingerprint.length).toBeGreaterThan(10);
    }
  });

  it("generates a valid traffic profile", () => {
    const weather = generateWeather(
      london,
      new Date("2026-11-04T09:30:00Z"),
      "traffic-test",
    );
    const traffic = generateTraffic(
      london,
      new Date("2026-11-04T09:30:00Z"),
      weather,
      "traffic-test",
    );
    expect(["free", "light", "moderate", "heavy", "severe"]).toContain(
      traffic.level,
    );
    expect(traffic.congestionPct).toBeGreaterThanOrEqual(0);
    expect(traffic.congestionPct).toBeLessThanOrEqual(100);
    expect(traffic.delayFactor).toBeGreaterThanOrEqual(1);
  });
});
