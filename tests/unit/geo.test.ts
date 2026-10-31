import { describe, expect, it } from "bun:test";
import {
  cumulativeDistances,
  destinationPoint,
  haversineM,
  interpolateAlong,
} from "../../shared/geo";
import {
  dayPhase,
  solarElevationDeg,
  sunTimes,
} from "../../server/solar";

describe("geodesy", () => {
  it("computes a realistic London-Paris distance", () => {
    const distance = haversineM(51.5074, -0.1278, 48.8566, 2.3522);
    expect(distance).toBeGreaterThan(330_000);
    expect(distance).toBeLessThan(355_000);
  });

  it("interpolates along a line and tracks cumulative distance", () => {
    const coords: [number, number][] = [
      [0, 0],
      [0.01, 0],
      [0.02, 0],
    ];
    const cumulative = cumulativeDistances(coords);
    expect(cumulative[0]).toBe(0);
    expect(cumulative[2]).toBeGreaterThan(2_000);
    const point = interpolateAlong(coords, cumulative, cumulative[2]! / 2);
    expect(point.coord[0]).toBeCloseTo(0.01, 3);
    expect(point.coord[1]).toBeCloseTo(0, 6);
    expect(point.bearing).toBeCloseTo(90, 0);
  });

  it("moves a point by a given distance", () => {
    const start = { lat: 51.5, lon: -0.1 };
    const end = destinationPoint(start.lat, start.lon, 1_000, 90);
    const distance = haversineM(start.lat, start.lon, end.lat, end.lon);
    expect(distance).toBeCloseTo(1_000, -1);
    expect(end.lon).toBeGreaterThan(start.lon);
  });
});

describe("solar model", () => {
  it("reports a high sun in summer and a low sun in winter", () => {
    const summer = solarElevationDeg(
      51.5074,
      -0.1278,
      new Date("2026-06-21T12:00:00Z"),
    );
    const winter = solarElevationDeg(
      51.5074,
      -0.1278,
      new Date("2026-12-21T12:00:00Z"),
    );
    expect(summer).toBeGreaterThan(55);
    expect(winter).toBeLessThan(22);
    expect(dayPhase(summer)).toBe("day");
  });

  it("finds plausible local sunrise and sunset labels", () => {
    const times = sunTimes(
      new Date("2026-06-21T12:00:00Z"),
      51.5074,
      -0.1278,
      "Europe/London",
    );
    expect(times.sunriseLocal).toMatch(/^\d{2}:\d{2}$/);
    expect(times.sunsetLocal).toMatch(/^\d{2}:\d{2}$/);
  });
});
