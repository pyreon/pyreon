import type { Plugin } from "vite";
import { generateApiRouteModule } from "./api-routes";
import { resolveConfig } from "./config";
import { matchPattern } from "./entry-server";
import { renderErrorOverlay } from "./error-overlay";
import {
	generateMiddlewareModule,
	generateRouteModule,
	scanRouteFiles,
} from "./fs-router";
import { render404Page } from "./not-found";
import type { ZeroConfig } from "./types";

const VIRTUAL_ROUTES_ID = "virtual:zero/routes";
const RESOLVED_VIRTUAL_ROUTES_ID = `\0${VIRTUAL_ROUTES_ID}`;

const VIRTUAL_MIDDLEWARE_ID = "virtual:zero/route-middleware";
const RESOLVED_VIRTUAL_MIDDLEWARE_ID = `\0${VIRTUAL_MIDDLEWARE_ID}`;

const VIRTUAL_API_ROUTES_ID = "virtual:zero/api-routes";
const RESOLVED_VIRTUAL_API_ROUTES_ID = `\0${VIRTUAL_API_ROUTES_ID}`;

/**
 * Zero Vite plugin — adds file-based routing and zero-config conventions
 * on top of @pyreon/vite-plugin.
 *
 * @example
 * // vite.config.ts
 * import pyreon from "@pyreon/vite-plugin"
 * import zero from "@pyreon/zero"
 *
 * export default {
 *   plugins: [pyreon(), zero()],
 * }
 */
export function zeroPlugin(userConfig: ZeroConfig = {}): Plugin {
	const config = resolveConfig(userConfig);
	let routesDir: string;
	let root: string;

	const plugin: Plugin & { _zeroConfig: ZeroConfig } = {
		name: "pyreon-zero",
		enforce: "pre",
		_zeroConfig: userConfig,

		configResolved(resolvedConfig) {
			root = resolvedConfig.root;
			routesDir = `${root}/src/routes`;
		},

		resolveId(id) {
			if (id === VIRTUAL_ROUTES_ID) return RESOLVED_VIRTUAL_ROUTES_ID;
			if (id === VIRTUAL_MIDDLEWARE_ID) return RESOLVED_VIRTUAL_MIDDLEWARE_ID;
			if (id === VIRTUAL_API_ROUTES_ID) return RESOLVED_VIRTUAL_API_ROUTES_ID;
		},

		async load(id) {
			if (id === RESOLVED_VIRTUAL_ROUTES_ID) {
				try {
					const files = await scanRouteFiles(routesDir);
					return generateRouteModule(files, routesDir);
				} catch (_err) {
					return `export const routes = []`;
				}
			}

			if (id === RESOLVED_VIRTUAL_MIDDLEWARE_ID) {
				try {
					const files = await scanRouteFiles(routesDir);
					return generateMiddlewareModule(files, routesDir);
				} catch (_err) {
					return `export const routeMiddleware = []`;
				}
			}

			if (id === RESOLVED_VIRTUAL_API_ROUTES_ID) {
				try {
					const files = await scanRouteFiles(routesDir);
					return generateApiRouteModule(files, routesDir);
				} catch (_err) {
					return `export const apiRoutes = []`;
				}
			}
		},

		configureServer(server) {
			// 404 handler — check if the requested path matches any route.
			// If not, render the nearest _404.tsx component with a 404 status.
			// Uses a sync wrapper that calls the async handler, since Connect
			// middleware does not natively support async functions.
			server.middlewares.use((req, res, next) => {
				const accept = req.headers.accept ?? "";
				// Accept HTML requests and wildcard requests (fetch without explicit Accept header)
				if (!accept.includes("text/html") && !accept.includes("*/*"))
					return next();

				const pathname = req.url?.split("?")[0] ?? "/";

				// Skip static assets, Vite internal requests, and file-like paths (with extensions)
				if (pathname.startsWith("/@") || pathname.startsWith("/__"))
					return next();
				if (/\.\w+$/.test(pathname)) return next();

				handle404(server, routesDir, pathname, res).then(
					(handled) => {
						if (!handled) next();
					},
					() => next(), // On error, fall through to Vite's default handling
				);
			});

			// SSR error overlay — intercept HTML requests and catch SSR errors
			// This runs as a late middleware (return function) so it wraps
			// Vite's own SSR handling and catches rendering failures.
			server.middlewares.use((req, res, next) => {
				const accept = req.headers.accept ?? "";
				if (!accept.includes("text/html")) return next();

				const originalEnd = res.end.bind(res);
				let errored = false;

				const handleError = (err: unknown) => {
					if (errored) return;
					errored = true;
					const error = err instanceof Error ? err : new Error(String(err));
					server.ssrFixStacktrace(error);
					const html = renderErrorOverlay(error);
					res.statusCode = 500;
					res.setHeader("Content-Type", "text/html; charset=utf-8");
					res.setHeader("Content-Length", Buffer.byteLength(html));
					originalEnd(html);
				};

				res.on("error", handleError);

				// Wrap next() in try/catch to handle both sync and async errors.
				// Express-style middleware may throw synchronously or pass errors
				// through next(err), and Vite's SSR pipeline may reject promises.
				try {
					const result = next() as unknown;
					// Handle async errors from Vite's SSR pipeline
					if (
						result &&
						typeof (result as Promise<unknown>).catch === "function"
					) {
						(result as Promise<unknown>).catch(handleError);
					}
				} catch (err) {
					handleError(err);
				}
			});

			// Watch routes directory for changes
			server.watcher.add(`${routesDir}/**/*.{tsx,jsx,ts,js}`);

			// Invalidate virtual modules when route files change
			server.watcher.on("all", (event, path) => {
				if (
					path.startsWith(routesDir) &&
					(event === "add" || event === "unlink")
				) {
					for (const resolvedId of [
						RESOLVED_VIRTUAL_ROUTES_ID,
						RESOLVED_VIRTUAL_MIDDLEWARE_ID,
						RESOLVED_VIRTUAL_API_ROUTES_ID,
					]) {
						const mod = server.moduleGraph.getModuleById(resolvedId);
						if (mod) server.moduleGraph.invalidateModule(mod);
					}
					server.ws.send({ type: "full-reload" });
				}
			});
		},

		config() {
			return {
				resolve: {
					conditions: ["bun"],
				},
				server: {
					port: config.port,
				},
				define: {
					__ZERO_MODE__: JSON.stringify(config.mode),
					__ZERO_BASE__: JSON.stringify(config.base),
				},
			};
		},
	};

	return plugin;
}

/**
 * Check if the requested path matches any route. If not, render a 404 page.
 * Returns true if the 404 was handled (response sent), false otherwise.
 *
 * In dev mode, the _404.tsx component cannot be SSR-rendered because
 * the compiler emits _tpl() calls that require `document`. Instead,
 * we return a static 404 page. The actual component rendering happens
 * on the client side when the SPA loads.
 */
async function handle404(
	server: import("vite").ViteDevServer,
	_routesDir: string,
	pathname: string,
	res: import("http").ServerResponse,
): Promise<boolean> {
	const mod = await server.ssrLoadModule(VIRTUAL_ROUTES_ID);
	const routes = mod.routes as Array<{ path?: string; children?: unknown[] }>;
	const patterns = flattenRoutePatterns(routes);

	if (patterns.some((pattern) => matchPattern(pattern, pathname))) {
		return false; // Route matches — not a 404
	}

	// No route matched — return a 404.
	// In dev, we return a static page since the compiler emits _tpl() calls
	// that require document (unavailable in SSR). The _404.tsx component
	// renders on the client side after hydration.
	const html = await render404Page(undefined);

	res.statusCode = 404;
	res.setHeader("Content-Type", "text/html; charset=utf-8");
	res.setHeader("Content-Length", Buffer.byteLength(html));
	res.end(html);
	return true;
}

/** Extract all URL patterns from a nested route tree. */
function flattenRoutePatterns(
	routes: Array<{ path?: string; children?: unknown[] }>,
	prefix = "",
): string[] {
	const patterns: string[] = [];
	for (const route of routes) {
		if (!route.path) continue;
		const fullPath =
			route.path === "/" && prefix ? prefix : `${prefix}${route.path}`;
		patterns.push(fullPath);
		if (route.children) {
			patterns.push(
				...flattenRoutePatterns(
					route.children as Array<{ path?: string; children?: unknown[] }>,
					fullPath,
				),
			);
		}
	}
	return patterns;
}
