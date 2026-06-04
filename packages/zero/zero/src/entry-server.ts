import { readFileSync } from "node:fs";
import type { ComponentFn } from "@pyreon/core";
import type { RouteRecord } from "@pyreon/router";
import type { Middleware, MiddlewareContext } from "@pyreon/server";
import { createHandler } from "@pyreon/server";
import type { CreateActionMiddlewareOptions } from "./actions";
import { createActionMiddleware, getRegisteredActions } from "./actions";
import type { ApiRouteEntry } from "./api-routes";
import { createApiMiddleware } from "./api-routes";
import { createApp } from "./app";
import { createISRHandler } from "./isr";
import { render404Page } from "./not-found";
import type { RenderMode, RouteMiddlewareEntry, ZeroConfig } from "./types";

// PR-S5: drift gate. Every value in `RenderMode` must have an
// explicit case in `wireRenderMode()` below. Adding `'edge'` to
// `RenderMode` without a case here will fail typecheck on the
// `_unreachable` assertion — catches the typed-but-unimplemented bug
// class (D) at compile time. The test
// `entry-server.test.ts:exhaustive RenderMode handling` is the runtime
// regression lock for the same gate.
type _AssertExhaustive<T extends never> = T;

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
	/**
	 * HTML template override (must contain the `<!--pyreon-app-->` /
	 * `<!--pyreon-head-->` / `<!--pyreon-scripts-->` placeholders).
	 *
	 * When omitted AND `clientEntry` is also omitted, `createServer`
	 * auto-loads the built `dist/server/template.html` staged by the SSR
	 * plugin (which carries the hashed client `<script>`) and sets
	 * `clientEntry: false`. If you pass a BUILT template here that already
	 * references the hashed entry, pair it with `clientEntry: false` so the
	 * handler doesn't inject a second (dev) client script.
	 */
	template?: string;
	/**
	 * Client entry path (default `/src/entry-client.ts`). Pass `false` to
	 * suppress the client-entry `<script>` entirely — use this when `template`
	 * already carries the production hashed module script.
	 */
	clientEntry?: string | false;
	/** Component to render when no route matches (from _404.tsx). */
	notFoundComponent?: ComponentFn;
	/**
	 * Options forwarded to the auto-wired `createActionMiddleware`.
	 *
	 * PR-S2: `createServer` auto-wires server actions whenever any
	 * `defineAction()` call has registered (detected via the module-level
	 * registry). Use `actions: { corsOrigins: [...] }` to opt in to
	 * cross-origin POSTs to `/_zero/actions/*`; without it, cross-origin
	 * POSTs are rejected with HTTP 403 (CSRF baseline).
	 *
	 * Pass `actions: false` to disable the auto-wire entirely (e.g. when
	 * mounting the middleware manually elsewhere in the chain).
	 */
	actions?: CreateActionMiddlewareOptions | false;
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

/**
 * Read the production SSR template — a `template.html` sibling of this server
 * bundle, copied from the built client `index.html` by the SSR build
 * (`ssr-plugin.ts`). Returns `undefined` when absent (dev / tests / a build
 * that didn't stage one) so the handler falls back to its defaults.
 *
 * `import.meta.url` resolves to the emitted `entry-server.js` location at
 * runtime (the bundler preserves it), so `./template.html` lands next to the
 * server bundle regardless of which adapter staged it.
 */
function readBuiltTemplate(): string | undefined {
	try {
		return readFileSync(new URL("./template.html", import.meta.url), "utf-8");
	} catch {
		return undefined;
	}
}

/**
 * Create the SSR request handler for production.
 *
 * @example
 * import { routes } from "virtual:zero/routes"
 * import { routeMiddleware } from "virtual:zero/route-middleware"
 * import { createServer } from "@pyreon/zero/server"
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

	// PR-S2: Auto-wire server actions when any defineAction() has run.
	// Sits between API routes and route middleware so action endpoints
	// short-circuit before the routing layer touches the path. Default
	// CSRF baseline: same-origin POSTs only; opt in to cross-origin via
	// `options.actions.corsOrigins`. Pass `actions: false` to disable
	// the auto-wire (and mount manually elsewhere).
	//
	// Detection via the module-level `actionRegistry` size. Because
	// `defineAction()` is called at module load (at the top of route
	// files), by the time `createServer` runs all actions are registered.
	if (options.actions !== false && getRegisteredActions().size > 0) {
		allMiddleware.push(
			createActionMiddleware(
				typeof options.actions === 'object' ? options.actions : undefined,
			),
		);
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
		// Forward zero's `base` to createRouter so RouterLinks render
		// correctly prefixed hrefs during SSR — must match the value
		// the client-side `startClient` reads from `__ZERO_BASE__` so
		// hydration doesn't mismatch.
		...(config.base && config.base !== "/" ? { base: config.base } : {}),
	});

	// Production SSR template resolution (the zero-config path). ONLY when the
	// caller customized NEITHER `template` NOR `clientEntry` do we look for a
	// built `template.html` sibling of this server bundle — the SSR build copies
	// the built client index.html there (see ssr-plugin.ts) and every deploy
	// adapter copies the whole server dir, so it travels with entry-server.js to
	// node/bun/vercel/netlify/cloudflare alike. That built template carries the
	// hashed client `<script>` + CSS `<link>` + injection placeholders, so we
	// use it AND suppress the handler's client-entry injection (the template
	// already references the hashed entry). If the caller customized EITHER
	// option we leave both untouched — auto-loading the template alongside an
	// explicit `clientEntry` would inject two module scripts. In dev / tests the
	// sibling doesn't exist → `readBuiltTemplate` returns undefined → the
	// handler's defaults apply (dev SSR renders via a separate path).
	const zeroConfigTemplate = !options.template && options.clientEntry === undefined;
	const autoTemplate = zeroConfigTemplate ? readBuiltTemplate() : undefined;
	if (
		zeroConfigTemplate &&
		autoTemplate === undefined &&
		process.env.NODE_ENV === "production"
	) {
		// The deploy is missing the staged production template (a non-zero /
		// custom build that didn't run the SSR plugin's copy step). Surfacing
		// this in production is the point — silently it server-renders but ships
		// the dev "/src/entry-client.ts" entry, which 404s → no hydration.
		// eslint-disable-next-line no-console
		console.warn(
			'[zero:ssr] No production template (dist/server/template.html) found next to the server bundle. Falling back to DEFAULT_TEMPLATE + the dev client entry "/src/entry-client.ts", which 404s in production — the page will server-render but NOT hydrate. Ensure the SSR build staged the template, or pass `template` + `clientEntry: false` explicitly.',
		);
	}

	// Prefer an explicit template; else the auto-resolved built one. `||` (not
	// `??`) so an empty-string template falls back too — consistent with the
	// truthy `!options.template` check above.
	const resolvedTemplate = options.template || autoTemplate;
	// The auto-loaded built template already carries the hashed client
	// <script>, so suppress the handler's injection. An explicit `clientEntry`
	// (including `false`) always wins.
	let resolvedClientEntry = options.clientEntry;
	if (resolvedClientEntry === undefined && autoTemplate) {
		resolvedClientEntry = false;
	}

	const baseHandler = createHandler({
		App,
		routes: options.routes,
		middleware: allMiddleware,
		mode: config.ssr?.mode ?? "string",
		...(resolvedTemplate ? { template: resolvedTemplate } : {}),
		...(resolvedClientEntry !== undefined ? { clientEntry: resolvedClientEntry } : {}),
	});

	// PR-S5: wire the render mode. `mode: 'isr'` was a typed-but-not-
	// wired surface from inception — apps that set it got SSR behavior
	// silently, with `config.isr` ignored and no signal pointing at the
	// cause (Pattern D from the audit). The wireRenderMode helper makes
	// the dispatch explicit + drift-tested.
	const handler = wireRenderMode(config.mode ?? "ssr", baseHandler, config);

	// M1.2 — Runtime SSR 404 routes through the router (PR L5).
	// When a URL doesn't match any leaf, @pyreon/router's resolveRoute
	// walks up to the closest parent `notFoundComponent` and builds a
	// synthetic chain `[...ancestorLayouts, syntheticLeaf]`. The handler
	// renders that chain, producing 404 HTML INSIDE the layout's chrome,
	// and reads `resolved.isNotFound` to set HTTP status 404. This
	// replaces the pre-M1 URL-pattern wrapper that bypassed the router
	// for unmatched URLs and rendered the not-found component standalone
	// (no layout wrapping).
	//
	// `options.notFoundComponent` is a legacy fallback for apps that
	// don't carry `_404.tsx` in their routes tree. When set AND the
	// routes tree has no reachable `notFoundComponent`, we render the
	// standalone shape as a final fallback. The canonical pattern is
	// `_404.tsx` inside a `_layout.tsx` directory — that goes through
	// PR L5's router-driven path and gets layout chrome for free.
	if (!options.notFoundComponent) return handler;

	const NotFound = options.notFoundComponent;
	const hasRouteTreeNotFound = routeTreeHasNotFound(options.routes);

	return async (req: Request) => {
		// Route-tree notFoundComponent present → handler handles 404 via
		// resolveRoute's `isNotFound` fallback (PR L5). Skip the legacy
		// wrapper entirely — handler.ts sets status 404 + renders layout
		// chrome correctly.
		if (hasRouteTreeNotFound) return handler(req);

		// Legacy fallback: routes tree has no notFoundComponent but the
		// caller passed `options.notFoundComponent`. Run the URL-pattern
		// check + standalone render for backward compat.
		const url = new URL(req.url);
		const pathname = url.pathname;
		if (!routePatternsCache(options.routes).some((p) => matchPattern(p, pathname))) {
			const fullHtml = await render404Page(NotFound, options.template);
			return new Response(fullHtml, {
				status: 404,
				headers: { "Content-Type": "text/html; charset=utf-8" },
			});
		}

		return handler(req);
	};
}

// ─── Render-mode dispatcher (PR-S5) ─────────────────────────────────────────

type RequestHandler = (req: Request) => Promise<Response>;

/**
 * Wrap the base SSR handler with the runtime layer for the configured
 * `RenderMode`. Exhaustive switch — adding a new RenderMode value
 * without a case fails typecheck on `_AssertExhaustive<mode>`.
 *
 * Modes:
 * - `'ssr'` — pass-through (base handler renders per request).
 * - `'isr'` — wrap with `createISRHandler` (stale-while-revalidate LRU
 *   cache, default `revalidate: 60` seconds, override via `config.isr`).
 * - `'ssg'` — pass-through at runtime; dist HTML served by the host. The
 *   handler is only invoked when an SSG'd app falls back to dynamic
 *   SSR for a path the build didn't enumerate (mixed-mode escape hatch).
 * - `'spa'` — pass-through. SPA mode renders an empty shell on the
 *   server; the SSR handler is what produces that shell.
 *
 * @internal exported for entry-server.test.ts drift gate
 */
export function wireRenderMode(
	mode: RenderMode,
	baseHandler: RequestHandler,
	config: ZeroConfig,
): RequestHandler {
	switch (mode) {
		case "isr": {
			// PR-S5: default `revalidate: 60` if the user enabled ISR but
			// didn't provide config.isr — beats silently falling back to
			// SSR (which is what the pre-PR-S5 code did).
			const isrConfig = config.isr ?? { revalidate: 60 };
			return createISRHandler(baseHandler, isrConfig);
		}
		case "ssr":
		case "ssg":
		case "spa":
			return baseHandler;
		default: {
			// Exhaustiveness check: if a new RenderMode value is added to
			// types.ts without a case here, this assertion fails typecheck
			// (Type 'X' is not assignable to type 'never').
			const _unreachable: _AssertExhaustive<typeof mode> = mode;
			void _unreachable;
			return baseHandler;
		}
	}
}

/** Walk the route tree looking for any record with a `notFoundComponent`. */
function routeTreeHasNotFound(routes: RouteRecord[]): boolean {
	for (const r of routes) {
		if (typeof (r as { notFoundComponent?: unknown }).notFoundComponent === "function") {
			return true;
		}
		if (r.children && routeTreeHasNotFound(r.children as RouteRecord[])) {
			return true;
		}
	}
	return false;
}

/** Lazy cache of flattened patterns — only computed if legacy fallback fires. */
const _routePatternsCache = new WeakMap<RouteRecord[], string[]>();
function routePatternsCache(routes: RouteRecord[]): string[] {
	const cached = _routePatternsCache.get(routes);
	if (cached) return cached;
	const out = flattenRoutePatterns(routes);
	_routePatternsCache.set(routes, out);
	return out;
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
