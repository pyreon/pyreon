import { readFile } from 'node:fs/promises'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin, ViteDevServer } from 'vite'
import { generateApiRouteModule } from './api-routes'
import { resolveConfig } from './config'

/**
 * Scan node_modules/@pyreon/ to discover all installed Pyreon packages.
 * Returns package names to exclude from Vite's dep optimizer.
 */
function scanPyreonPackages(root: string): string[] {
  const pyreonDir = join(root, 'node_modules', '@pyreon')
  if (!existsSync(pyreonDir)) return []

  try {
    return readdirSync(pyreonDir)
      .filter((name) => !name.startsWith('.'))
      .map((name) => `@pyreon/${name}`)
  } catch {
    return []
  }
}

/**
 * Resolve a package that isn't at the app's top-level `node_modules` but is
 * nested under another `@pyreon/*` package. Used to alias `@pyreon/runtime-server`
 * to the copy under `node_modules/@pyreon/zero/node_modules/@pyreon/runtime-server`
 * so `ssrLoadModule` works without requiring the app to declare it as a
 * direct dep.
 */
function resolveNestedPackage(root: string, name: string): string | undefined {
  const direct = join(root, 'node_modules', name)
  if (existsSync(direct)) return direct
  const nested = join(root, 'node_modules', '@pyreon', 'zero', 'node_modules', name)
  if (existsSync(nested)) return nested
  return undefined
}
import { matchPattern } from "./entry-server";
import { renderErrorOverlay } from "./error-overlay";
import {
	generateMiddlewareModule,
	generateRouteModuleFromRoutes,
	scanRouteFiles,
	scanRouteFilesWithExports,
} from "./fs-router";
import { render404Page } from "./not-found";
import { ssgPlugin } from "./ssg-plugin";
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
export function zeroPlugin(userConfig: ZeroConfig = {}): Plugin[] {
	const config = resolveConfig(userConfig);
	let routesDir: string;
	let root: string;

	const mainPlugin: Plugin & { _zeroConfig: ZeroConfig } = {
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
					// Detect each file's optional exports up front so the
					// generator emits the optimal shape:
					//   • lazy() for routes that only export `default` (best code splitting)
					//   • Direct mod.loader/.guard/.meta access for routes with metadata
					//   • No spurious IMPORT_IS_UNDEFINED warnings from Rolldown
					const routes = await scanRouteFilesWithExports(routesDir, config.mode);
					return generateRouteModuleFromRoutes(routes, routesDir, {
						staticImports: config.mode === 'ssg',
					});
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
			// Dev-mode SSR middleware — for mode: "ssr", actually render each
			// matched route server-side instead of serving the SPA shell.
			// Runs BEFORE the 404 handler so matched routes are SSR'd and
			// unmatched ones fall through to the 404 handler.
			if (config.mode === "ssr") {
				server.middlewares.use((req, res, next) => {
					const accept = req.headers.accept ?? "";
					if (!accept.includes("text/html") && !accept.includes("*/*"))
						return next();
					const pathname = req.url?.split("?")[0] ?? "/";
					if (pathname.startsWith("/@") || pathname.startsWith("/__"))
						return next();
					if (/\.\w+$/.test(pathname)) return next();

					renderSsr(server, root, req.originalUrl ?? pathname, pathname).then(
						(result) => {
							if (result === null) return next();
							res.statusCode = 200;
							res.setHeader("Content-Type", "text/html; charset=utf-8");
							res.setHeader("Content-Length", Buffer.byteLength(result));
							res.end(result);
						},
						(err: unknown) => {
							const error = err instanceof Error ? err : new Error(String(err));
							server.ssrFixStacktrace(error);
							const html = renderErrorOverlay(error);
							res.statusCode = 500;
							res.setHeader("Content-Type", "text/html; charset=utf-8");
							res.setHeader("Content-Length", Buffer.byteLength(html));
							res.end(html);
						},
					);
				});
			}

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
					(err) => {
						// oxlint-disable-next-line no-console
						console.error('[Pyreon] Error in 404 handler:', err);
						next();
					},
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

		config(userConfig) {
			// Discover all @pyreon/* packages installed in node_modules.
			// The "bun" export condition points to TS source — esbuild's
			// dep optimizer would compile them with the wrong JSX runtime.
			const root = userConfig.root ?? process.cwd()
			const pyreonExclude = scanPyreonPackages(root)

			// `@pyreon/runtime-server` is only imported by zero's dev SSR
			// middleware and the production server entry — apps rarely list it
			// as a direct dep. Resolve it to the copy nested under zero so
			// `ssrLoadModule("@pyreon/runtime-server")` works uniformly.
			const runtimeServerAlias = resolveNestedPackage(
				root,
				"@pyreon/runtime-server",
			)

			return {
				resolve: {
					conditions: ['bun'],
					...(runtimeServerAlias
						? { alias: { '@pyreon/runtime-server': runtimeServerAlias } }
						: {}),
				},
				// Vite's SSR module graph has its own resolver that defaults to the
				// "node" condition — which would pick the built `lib/index.js` for
				// every `@pyreon/*` package and bypass workspace source edits. Mirror
				// the client-side "bun" condition + alias so dev SSR uses `src/`.
				ssr: {
					resolve: {
						conditions: ['bun'],
						...(runtimeServerAlias
							? { alias: { '@pyreon/runtime-server': runtimeServerAlias } }
							: {}),
					},
				},
				optimizeDeps: {
					exclude: pyreonExclude,
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

	// SSG mode auto-wires the static-site generation hook. Other modes get
	// just the main plugin. The SSG plugin internally no-ops when
	// `mode !== 'ssg'`, but skipping it entirely keeps the plugin chain
	// minimal for SSR/SPA/ISR builds (one less `closeBundle` to call).
	return config.mode === "ssg" ? [mainPlugin, ssgPlugin(userConfig)] : [mainPlugin];
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

/**
 * Dev-mode SSR render pipeline. Returns the composed HTML string, or `null`
 * if the URL doesn't match any known route (caller falls through to the 404
 * middleware). Mirrors the production `createServer` flow:
 *   1. Load virtual:zero/routes + app.ts via Vite's ssrLoadModule
 *   2. Create a per-request router bound to the request URL
 *   3. Pre-run loaders for the matched route(s)
 *   4. Render app tree with head tag collection
 *   5. Serialize loader data into `window.__PYREON_LOADER_DATA__`
 *   6. Inject everything into the user's transformed index.html (so Vite
 *      still gets a chance to inject its HMR client + JSX runtime prelude)
 */
async function renderSsr(
	server: ViteDevServer,
	root: string,
	originalUrl: string,
	pathname: string,
): Promise<string | null> {
	// Pattern check FIRST — otherwise SSR would try (and likely crash) on
	// asset paths that happened to accept text/html (e.g. curl-style).
	const routesMod = await server.ssrLoadModule(VIRTUAL_ROUTES_ID);
	const routes = routesMod.routes as Array<{
		path?: string;
		children?: unknown[];
	}>;
	const patterns = flattenRoutePatterns(routes);
	if (!patterns.some((pattern) => matchPattern(pattern, pathname))) {
		return null;
	}

	// Read + transform index.html (Vite injects the HMR client / JSX prelude).
	let template = await readFile(join(root, "index.html"), "utf-8");
	template = await server.transformIndexHtml(originalUrl, template);

	// Framework modules load through Vite's SSR module graph so user code (which
	// imports the same packages) shares a single module instance — otherwise two
	// copies of `@pyreon/router` would hold separate `RouterContext` IDs and
	// `useContext` in RouterLink would miss the RouterProvider's value.
	// `@pyreon/runtime-server` isn't a direct dep of most apps, so zero's
	// `config()` hook registers an alias that points it at the copy under
	// zero's own `node_modules` — same path → same Vite module → same instance.
	const [core, headPkg, headSsr, routerPkg, runtimeServer] = await Promise.all(
		[
			server.ssrLoadModule("@pyreon/core") as Promise<
				typeof import("@pyreon/core")
			>,
			server.ssrLoadModule("@pyreon/head") as Promise<
				typeof import("@pyreon/head")
			>,
			server.ssrLoadModule("@pyreon/head/ssr") as Promise<
				typeof import("@pyreon/head/ssr")
			>,
			server.ssrLoadModule("@pyreon/router") as Promise<
				typeof import("@pyreon/router")
			>,
			server.ssrLoadModule("@pyreon/runtime-server") as Promise<
				typeof import("@pyreon/runtime-server")
			>,
		],
	);

	// Build the SAME app tree the client will hydrate against. `entry-client`
	// imports `layout` from `_layout.tsx` and passes it explicitly to
	// `startClient` → `createApp`. We mirror that here: discover the user's
	// `_layout` (if present) via Vite's SSR module graph and pass it along.
	// Without this, SSR renders a different tree (no outer Layout wrapper)
	// and hydration mismatches at the very first nesting level — cascading
	// into duplicated mounts of every section below.
	let userLayout: unknown
	for (const ext of ['tsx', 'ts', 'jsx', 'js']) {
		try {
			const layoutMod = (await server.ssrLoadModule(
				`/src/routes/_layout.${ext}`,
			)) as { layout?: unknown; default?: unknown }
			userLayout = layoutMod.layout ?? layoutMod.default
			if (userLayout) break
		} catch {
			// Try the next extension. If none exist, createApp uses DefaultLayout.
		}
	}

	// Use zero's own `createApp` rather than reassembling the tree by hand —
	// guarantees server and client agree on every wrapper component (any
	// future change to the App tree only needs to happen in one place).
	// Load via `ssrLoadModule` so app.ts shares Vite's SSR module graph with
	// the user's code: both end up importing the SAME `@pyreon/router` /
	// `@pyreon/core` / `@pyreon/head` instances, so contexts (RouterContext,
	// HeadContext, etc.) match between provider and consumer. A direct Node
	// `import("./app")` would resolve those packages via Node's module graph,
	// producing duplicate context registries that never connect.
	const appMod = (await server.ssrLoadModule(
		"@pyreon/zero/server",
	)) as typeof import("./server")
	type CreateAppLayout = NonNullable<
		Parameters<typeof appMod.createApp>[0]["layout"]
	>
	const { App, router: routerInst } = appMod.createApp({
		routes: routes as import("@pyreon/router").RouteRecord[],
		routerMode: "history",
		url: pathname,
		...(userLayout ? { layout: userLayout as CreateAppLayout } : {}),
	})

	// `preload` loads lazy route components AND runs loaders for `pathname` so
	// the synchronous render pass produces final HTML — no loading fallbacks,
	// no `useLoaderData() === undefined`.
	await routerInst.preload(pathname);

	return runtimeServer.runWithRequestContext(async () => {
		const app = core.h(App as Parameters<typeof core.h>[0], null);

		const { html: appHtml, head } = await headSsr.renderWithHead(app);
		const loaderData = routerPkg.serializeLoaderData(
			routerInst as Parameters<typeof routerPkg.serializeLoaderData>[0],
		);
		const hasData = loaderData && Object.keys(loaderData).length > 0;
		const loaderScript = hasData
			? `<script>window.__PYREON_LOADER_DATA__=${JSON.stringify(loaderData).replace(/<\//g, "<\\/")}</script>`
			: "";

		return template
			.replace("<!--pyreon-head-->", head)
			.replace("<!--pyreon-app-->", appHtml)
			.replace("<!--pyreon-scripts-->", loaderScript);
	});
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
