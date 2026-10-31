import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { z } from "zod";
import { resolve, sep } from "node:path";
import { existsSync, statSync } from "node:fs";
import type { Place } from "../shared/types";
import { CITIES } from "./cities";
import { config, DISCLAIMER } from "./config";
import {
  countMapCache,
  countScenarios,
  getLabRun,
  getLatestScenarioId,
  getScenarioPayload,
  listLabRuns,
} from "./db";
import { reversePlace, searchPlaces } from "./geocode";
import { startLabRun, LAB_MAX_COUNT } from "./lab";
import { explainRoute, llmConfigured } from "./llm";
import {
  generateCustomScenarioWithLabels,
  generateRandomScenario,
  rerankScenario,
} from "./simulate";

export const app = new Hono();

app.use("*", logger());
app.use("*", secureHeaders());
app.use("/api/*", cors({ origin: "*" }));
app.use("/api/*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
});

function apiError(c: Context, error: unknown) {
  const message =
    error instanceof Error ? error.message : "Unexpected server error";
  console.error("[api]", error);
  const isInputError =
    /^(Unknown city|Invalid simulatedAt|Choose two points|Custom routes|Origin and destination)/.test(
      message,
    );
  return c.json(
    {
      error: isInputError ? "invalid_input" : "upstream_error",
      message:
        isInputError || !config.isProduction
          ? message
          : "The live routing or geocoding provider could not complete this request. Please try again.",
    },
    isInputError ? 400 : 503,
  );
}

const randomSchema = z
  .object({
    seed: z.string().min(4).max(80).optional(),
    cityId: z.string().min(1).max(80).optional(),
    priority: z.number().min(0).max(1).optional(),
    simulatedAt: z.string().max(80).optional(),
  })
  .strict();

const placeSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  label: z.string().max(400).optional(),
});

const customSchema = z
  .object({
    origin: placeSchema,
    destination: placeSchema,
    priority: z.number().min(0).max(1).optional(),
    seed: z.string().min(4).max(80).optional(),
    simulatedAt: z.string().max(80).optional(),
  })
  .strict();

const rankSchema = z
  .object({
    priority: z.number().min(0).max(1),
  })
  .strict();

const explainSchema = z
  .object({
    scenarioId: z.string().min(1).max(80),
    routeId: z.string().min(1).max(120),
    priority: z.number().min(0).max(1).optional(),
  })
  .strict();

const labSchema = z
  .object({
    count: z.number().int().min(1).max(LAB_MAX_COUNT),
    priority: z.number().min(0).max(1).optional(),
  })
  .strict();

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    version: config.version,
    scenarios: countScenarios(),
    cachedMapResponses: countMapCache(),
    llmConfigured: llmConfigured(),
    router: "OSM + Valhalla",
    uptimeSeconds: Math.round(process.uptime()),
  }),
);

app.get("/api/config", (c) =>
  c.json({
    version: config.version,
    router: "OSM + Valhalla",
    llmConfigured: llmConfigured(),
    llmModel: config.llmModel,
    tileProvider: "OpenStreetMap",
    disclaimer: DISCLAIMER,
  }),
);

app.get("/api/cities", (c) => c.json({ cities: CITIES }));

app.get("/api/scenarios/latest", (c) => {
  const id = getLatestScenarioId();
  if (!id) return c.json({ error: "not_found", message: "No scenarios yet" }, 404);
  const payload = getScenarioPayload(id);
  if (!payload) return c.json({ error: "not_found", message: "Scenario missing" }, 404);
  return c.json(payload);
});

app.get("/api/scenarios/:id", (c) => {
  const payload = getScenarioPayload(c.req.param("id"));
  if (!payload) {
    return c.json({ error: "not_found", message: "Scenario not found" }, 404);
  }
  return c.json(payload);
});

app.post("/api/scenarios/random", async (c) => {
  const raw = await c.req.json().catch(() => ({}));
  const parsed = randomSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: parsed.error.issues[0]?.message ?? "Invalid request" },
      400,
    );
  }
  try {
    const payload = await generateRandomScenario(parsed.data);
    return c.json(payload, 201);
  } catch (error) {
    return apiError(c, error);
  }
});

app.post("/api/scenarios/custom", async (c) => {
  const raw = await c.req.json().catch(() => ({}));
  const parsed = customSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: parsed.error.issues[0]?.message ?? "Invalid request" },
      400,
    );
  }
  try {
    const origin: Place = {
      lat: parsed.data.origin.lat,
      lon: parsed.data.origin.lon,
      label: parsed.data.origin.label ?? "Origin",
    };
    const destination: Place = {
      lat: parsed.data.destination.lat,
      lon: parsed.data.destination.lon,
      label: parsed.data.destination.label ?? "Destination",
    };
    const payload = await generateCustomScenarioWithLabels(
      origin,
      destination,
      parsed.data.priority ?? 0.8,
    );
    return c.json(payload, 201);
  } catch (error) {
    return apiError(c, error);
  }
});

app.post("/api/scenarios/:id/rank", async (c) => {
  const raw = await c.req.json().catch(() => ({}));
  const parsed = rankSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: "priority must be between 0 and 1" },
      400,
    );
  }
  const payload = getScenarioPayload(c.req.param("id"));
  if (!payload) {
    return c.json({ error: "not_found", message: "Scenario not found" }, 404);
  }
  try {
    return c.json(rerankScenario(payload, parsed.data.priority));
  } catch (error) {
    return apiError(c, error);
  }
});

app.get("/api/geocode/search", async (c) => {
  const query = (c.req.query("q") ?? "").trim();
  if (query.length < 2) {
    return c.json({ results: [] });
  }
  try {
    const results = await searchPlaces(query);
    return c.json({ results });
  } catch (error) {
    return apiError(c, error);
  }
});

app.get("/api/geocode/reverse", async (c) => {
  const schema = z.object({
    lat: z.coerce.number().min(-90).max(90),
    lon: z.coerce.number().min(-180).max(180),
  });
  const parsed = schema.safeParse({
    lat: c.req.query("lat"),
    lon: c.req.query("lon"),
  });
  if (!parsed.success) {
    return c.json({ error: "invalid_input", message: "Valid lat/lon required" }, 400);
  }
  try {
    return c.json({ place: await reversePlace(parsed.data.lat, parsed.data.lon) });
  } catch (error) {
    return apiError(c, error);
  }
});

app.post("/api/ai/explain", async (c) => {
  const raw = await c.req.json().catch(() => ({}));
  const parsed = explainSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", message: "scenarioId and routeId required" }, 400);
  }
  const payload = getScenarioPayload(parsed.data.scenarioId);
  if (!payload) {
    return c.json({ error: "not_found", message: "Scenario not found" }, 404);
  }
  const route = payload.routes.find((item) => item.id === parsed.data.routeId);
  if (!route) {
    return c.json({ error: "not_found", message: "Route not found" }, 404);
  }
  try {
    const explanation = await explainRoute(
      payload,
      route,
      parsed.data.priority ?? payload.priority,
    );
    return c.json({ explanation });
  } catch (error) {
    return apiError(c, error);
  }
});

app.get("/api/lab/runs", (c) => {
  const limit = Math.min(20, Math.max(1, Number(c.req.query("limit") ?? 8)));
  return c.json({ runs: listLabRuns(limit), maxCount: LAB_MAX_COUNT });
});

app.get("/api/lab/runs/:id", (c) => {
  const run = getLabRun(c.req.param("id"));
  if (!run) {
    return c.json({ error: "not_found", message: "Lab run not found" }, 404);
  }
  return c.json(run);
});

app.post("/api/lab/runs", async (c) => {
  const raw = await c.req.json().catch(() => ({}));
  const parsed = labSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        message: `count must be an integer between 1 and ${LAB_MAX_COUNT}`,
      },
      400,
    );
  }
  try {
    const runId = startLabRun(parsed.data.count, parsed.data.priority ?? 0.8);
    return c.json({ runId, run: getLabRun(runId) }, 202);
  } catch (error) {
    return apiError(c, error);
  }
});

app.all("/api/*", (c) =>
  c.json({ error: "not_found", message: "API endpoint not found" }, 404),
);

function serveStatic(pathname: string): Response | null {
  if (!existsSync(config.distDir)) return null;
  const normalized = pathname === "/" ? "/index.html" : pathname;
  const candidate = resolve(config.distDir, `.${normalized}`);
  const distPrefix = config.distDir.endsWith(sep)
    ? config.distDir
    : `${config.distDir}${sep}`;
  if (candidate !== config.distDir && !candidate.startsWith(distPrefix)) {
    return new Response("Forbidden", { status: 403 });
  }
  let target = candidate;
  if (!existsSync(target) || !statSync(target).isFile()) {
    target = resolve(config.distDir, "index.html");
  }
  if (!existsSync(target)) return null;
  const file = Bun.file(target);
  const headers: Record<string, string> = {};
  if (target.endsWith("index.html")) {
    headers["Cache-Control"] = "no-cache";
  } else {
    headers["Cache-Control"] = "public, max-age=31536000, immutable";
  }
  return new Response(file, { headers });
}

app.get("*", (c) => {
  const staticResponse = serveStatic(c.req.path);
  if (staticResponse) return staticResponse;
  return c.json(
    {
      name: "Routey API",
      version: config.version,
      message:
        "Frontend build not found. Run `bun run dev` for the Vite client or `bun run build` to serve the production site.",
    },
    200,
  );
});

app.onError((error, c) => apiError(c, error));

if (import.meta.main) {
  const server = Bun.serve({
    port: config.port,
    fetch: app.fetch,
    idleTimeout: 60,
  });
  console.log(`Routey API listening on http://localhost:${server.port}`);
  console.log(`SQLite: ${config.dbPath}`);
  console.log(
    `LLM explanations: ${llmConfigured() ? `enabled (${config.llmModel})` : "local fallback"}`,
  );
}
