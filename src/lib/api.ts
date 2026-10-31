import type {
  AiExplanation,
  ConfigPayload,
  GeocodeResult,
  LabRun,
  LabRunSummary,
  ScenarioPayload,
} from "../../shared/types";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code = "request_failed") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    signal,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message =
      data &&
      typeof data === "object" &&
      "message" in data &&
      typeof (data as { message: unknown }).message === "string"
        ? (data as { message: string }).message
        : `Request failed (${response.status})`;
    const code =
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : "request_failed";
    throw new ApiError(message, response.status, code);
  }
  return data as T;
}

export const api = {
  getConfig(): Promise<ConfigPayload> {
    return request<ConfigPayload>("/api/config");
  },

  getLatestScenario(): Promise<ScenarioPayload> {
    return request<ScenarioPayload>("/api/scenarios/latest");
  },

  getScenario(id: string): Promise<ScenarioPayload> {
    return request<ScenarioPayload>(`/api/scenarios/${encodeURIComponent(id)}`);
  },

  randomScenario(options: {
    cityId?: string;
    priority?: number;
    seed?: string;
  } = {}): Promise<ScenarioPayload> {
    return request<ScenarioPayload>("/api/scenarios/random", {
      method: "POST",
      body: JSON.stringify(options),
    });
  },

  customScenario(
    origin: { lat: number; lon: number; label: string },
    destination: { lat: number; lon: number; label: string },
    priority: number,
  ): Promise<ScenarioPayload> {
    return request<ScenarioPayload>("/api/scenarios/custom", {
      method: "POST",
      body: JSON.stringify({ origin, destination, priority }),
    });
  },

  rankScenario(
    scenarioId: string,
    priority: number,
  ): Promise<ScenarioPayload> {
    return request<ScenarioPayload>(
      `/api/scenarios/${encodeURIComponent(scenarioId)}/rank`,
      {
        method: "POST",
        body: JSON.stringify({ priority }),
      },
    );
  },

  searchPlaces(query: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
    return request<{ results: GeocodeResult[] }>(
      `/api/geocode/search?q=${encodeURIComponent(query)}`,
      undefined,
      signal,
    ).then((data) => data.results);
  },

  reversePlace(lat: number, lon: number): Promise<GeocodeResult> {
    return request<{ place: GeocodeResult }>(
      `/api/geocode/reverse?lat=${lat}&lon=${lon}`,
    ).then((data) => data.place);
  },

  explain(
    scenarioId: string,
    routeId: string,
    priority: number,
  ): Promise<AiExplanation> {
    return request<{ explanation: AiExplanation }>("/api/ai/explain", {
      method: "POST",
      body: JSON.stringify({ scenarioId, routeId, priority }),
    }).then((data) => data.explanation);
  },

  startLabRun(count: number, priority: number): Promise<{ runId: string; run: LabRun }> {
    return request<{ runId: string; run: LabRun }>("/api/lab/runs", {
      method: "POST",
      body: JSON.stringify({ count, priority }),
    });
  },

  getLabRun(runId: string): Promise<LabRun> {
    return request<LabRun>(`/api/lab/runs/${encodeURIComponent(runId)}`);
  },

  listLabRuns(): Promise<{ runs: LabRunSummary[]; maxCount: number }> {
    return request<{ runs: LabRunSummary[]; maxCount: number }>(
      "/api/lab/runs?limit=8",
    );
  },
};
