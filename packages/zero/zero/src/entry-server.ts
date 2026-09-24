import { readFileSync } from "node:fs";
import type { ComponentFn } from "@pyreon/core";
import type { RouteRecord } from "@pyreon/router";
import type { Middleware } from "@pyreon/server";
import { createHandler } from "@pyreon/server";
import type { CreateActionMiddlewareOptions } from "./actions";
import { createActionRerenderMiddleware } from "./form-actions-server";
import type { ApiRouteEntry } from "./api-routes";
import { createApp } from "./app";
import { createISRHandler } from "./isr";
import { createRequestPipeline, matchPattern, trimTrailingSlashes } from "./pipeline";
import { collectRouteModes, resolveRenderModeForPath } from "./route-modes";
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

export { matchPattern, routingPathname } from "./pipeline";

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
 * The serializable part of the app's `zero({...})` config, injected by
 * zero's Vite plugin into the server build (see `serverConfigDefine`). Without
 * it the generated server entry — which cannot import `vite.config.ts` —
 * rendered with NO config: `mode: 'isr'`, `base`, `ssr.mode` and
 * `routeRules` were build-time only, and the runtime silently served plain
 * SSR at the wrong paths. Undefined outside a zero build (tests, custom
 * embeddings), where `options.config` alone applies.
 */
declare const __ZERO_SERVER_CONFIG__: ZeroConfig | undefined;

/** Built config first, then the entry's own `config` wins key by key. */
export function mergeServerConfig(
	built: ZeroConfig | undefined,
	own: ZeroConfig | undefined,
): ZeroConfig {
	if (!built) return own ?? {};
	if (!own) return built;
	const merged: ZeroConfig = { ...built, ...own };
	if (built.isr || own.isr) merged.isr = { ...built.isr, ...own.isr } as NonNullable<ZeroConfig["isr"]>;
	if (built.ssr || own.ssr) merged.ssr = { ...built.ssr, ...own.ssr };
	return merged;
}

/**
 * Read the production SSR template — the built client `index.html` (with its
 * hashed entry script), so SSR responses hydrate. Returns `undefined` when
 * absent (dev / tests / a build that didn't stage one) so the handler falls
 * back to its defaults.
 *
 * Two delivery paths, runtime-agnostic by design:
 *
 * 1. **Worker runtimes (Cloudflare workerd)** have no filesystem and can't
 *    `readFileSync` a sibling asset, so the adapter inlines the template into
 *    `globalThis.__PYREON_SSR_TEMPLATE__` in the generated `_worker.js` BEFORE
 *    dynamic-importing this module. Checked first.
 * 2. **Node-based runtimes** (node / bun / vercel / netlify functions all run
 *    on Node) read the `template.html` sibling that `ssr-plugin.ts` staged
 *    next to the server bundle. `import.meta.url` resolves to the emitted
 *    `entry-server.js` location at runtime, so `./template.html` lands beside
 *    it regardless of which adapter staged it.
 *
 * Without path 1, Cloudflare SSR server-rendered but shipped the dev
 * `entry-client.ts` (the fs read threw → caught → undefined → dev fallback) →
 * no hydration in production.
 */
function readBuiltTemplate(): string | undefined {
	const injected = (globalThis as { __PYREON_SSR_TEMPLATE__?: unknown })
		.__PYREON_SSR_TEMPLATE__;
	if (typeof injected === "string" && injected.length > 0) return injected;
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
	const config = mergeServerConfig(
		typeof __ZERO_SERVER_CONFIG__ !== "undefined" ? __ZERO_SERVER_CONFIG__ : undefined,
		options.config,
	);

	let renderForAction: ((req: Request) => Promise<Response>) | null = null;
	// Order is a security property — see `createRequestPipeline`. Dev runs
	// the SAME function (zero's dev middleware), so the two cannot drift.
	const { middleware: allMiddleware, isEndpoint } = createRequestPipeline({
		routes: options.routes,
		config,
		...(options.middleware ? { middleware: options.middleware } : {}),
		...(options.routeMiddleware ? { routeMiddleware: options.routeMiddleware } : {}),
		...(options.apiRoutes ? { apiRoutes: options.apiRoutes } : {}),
		...(options.actions !== undefined ? { actions: options.actions } : {}),
		// No-JS form posts re-render their page through a handler that does
		// NOT run this pipeline again (assigned below).
		renderActionPage: (req) => renderForAction!(req),
	});

	const { App } = createApp({
		routes: options.routes,
		routerMode: "history",
		// Forward zero's `base` to createRouter so RouterLinks render
		// correctly prefixed hrefs during SSR — must match the value
		// the client-side `startClient` reads from `__ZERO_BASE__` so
		// hydration doesn't mismatch.
		...(config.base && config.base !== "/" ? { base: config.base } : {}),
	});

	// Production SSR template resolution (zero-config path): ONLY when the
	// caller customized neither `template` nor `clientEntry` do we auto-load the
	// built `dist/server/template.html` sibling — the SSR build copies the built
	// client index.html there (see ssr-plugin.ts) and every deploy adapter
	// copies the whole server dir, so it travels with entry-server.js to
	// node/bun/vercel/netlify/cloudflare alike. That template carries the hashed
	// client `<script>` + CSS `<link>` + injection placeholders, so we use it
	// AND suppress the handler's client-entry injection below (the template
	// already references the hashed entry). If the caller set EITHER option we
	// leave both untouched — auto-loading alongside an explicit `clientEntry`
	// would inject two module scripts. A missing template in the zero path is a
	// build error the SSR plugin reports at build time (+ verify-modes and the
	// ssr-node/isr-node e2e gate it); custom builds pass their own `template`
	// (with `clientEntry: false` — see the option JSDoc). In dev / tests the
	// sibling doesn't exist → undefined → the handler's defaults apply.
	const autoTemplate =
		!options.template && options.clientEntry === undefined
			? readBuiltTemplate()
			: undefined;

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
		// `ssr.mode` decides. A zero build always sets it (resolveConfig
		// defaults it to 'string'; `ssr: { mode: 'stream' }` opts into the
		// streamed shell + out-of-order Suspense). The `mode: 'ssr'` fallback
		// to streaming below only applies to hand-built configs that set no
		// `ssr` at all. ISR apps stay buffered — the SWR cache stores complete
		// Response bodies; caching a stream would either drain it (defeating
		// streaming) or store nothing (defeating caching). PPR-shaped shell
		// caching is the eventual resolution (analysis doc P1-B).
		mode: config.ssr?.mode ?? (config.mode === "ssr" ? "stream" : "string"),
		...(resolvedTemplate ? { template: resolvedTemplate } : {}),
		...(resolvedClientEntry !== undefined ? { clientEntry: resolvedClientEntry } : {}),
	});

	// A no-JS action post re-renders its page through a handler whose ONLY
	// middleware restores the POST's own middleware results (locals,
	// response headers) — the app and route middleware already ran for this
	// request and must not run again (rate limiters would count it twice).
	// Never an ISR-cached handler: a result page is per submission.
	let actionRenderHandler: ((req: Request) => Promise<Response>) | null = null;
	renderForAction = (req) =>
		(actionRenderHandler ??= createHandler({
			App,
			routes: options.routes,
			middleware: [createActionRerenderMiddleware()],
			mode: config.ssr?.mode ?? (config.mode === "ssr" ? "stream" : "string"),
			...(resolvedTemplate ? { template: resolvedTemplate } : {}),
			...(resolvedClientEntry !== undefined ? { clientEntry: resolvedClientEntry } : {}),
		}))(req);

	// PR-S5: wire the render mode. `mode: 'isr'` was a typed-but-not-
	// wired surface from inception — apps that set it got SSR behavior
	// silently, with `config.isr` ignored and no signal pointing at the
	// cause (Pattern D from the audit). The wireRenderMode helper makes
	// the dispatch explicit + drift-tested.
	const handler = wirePerRouteModes(
		config.mode ?? "ssr",
		baseHandler,
		config,
		options.routes,
		resolvedTemplate,
		// Phase 4 — per-route ISR needs a BUFFERED handler: the SWR cache
		// stores complete bodies, and `mode: 'ssr'` now defaults to
		// streaming. Built lazily — only when a route actually declares
		// 'isr' inside a streaming app.
		() =>
			createHandler({
				App,
				routes: options.routes,
				middleware: allMiddleware,
				mode: "string",
				...(resolvedTemplate ? { template: resolvedTemplate } : {}),
				...(resolvedClientEntry !== undefined
					? { clientEntry: resolvedClientEntry }
					: {}),
			}),
		isEndpoint,
	);

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
	if (!options.notFoundComponent) return withPipelineOptions(handler, options);

	const NotFound = options.notFoundComponent;
	const hasRouteTreeNotFound = routeTreeHasNotFound(options.routes);

	return withPipelineOptions(async (req: Request) => {
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
	}, options);
}

/**
 * The server entry's own pipeline inputs, readable by zero's dev middleware
 * (which loads `src/entry-server.ts` through Vite and runs the SAME
 * `createRequestPipeline` in front of its dev renderer). Without it the
 * entry's `middleware` — CSP / security headers, auth — only ran in
 * production.
 * @internal
 */
export const PIPELINE_OPTIONS: unique symbol = Symbol.for("pyreon.zero.pipelineOptions") as never;

export type PipelineTaggedHandler = ((req: Request) => Promise<Response>) & {
	[PIPELINE_OPTIONS]?: Pick<CreateServerOptions, "middleware" | "actions">;
};

function withPipelineOptions(
	handler: (req: Request) => Promise<Response>,
	options: CreateServerOptions,
): PipelineTaggedHandler {
	const tagged = handler as PipelineTaggedHandler;
	tagged[PIPELINE_OPTIONS] = {
		...(options.middleware ? { middleware: options.middleware } : {}),
		...(options.actions !== undefined ? { actions: options.actions } : {}),
	};
	return tagged;
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
/**
 * Phase 2 — per-route render-mode dispatch. When any route DECLARES a
 * `renderMode` diverging from the app default, requests dispatch per
 * matched route:
 *
 *   - `'spa'`  → the CSR shell (built template, placeholders blanked) with
 *                no server render — the opt-this-route-out-of-SSR hatch.
 *                Falls back to SSR when no built template is available
 *                (custom template/clientEntry setups, dev).
 *   - `'isr'`  → the shared SWR cache handler (created lazily once).
 *   - `'ssr'`  → the base handler directly — under an `'isr'` APP mode this
 *                is the per-route cache BYPASS.
 *   - `'ssg'`  → base handler too: prerendered files are served upstream by
 *                the static layer (emitted node/bun servers + CDN adapters);
 *                reaching the handler means the file is missing — SSR is the
 *                graceful fallback, never a 404.
 *
 * When NO route declares a divergent mode, returns the plain app-level
 * `wireRenderMode` handler — the zero-change path for every existing app.
 * Resolution shares `resolveRenderModeForPath` with the build (leaf-first,
 * layout cascade, app default) so build and runtime can never disagree.
 */
export function wirePerRouteModes(
	appMode: RenderMode,
	baseHandler: RequestHandler,
	config: ZeroConfig,
	routes: RouteRecord[],
	builtTemplate: string | undefined,
	makeBufferedHandler?: () => RequestHandler,
	isEndpoint?: (pathname: string) => boolean,
): RequestHandler {
	const entries = collectRouteModes(routes, appMode, config.routeRules);
	const divergent = entries.some((e) => e.declared && e.mode !== appMode);
	if (!divergent) return wireRenderMode(appMode, baseHandler, config, isEndpoint);

	const needsIsr =
		appMode === "isr" || entries.some((e) => e.declared && e.mode === "isr");
	// The cached handler must produce BUFFERED responses (the SWR cache
	// stores complete bodies). Under app mode 'isr' the base handler is
	// already string-mode; under a streaming 'ssr' app, use the buffered
	// factory the caller supplies. No factory (tests, custom embeddings) →
	// fall back to the base handler (correct for string-mode bases).
	const isrBase =
		appMode === "isr" ? baseHandler : (makeBufferedHandler?.() ?? baseHandler);
	const isrHandler = needsIsr
		? createISRHandler(isrBase, config.isr ?? { revalidate: 60 })
		: null;

	// CSR shell for 'spa' routes: the built template with the injection
	// placeholders blanked. `startClient` sees no SSR content and takes the
	// mount + run-loaders cold-start path (the documented SPA contract).
	const spaShell = builtTemplate
		? builtTemplate
				.replace("<!--pyreon-head-->", "")
				.replace("<!--pyreon-app-->", "")
				.replace("<!--pyreon-scripts-->", "")
		: undefined;

	const basePrefix =
		config.base && config.base !== "/" ? trimTrailingSlashes(config.base) : "";
	return async (req: Request) => {
		const url = new URL(req.url);
		if (isEndpoint?.(url.pathname)) return baseHandler(req);
		// Route patterns carry no base, so resolve on the base-stripped path —
		// matching the un-stripped one resolved nothing under a `base`, and
		// every declared per-route mode silently fell back to the app mode.
		let routePath = url.pathname;
		if (basePrefix) {
			if (routePath === basePrefix) routePath = "/";
			else if (routePath.startsWith(`${basePrefix}/`)) routePath = routePath.slice(basePrefix.length);
		}
		const mode = resolveRenderModeForPath(routes, routePath, appMode, config.routeRules);
		if (mode === "spa" && spaShell !== undefined && req.method === "GET") {
			return new Response(spaShell, {
				status: 200,
				headers: { "Content-Type": "text/html; charset=utf-8" },
			});
		}
		if (mode === "isr" && isrHandler) return isrHandler(req);
		return baseHandler(req);
	};
}

export function wireRenderMode(
	mode: RenderMode,
	baseHandler: RequestHandler,
	config: ZeroConfig,
	isEndpoint?: (pathname: string) => boolean,
): RequestHandler {
	switch (mode) {
		case "isr": {
			// PR-S5: default `revalidate: 60` if the user enabled ISR but
			// didn't provide config.isr — beats silently falling back to
			// SSR (which is what the pre-PR-S5 code did).
			const isrConfig = config.isr ?? { revalidate: 60 };
			const isr = createISRHandler(baseHandler, isrConfig);
			if (!isEndpoint) return isr;
			return (req) =>
				isEndpoint(new URL(req.url).pathname) ? baseHandler(req) : isr(req);
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
