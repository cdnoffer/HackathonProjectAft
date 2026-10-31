/**
 * Cloudflare Worker entrypoint.
 *
 * This Worker serves the Vite build from ./dist and proxies `/api/*` to the
 * existing Bun/Hono backend. Cloudflare Workers cannot run `Bun.serve` or
 * `bun:sqlite`, so the API backend must be hosted separately (for example on
 * Render, Railway or Fly.io).
 *
 * Required Cloudflare variable:
 *   API_ORIGIN = https://your-routey-backend.example.com
 */

interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  ASSETS: AssetFetcher;
  API_ORIGIN?: string;
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const isApi = url.pathname === "/api" || url.pathname.startsWith("/api/");

    if (!isApi) {
      return env.ASSETS.fetch(request);
    }

    const origin = env.API_ORIGIN?.trim().replace(/\/+$/, "");
    if (!origin) {
      return jsonError(
        503,
        "backend_not_configured",
        "This Cloudflare Worker is serving the frontend, but API_ORIGIN is not set. Deploy the Bun backend and add API_ORIGIN in Cloudflare Worker settings.",
      );
    }

    let target: URL;
    try {
      target = new URL(url.pathname + url.search, `${origin}/`);
    } catch {
      return jsonError(
        503,
        "backend_not_configured",
        "API_ORIGIN is not a valid backend URL.",
      );
    }

    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.set("x-forwarded-host", url.host);
    headers.set("x-forwarded-proto", url.protocol.replace(":", ""));

    const init: RequestInit = {
      method: request.method,
      headers,
      redirect: "manual",
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = request.body;
    }

    try {
      const response = await fetch(target.toString(), init);
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set("cache-control", "no-store");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch {
      return jsonError(
        502,
        "backend_unreachable",
        "The Routey backend could not be reached. Check API_ORIGIN and that the backend is running.",
      );
    }
  },
};
