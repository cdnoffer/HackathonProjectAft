export type LngLat = [number, number];

const EARTH_RADIUS_M = 6_371_008.8;
const RAD = Math.PI / 180;

export function haversineM(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const dLat = (bLat - aLat) * RAD;
  const dLon = (bLon - aLon) * RAD;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function bearingDeg(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const lat1 = aLat * RAD;
  const lat2 = bLat * RAD;
  const dLon = (bLon - aLon) * RAD;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

export function angleDelta(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

export function cumulativeDistances(coords: LngLat[]): number[] {
  const out: number[] = [0];
  for (let i = 1; i < coords.length; i += 1) {
    const prev = coords[i - 1]!;
    const next = coords[i]!;
    out.push(
      out[i - 1]! + haversineM(prev[1], prev[0], next[1], next[0]),
    );
  }
  return out;
}

export function interpolateAlong(
  coords: LngLat[],
  cumulative: number[],
  distanceM: number,
): { coord: LngLat; bearing: number; index: number } {
  if (coords.length === 0) {
    return { coord: [0, 0], bearing: 0, index: 0 };
  }
  if (coords.length === 1) {
    return { coord: coords[0]!, bearing: 0, index: 0 };
  }
  const total = cumulative[cumulative.length - 1] ?? 0;
  const target = Math.min(Math.max(distanceM, 0), total);
  let low = 0;
  let high = cumulative.length - 1;
  while (low < high - 1) {
    const mid = Math.floor((low + high) / 2);
    if (cumulative[mid]! <= target) low = mid;
    else high = mid;
  }
  const a = coords[low]!;
  const b = coords[high]!;
  const segStart = cumulative[low]!;
  const segLen = Math.max(1e-6, cumulative[high]! - segStart);
  const t = Math.min(1, Math.max(0, (target - segStart) / segLen));
  return {
    coord: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
    bearing: bearingDeg(a[1], a[0], b[1], b[0]),
    index: low,
  };
}

export function destinationPoint(
  lat: number,
  lon: number,
  distanceM: number,
  bearing: number,
): { lat: number; lon: number } {
  const d = distanceM / EARTH_RADIUS_M;
  const brng = bearing * RAD;
  const lat1 = lat * RAD;
  const lon1 = lon * RAD;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lat: lat2 / RAD, lon: ((lon2 / RAD + 540) % 360) - 180 };
}

export function midpoint(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): { lat: number; lon: number } {
  const lat1 = a.lat * RAD;
  const lat2 = b.lat * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const bx = Math.cos(lat2) * Math.cos(dLon);
  const by = Math.cos(lat2) * Math.sin(dLon);
  const lat3 = Math.atan2(
    Math.sin(lat1) + Math.sin(lat2),
    Math.sqrt((Math.cos(lat1) + bx) ** 2 + by ** 2),
  );
  const lon3 = a.lon * RAD + Math.atan2(by, Math.cos(lat1) + bx);
  return { lat: lat3 / RAD, lon: ((lon3 / RAD + 540) % 360) - 180 };
}
