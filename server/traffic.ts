import type { City, Traffic, TrafficLevel, Weather } from "../shared/types";
import { localParts } from "./solar";
import { clamp, rand, rngFor, round } from "./rng";

function trafficLevel(congestionPct: number): TrafficLevel {
  if (congestionPct < 12) return "free";
  if (congestionPct < 30) return "light";
  if (congestionPct < 52) return "moderate";
  if (congestionPct < 74) return "heavy";
  return "severe";
}

export function generateTraffic(
  city: City,
  date: Date,
  weather: Weather,
  seed: string,
): Traffic {
  const rng = rngFor(seed, city.id, date.toISOString(), "traffic");
  const local = localParts(date, city.timezone);
  const hour = local.hour + local.minute / 60;
  const isWeekday = local.weekday >= 1 && local.weekday <= 5;
  const morningRush = isWeekday && hour >= 6.75 && hour <= 9.5;
  const eveningRush = isWeekday && hour >= 15.75 && hour <= 19.5;
  const rushHour = morningRush || eveningRush;
  const night = hour < 5.5 || hour > 22;
  const weatherPressure =
    weather.precipitationMmH > 0.1
      ? Math.min(22, 8 + weather.precipitationMmH * 1.8)
      : weather.visibilityKm < 2
        ? 12
        : 0;
  const base = rushHour ? rand(rng, 47, 79) : night ? rand(rng, 2, 18) : rand(rng, 12, 42);
  const congestionPct = clamp(
    base + weatherPressure + rand(rng, -8, 10),
    1,
    97,
  );
  const level = trafficLevel(congestionPct);
  const delayFactor =
    1 +
    (congestionPct / 100) * 0.72 +
    (level === "severe" ? 0.08 : 0);
  return {
    level,
    congestionPct: round(congestionPct, 0),
    delayFactor: round(delayFactor, 2),
    rushHour,
  };
}
