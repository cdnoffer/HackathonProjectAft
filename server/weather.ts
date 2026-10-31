import type {
  City,
  RoadState,
  Weather,
  WeatherCondition,
} from "../shared/types";
import { clamp, rand, rngFor, round, type Rng } from "./rng";
import {
  dayPhase,
  localParts,
  solarElevationDeg,
  sunTimes,
} from "./solar";

function seasonalBase(climate: City["climate"], season: number): number {
  switch (climate) {
    case "tropical":
      return 27 + 1.8 * season;
    case "arid":
      return 24 + 10 * season;
    case "cold":
      return 0 + 15 * season;
    case "mediterranean":
      return 17 + 9 * season;
    case "humid-subtropical":
      return 19 + 10 * season;
    case "highland":
      return 13 + 5 * season;
    default:
      return 11 + 11 * season;
  }
}

function diurnalAmplitude(climate: City["climate"]): number {
  switch (climate) {
    case "arid":
      return 11;
    case "cold":
      return 5;
    case "tropical":
      return 2.5;
    case "highland":
      return 7;
    default:
      return 5.5;
  }
}

function rainProbability(
  climate: City["climate"],
  season: number,
  humidity: number,
): number {
  switch (climate) {
    case "tropical":
      return 0.48 + 0.12 * season;
    case "arid":
      return 0.06 + 0.02 * Math.max(0, -season);
    case "mediterranean":
      return season < 0 ? 0.32 : 0.09;
    case "cold":
      return 0.28;
    case "humid-subtropical":
      return 0.34 + 0.08 * season;
    case "highland":
      return 0.3;
    default:
      return 0.3 + (humidity - 60) / 250;
  }
}

function baseHumidity(climate: City["climate"]): number {
  switch (climate) {
    case "tropical":
      return 78;
    case "arid":
      return 32;
    case "cold":
      return 68;
    case "mediterranean":
      return 58;
    case "humid-subtropical":
      return 70;
    case "highland":
      return 62;
    default:
      return 68;
  }
}

function feelsLike(
  temperatureC: number,
  windKph: number,
  humidityPct: number,
): number {
  if (temperatureC <= 10 && windKph >= 4.8) {
    const v = windKph ** 0.16;
    return (
      13.12 +
      0.6215 * temperatureC -
      11.37 * v +
      0.3965 * temperatureC * v
    );
  }
  if (temperatureC >= 27) {
    const t = temperatureC;
    const r = humidityPct;
    const hi =
      -8.784695 +
      1.61139411 * t +
      2.338549 * r -
      0.14611605 * t * r -
      0.012308094 * t * t -
      0.016424828 * r * r +
      0.002211732 * t * t * r +
      0.00072546 * t * r * r -
      0.000003582 * t * t * r * r;
    return Math.max(t, hi);
  }
  return temperatureC;
}

function chooseCondition(
  rng: Rng,
  temperatureC: number,
  precipitationMmH: number,
  humidityPct: number,
  windKph: number,
  cloudCoverPct: number,
  phase: string,
): WeatherCondition {
  if (precipitationMmH > 0.05) {
    if (temperatureC <= 0.7) return "snow";
    if (temperatureC <= 3) return "sleet";
    if (precipitationMmH > 7 && temperatureC > 17) return "thunderstorm";
    if (precipitationMmH > 4) return "heavy-rain";
    if (precipitationMmH > 1.1) return "rain";
    return "drizzle";
  }
  if (
    humidityPct > 90 &&
    windKph < 11 &&
    (phase === "night" || phase === "civil-twilight" || phase === "golden-hour") &&
    rng() < 0.42
  ) {
    return "fog";
  }
  if (humidityPct > 84 && windKph < 14 && rng() < 0.3) {
    return "mist";
  }
  if (cloudCoverPct > 78) return "overcast";
  if (cloudCoverPct > 35) return "partly-cloudy";
  return "clear";
}

export function generateWeather(
  city: City,
  date: Date,
  seed: string,
): Weather {
  const rng = rngFor(seed, city.id, date.toISOString(), "weather");
  const local = localParts(date, city.timezone);
  const latitudeSeason =
    Math.sin((2 * Math.PI * (local.dayOfYear - 80)) / 365);
  const season = city.lat < 0 ? -latitudeSeason : latitudeSeason;
  const elevation = solarElevationDeg(city.lat, city.lon, date);
  const phase = dayPhase(elevation);
  const base = seasonalBase(city.climate, season);
  const amplitude = diurnalAmplitude(city.climate);
  const diurnal =
    amplitude * Math.cos((2 * Math.PI * (local.hour + local.minute / 60 - 15)) / 24);
  let temperatureC = base + diurnal + rand(rng, -2.3, 2.3);
  const humidityPct = clamp(
    baseHumidity(city.climate) +
      rand(rng, -16, 16) +
      (phase === "night" ? 7 : 0) -
      (city.climate === "arid" ? 8 : 0),
    18,
    99,
  );
  const cloudBase = clamp(
    humidityPct - 25 + rand(rng, -18, 24),
    0,
    100,
  );
  const precipChance = clamp(
    rainProbability(city.climate, season, humidityPct),
    0.02,
    0.75,
  );
  const precipitating = rng() < precipChance;
  const cloudCoverPct = precipitating
    ? clamp(rand(rng, 72, 100), 0, 100)
    : cloudBase;
  const precipitationMmH = precipitating
    ? round(
        Math.max(
          0.1,
          (rng() < 0.16 ? rand(rng, 5, 14) : rand(rng, 0.1, 4.2)),
        ),
        1,
      )
    : 0;
  const condition = chooseCondition(
    rng,
    temperatureC,
    precipitationMmH,
    humidityPct,
    clamp(rand(rng, 2, 32), 0, 60),
    cloudCoverPct,
    phase,
  );
  if (condition === "snow" || condition === "sleet") {
    temperatureC = Math.min(temperatureC, 1.8);
  }

  let precipitationType: Weather["precipitationType"] = "none";
  if (precipitationMmH > 0.05) {
    if (condition === "snow") precipitationType = "snow";
    else if (condition === "sleet") precipitationType = "sleet";
    else precipitationType = "rain";
  }
  const windBase =
    condition === "thunderstorm"
      ? rand(rng, 28, 62)
      : condition === "heavy-rain"
        ? rand(rng, 16, 38)
        : rand(rng, 3, 27);
  const windKph = round(windBase, 0);
  const gustKph = round(
    windKph * (condition === "thunderstorm" ? rand(rng, 1.3, 1.8) : rand(rng, 1.05, 1.45)),
    0,
  );

  let visibilityKm = rand(rng, 18, 35);
  if (condition === "fog") visibilityKm = rand(rng, 0.05, 0.7);
  else if (condition === "mist") visibilityKm = rand(rng, 0.8, 3.2);
  else if (condition === "heavy-rain" || condition === "thunderstorm")
    visibilityKm = rand(rng, 0.8, 4);
  else if (condition === "rain") visibilityKm = rand(rng, 3.5, 8);
  else if (condition === "snow" || condition === "sleet")
    visibilityKm = rand(rng, 0.7, 4.5);
  else if (condition === "overcast") visibilityKm = rand(rng, 8, 20);
  else if (condition === "partly-cloudy") visibilityKm = rand(rng, 14, 30);
  visibilityKm = round(visibilityKm, 1);

  const coldFactor = clamp((3 - temperatureC) / 9, 0, 1);
  let iceRisk = 0;
  if (temperatureC <= 3.5) {
    iceRisk =
      coldFactor * 62 +
      (humidityPct > 80 ? 12 : 0) +
      (phase === "night" || phase === "civil-twilight" ? 14 : 0) +
      (precipitationMmH > 0.1 ? 14 : 0) +
      rand(rng, -6, 8);
    iceRisk = clamp(iceRisk, 0, 100);
  }

  let roadState: RoadState = "dry";
  if (condition === "snow") roadState = "snow-covered";
  else if (precipitationMmH > 0.15) {
    roadState =
      temperatureC <= 1.8 && iceRisk > 42 ? "icy" : "wet";
  } else if (humidityPct > 86 || condition === "mist" || condition === "fog") {
    roadState = "damp";
  }
  if (roadState === "wet" && iceRisk > 58) roadState = "icy";

  const sun = sunTimes(date, city.lat, city.lon, city.timezone);
  const fingerprint = [
    condition,
    round(temperatureC, 1),
    precipitationMmH,
    visibilityKm,
    windKph,
    phase,
    local.timeLabel,
  ].join("|");

  return {
    condition,
    temperatureC: round(temperatureC, 1),
    feelsLikeC: round(feelsLike(temperatureC, windKph, humidityPct), 1),
    precipitationMmH,
    precipitationType,
    visibilityKm,
    windKph,
    gustKph,
    humidityPct: round(humidityPct, 0),
    cloudCoverPct: round(cloudCoverPct, 0),
    iceRisk: round(iceRisk, 0),
    roadState,
    solarElevationDeg: round(elevation, 1),
    phase,
    localTimeLabel: local.timeLabel,
    sunriseLocal: sun.sunriseLocal,
    sunsetLocal: sun.sunsetLocal,
    fingerprint,
  };
}
