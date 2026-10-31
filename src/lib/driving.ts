import type { Maneuver, RoadSegment, RouteData } from "../../shared/types";
import { cumulativeDistances, interpolateAlong } from "../../shared/geo";

export interface DrivingFrame {
  progress: number;
  distanceM: number;
  remainingM: number;
  lat: number;
  lon: number;
  bearing: number;
  speedKph: number;
  currentSegment: RoadSegment | null;
  nextManeuver: Maneuver | null;
  distanceToManeuverM: number;
  localClock: string;
}

export interface RouteTimeline {
  geometry: [number, number][];
  cumulative: number[];
  totalDistanceM: number;
  segmentStarts: number[];
  maneuverStarts: number[];
  segmentDurationS: number[];
}

export function buildRouteTimeline(route: RouteData): RouteTimeline {
  const geometry = route.geometry;
  const cumulative = cumulativeDistances(geometry);
  const totalDistanceM = cumulative[cumulative.length - 1] ?? 0;
  const segmentStarts: number[] = [];
  const segmentDurationS: number[] = [];
  let segmentDistance = 0;
  for (const segment of route.segments) {
    segmentStarts.push(segmentDistance);
    segmentDurationS.push(segment.durationS);
    segmentDistance += segment.distanceM;
  }
  const maneuverStarts = route.maneuvers.map((maneuver) =>
    cumulative[Math.min(maneuver.beginShapeIndex, cumulative.length - 1)] ?? 0,
  );
  return {
    geometry,
    cumulative,
    totalDistanceM,
    segmentStarts,
    maneuverStarts,
    segmentDurationS,
  };
}

function findIndexAtDistance(
  starts: number[],
  distance: number,
): number {
  let low = 0;
  let high = starts.length - 1;
  if (starts.length === 0) return -1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (starts[mid]! <= distance) low = mid;
    else high = mid - 1;
  }
  return low;
}

export function frameFor(
  route: RouteData,
  timeline: RouteTimeline,
  progress: number,
  simulatedTime: Date,
  timezone: string,
): DrivingFrame {
  const clamped = Math.min(1, Math.max(0, progress));
  const distanceM = timeline.totalDistanceM * clamped;
  const point = interpolateAlong(
    timeline.geometry,
    timeline.cumulative,
    distanceM,
  );
  const segmentIndex = findIndexAtDistance(timeline.segmentStarts, distanceM);
  const segment = route.segments[Math.max(0, segmentIndex)] ?? null;
  let maneuverIndex = timeline.maneuverStarts.findIndex(
    (start) => start > distanceM + 2,
  );
  if (maneuverIndex === -1) maneuverIndex = route.maneuvers.length;
  const nextManeuver =
    maneuverIndex < route.maneuvers.length
      ? route.maneuvers[maneuverIndex]!
      : null;
  const distanceToManeuverM = nextManeuver
    ? Math.max(0, timeline.maneuverStarts[maneuverIndex]! - distanceM)
    : 0;
  const speedKph = segment
    ? Math.min(
        130,
        Math.max(
          4,
          (segment.distanceM / Math.max(1, segment.durationS)) * 3.6,
        ),
      )
    : route.avgSpeedKph;
  const localClock = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(simulatedTime);
  return {
    progress: clamped,
    distanceM,
    remainingM: Math.max(0, timeline.totalDistanceM - distanceM),
    lat: point.coord[1],
    lon: point.coord[0],
    bearing: point.bearing,
    speedKph,
    currentSegment: segment,
    nextManeuver,
    distanceToManeuverM,
    localClock,
  };
}
