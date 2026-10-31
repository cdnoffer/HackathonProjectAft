import type {
  AiExplanation,
  RouteData,
  ScenarioPayload,
} from "../shared/types";
import { WEATHER_LABELS, formatDuration, formatDistance } from "../shared/labels";
import { config } from "./config";

export function llmConfigured(): boolean {
  return Boolean(config.llmApiKey);
}

function localExplanation(route: RouteData): string {
  const context = route.reasons.slice(0, 2).join(" ");
  return `${context} ${route.recommendation}`.trim();
}

export async function explainRoute(
  payload: ScenarioPayload,
  route: RouteData,
  priority: number,
): Promise<AiExplanation> {
  if (!config.llmApiKey) {
    return {
      text: localExplanation(route),
      enhanced: false,
      model: null,
    };
  }

  const scenario = payload.scenario;
  const compact = {
    city: scenario.cityName,
    country: scenario.country,
    localTime: scenario.simulatedAtLocal,
    priorityPercent: Math.round(priority * 100),
    weather: {
      condition: WEATHER_LABELS[scenario.weather.condition],
      temperatureC: scenario.weather.temperatureC,
      precipitationMmH: scenario.weather.precipitationMmH,
      visibilityKm: scenario.weather.visibilityKm,
      windKph: scenario.weather.windKph,
      roadState: scenario.weather.roadState,
      phase: scenario.weather.phase,
    },
    traffic: {
      level: scenario.traffic.level,
      congestionPct: scenario.traffic.congestionPct,
    },
    route: {
      name: route.name,
      safetyScore: route.safetyScore,
      safetyLabel: route.safetyLabel,
      efficiencyScore: route.efficiencyScore,
      overallScore: route.overallScore,
      eta: formatDuration(route.adjustedDurationS),
      distance: formatDistance(route.distanceM),
      factors: route.factors.map((factor) => ({
        factor: factor.label,
        risk: factor.risk,
        detail: factor.description,
      })),
      topRisks: route.topRisks,
      localReasons: route.reasons,
      isRecommended: route.isRecommended,
      isSafest: route.isSafest,
      isFastest: route.isFastest,
    },
    otherRoutes: payload.routes
      .filter((item) => item.id !== route.id)
      .map((item) => ({
        name: item.name,
        safetyScore: item.safetyScore,
        eta: formatDuration(item.adjustedDurationS),
        isRecommended: item.isRecommended,
      })),
    disclaimer: payload.disclaimer,
  };

  try {
    const endpoint = `${config.llmBaseUrl.replace(/\/$/, "")}/chat/completions`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.llmApiKey}`,
        "HTTP-Referer": "https://github.com/cdnoffer/HackathonProjectAft",
        "X-Title": "Routey",
      },
      body: JSON.stringify({
        model: config.llmModel,
        temperature: 0.35,
        max_tokens: 320,
        messages: [
          {
            role: "system",
            content:
              "You are Routey's explanation layer. The safety score has already been decided by Routey's local explainable risk engine. Never change or invent scores. Use only the provided data, say that conditions are simulated, and write 3-4 concise sentences explaining the recommendation, the main risk, and the safety-versus-time trade-off. Do not claim real-world conditions. Avoid bullet points.",
          },
          {
            role: "user",
            content: JSON.stringify(compact),
          },
        ],
      }),
      signal: AbortSignal.timeout(28_000),
    });
    if (!response.ok) throw new Error(`LLM responded ${response.status}`);
    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("LLM returned an empty explanation");
    return {
      text: text.slice(0, 1_800),
      enhanced: true,
      model: config.llmModel,
    };
  } catch {
    return {
      text: localExplanation(route),
      enhanced: false,
      model: null,
    };
  }
}
