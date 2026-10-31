import type { City, Climate } from "../shared/types";
import { haversineM } from "../shared/geo";

interface CitySeed {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  span?: number;
  timezone: string;
  climate: Climate;
}

const CITY_SEEDS: CitySeed[] = [
  { id: "london", name: "London", country: "United Kingdom", lat: 51.5074, lon: -0.1278, span: 0.1, timezone: "Europe/London", climate: "temperate" },
  { id: "paris", name: "Paris", country: "France", lat: 48.8566, lon: 2.3522, span: 0.1, timezone: "Europe/Paris", climate: "temperate" },
  { id: "berlin", name: "Berlin", country: "Germany", lat: 52.52, lon: 13.405, span: 0.1, timezone: "Europe/Berlin", climate: "temperate" },
  { id: "madrid", name: "Madrid", country: "Spain", lat: 40.4168, lon: -3.7038, span: 0.1, timezone: "Europe/Madrid", climate: "mediterranean" },
  { id: "rome", name: "Rome", country: "Italy", lat: 41.9028, lon: 12.4964, span: 0.1, timezone: "Europe/Rome", climate: "mediterranean" },
  { id: "amsterdam", name: "Amsterdam", country: "Netherlands", lat: 52.3676, lon: 4.9041, span: 0.07, timezone: "Europe/Amsterdam", climate: "temperate" },
  { id: "lisbon", name: "Lisbon", country: "Portugal", lat: 38.7223, lon: -9.1393, span: 0.08, timezone: "Europe/Lisbon", climate: "mediterranean" },
  { id: "vienna", name: "Vienna", country: "Austria", lat: 48.2082, lon: 16.3738, span: 0.09, timezone: "Europe/Vienna", climate: "temperate" },
  { id: "prague", name: "Prague", country: "Czechia", lat: 50.0755, lon: 14.4378, span: 0.08, timezone: "Europe/Prague", climate: "temperate" },
  { id: "stockholm", name: "Stockholm", country: "Sweden", lat: 59.3293, lon: 18.0686, span: 0.1, timezone: "Europe/Stockholm", climate: "cold" },
  { id: "oslo", name: "Oslo", country: "Norway", lat: 59.9139, lon: 10.7522, span: 0.09, timezone: "Europe/Oslo", climate: "cold" },
  { id: "helsinki", name: "Helsinki", country: "Finland", lat: 60.1699, lon: 24.9384, span: 0.09, timezone: "Europe/Helsinki", climate: "cold" },
  { id: "copenhagen", name: "Copenhagen", country: "Denmark", lat: 55.6761, lon: 12.5683, span: 0.07, timezone: "Europe/Copenhagen", climate: "temperate" },
  { id: "dublin", name: "Dublin", country: "Ireland", lat: 53.3498, lon: -6.2603, span: 0.07, timezone: "Europe/Dublin", climate: "temperate" },
  { id: "zurich", name: "Zürich", country: "Switzerland", lat: 47.3769, lon: 8.5417, span: 0.07, timezone: "Europe/Zurich", climate: "temperate" },
  { id: "barcelona", name: "Barcelona", country: "Spain", lat: 41.3874, lon: 2.1686, span: 0.07, timezone: "Europe/Madrid", climate: "mediterranean" },
  { id: "istanbul", name: "Istanbul", country: "Türkiye", lat: 41.0082, lon: 28.9784, span: 0.11, timezone: "Europe/Istanbul", climate: "mediterranean" },
  { id: "athens", name: "Athens", country: "Greece", lat: 37.9838, lon: 23.7275, span: 0.08, timezone: "Europe/Athens", climate: "mediterranean" },
  { id: "warsaw", name: "Warsaw", country: "Poland", lat: 52.2297, lon: 21.0122, span: 0.09, timezone: "Europe/Warsaw", climate: "temperate" },
  { id: "budapest", name: "Budapest", country: "Hungary", lat: 47.4979, lon: 19.0402, span: 0.08, timezone: "Europe/Budapest", climate: "temperate" },
  { id: "reykjavik", name: "Reykjavík", country: "Iceland", lat: 64.1466, lon: -21.9426, span: 0.06, timezone: "Atlantic/Reykjavik", climate: "cold" },
  { id: "tokyo", name: "Tokyo", country: "Japan", lat: 35.6762, lon: 139.6503, span: 0.12, timezone: "Asia/Tokyo", climate: "humid-subtropical" },
  { id: "osaka", name: "Osaka", country: "Japan", lat: 34.6937, lon: 135.5023, span: 0.09, timezone: "Asia/Tokyo", climate: "humid-subtropical" },
  { id: "seoul", name: "Seoul", country: "South Korea", lat: 37.5665, lon: 126.978, span: 0.1, timezone: "Asia/Seoul", climate: "humid-subtropical" },
  { id: "beijing", name: "Beijing", country: "China", lat: 39.9042, lon: 116.4074, span: 0.12, timezone: "Asia/Shanghai", climate: "temperate" },
  { id: "shanghai", name: "Shanghai", country: "China", lat: 31.2304, lon: 121.4737, span: 0.1, timezone: "Asia/Shanghai", climate: "humid-subtropical" },
  { id: "hong-kong", name: "Hong Kong", country: "China", lat: 22.3193, lon: 114.1694, span: 0.07, timezone: "Asia/Hong_Kong", climate: "humid-subtropical" },
  { id: "taipei", name: "Taipei", country: "Taiwan", lat: 25.033, lon: 121.5654, span: 0.07, timezone: "Asia/Taipei", climate: "humid-subtropical" },
  { id: "bangkok", name: "Bangkok", country: "Thailand", lat: 13.7563, lon: 100.5018, span: 0.09, timezone: "Asia/Bangkok", climate: "tropical" },
  { id: "singapore", name: "Singapore", country: "Singapore", lat: 1.3521, lon: 103.8198, span: 0.07, timezone: "Asia/Singapore", climate: "tropical" },
  { id: "kuala-lumpur", name: "Kuala Lumpur", country: "Malaysia", lat: 3.139, lon: 101.6869, span: 0.08, timezone: "Asia/Kuala_Lumpur", climate: "tropical" },
  { id: "jakarta", name: "Jakarta", country: "Indonesia", lat: -6.2088, lon: 106.8456, span: 0.1, timezone: "Asia/Jakarta", climate: "tropical" },
  { id: "manila", name: "Manila", country: "Philippines", lat: 14.5995, lon: 120.9842, span: 0.09, timezone: "Asia/Manila", climate: "tropical" },
  { id: "mumbai", name: "Mumbai", country: "India", lat: 19.076, lon: 72.8777, span: 0.09, timezone: "Asia/Kolkata", climate: "tropical" },
  { id: "delhi", name: "Delhi", country: "India", lat: 28.6139, lon: 77.209, span: 0.11, timezone: "Asia/Kolkata", climate: "humid-subtropical" },
  { id: "kathmandu", name: "Kathmandu", country: "Nepal", lat: 27.7172, lon: 85.324, span: 0.07, timezone: "Asia/Kathmandu", climate: "highland" },
  { id: "colombo", name: "Colombo", country: "Sri Lanka", lat: 6.9271, lon: 79.8612, span: 0.07, timezone: "Asia/Colombo", climate: "tropical" },
  { id: "ho-chi-minh", name: "Ho Chi Minh City", country: "Vietnam", lat: 10.8231, lon: 106.6297, span: 0.09, timezone: "Asia/Ho_Chi_Minh", climate: "tropical" },
  { id: "hanoi", name: "Hanoi", country: "Vietnam", lat: 21.0285, lon: 105.8542, span: 0.08, timezone: "Asia/Ho_Chi_Minh", climate: "humid-subtropical" },
  { id: "dubai", name: "Dubai", country: "United Arab Emirates", lat: 25.2048, lon: 55.2708, span: 0.09, timezone: "Asia/Dubai", climate: "arid" },
  { id: "doha", name: "Doha", country: "Qatar", lat: 25.2854, lon: 51.531, span: 0.07, timezone: "Asia/Qatar", climate: "arid" },
  { id: "riyadh", name: "Riyadh", country: "Saudi Arabia", lat: 24.7136, lon: 46.6753, span: 0.11, timezone: "Asia/Riyadh", climate: "arid" },
  { id: "tehran", name: "Tehran", country: "Iran", lat: 35.6892, lon: 51.389, span: 0.11, timezone: "Asia/Tehran", climate: "arid" },
  { id: "tashkent", name: "Tashkent", country: "Uzbekistan", lat: 41.2995, lon: 69.2401, span: 0.09, timezone: "Asia/Tashkent", climate: "arid" },
  { id: "almaty", name: "Almaty", country: "Kazakhstan", lat: 43.222, lon: 76.8512, span: 0.09, timezone: "Asia/Almaty", climate: "cold" },
  { id: "ulaanbaatar", name: "Ulaanbaatar", country: "Mongolia", lat: 47.8864, lon: 106.9057, span: 0.09, timezone: "Asia/Ulaanbaatar", climate: "cold" },
  { id: "cairo", name: "Cairo", country: "Egypt", lat: 30.0444, lon: 31.2357, span: 0.1, timezone: "Africa/Cairo", climate: "arid" },
  { id: "casablanca", name: "Casablanca", country: "Morocco", lat: 33.5731, lon: -7.5898, span: 0.08, timezone: "Africa/Casablanca", climate: "mediterranean" },
  { id: "marrakech", name: "Marrakech", country: "Morocco", lat: 31.6295, lon: -7.9811, span: 0.07, timezone: "Africa/Casablanca", climate: "arid" },
  { id: "nairobi", name: "Nairobi", country: "Kenya", lat: -1.2921, lon: 36.8219, span: 0.09, timezone: "Africa/Nairobi", climate: "highland" },
  { id: "addis-ababa", name: "Addis Ababa", country: "Ethiopia", lat: 9.032, lon: 38.7469, span: 0.08, timezone: "Africa/Addis_Ababa", climate: "highland" },
  { id: "lagos", name: "Lagos", country: "Nigeria", lat: 6.5244, lon: 3.3792, span: 0.1, timezone: "Africa/Lagos", climate: "tropical" },
  { id: "accra", name: "Accra", country: "Ghana", lat: 5.6037, lon: -0.187, span: 0.08, timezone: "Africa/Accra", climate: "tropical" },
  { id: "dar-es-salaam", name: "Dar es Salaam", country: "Tanzania", lat: -6.7924, lon: 39.2083, span: 0.08, timezone: "Africa/Dar_es_Salaam", climate: "tropical" },
  { id: "cape-town", name: "Cape Town", country: "South Africa", lat: -33.9249, lon: 18.4241, span: 0.09, timezone: "Africa/Johannesburg", climate: "mediterranean" },
  { id: "johannesburg", name: "Johannesburg", country: "South Africa", lat: -26.2041, lon: 28.0473, span: 0.1, timezone: "Africa/Johannesburg", climate: "highland" },
  { id: "new-york", name: "New York", country: "United States", lat: 40.7128, lon: -74.006, span: 0.09, timezone: "America/New_York", climate: "humid-subtropical" },
  { id: "los-angeles", name: "Los Angeles", country: "United States", lat: 34.0522, lon: -118.2437, span: 0.14, timezone: "America/Los_Angeles", climate: "mediterranean" },
  { id: "chicago", name: "Chicago", country: "United States", lat: 41.8781, lon: -87.6298, span: 0.1, timezone: "America/Chicago", climate: "temperate" },
  { id: "san-francisco", name: "San Francisco", country: "United States", lat: 37.7749, lon: -122.4194, span: 0.07, timezone: "America/Los_Angeles", climate: "mediterranean" },
  { id: "seattle", name: "Seattle", country: "United States", lat: 47.6062, lon: -122.3321, span: 0.08, timezone: "America/Los_Angeles", climate: "temperate" },
  { id: "anchorage", name: "Anchorage", country: "United States", lat: 61.2181, lon: -149.9003, span: 0.09, timezone: "America/Anchorage", climate: "cold" },
  { id: "honolulu", name: "Honolulu", country: "United States", lat: 21.3069, lon: -157.8583, span: 0.07, timezone: "Pacific/Honolulu", climate: "tropical" },
  { id: "toronto", name: "Toronto", country: "Canada", lat: 43.6532, lon: -79.3832, span: 0.09, timezone: "America/Toronto", climate: "temperate" },
  { id: "vancouver", name: "Vancouver", country: "Canada", lat: 49.2827, lon: -123.1207, span: 0.08, timezone: "America/Vancouver", climate: "temperate" },
  { id: "montreal", name: "Montréal", country: "Canada", lat: 45.5017, lon: -73.5673, span: 0.09, timezone: "America/Toronto", climate: "cold" },
  { id: "mexico-city", name: "Mexico City", country: "Mexico", lat: 19.4326, lon: -99.1332, span: 0.11, timezone: "America/Mexico_City", climate: "highland" },
  { id: "sao-paulo", name: "São Paulo", country: "Brazil", lat: -23.5505, lon: -46.6333, span: 0.11, timezone: "America/Sao_Paulo", climate: "humid-subtropical" },
  { id: "rio-de-janeiro", name: "Rio de Janeiro", country: "Brazil", lat: -22.9068, lon: -43.1729, span: 0.09, timezone: "America/Sao_Paulo", climate: "tropical" },
  { id: "buenos-aires", name: "Buenos Aires", country: "Argentina", lat: -34.6037, lon: -58.3816, span: 0.1, timezone: "America/Argentina/Buenos_Aires", climate: "temperate" },
  { id: "santiago", name: "Santiago", country: "Chile", lat: -33.4489, lon: -70.6693, span: 0.1, timezone: "America/Santiago", climate: "mediterranean" },
  { id: "lima", name: "Lima", country: "Peru", lat: -12.0464, lon: -77.0428, span: 0.09, timezone: "America/Lima", climate: "arid" },
  { id: "bogota", name: "Bogotá", country: "Colombia", lat: 4.711, lon: -74.0721, span: 0.09, timezone: "America/Bogota", climate: "highland" },
  { id: "quito", name: "Quito", country: "Ecuador", lat: -0.1807, lon: -78.4678, span: 0.07, timezone: "America/Guayaquil", climate: "highland" },
  { id: "montevideo", name: "Montevideo", country: "Uruguay", lat: -34.9011, lon: -56.1645, span: 0.07, timezone: "America/Montevideo", climate: "temperate" },
  { id: "panama-city", name: "Panama City", country: "Panama", lat: 8.9824, lon: -79.5199, span: 0.07, timezone: "America/Panama", climate: "tropical" },
  { id: "havana", name: "Havana", country: "Cuba", lat: 23.1136, lon: -82.3666, span: 0.07, timezone: "America/Havana", climate: "tropical" },
  { id: "san-juan", name: "San Juan", country: "Puerto Rico", lat: 18.4655, lon: -66.1057, span: 0.06, timezone: "America/Puerto_Rico", climate: "tropical" },
  { id: "sydney", name: "Sydney", country: "Australia", lat: -33.8688, lon: 151.2093, span: 0.1, timezone: "Australia/Sydney", climate: "humid-subtropical" },
  { id: "melbourne", name: "Melbourne", country: "Australia", lat: -37.8136, lon: 144.9631, span: 0.1, timezone: "Australia/Melbourne", climate: "temperate" },
  { id: "brisbane", name: "Brisbane", country: "Australia", lat: -27.4698, lon: 153.0251, span: 0.09, timezone: "Australia/Brisbane", climate: "humid-subtropical" },
  { id: "perth", name: "Perth", country: "Australia", lat: -31.9505, lon: 115.8605, span: 0.09, timezone: "Australia/Perth", climate: "mediterranean" },
  { id: "adelaide", name: "Adelaide", country: "Australia", lat: -34.9285, lon: 138.6007, span: 0.08, timezone: "Australia/Adelaide", climate: "mediterranean" },
  { id: "auckland", name: "Auckland", country: "New Zealand", lat: -36.8485, lon: 174.7633, span: 0.08, timezone: "Pacific/Auckland", climate: "temperate" },
  { id: "wellington", name: "Wellington", country: "New Zealand", lat: -41.2866, lon: 174.7756, span: 0.06, timezone: "Pacific/Auckland", climate: "temperate" },
];

function makeCity(seed: CitySeed): City {
  const spanLat = seed.span ?? 0.08;
  const cosLat = Math.max(0.25, Math.cos((seed.lat * Math.PI) / 180));
  const spanLon = Math.min(0.28, spanLat / cosLat);
  return {
    id: seed.id,
    name: seed.name,
    country: seed.country,
    lat: seed.lat,
    lon: seed.lon,
    bbox: {
      minLat: seed.lat - spanLat,
      maxLat: seed.lat + spanLat,
      minLon: seed.lon - spanLon,
      maxLon: seed.lon + spanLon,
    },
    timezone: seed.timezone,
    climate: seed.climate,
  };
}

export const CITIES: City[] = CITY_SEEDS.map(makeCity);

const CITY_BY_ID = new Map(CITIES.map((city) => [city.id, city]));

export function getCity(id: string): City | undefined {
  return CITY_BY_ID.get(id);
}

export function findNearestCity(
  lat: number,
  lon: number,
): { city: City; distanceM: number } {
  let best = CITIES[0]!;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const city of CITIES) {
    const distance = haversineM(lat, lon, city.lat, city.lon);
    if (distance < bestDistance) {
      best = city;
      bestDistance = distance;
    }
  }
  return { city: best, distanceM: bestDistance };
}

export function climateForLatitude(lat: number): Climate {
  const absolute = Math.abs(lat);
  if (absolute < 13) return "tropical";
  if (absolute < 24) return "humid-subtropical";
  if (absolute < 35) return "mediterranean";
  if (absolute > 58) return "cold";
  return "temperate";
}
