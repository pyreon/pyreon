/**
 * The request pipeline in front of a zero page render — shared by the
 * production `createServer` AND the `vite dev` middleware, so a request sees
 * the same middleware in both. Before this module, dev dispatched only fs API
 * routes: server actions (`/_zero/actions/*`), the single-fetch data endpoint
 * (`/_pyreon/data`), server-island fragments, route middleware and the
 * entry's own `middleware` (security headers, auth) existed ONLY in
 * production.
 *
 * Kept free of the SSR handler / ISR / Vite so the dev server can load it
 * through its SSR module graph (`@pyreon/zero/pipeline`) without the rest of
 * the server package — and so the action / island registries it reads are
 * the same instances the user's route modules register into.
 */
import type { RouteRecord } from "@pyreon/router";
import type { Middleware, MiddlewareContext } from "@pyreon/server";
import type { CreateActionMiddlewareOptions } from "./actions";
import { createActionMiddleware, resolveActionOptions } from "./actions";
import { createFormActionMiddleware } from "./form-actions-server";
import type { ApiRouteEntry } from "./api-routes";
import { createApiMiddleware, matchApiRoute } from "./api-routes";
import { createDataEndpointMiddleware } from "./data-endpoint-middleware";
import { createServerIslandMiddleware } from "./server-islands-middleware";
import type { RouteMiddlewareEntry, ZeroConfig } from "./types";

export const DATA_ENDPOINT = "/_pyreon/data";

export interface RequestPipelineOptions {
	routes: RouteRecord[];
	config: ZeroConfig;
	/** The server entry's own middleware (`createServer({ middleware })`). */
	middleware?: Middleware[];
	routeMiddleware?: RouteMiddlewareEntry[];
	apiRoutes?: ApiRouteEntry[];
	actions?: CreateActionMiddlewareOptions | false;
	/**
	 * Renders a page for a no-JS action post's re-render (a synthetic GET).
	 * It must NOT run this pipeline again — the app and route middleware
	 * already ran for the POST — and must restore the POST's middleware
	 * results via `readCarriedActionState(req)` (production:
	 * `createActionRerenderMiddleware`; dev: the dev page renderer). Without
	 * it, page form posts still run their action but answer 303 back to the
	 * page (PRG) instead of re-rendering with the result.
	 */
	renderActionPage?: (req: Request) => Promise<Response>;
}

export interface RequestPipeline {
	/** Ordered middleware; the first to return a Response answers the request. */
	middleware: Middleware[];
	/** True for framework / API endpoints — never cached or relabeled as pages. */
	isEndpoint: (pathname: string) => boolean;
}

/**
 * Build the ordered middleware chain in front of the page render.
 *
 * Order is a security property. App-wide middleware (auth gates, rate
 * limits, CORS, security headers) and each route's own middleware run BEFORE
 * every framework endpoint. They used to run last, so API routes, server
 * actions, the data endpoint and island fragments all answered without any
 * of it — the documented `rateLimitMiddleware({ include: ['/api/*'] })` never
 * applied to /api, and route auth never protected loader data.
 */
export function createRequestPipeline(options: RequestPipelineOptions): RequestPipeline {
	const { config } = options;
	const middleware: Middleware[] = [...(config.middleware ?? []), ...(options.middleware ?? [])];
	if (options.routeMiddleware?.length) {
		middleware.push(createRouteMiddlewareDispatcher(options.routeMiddleware, config));
	}
	if (options.apiRoutes?.length) {
		middleware.push(createApiMiddleware(options.apiRoutes));
	}
	// Server-island fragments, the single-fetch data endpoint and server
	// actions are mounted UNCONDITIONALLY: their registries fill at route-
	// module evaluation, which is LAZY in zero — gating on registry size at
	// construction would miss everything declared in a route file. Unused,
	// each costs one path-prefix check.
	middleware.push(createServerIslandMiddleware(options.routes));
	middleware.push(createDataEndpointMiddleware(options.routes));
	if (options.actions !== false) {
		const resolvedActions = resolveActionOptions(
			typeof options.actions === "object" ? options.actions : undefined,
		);
		middleware.push(createActionMiddleware(resolvedActions));
		// Page form posts (`<Form>` without JS, a route's `action` export):
		// the SAME origin check + body limit, after every middleware above.
		middleware.push(
			createFormActionMiddleware({
				routes: options.routes,
				...(options.renderActionPage ? { render: options.renderActionPage } : {}),
				options: resolvedActions,
				base: config.base && config.base !== "/" ? trimTrailingSlashes(config.base) : "",
			}),
		);
	}

	const apiPatterns = (options.apiRoutes ?? []).map((r) => r.pattern);
	const isEndpoint = (pathname: string): boolean =>
		pathname.startsWith("/_pyreon/") ||
		pathname.startsWith("/_zero/") ||
		apiPatterns.some((p) => matchApiRoute(p, pathname) !== null);

	return { middleware, isEndpoint };
}

/**
 * What a request that no middleware answered gets when it is NOT a GET/HEAD:
 * the page renderer only renders HTML for GET/HEAD, so OPTIONS → 204 and any
 * other method → 405, both with `Allow`. Mirrors `@pyreon/server`'s handler
 * (PR-S6) byte for byte; zero's dev server uses it so a stray `POST /page`
 * gets the same answer in dev as in production. `undefined` for GET/HEAD.
 */
export function pageMethodResponse(method: string): Response | undefined {
	if (method === "GET" || method === "HEAD") return undefined;
	if (method === "OPTIONS") {
		return new Response(null, { status: 204, headers: { Allow: "GET, HEAD, OPTIONS" } });
	}
	return new Response(null, { status: 405, headers: { Allow: "GET, HEAD, OPTIONS" } });
}

/**
 * Run the chain: the first middleware returning a Response wins. A throwing
 * middleware is re-thrown to the caller (production answers 500; dev shows
 * the overlay).
 */
export async function runRequestPipeline(
	pipeline: RequestPipeline,
	ctx: MiddlewareContext,
): Promise<Response | undefined> {
	for (const mw of pipeline.middleware) {
		const result = await mw(ctx);
		if (result instanceof Response) return result;
	}
	return undefined;
}

/**
 * `base` without its trailing slashes. A loop, not `/\/+$/`: that regex backtracks
 * quadratically on a long run of `/`, and a linear strip costs nothing.
 */
export function trimTrailingSlashes(value: string): string {
	let end = value.length;
	while (end > 0 && value.charCodeAt(end - 1) === 47) end--;
	return value.slice(0, end);
}

/**
 * The path a request's route middleware must be matched against.
 *
 * - The PATHNAME, never `ctx.path`: that carries the query string, and a
 *   segment-exact match on it let `/admin?x=1` skip `/admin`'s middleware.
 * - For the single-fetch data endpoint, the TARGET page's path: the endpoint
 *   runs that page's serverLoaders, so it must be gated by that page's
 *   middleware — otherwise `/_pyreon/data?path=/admin` handed out data the
 *   `/admin` middleware refuses, on every client-side navigation.
 * - With `base` and i18n prefixes removed, because route patterns carry
 *   neither (`/app/de/admin` is the `/admin` route).
 */
export function routingPathname(url: URL, config: ZeroConfig): string {
	let pathname = url.pathname;
	if (pathname === DATA_ENDPOINT) {
		const target = url.searchParams.get("path");
		if (target && target.startsWith("/")) {
			pathname = new URL(target, "http://pyreon.invalid").pathname;
		}
	}
	const base = config.base && config.base !== "/" ? trimTrailingSlashes(config.base) : "";
	if (base) {
		if (pathname === base) pathname = "/";
		else if (pathname.startsWith(`${base}/`)) pathname = pathname.slice(base.length);
	}
	const locales = config.i18n?.locales;
	if (locales?.length) {
		const first = pathname.split("/")[1] ?? "";
		const hit = locales.find((l) => l.toLowerCase() === first.toLowerCase());
		if (hit) pathname = pathname.slice(first.length + 1) || "/";
	}
	return pathname;
}

/**
 * Create a middleware that dispatches per-route middleware based on URL pattern matching.
 */
export function createRouteMiddlewareDispatcher(
	entries: RouteMiddlewareEntry[],
	config: ZeroConfig,
): Middleware {
	return async (ctx: MiddlewareContext) => {
		const pathname = routingPathname(ctx.url, config);
		for (const entry of entries) {
			const hit = entry.patterns
				? entry.patterns.some((p) => matchPattern(p, pathname))
				: matchPattern(entry.pattern, pathname);
			if (hit) {
				const mw = Array.isArray(entry.middleware)
					? entry.middleware
					: [entry.middleware];
				for (const fn of mw) {
					const result = await fn(ctx);
					if (result) return result;
				}
			}
		}
	};
}

/**
 * URL pattern matcher supporting :param and :param* segments.
 *
 * Rules:
 * - Static segments must match exactly
 * - `:param` matches a single path segment
 * - `:param*` matches all remaining segments (must be last, and path must
 *   have matched all preceding segments)
 * - Path length must match pattern length (unless catch-all)
 */
export function matchPattern(pattern: string, path: string): boolean {
	const patternParts = pattern.split("/").filter(Boolean);
	const pathParts = path.split("/").filter(Boolean);

	for (let i = 0; i < patternParts.length; i++) {
		const pp = patternParts[i]!;

		// Catch-all: matches remaining segments, but only if we've matched
		// all preceding segments up to this point
		if (pp.endsWith("*")) {
			// All segments before the catch-all must have matched (we got here)
			// and there must be at least one remaining path segment
			return i <= pathParts.length;
		}

		// No more path segments to match against
		if (i >= pathParts.length) return false;

		// Dynamic segment matches any single segment
		if (pp.startsWith(":")) continue;

		// Static segment must match exactly
		if (pp !== pathParts[i]) return false;
	}

	// All pattern parts consumed — path must also be fully consumed
	return patternParts.length === pathParts.length;
}

export { readCarriedActionState } from "./form-actions-server";
