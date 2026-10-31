import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const VERSION = "1.0.0";

function env(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

function resolveDbPath(): string {
  const raw = env("ROUTEY_DB", "data/routey.db");
  return isAbsolute(raw) ? raw : join(ROOT_DIR, raw);
}

export const config = {
  port: Number(env("PORT", "8787")),
  dbPath: resolveDbPath(),
  valhallaUrl: env(
    "VALHALLA_URL",
    "https://valhalla1.openstreetmap.de/route",
  ),
  nominatimUserAgent: env(
    "NOMINATIM_USER_AGENT",
    "Routey/1.0 (local road-safety simulation demo)",
  ),
  nominatimEmail: env("NOMINATIM_EMAIL"),
  llmApiKey: env("LLM_API_KEY"),
  llmBaseUrl: env("LLM_BASE_URL", "https://openrouter.ai/api/v1"),
  llmModel: env("LLM_MODEL", "deepseek/deepseek-chat"),
  isProduction: env("NODE_ENV") === "production",
  distDir: join(ROOT_DIR, "dist"),
  version: VERSION,
} as const;

export const DISCLAIMER =
  "Routey is a simulation and research demo. Weather, traffic, road-surface and road-condition data are simulated. Map geometry and routing are live OpenStreetMap data. Never use Routey for real navigation or safety decisions.";
