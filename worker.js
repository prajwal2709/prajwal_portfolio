import {
  onRequest as presenceRequest,
  onRequestPost as presencePost,
} from "./functions/api/presence.js";
import {
  onRequest as appreciationRequest,
  onRequestPost as appreciationPost,
} from "./functions/api/appreciation.js";

const apiRoutes = new Map([
  ["/api/presence", { get: presenceRequest, post: presencePost }],
  ["/api/appreciation", { get: appreciationRequest, post: appreciationPost }],
]);

const allowedOrigins = new Set([
  "https://prajwal2709.github.io",
  "https://prajwal-portfolio.pd613868.workers.dev",
]);

function withCors(response, origin) {
  const headers = new Headers(response.headers);
  const vary = new Set((headers.get("Vary") || "").split(",").map((value) => value.trim()).filter(Boolean));
  vary.add("Origin");
  headers.set("Vary", [...vary].join(", "));

  if (allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonError(message, status) {
  return Response.json({ error: message }, { status });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/favicon.ico") {
      url.pathname = "/favicon.svg";
      return env.ASSETS.fetch(new Request(url, request));
    }

    const isApiPath = url.pathname === "/api" || url.pathname.startsWith("/api/");
    if (isApiPath) {
      const origin = request.headers.get("Origin");
      if (origin && !allowedOrigins.has(origin)) {
        return withCors(jsonError("Origin not allowed.", 403), null);
      }

      if (request.method === "OPTIONS") {
        if (!allowedOrigins.has(origin)) {
          return withCors(jsonError("Origin not allowed.", 403), null);
        }
        const requestedMethod = request.headers.get("Access-Control-Request-Method");
        const requestedHeaders = (request.headers.get("Access-Control-Request-Headers") || "")
          .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
        if ((requestedMethod && requestedMethod.toUpperCase() !== "POST") ||
            requestedHeaders.some((header) => header !== "content-type")) {
          return withCors(jsonError("Preflight request is not allowed.", 405), origin);
        }
        return withCors(new Response(null, { status: 204 }), origin);
      }

      const route = apiRoutes.get(url.pathname);
      if (!route) return withCors(jsonError("Not found.", 404), origin);
      const handler = route[request.method.toLowerCase()];
      if (!handler) return withCors(jsonError("Method not allowed.", 405), origin);
      try {
        return withCors(await handler({ request, env }), origin);
      } catch {
        return withCors(jsonError("Internal server error.", 500), origin);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
