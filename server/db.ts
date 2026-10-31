import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  LabChecks,
  LabRun,
  LabRunStatus,
  LabRunSummary,
  LabScenarioSummary,
  RouteData,
  Scenario,
  ScenarioPayload,
} from "../shared/types";
import { config } from "./config";
import { CITIES } from "./cities";

if (config.dbPath !== ":memory:") {
  mkdirSync(dirname(config.dbPath), { recursive: true });
}

export const db = new Database(config.dbPath, { create: true });
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS cities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    country TEXT NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    bbox_json TEXT NOT NULL,
    timezone TEXT NOT NULL,
    climate TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS scenarios (
    id TEXT PRIMARY KEY,
    seed TEXT NOT NULL,
    city_id TEXT NOT NULL,
    city_name TEXT NOT NULL,
    country TEXT NOT NULL,
    center_lat REAL NOT NULL,
    center_lon REAL NOT NULL,
    timezone TEXT NOT NULL,
    climate TEXT NOT NULL,
    origin_json TEXT NOT NULL,
    destination_json TEXT NOT NULL,
    simulated_at_utc TEXT NOT NULL,
    simulated_at_local TEXT NOT NULL,
    weather_json TEXT NOT NULL,
    traffic_json TEXT NOT NULL,
    priority REAL NOT NULL,
    priority_label TEXT NOT NULL,
    route_provider TEXT NOT NULL,
    is_fallback INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS routes (
    id TEXT PRIMARY KEY,
    scenario_id TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    provider TEXT NOT NULL,
    distance_m REAL NOT NULL,
    duration_s REAL NOT NULL,
    adjusted_duration_s REAL NOT NULL,
    avg_speed_kph REAL NOT NULL,
    geometry_json TEXT NOT NULL,
    maneuvers_json TEXT NOT NULL,
    segments_json TEXT NOT NULL,
    safety_score REAL NOT NULL,
    efficiency_score REAL NOT NULL,
    overall_score REAL NOT NULL,
    safety_label TEXT NOT NULL,
    factors_json TEXT NOT NULL,
    top_risks_json TEXT NOT NULL,
    reasons_json TEXT NOT NULL,
    recommendation TEXT NOT NULL,
    is_safest INTEGER NOT NULL DEFAULT 0,
    is_fastest INTEGER NOT NULL DEFAULT 0,
    is_recommended INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_routes_scenario ON routes(scenario_id);

  CREATE TABLE IF NOT EXISTS map_cache (
    cache_key TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_map_cache_expiry ON map_cache(expires_at);

  CREATE TABLE IF NOT EXISTS lab_runs (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    requested_count INTEGER NOT NULL,
    completed_count INTEGER NOT NULL DEFAULT 0,
    checks_json TEXT NOT NULL,
    summaries_json TEXT NOT NULL,
    unique_places INTEGER NOT NULL DEFAULT 0,
    unique_weather INTEGER NOT NULL DEFAULT 0,
    all_checks_passed INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS lab_run_scenarios (
    run_id TEXT NOT NULL REFERENCES lab_runs(id) ON DELETE CASCADE,
    scenario_id TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL,
    PRIMARY KEY (run_id, scenario_id)
  );

  CREATE INDEX IF NOT EXISTS idx_lab_scenarios_run ON lab_run_scenarios(run_id);
`);

const seedCity = db.prepare(
  `INSERT INTO cities (id, name, country, lat, lon, bbox_json, timezone, climate)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(id) DO UPDATE SET
     name = excluded.name,
     country = excluded.country,
     lat = excluded.lat,
     lon = excluded.lon,
     bbox_json = excluded.bbox_json,
     timezone = excluded.timezone,
     climate = excluded.climate`,
);
for (const city of CITIES) {
  seedCity.run(
    city.id,
    city.name,
    city.country,
    city.lat,
    city.lon,
    JSON.stringify(city.bbox),
    city.timezone,
    city.climate,
  );
}

export interface CachedPayload {
  payload: unknown;
  fetchedAt: string;
  expiresAt: string;
}

export function getCache(key: string): CachedPayload | null {
  const row = db
    .query(
      `SELECT payload_json, fetched_at, expires_at FROM map_cache
       WHERE cache_key = ? AND expires_at > ?`,
    )
    .get(key, new Date().toISOString()) as
    | { payload_json: string; fetched_at: string; expires_at: string }
    | null;
  if (!row) return null;
  return {
    payload: JSON.parse(row.payload_json),
    fetchedAt: row.fetched_at,
    expiresAt: row.expires_at,
  };
}

export function getAnyCache(key: string): CachedPayload | null {
  const row = db
    .query(
      `SELECT payload_json, fetched_at, expires_at FROM map_cache
       WHERE cache_key = ?`,
    )
    .get(key) as
    | { payload_json: string; fetched_at: string; expires_at: string }
    | null;
  if (!row) return null;
  return {
    payload: JSON.parse(row.payload_json),
    fetchedAt: row.fetched_at,
    expiresAt: row.expires_at,
  };
}

export function setCache(
  key: string,
  provider: string,
  payload: unknown,
  ttlMs: number,
): void {
  const now = new Date();
  db.query(
    `INSERT INTO map_cache (cache_key, provider, payload_json, fetched_at, expires_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET
       payload_json = excluded.payload_json,
       fetched_at = excluded.fetched_at,
       expires_at = excluded.expires_at`,
  ).run(
    key,
    provider,
    JSON.stringify(payload),
    now.toISOString(),
    new Date(now.getTime() + ttlMs).toISOString(),
  );
}

export function saveScenario(
  scenario: Scenario,
  routes: RouteData[],
  recommendedRouteId: string,
): void {
  const insert = db.transaction(() => {
    db.query(
      `INSERT INTO scenarios (
        id, seed, city_id, city_name, country, center_lat, center_lon,
        timezone, climate, origin_json, destination_json, simulated_at_utc,
        simulated_at_local, weather_json, traffic_json, priority,
        priority_label, route_provider, is_fallback, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        priority = excluded.priority,
        priority_label = excluded.priority_label`,
    ).run(
      scenario.id,
      scenario.seed,
      scenario.cityId,
      scenario.cityName,
      scenario.country,
      scenario.centerLat,
      scenario.centerLon,
      scenario.timezone,
      scenario.climate,
      JSON.stringify(scenario.origin),
      JSON.stringify(scenario.destination),
      scenario.simulatedAtUtc,
      scenario.simulatedAtLocal,
      JSON.stringify(scenario.weather),
      JSON.stringify(scenario.traffic),
      scenario.priority,
      scenario.priorityLabel,
      scenario.routeProvider,
      scenario.isFallback ? 1 : 0,
      scenario.createdAt,
    );

    db.query("DELETE FROM routes WHERE scenario_id = ?").run(scenario.id);
    for (const route of routes) {
      db.query(
        `INSERT INTO routes (
          id, scenario_id, ordinal, name, kind, provider, distance_m,
          duration_s, adjusted_duration_s, avg_speed_kph, geometry_json,
          maneuvers_json, segments_json, safety_score, efficiency_score,
          overall_score, safety_label, factors_json, top_risks_json,
          reasons_json, recommendation, is_safest, is_fastest, is_recommended,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        route.id,
        scenario.id,
        route.ordinal,
        route.name,
        route.kind,
        route.provider,
        route.distanceM,
        route.durationS,
        route.adjustedDurationS,
        route.avgSpeedKph,
        JSON.stringify(route.geometry),
        JSON.stringify(route.maneuvers),
        JSON.stringify(route.segments),
        route.safetyScore,
        route.efficiencyScore,
        route.overallScore,
        route.safetyLabel,
        JSON.stringify(route.factors),
        JSON.stringify(route.topRisks),
        JSON.stringify(route.reasons),
        route.recommendation,
        route.isSafest ? 1 : 0,
        route.isFastest ? 1 : 0,
        route.isRecommended ? 1 : 0,
        scenario.createdAt,
      );
    }
    void recommendedRouteId;
  });
  insert();
}

interface ScenarioRow {
  id: string;
  seed: string;
  city_id: string;
  city_name: string;
  country: string;
  center_lat: number;
  center_lon: number;
  timezone: string;
  climate: Scenario["climate"];
  origin_json: string;
  destination_json: string;
  simulated_at_utc: string;
  simulated_at_local: string;
  weather_json: string;
  traffic_json: string;
  priority: number;
  priority_label: Scenario["priorityLabel"];
  route_provider: string;
  is_fallback: number;
  created_at: string;
}

interface RouteRow {
  id: string;
  ordinal: number;
  name: string;
  kind: RouteData["kind"];
  provider: string;
  distance_m: number;
  duration_s: number;
  adjusted_duration_s: number;
  avg_speed_kph: number;
  geometry_json: string;
  maneuvers_json: string;
  segments_json: string;
  safety_score: number;
  efficiency_score: number;
  overall_score: number;
  safety_label: RouteData["safetyLabel"];
  factors_json: string;
  top_risks_json: string;
  reasons_json: string;
  recommendation: string;
  is_safest: number;
  is_fastest: number;
  is_recommended: number;
}

function rowToScenario(row: ScenarioRow): Scenario {
  return {
    id: row.id,
    seed: row.seed,
    cityId: row.city_id,
    cityName: row.city_name,
    country: row.country,
    centerLat: row.center_lat,
    centerLon: row.center_lon,
    timezone: row.timezone,
    climate: row.climate,
    origin: JSON.parse(row.origin_json),
    destination: JSON.parse(row.destination_json),
    simulatedAtUtc: row.simulated_at_utc,
    simulatedAtLocal: row.simulated_at_local,
    weather: JSON.parse(row.weather_json),
    traffic: JSON.parse(row.traffic_json),
    priority: row.priority,
    priorityLabel: row.priority_label,
    routeProvider: row.route_provider,
    isFallback: Boolean(row.is_fallback),
    createdAt: row.created_at,
  };
}

function rowToRoute(row: RouteRow): RouteData {
  return {
    id: row.id,
    ordinal: row.ordinal,
    name: row.name,
    kind: row.kind,
    provider: row.provider,
    distanceM: row.distance_m,
    durationS: row.duration_s,
    adjustedDurationS: row.adjusted_duration_s,
    avgSpeedKph: row.avg_speed_kph,
    geometry: JSON.parse(row.geometry_json),
    maneuvers: JSON.parse(row.maneuvers_json),
    segments: JSON.parse(row.segments_json),
    safetyScore: row.safety_score,
    efficiencyScore: row.efficiency_score,
    overallScore: row.overall_score,
    safetyLabel: row.safety_label,
    factors: JSON.parse(row.factors_json),
    topRisks: JSON.parse(row.top_risks_json),
    reasons: JSON.parse(row.reasons_json),
    recommendation: row.recommendation,
    isSafest: Boolean(row.is_safest),
    isFastest: Boolean(row.is_fastest),
    isRecommended: Boolean(row.is_recommended),
  };
}

export function getScenarioPayload(id: string): ScenarioPayload | null {
  const scenarioRow = db
    .query("SELECT * FROM scenarios WHERE id = ?")
    .get(id) as ScenarioRow | null;
  if (!scenarioRow) return null;
  const routes = (
    db
      .query("SELECT * FROM routes WHERE scenario_id = ? ORDER BY ordinal")
      .all(id) as RouteRow[]
  ).map(rowToRoute);
  const scenario = rowToScenario(scenarioRow);
  const recommended = routes.find((route) => route.isRecommended) ?? routes[0];
  if (!recommended) return null;
  return {
    scenario,
    routes,
    recommendedRouteId: recommended.id,
    priority: scenario.priority,
    priorityLabel: scenario.priorityLabel,
    disclaimer:
      "Simulated weather, traffic and road conditions. Real OpenStreetMap geometry and routing. Not for real navigation.",
  };
}

export function updateRouteRanking(
  scenarioId: string,
  routes: RouteData[],
  recommendedRouteId: string,
  priority: number,
  priorityLabel: Scenario["priorityLabel"],
): void {
  const update = db.transaction(() => {
    db.query(
      "UPDATE scenarios SET priority = ?, priority_label = ? WHERE id = ?",
    ).run(priority, priorityLabel, scenarioId);
    for (const route of routes) {
      db.query(
        `UPDATE routes SET
          overall_score = ?, is_recommended = ?, is_safest = ?,
          is_fastest = ?, kind = ?, reasons_json = ?, recommendation = ?
         WHERE id = ? AND scenario_id = ?`,
      ).run(
        route.overallScore,
        route.id === recommendedRouteId ? 1 : 0,
        route.isSafest ? 1 : 0,
        route.isFastest ? 1 : 0,
        route.kind,
        JSON.stringify(route.reasons),
        route.recommendation,
        route.id,
        scenarioId,
      );
    }
  });
  update();
}

export function getRecentCityIds(limit = 4): string[] {
  const rows = db
    .query(
      "SELECT city_id FROM scenarios ORDER BY created_at DESC LIMIT ?",
    )
    .all(limit) as { city_id: string }[];
  return rows.map((row) => row.city_id);
}

export function getLatestScenarioId(): string | null {
  const row = db
    .query("SELECT id FROM scenarios ORDER BY created_at DESC LIMIT 1")
    .get() as { id: string } | null;
  return row?.id ?? null;
}

export function countScenarios(): number {
  const row = db
    .query("SELECT COUNT(*) AS count FROM scenarios")
    .get() as { count: number };
  return row.count;
}

export interface LabRunRecord {
  id: string;
  status: LabRunStatus;
  requested_count: number;
  completed_count: number;
  checks_json: string;
  summaries_json: string;
  unique_places: number;
  unique_weather: number;
  all_checks_passed: number;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export function createLabRun(
  id: string,
  requestedCount: number,
  now: string,
): void {
  db.query(
    `INSERT INTO lab_runs (
      id, status, requested_count, completed_count, checks_json,
      summaries_json, created_at
    ) VALUES (?, 'queued', ?, 0, ?, '[]', ?)`,
  ).run(
    id,
    requestedCount,
    JSON.stringify({
      uniquePlaces: false,
      uniqueWeather: false,
      uniqueTimes: false,
      uniqueSeeds: false,
      allRoutesScored: false,
      multiRouteScenarios: false,
    } satisfies LabChecks),
    now,
  );
}

export function updateLabRun(
  id: string,
  data: {
    status?: LabRunStatus;
    completedCount?: number;
    checks?: LabChecks;
    summaries?: LabScenarioSummary[];
    uniquePlaces?: number;
    uniqueWeather?: number;
    allChecksPassed?: boolean;
    error?: string | null;
    completedAt?: string | null;
  },
): void {
  const current = db
    .query("SELECT * FROM lab_runs WHERE id = ?")
    .get(id) as LabRunRecord | null;
  if (!current) return;
  const checks = data.checks ?? JSON.parse(current.checks_json);
  const summaries = data.summaries ?? JSON.parse(current.summaries_json);
  db.query(
    `UPDATE lab_runs SET
      status = ?, completed_count = ?, checks_json = ?, summaries_json = ?,
      unique_places = ?, unique_weather = ?, all_checks_passed = ?,
      error = ?, completed_at = ?
     WHERE id = ?`,
  ).run(
    data.status ?? current.status,
    data.completedCount ?? current.completed_count,
    JSON.stringify(checks),
    JSON.stringify(summaries),
    data.uniquePlaces ?? current.unique_places,
    data.uniqueWeather ?? current.unique_weather,
    data.allChecksPassed ?? Boolean(current.all_checks_passed) ? 1 : 0,
    data.error !== undefined ? data.error : current.error,
    data.completedAt !== undefined ? data.completedAt : current.completed_at,
    id,
  );
}

export function linkLabScenario(
  runId: string,
  scenarioId: string,
  ordinal: number,
): void {
  db.query(
    `INSERT OR REPLACE INTO lab_run_scenarios (run_id, scenario_id, ordinal)
     VALUES (?, ?, ?)`,
  ).run(runId, scenarioId, ordinal);
}

function rowToLabRun(row: LabRunRecord): LabRun {
  return {
    id: row.id,
    status: row.status,
    requestedCount: row.requested_count,
    completedCount: row.completed_count,
    checks: JSON.parse(row.checks_json),
    scenarios: JSON.parse(row.summaries_json),
    error: row.error,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

export function getLabRun(id: string): LabRun | null {
  const row = db
    .query("SELECT * FROM lab_runs WHERE id = ?")
    .get(id) as LabRunRecord | null;
  return row ? rowToLabRun(row) : null;
}

export function listLabRuns(limit = 8): LabRunSummary[] {
  const rows = db
    .query("SELECT * FROM lab_runs ORDER BY created_at DESC LIMIT ?")
    .all(limit) as LabRunRecord[];
  return rows.map((row) => {
    const checks = JSON.parse(row.checks_json) as LabChecks;
    const allChecksPassed = Object.values(checks).every(Boolean);
    return {
      id: row.id,
      status: row.status,
      requestedCount: row.requested_count,
      completedCount: row.completed_count,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      uniquePlaces: row.unique_places,
      uniqueWeather: row.unique_weather,
      allChecksPassed,
    };
  });
}

export function countMapCache(): number {
  const row = db.query("SELECT COUNT(*) AS count FROM map_cache").get() as {
    count: number;
  };
  return row.count;
}
