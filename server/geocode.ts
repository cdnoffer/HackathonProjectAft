import type { GeocodeResult } from "../shared/types";
import { config } from "./config";
import { getCache, setCache } from "./db";
import { hashString } from "./rng";

interface NominatimAddress {
  road?: string;
  pedestrian?: string;
  suburb?: string;
  neighbourhood?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  state?: string;
  country?: string;
  country_code?: string;
}

interface NominatimItem {
  place_id: number;
  display_name: string;
  name?: string;
  lat: string;
  lon: string;
  type?: string;
  address?: NominatimAddress;
}

let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function politeFetch(url: string): Promise<unknown> {
  const run = async () => {
    const since = Date.now() - lastRequestAt;
    if (since < 1_100) await sleep(1_100 - since);
    lastRequestAt = Date.now();
    const response = await fetch(url, {
      headers: {
        "User-Agent": config.nominatimUserAgent,
        Accept: "application/json",
        "Accept-Language": "en",
      },
      signal: AbortSignal.timeout(18_000),
    });
    if (!response.ok) {
      throw new Error(`Geocoder responded ${response.status}`);
    }
    return response.json();
  };
  const next = queue.then(run, run);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function shortLabelFor(item: NominatimItem): string {
  const address = item.address ?? {};
  const locality =
    address.city ??
    address.town ??
    address.village ??
    address.municipality ??
    address.county ??
    address.state ??
    address.country ??
    "";
  const road = address.road ?? address.pedestrian ?? address.neighbourhood ?? "";
  if (road && locality) return `${road}, ${locality}`;
  if (road) return road;
  if (locality) return locality;
  return item.display_name.split(",")[0] ?? item.display_name;
}

function toResult(item: NominatimItem): GeocodeResult | null {
  const lat = Number(item.lat);
  const lon = Number(item.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    label: item.display_name,
    shortLabel: shortLabelFor(item),
    lat,
    lon,
    type: item.type ?? "place",
    countryCode: item.address?.country_code ?? null,
  };
}

export async function searchPlaces(query: string): Promise<GeocodeResult[]> {
  const clean = query.trim().slice(0, 180);
  if (clean.length < 2) return [];
  const key = `nominatim:search:${hashString(clean.toLowerCase())}`;
  const cached = getCache(key);
  if (cached) return cached.payload as GeocodeResult[];
  const params = new URLSearchParams({
    q: clean,
    format: "jsonv2",
    addressdetails: "1",
    limit: "6",
    "accept-language": "en",
  });
  if (config.nominatimEmail) params.set("email", config.nominatimEmail);
  const raw = (await politeFetch(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
  )) as NominatimItem[];
  const results = (Array.isArray(raw) ? raw : [])
    .map(toResult)
    .filter((item): item is GeocodeResult => Boolean(item));
  setCache(key, "nominatim-search", results, 30 * 24 * 3_600_000);
  return results;
}

export async function reversePlace(
  lat: number,
  lon: number,
): Promise<GeocodeResult> {
  const key = `nominatim:reverse:${lat.toFixed(5)}:${lon.toFixed(5)}`;
  const cached = getCache(key);
  if (cached) return cached.payload as GeocodeResult;
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    format: "jsonv2",
    addressdetails: "1",
    zoom: "16",
    "accept-language": "en",
  });
  if (config.nominatimEmail) params.set("email", config.nominatimEmail);
  try {
    const raw = (await politeFetch(
      `https://nominatim.openstreetmap.org/reverse?${params.toString()}`,
    )) as NominatimItem;
    const result = toResult(raw);
    if (result) {
      setCache(key, "nominatim-reverse", result, 30 * 24 * 3_600_000);
      return result;
    }
  } catch {
    // Fall back to a coordinate label; routing can still proceed.
  }
  const fallback: GeocodeResult = {
    label: `Dropped pin · ${lat.toFixed(4)}, ${lon.toFixed(4)}`,
    shortLabel: "Dropped pin",
    lat,
    lon,
    type: "coordinate",
    countryCode: null,
  };
  return fallback;
}
