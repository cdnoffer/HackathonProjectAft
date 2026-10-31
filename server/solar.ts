import type { DayPhase } from "../shared/types";
import { clamp } from "./rng";

const RAD = Math.PI / 180;

export function solarElevationDeg(
  lat: number,
  lon: number,
  date: Date,
): number {
  const jd = date.getTime() / 86_400_000 + 2_440_587.5;
  const n = jd - 2_451_545.0;
  const meanLongitude = (280.46 + 0.9856474 * n) % 360;
  const meanAnomaly = ((357.528 + 0.9856003 * n) % 360) * RAD;
  const eclipticLongitude =
    (meanLongitude +
      1.915 * Math.sin(meanAnomaly) +
      0.02 * Math.sin(2 * meanAnomaly)) *
    RAD;
  const obliquity = (23.439 - 0.0000004 * n) * RAD;
  const declination = Math.asin(
    Math.sin(obliquity) * Math.sin(eclipticLongitude),
  );
  const rightAscension = Math.atan2(
    Math.cos(obliquity) * Math.sin(eclipticLongitude),
    Math.cos(eclipticLongitude),
  );
  const gmstHours = (18.697374558 + 24.06570982441908 * n) % 24;
  const localSiderealDeg = (gmstHours * 15 + lon + 360) % 360;
  const hourAngle = (localSiderealDeg - rightAscension / RAD + 540) % 360 - 180;
  const elevation = Math.asin(
    Math.sin(lat * RAD) * Math.sin(declination) +
      Math.cos(lat * RAD) * Math.cos(declination) * Math.cos(hourAngle * RAD),
  );
  return elevation / RAD;
}

export function dayPhase(elevation: number): DayPhase {
  if (elevation > 8) return "day";
  if (elevation > 0) return "golden-hour";
  if (elevation > -6) return "civil-twilight";
  return "night";
}

export function localParts(
  date: Date,
  timezone: string,
): {
  hour: number;
  minute: number;
  weekday: number;
  dayOfYear: number;
  timeLabel: string;
  dateLabel: string;
  dateTimeLabel: string;
} {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).formatToParts(date);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  const weekdayText = get("weekday");
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekday = Math.max(0, weekdays.indexOf(weekdayText));
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const dayOfYear =
    Math.floor((date.getTime() - start.getTime()) / 86_400_000) + 1;
  return {
    hour,
    minute,
    weekday,
    dayOfYear,
    timeLabel: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    dateLabel: `${get("weekday")} ${get("day")} ${get("month")} ${get("year")}`,
    dateTimeLabel: `${get("weekday")} ${get("day")} ${get("month")} · ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

export function localHour(date: Date, timezone: string): number {
  return localParts(date, timezone).hour;
}

export function formatLocalTime(
  date: Date,
  timezone: string,
): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatLocalDateTime(
  date: Date,
  timezone: string,
): string {
  const parts = localParts(date, timezone);
  return `${parts.dateLabel} · ${parts.timeLabel}`;
}

export function sunTimes(
  date: Date,
  lat: number,
  lon: number,
  timezone: string,
): { sunriseLocal: string | null; sunsetLocal: string | null } {
  const stepMs = 5 * 60_000;
  const start = date.getTime() - 18 * 3_600_000;
  const end = date.getTime() + 18 * 3_600_000;
  let previous = solarElevationDeg(lat, lon, new Date(start));
  let sunrise: number | null = null;
  let sunset: number | null = null;
  let closestSunrise = Number.POSITIVE_INFINITY;
  let closestSunset = Number.POSITIVE_INFINITY;
  for (let t = start + stepMs; t <= end; t += stepMs) {
    const current = solarElevationDeg(lat, lon, new Date(t));
    const crossing = -0.833;
    if (previous <= crossing && current > crossing) {
      const distance = Math.abs(t - date.getTime());
      if (distance < closestSunrise) {
        closestSunrise = distance;
        sunrise = t;
      }
    }
    if (previous > crossing && current <= crossing) {
      const distance = Math.abs(t - date.getTime());
      if (distance < closestSunset) {
        closestSunset = distance;
        sunset = t;
      }
    }
    previous = current;
  }
  return {
    sunriseLocal: sunrise ? formatLocalTime(new Date(sunrise), timezone) : null,
    sunsetLocal: sunset ? formatLocalTime(new Date(sunset), timezone) : null,
  };
}

export function nightFactor(elevation: number): number {
  return clamp((8 - elevation) / 20, 0, 1);
}
