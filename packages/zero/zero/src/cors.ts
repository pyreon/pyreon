import type { Middleware, MiddlewareContext } from "@pyreon/server";

// ─── CORS middleware ────────────────────────────────────────────────────────

export interface CorsConfig {
  /** Allowed origins. Use `"*"` for any origin. Default: `"*"` */
  origin?: string | string[] | ((origin: string) => boolean);
  /** Allowed HTTP methods. Default: `["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]` */
  methods?: string[];
  /** Allowed request headers. Default: `["Content-Type", "Authorization"]` */
  allowedHeaders?: string[];
  /** Headers exposed to the client. Default: `[]` */
  exposedHeaders?: string[];
  /** Allow credentials (cookies, auth headers). Default: `false` */
  credentials?: boolean;
  /** Preflight cache duration in seconds. Default: `86400` (24 hours) */
  maxAge?: number;
}

const DEFAULT_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
const DEFAULT_HEADERS = ["Content-Type", "Authorization"];

/**
 * CORS middleware — handles preflight requests and sets appropriate
 * Access-Control headers on all responses.
 *
 * @example
 * import { corsMiddleware } from "@pyreon/zero/cors"
 *
 * corsMiddleware({ origin: "https://example.com", credentials: true })
 *
 * // Allow any origin
 * corsMiddleware({ origin: "*" })
 *
 * // Multiple origins
 * corsMiddleware({ origin: ["https://app.com", "https://admin.com"] })
 */
export function corsMiddleware(config: CorsConfig = {}): Middleware {
  const {
    origin = "*",
    methods = DEFAULT_METHODS,
    allowedHeaders = DEFAULT_HEADERS,
    exposedHeaders = [],
    credentials = false,
    maxAge = 86400,
  } = config;

  return (ctx: MiddlewareContext) => {
    const requestOrigin = ctx.req.headers.get("origin") ?? "";
    const resolvedOrigin = resolveOrigin(origin, requestOrigin);

    if (!resolvedOrigin) return;

    // Set CORS headers on all responses
    ctx.headers.set("Access-Control-Allow-Origin", resolvedOrigin);
    if (credentials) {
      ctx.headers.set("Access-Control-Allow-Credentials", "true");
    }
    if (exposedHeaders.length > 0) {
      ctx.headers.set("Access-Control-Expose-Headers", exposedHeaders.join(", "));
    }
    if (resolvedOrigin !== "*") {
      ctx.headers.append("Vary", "Origin");
    }

    // Handle preflight
    if (ctx.req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": resolvedOrigin,
          "Access-Control-Allow-Methods": methods.join(", "),
          "Access-Control-Allow-Headers": allowedHeaders.join(", "),
          "Access-Control-Max-Age": String(maxAge),
          ...(credentials ? { "Access-Control-Allow-Credentials": "true" } : {}),
        },
      });
    }
  };
}

function resolveOrigin(config: CorsConfig["origin"], requestOrigin: string): string | null {
  if (config === "*") return "*";
  if (typeof config === "string") {
    return config === requestOrigin ? config : null;
  }
  if (typeof config === "function") {
    return config(requestOrigin) ? requestOrigin : null;
  }
  if (Array.isArray(config)) {
    return config.includes(requestOrigin) ? requestOrigin : null;
  }
  return null;
}
