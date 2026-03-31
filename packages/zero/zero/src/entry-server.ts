import type { ComponentFn } from "@pyreon/core";
import type { RouteRecord } from "@pyreon/router";
import type { Middleware, MiddlewareContext } from "@pyreon/server";
import { createHandler } from "@pyreon/server";
import type { ApiRouteEntry } from "./api-routes";
import { createApiMiddleware } from "./api-routes";
import { createApp } from "./app";
import { render404Page } from "./not-found";
import type { RouteMiddlewareEntry, ZeroConfig } from "./types";

// ─── Server entry factory ───────────────────────────────────────────────────

export interface CreateServerOptions {
	/** Route definitions. */
	routes: RouteRecord[];
	/** Zero config. */
	config?: ZeroConfig;
	/** Additional middleware. */
	middleware?: Middleware[];
	/** Per-route middleware from virtual:zero/route-middleware. */
	routeMiddleware?: RouteMiddlewareEntry[];
	/** API route entries from virtual:zero/api-routes. */
	apiRoutes?: ApiRouteEntry[];
	/** HTML template override. */
	template?: string;
	/** Client entry path. */
	clientEntry?: string;
	/** Component to render when no route matches (from _404.tsx). */
	notFoundComponent?: ComponentFn;
}

/**
 * Create a middleware that dispatches per-route middleware based on URL pattern matching.
 */
function createRouteMiddlewareDispatcher(
	entries: RouteMiddlewareEntry[],
): Middleware {
	return async (ctx: MiddlewareContext) => {
		for (const entry of entries) {
			if (matchPattern(entry.pattern, ctx.path)) {
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

/** Simple URL pattern matcher supporting :param and :param* segments. */
export function matchPattern(pattern: string, path: string): boolean {
	const patternParts = pattern.split("/").filter(Boolean);
	const pathParts = path.split("/").filter(Boolean);

	for (let i = 0; i < patternParts.length; i++) {
		const pp = patternParts[i];
		if (!pp) continue;
		if (pp.endsWith("*")) return true; // catch-all matches everything after
		if (pp.startsWith(":")) continue; // dynamic segment matches anything
		if (pp !== pathParts[i]) return false;
	}

	return patternParts.length === pathParts.length;
}

/**
 * Create the SSR request handler for production.
 *
 * @example
 * import { routes } from "virtual:zero/routes"
 * import { routeMiddleware } from "virtual:zero/route-middleware"
 * import { createServer } from "@pyreon/zero"
 *
 * export default createServer({ routes, routeMiddleware, apiRoutes })
 */
export function createServer(options: CreateServerOptions) {
	const config = options.config ?? {};

	const allMiddleware: Middleware[] = [];

	// API routes run first — they short-circuit before SSR
	if (options.apiRoutes?.length) {
		allMiddleware.push(createApiMiddleware(options.apiRoutes));
	}

	// Per-route middleware runs next
	if (options.routeMiddleware?.length) {
		allMiddleware.push(
			createRouteMiddlewareDispatcher(options.routeMiddleware),
		);
	}

	// Then global middleware from config and options
	allMiddleware.push(...(config.middleware ?? []));
	allMiddleware.push(...(options.middleware ?? []));

	const { App } = createApp({
		routes: options.routes,
		routerMode: "history",
	});

	const handler = createHandler({
		App,
		routes: options.routes,
		middleware: allMiddleware,
		mode: config.ssr?.mode ?? "string",
		...(options.template ? { template: options.template } : {}),
		...(options.clientEntry ? { clientEntry: options.clientEntry } : {}),
	});

	// Wrap handler with 404 detection when a notFoundComponent is provided
	if (!options.notFoundComponent) return handler;

	const NotFound = options.notFoundComponent;
	const routePatterns = flattenRoutePatterns(options.routes);

	return async (req: Request) => {
		const url = new URL(req.url);
		const pathname = url.pathname;

		// Check if any defined route matches this path
		if (!routePatterns.some((pattern) => matchPattern(pattern, pathname))) {
			const fullHtml = await render404Page(NotFound, options.template);
			return new Response(fullHtml, {
				status: 404,
				headers: { "Content-Type": "text/html; charset=utf-8" },
			});
		}

		return handler(req);
	};
}

/** Extract all URL patterns from a nested route tree. */
function flattenRoutePatterns(routes: RouteRecord[], prefix = ""): string[] {
	const patterns: string[] = [];
	for (const route of routes) {
		const fullPath =
			route.path === "/" && prefix ? prefix : `${prefix}${route.path}`;
		patterns.push(fullPath);
		if (route.children) {
			patterns.push(
				...flattenRoutePatterns(route.children as RouteRecord[], fullPath),
			);
		}
	}
	return patterns;
}
