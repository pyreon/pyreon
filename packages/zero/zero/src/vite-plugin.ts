import { readFile } from 'node:fs/promises'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type { Plugin, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ApiRouteEntry } from './api-routes'
import {
  createApiMiddleware,
  generateApiRouteModule,
  matchApiRoute,
} from './api-routes'
import { resolveConfig } from './config'
// Used in the dev-mode SSR catch handler to convert loader-thrown
// `redirect()` errors into real HTTP redirects (302/307/308).
import { getRedirectInfo } from '@pyreon/router'
import { matchPattern } from './entry-server'

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
import { renderErrorOverlay } from "./error-overlay";
import {
	generateMiddlewareModule,
	applyModeInference,
	generateRouteModuleFromRoutes,
	resolveAutoModeSync,
	scanRouteFiles,
	scanRouteFilesWithExports,
} from "./fs-router";
import { expandRoutesForLocales } from "./i18n-routing";
import { writeRouteTypes } from "./route-types-gen";
import { render404Page } from "./not-found";
import { aiPlugin } from "./ai";
import { faviconPlugin } from "./favicon";
import { fontPlugin } from "./font";
import { fontImportPlugin } from "./font-import-plugin";
import { imagePlugin } from "./image-plugin";
import { ogImagePlugin } from "./og-image";
import { perfAdvisorPlugin } from "./perf-advisor-plugin";
import { seoPlugin } from "./seo";
import { ssgPlugin } from "./ssg-plugin";
import { ssrPlugin } from "./ssr-plugin";
import { themeScript } from "./theme";
import type { ZeroConfig } from "./types";

import { withSilent } from "@pyreon/reactivity";

const VIRTUAL_ROUTES_ID = "virtual:zero/routes";

/**
 * `ssrLoadModule` wrapper that opts out of the `@pyreon/reactivity`
 * singleton sentinel for the duration of the load via a refcount-based
 * scope (`withSilent` from `@pyreon/reactivity`).
 *
 * Zero's dev SSR pipeline legitimately dual-loads `@pyreon/*` packages —
 * the outer Vite plugin process holds one set of module instances (from
 * its own `import` chain), and `ssrLoadModule` evaluates a SECOND set
 * through Vite's SSR module graph for the user's app code. Same package
 * code, two distinct module records — the sentinel would throw and crash
 * the dev server (or SSG build).
 *
 * **Why `withSilent` and NOT `process.env.PYREON_SINGLE_INSTANCE='silent'`
 * + capture/restore**: the prior env-var dance was race-prone under
 * concurrent `Promise.all` of N loads. Two scopes A + B running in
 * parallel: A captures `prev=undefined`, sets `'silent'`; B captures
 * `prev='silent'` (post-A); A's `finally` deletes env; B's `finally`
 * restores `'silent'` — leaking the silence past both scopes
 * permanently. The refcount is order-independent. See
 * `.claude/rules/anti-patterns.md` "Sentinel opt-out for legitimate
 * dual-load" and the bisect-verified test in
 * `packages/core/reactivity/src/tests/singleton-sentinel.test.ts`.
 *
 * Same opt-out pattern as `rocketstyle-collapse.ts`'s nested-SSR resolver
 * and `ssg-plugin.ts`'s built-handler import.
 */
async function ssrLoadModuleQuiet(
	server: ViteDevServer,
	specifier: string,
): Promise<Record<string, unknown>> {
	return withSilent(() => server.ssrLoadModule(specifier));
}
const RESOLVED_VIRTUAL_ROUTES_ID = `\0${VIRTUAL_ROUTES_ID}`;

const VIRTUAL_MIDDLEWARE_ID = "virtual:zero/route-middleware";
const RESOLVED_VIRTUAL_MIDDLEWARE_ID = `\0${VIRTUAL_MIDDLEWARE_ID}`;

const VIRTUAL_API_ROUTES_ID = "virtual:zero/api-routes";
const RESOLVED_VIRTUAL_API_ROUTES_ID = `\0${VIRTUAL_API_ROUTES_ID}`;

/**
 * Per-plugin-instance storage for the user-supplied ZeroConfig. Lets
 * downstream consumers (e.g. `@pyreon/zero-cli`'s `build` command, which
 * loads the user's `vite.config.ts` and inspects its plugin list)
 * recover the original config without us attaching internal state to
 * the public Plugin object via an underscore-prefixed property.
 *
 * Exported via `getZeroPluginConfig(plugin)` so the WeakMap itself
 * stays an implementation detail — callers can't enumerate or mutate
 * the table, only read by Plugin identity.
 */
const zeroPluginConfigMap = new WeakMap<Plugin, ZeroConfig>();

/**
 * Retrieve the `ZeroConfig` that was passed to `zeroPlugin(userConfig)`
 * when the plugin was created. Returns `undefined` if the argument
 * isn't a recognized pyreon-zero main plugin instance.
 */
export function getZeroPluginConfig(plugin: Plugin): ZeroConfig | undefined {
	return zeroPluginConfigMap.get(plugin);
}

/**
 * Detects `--port` / `--port=N` / `-p N` / `-p=N` in `process.argv`.
 * Used by the plugin's `config()` hook to decide whether to apply the
 * default port — when the CLI was invoked with `--port`, the plugin
 * must skip its default so the CLI flag wins (see the comment at the
 * port-handling block in `zeroPlugin()` for the full precedence model).
 *
 * Exported for testing only (the plugin uses it internally).
 *
 * @internal
 */
export function argvHasPortFlag(argv: readonly string[] = process.argv): boolean {
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--port" || a === "-p") return true;
		if (a !== undefined && (a.startsWith("--port=") || a.startsWith("-p=")))
			return true;
	}
	return false;
}

/**
 * Detects `--base` / `--base=PATH` in `process.argv`. Same shape as
 * `argvHasPortFlag` — the plugin's `config()` hook returns `base:
 * config.base` (default `/`) which empirically beats Vite's `--base`
 * CLI flag in the merge order, silently swallowing it. When the CLI
 * was invoked with `--base=X`, the plugin must skip its default so
 * the CLI flag wins (see the comment at the base-handling block in
 * `zeroPlugin()` for the full precedence model).
 *
 * The same bug class was already fixed for `--port`; this is the
 * `base` counterpart. Bisect-verified: removing the
 * `argvHasBaseFlag() && !zeroBaseExplicit` guard at the call site
 * causes `vite build --base=/sub/` to emit assets at root paths
 * instead of `/sub/assets/…`.
 *
 * Exported for testing only (the plugin uses it internally).
 *
 * @internal
 */
export function argvHasBaseFlag(argv: readonly string[] = process.argv): boolean {
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--base") return true;
		if (a !== undefined && a.startsWith("--base=")) return true;
	}
	return false;
}

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
/**
 * Dev-mode template cache (module-level — shared across plugin instances
 * within the same Node process). `index.html` rarely changes during a dev
 * session, but `renderSsr` re-reads + transforms it per SSR request. Cache
 * the raw file content; `handleHotUpdate` invalidates it on file change.
 * `transformIndexHtml` is NOT cached — its output may carry per-request
 * timestamps / nonces injected by other plugins.
 */
let _indexHtmlCache: string | null = null;

/** `zero()`'s accepted config: `ZeroConfig` plus the `mode: 'auto'` input. */
export type ZeroUserConfig = Omit<ZeroConfig, 'mode'> & {
	/** Render mode — or 'auto' (EXPERIMENTAL): infer per route from exports. */
	mode?: ZeroConfig['mode'] | 'auto'
};

export function zeroPlugin(userInput: ZeroUserConfig = {}): Plugin[] {
	// ── mode: 'auto' (EXPERIMENTAL) — resolve inference ONCE, up front ──
	// Per-route inference happens at route-module generation (inference-as-
	// declaration: inferred modes become renderMode literals, so runtime
	// dispatch / build filtering / mode errors need zero auto-awareness).
	// The APP-LEVEL pipeline (server vs pure-static) must be decided at
	// plugin-factory time, before any async hook: scan synchronously.
	let userConfig: ZeroConfig;
	if (userInput.mode === 'auto') {
		const routesDirGuess = `${process.cwd()}/src/routes`;
		const { mode, pages } = resolveAutoModeSync(routesDirGuess, userInput.routeRules, {
			existsSync,
			readdirSync,
			readFileSync,
			statSync,
		});
		// oxlint-disable-next-line no-console
		console.log(
			`[Pyreon] mode: 'auto' → '${mode}' (${pages} page route(s) scanned; the build mode table shows the per-route inference — explicit renderMode exports and routeRules always win)`,
		);
		userConfig = { ...userInput, mode, _autoMode: true };
	} else {
		userConfig = userInput as ZeroConfig;
	}
	const config = resolveConfig(userConfig);
	let routesDir: string;
	let root: string;

	const mainPlugin: Plugin = {
		name: "pyreon-zero",
		enforce: "pre",

		configResolved(resolvedConfig) {
			root = resolvedConfig.root;
			routesDir = `${root}/src/routes`;
			// Sync `__ZERO_BASE__` to the FINAL resolved base. The config()
			// hook above seeds it with `config.base` (the zero({base})
			// value), but when `vite --base=/X/` wins precedence (because
			// argvHasBaseFlag fires and userConfig.base was undefined), the
			// resolved base differs. Without this sync, `startClient` and
			// the SSG entry would set the router base to '/' while Vite
			// serves assets at /X/ — RouterLink hrefs would resolve to the
			// wrong paths and 404 on navigation. configResolved runs before
			// any transform sees the define values, so mutating it here is
			// the supported way to keep the build-time constant aligned.
			if (resolvedConfig.define && resolvedConfig.base !== undefined) {
				resolvedConfig.define.__ZERO_BASE__ = JSON.stringify(
					resolvedConfig.base,
				);
			}
		},

		async buildStart() {
			// Typed routes (opt-in): generate src/pyreon-routes.d.ts once at
			// build/dev start so `<Link href>` autocomplete is available.
			if (config.typedRoutes) {
				await writeRouteTypes(routesDir, root, config.mode ?? "ssr");
			}
		},

		handleHotUpdate(ctx) {
			// Invalidate cached index.html when the file itself OR any of its
			// imported deps change. Vite calls this per-file change; we filter
			// to just `<root>/index.html`. Cache stays warm across all other
			// HMR updates (user code, deps, etc.).
			if (ctx.file === `${root}/index.html`) {
				_indexHtmlCache = null;
			}
			// NOTE: typed-routes regen is NOT wired here. `handleHotUpdate` fires
			// only for Vite `type: "update"` (content EDITS), never for add/delete
			// — and a content edit can't change a route's urlPath — so it would
			// never do useful work. The regen lives in the `server.watcher`
			// add/unlink handler above, where route-SET changes actually land.
		},

		/**
		 * W19 — auto-inject the client entry script
		 * before `<!--pyreon-scripts-->` so users don't have to remember
		 * to add `<script type="module" src="/src/entry-client.ts">` to
		 * `index.html` by hand.
		 *
		 * Skipped when:
		 * - `config.entryClient === false` (explicit opt-out)
		 * - html doesn't contain `<!--pyreon-scripts-->` (not a Zero-shaped template)
		 * - html already contains a `<script type="module"` referencing the entry
		 */
		transformIndexHtml: {
			order: 'pre',
			handler(html) {
				if (config.entryClient === false) return html;
				const entry = config.entryClient ?? '/src/entry-client.ts';
				if (!html.includes('<!--pyreon-scripts-->')) return html;
				if (html.includes(`src="${entry}"`)) return html;
				if (html.includes(`src='${entry}'`)) return html;
				const tag = `<script type="module" src="${entry}"></script>`;
				return html.replace(
					'<!--pyreon-scripts-->',
					`${tag}\n    <!--pyreon-scripts-->`,
				);
			},
		},

		resolveId(id) {
			if (id === VIRTUAL_ROUTES_ID) return RESOLVED_VIRTUAL_ROUTES_ID;
			if (id === VIRTUAL_MIDDLEWARE_ID) return RESOLVED_VIRTUAL_MIDDLEWARE_ID;
			if (id === VIRTUAL_API_ROUTES_ID) return RESOLVED_VIRTUAL_API_ROUTES_ID;
		},

		async load(id, loadOptions) {
			if (id === RESOLVED_VIRTUAL_ROUTES_ID) {
				try {
					// Detect each file's optional exports up front so the
					// generator emits the optimal shape:
					//   • lazy() for routes that only export `default` (best code splitting)
					//   • Direct mod.loader/.guard/.meta access for routes with metadata
					//   • No spurious IMPORT_IS_UNDEFINED warnings from Rolldown
					const baseRoutes = await scanRouteFilesWithExports(routesDir, config.mode);
					// PR H — fan routes into per-locale variants when `i18n` is
					// configured. No-op when unset; identity-returns the input
					// otherwise so existing apps see byte-identical output.
					const expandedRoutes = config.i18n
						? expandRoutesForLocales(baseRoutes, config.i18n)
						: baseRoutes;
					// mode: 'auto' — inference-as-declaration (see zeroPlugin head).
					const routes = config._autoMode ? applyModeInference(expandedRoutes) : expandedRoutes;
					// SSG mode: lazy() route splitting by default (parity with
					// SSR/SPA). Opt-out via `ssg.splitChunks: false` for tiny
					// sites that prefer single-chunk + instant navigation.
					//
					// Pre-2026-Q3: SSG was hardcoded to `staticImports: true`
					// (bundle everything). Trade-off was instant post-hydration
					// nav, but the initial bundle grew linearly with route
					// count — a 50-route docs site shipped all 50 route
					// components on first paint. Lazy splitting (now the
					// default for SSG) fixes that: only the landing route +
					// deps load up front, the rest fetch on navigation. See
					// `ssg.splitChunks` JSDoc in types.ts for the crossover-
					// point rationale.
					const ssgSplitDisabled =
						config.mode === "ssg" && config.ssg?.splitChunks === false;
					return generateRouteModuleFromRoutes(routes, routesDir, {
						staticImports: ssgSplitDisabled,
						// Phase 5 — the SSR module graph gets the real serverLoader
						// function imports; the client graph gets only the
						// hasServerLoader marker (the .server.ts sibling is
						// structurally unreachable from the client bundle).
						serverLoaders: loadOptions?.ssr === true,
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
			// Dev-mode API-route middleware — production wires `createApiMiddleware`
			// via `createServer`, but dev had no equivalent. API requests fell
			// through to Vite's default 404. This middleware loads the
			// `virtual:zero/api-routes` module and dispatches matching requests to
			// the route's `GET()` / `POST()` / etc. handler. Mirrors the production
			// flow in `entry-server.ts` minus the ergonomic helpers (auth, cors,
			// etc. — those plug in via user-defined Pyreon middleware which dev
			// doesn't currently load; not in scope here).
			//
			// Registered FIRST so API requests don't get SSR'd or 404'd.
			server.middlewares.use((req, res, next) => {
				const pathname = req.url?.split("?")[0] ?? "/";
				if (pathname.startsWith("/@") || pathname.startsWith("/__"))
					return next();
				// Skip files (extension-bearing) — let Vite's static pipeline serve.
				if (/\.\w+$/.test(pathname)) return next();

				dispatchApiRoute(server, req, res).then(
					(handled) => {
						if (!handled) next();
					},
					(err: unknown) => {
						// oxlint-disable-next-line no-console
						console.error("[Pyreon] Error in dev API dispatcher:", err);
						next();
					},
				);
			});

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

					// Build a Web Request from the Node IncomingMessage so loaders
					// can read cookies / auth headers via `ctx.request` and call
					// `redirect()` from a server-side context.
					const reqHost = req.headers.host ?? "localhost";
					const reqUrl = new URL(req.url ?? "/", `http://${reqHost}`);
					const reqHeaders = new Headers();
					for (const [key, value] of Object.entries(req.headers)) {
						if (value !== undefined) {
							reqHeaders.set(
								key,
								Array.isArray(value) ? value.join(", ") : String(value),
							);
						}
					}
					const webReq = new Request(reqUrl.href, {
						method: req.method ?? "GET",
						headers: reqHeaders,
					});

					renderSsr(server, root, req.originalUrl ?? pathname, pathname, webReq).then(
						(result) => {
							if (result === null) return next();
							if (result.kind === "redirect") {
								// Loader-thrown `redirect()` — real HTTP redirect, same
								// contract as the production handler (302/307/308 +
								// Location). renderSsr surfaces it as data now that the
								// shared renderPage catches the throw internally.
								res.statusCode = result.status;
								res.setHeader("Location", result.to);
								res.end();
								return;
							}
							res.statusCode = result.status;
							res.setHeader("Content-Type", "text/html; charset=utf-8");
							res.setHeader("Content-Length", Buffer.byteLength(result.html));
							res.end(result.html);
						},
						(err: unknown) => {
							// Loader-thrown `redirect()` — convert to a real HTTP redirect
							// (302/307/308) BEFORE the layout renders. This is the dev-mode
							// equivalent of the production handler's redirect catch.
							const info = getRedirectInfo(err);
							if (info) {
								res.statusCode = info.status;
								res.setHeader("Location", info.url);
								res.end();
								return;
							}
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
				// W24 from chat audit — skip `/api/*` paths so user plugins that
				// register their own dev API middleware (via `configureServer`)
				// aren't shadowed by this 404 handler when their middleware is
				// registered AFTER Zero's (the typical plugin order). The dev
				// API-route dispatcher at line ~277 already handles fs-router
				// `src/routes/api/*` paths; anything else under `/api/*` falls
				// through to user middleware OR to Vite's terminal 404 — both
				// of which are correct outcomes.
				if (pathname.startsWith("/api/")) return next();

				handle404(
					server,
					routesDir,
					pathname,
					res,
					root,
					req.originalUrl ?? pathname,
				).then(
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
					// Typed routes: the route SET changed (add / rename / remove),
					// so regenerate src/pyreon-routes.d.ts. This is the correct hook
					// for it — `handleHotUpdate` fires only on content EDITS (Vite's
					// `type: "update"`), which never change a route's urlPath, so the
					// regen belongs here where add/unlink actually land.
					if (config.typedRoutes) {
						void writeRouteTypes(routesDir, root, config.mode ?? "ssr");
					}
					server.ws.send({ type: "full-reload" });
				}
			});
		},

		config(viteUserConfig) {
			// Discover all @pyreon/* packages installed in node_modules.
			// The "bun" export condition points to TS source — esbuild's
			// dep optimizer would compile them with the wrong JSX runtime.
			const cwd = viteUserConfig.root ?? process.cwd()
			const pyreonExclude = scanPyreonPackages(cwd)

			// `@pyreon/runtime-server` and `@pyreon/server` are only imported by
			// zero's dev SSR middleware and the production server entry — apps
			// rarely list them as direct deps. Resolve each to the copy nested
			// under zero so `ssrLoadModule("@pyreon/runtime-server")` and
			// `ssrLoadModule("@pyreon/server")` (the shared `renderPage`
			// pipeline) work uniformly.
			const runtimeServerAlias = resolveNestedPackage(
				cwd,
				"@pyreon/runtime-server",
			)
			const serverPkgAlias = resolveNestedPackage(cwd, "@pyreon/server")
			// ARRAY form with an EXACT-match RegExp for `@pyreon/server`: a plain
			// string alias does PREFIX matching (rollup-alias semantics), which
			// rewrote `@pyreon/server/client` — imported by zero's own client-safe
			// index — to `<nested-dir>/client`, bypassing the package's exports
			// map and failing import-analysis with "Does the file exist?" (caught
			// by the zero-hmr e2e; the main-entry alias must never swallow
			// subpath imports). `@pyreon/runtime-server` keeps the string form —
			// it has no subpath consumers and the prefix shape has shipped fine.
			const pyreonServerAliases = [
				...(runtimeServerAlias
					? [{ find: "@pyreon/runtime-server", replacement: runtimeServerAlias }]
					: []),
				...(serverPkgAlias
					? [{ find: /^@pyreon\/server$/, replacement: serverPkgAlias }]
					: []),
			]
			const hasServerAliases = pyreonServerAliases.length > 0

			return {
				resolve: {
					conditions: ['bun'],
					...(hasServerAliases ? { alias: pyreonServerAliases } : {}),
				},
				// Vite's SSR module graph has its own resolver that defaults to the
				// "node" condition — which would pick the built `lib/index.js` for
				// every `@pyreon/*` package and bypass workspace source edits. Mirror
				// the client-side "bun" condition + alias so dev SSR uses `src/`.
				ssr: {
					resolve: {
						conditions: ['bun'],
						...(hasServerAliases ? { alias: pyreonServerAliases } : {}),
					},
				},
				optimizeDeps: {
					exclude: pyreonExclude,
				},
				// Port handling — the zero-canonical default is 3000 (matches
				// `zero dev` / `zero preview` / the runtime adapter, and
				// matches Next.js / Remix / Astro convention).
				//
				// Apply the default UNLESS Vite's CLI was invoked with
				// `--port`/`-p` (in which case the CLI flag must win).
				// Returning `server: { port: 3000 }` unconditionally
				// clobbered `vite --port 517N --strictPort` in the e2e
				// playwright config — every webServer timed out. argv
				// detection here lets the CLI win at the source.
				//
				// Precedence (CLI > user vite.config > zero({port}) > 3000):
				//   1. `vite --port N` → argvHasPortFlag() === true → plugin
				//      omits `server.port` entirely → CLI value wins
				//   2. User `vite.config.ts server: { port: N }` → user
				//      config beats plugin in Vite's merge order
				//   3. `zero({ port: N })` → resolved into `config.port`
				//   4. Default 3000 — when no other source set a port
				//
				// `process.argv` is populated by the time Vite invokes the
				// plugin's config() hook (Vite calls plugins synchronously
				// during CLI bootstrap before applying inline overrides).
				...(userConfig.port === undefined && argvHasPortFlag()
					? {}
					: { server: { port: config.port } }),
				// Propagate `zero({ base })` to Vite's `base` config — that's
				// what controls asset URL rewriting in the built HTML/JS
				// (`<script src="/blog/assets/…">`).
				//
				// Precedence (CLI > user vite.config > zero({base}) > '/'):
				//   1. `vite --base=/X/` → argvHasBaseFlag() === true AND
				//      userConfig.base undefined → plugin omits `base`
				//      entirely → CLI value wins.
				//   2. `vite.config.ts { base: '/X/' }` → user config beats
				//      plugin in Vite's merge order automatically — no
				//      special handling needed.
				//   3. `zero({ base: '/X/' })` → resolved into `config.base`
				//      → returned here.
				//   4. Default `/` — when no other source set a base.
				//
				// Pre-fix this was unconditional `base: config.base`, which
				// silently swallowed the CLI `--base` flag (plugin BASE
				// returns of the default `/` won the merge against CLI in
				// every empirically tested case — the same bug class already
				// fixed for `--port` via argvHasPortFlag). Symptom: `vite
				// build --base=/sub/` emitted `<script src="/assets/…">`
				// instead of `/sub/assets/…`, so every asset 404'd on a
				// subpath deploy. Discovered when the docs site preview
				// deploy at /pyreon/ shipped a white screen.
				//
				// `__ZERO_BASE__` define ALWAYS reflects config.base here
				// because that's what `startClient` / `createApp` read for
				// router base prefix matching. When the CLI flag is what's
				// actually applied (case 1), `configResolved` overrides
				// this define with the FINAL resolved value.
				...(userConfig.base === undefined && argvHasBaseFlag()
					? {}
					: { base: config.base }),
				define: {
					__ZERO_MODE__: JSON.stringify(config.mode),
					__ZERO_BASE__: JSON.stringify(config.base),
				},
			};
		},
	};

	// Stash the original user config keyed by plugin identity so the CLI
	// (which loads vite.config.ts and inspects the plugin list) can
	// recover it via `getZeroPluginConfig(plugin)` without us hanging a
	// `_`-prefixed property off the public Plugin object.
	zeroPluginConfigMap.set(mainPlugin, userConfig);

	// Each render mode auto-wires its build-time companion plugin:
	//   - `ssg` → ssgPlugin (prerender every path to dist/<path>/index.html)
	//   - `ssr` / `isr` → ssrPlugin (bundle the SSR handler into
	//     dist/server/entry-server.js + dispatch adapter.build({ kind: 'ssr' }))
	//   - `spa` → no companion (SPA ships a client bundle only)
	//
	// Each companion is `apply: 'build'` so it never runs during
	// `vite dev` (runtime dev SSR is handled by mainPlugin's
	// `configureServer` middleware). Each one internally no-ops when
	// the mode doesn't match (defense-in-depth) but we omit them from
	// the chain entirely for clarity — one less closeBundle to call.
	const plugins: Plugin[] = [mainPlugin];
	// Opt-in build perf advisor. Pushed BEFORE ssgPlugin so its closeBundle
	// reads `dist/.vite/manifest.json` before the SSG plugin deletes it; in
	// any mode where ssgPlugin joins the chain (ssg/ssr/isr) it defers
	// manifest cleanup to the SSG plugin (which owns it for modulepreload).
	if (userConfig.perfAdvisor) {
		const ssgInChain =
			config.mode === "ssg" || config.mode === "ssr" || config.mode === "isr";
		plugins.push(
			perfAdvisorPlugin({
				...(typeof userConfig.perfAdvisor === "object" ? userConfig.perfAdvisor : {}),
				cleanupManifest: !ssgInChain,
			}),
		);
	}
	if (config.mode === "ssg") plugins.push(ssgPlugin(userConfig));
	if (config.mode === "ssr" || config.mode === "isr") {
		// Phase 2 — hybrid rendering: the SSG plugin ALSO joins server-mode
		// builds to prerender routes that declare `renderMode = 'ssg'`. Its
		// closeBundle is a cheap no-op when no route declares a static mode
		// (one file scan, no SSR sub-build). ORDER MATTERS: ssgPlugin runs
		// BEFORE ssrPlugin so prerendered `dist/<path>/index.html` files
		// exist when the ssrPlugin's adapter staging copies the client dir —
		// after staging they'd miss the `dist/client/` copy the emitted
		// node/bun server and CDN adapters serve static-first from.
		plugins.push(ssgPlugin(userConfig));
		plugins.push(ssrPlugin(userConfig));
	}

	// W20 — auto-wire imagePlugin and fontPlugin so `<Image>` / `<Font>` work
	// out of the box. Each is opt-out via `image: false` / `font: false`.
	// Auto-wired with `{}` (default config) when the field is undefined.
	// User-supplied object overrides per-field defaults.
	//
	// Why default-on: the original goal — "out of the box optimization, can
	// be disabled". A user installs `@pyreon/zero`, imports an image, and
	// expects AVIF/WebP/blur-placeholder/srcset to Just Work without
	// learning the imagePlugin API. Same for fontPlugin — declared fonts
	// are self-hosted, preloaded, font-display: swap'd, all from one config.
	if (userConfig.image !== false) {
		plugins.push(imagePlugin(userConfig.image ?? {}));
	}
	if (userConfig.font !== false) {
		plugins.push(fontPlugin(userConfig.font ?? {}));
		// `?font` import plugin pairs with `fontPlugin` — both are part of
		// the font integration; same opt-out flag. The plugin only acts
		// when a `?font` query is actually used; no cost otherwise.
		plugins.push(fontImportPlugin());
	}

	// Config-present auto-wiring for the remaining DX plugins — one config
	// surface (`zero({ seo, favicon, og, ai })`) instead of four manual
	// imports + plugin entries. Unlike image/font these are NOT default-on:
	// each needs user input to do anything meaningful (an origin, a source
	// icon, templates), so `undefined` simply means "not used" and there is
	// no `false` opt-out to learn. Supplying the config IS the opt-in.
	if (userConfig.seo) plugins.push(seoPlugin(userConfig.seo));
	if (userConfig.og) plugins.push(ogImagePlugin(userConfig.og));
	if (userConfig.ai) plugins.push(aiPlugin(userConfig.ai));

	// Favicon: explicit config wins; `false` opts out entirely; OMITTED falls
	// back to FILE-CONVENTION auto-detect (`src/favicon.svg` / `src/favicon.png`
	// → full set with defaults, like Next's `app/icon.png`). The auto-detected
	// wiring carries `autoDetected: true` so a missing `sharp` soft-degrades to
	// a build warning instead of a hard error (the user never explicitly asked).
	if (userConfig.favicon) {
		plugins.push(faviconPlugin(userConfig.favicon));
	} else if (userConfig.favicon !== false) {
		const detected = detectConventionFavicon();
		if (detected) plugins.push(faviconPlugin({ source: detected, autoDetected: true }));
	}

	// Pre-paint theme script injection (`zero({ theme: true })`) — the manual
	// `<script>{themeScript}</script>` head step, automated.
	if (userConfig.theme) plugins.push(themeScriptInjectPlugin());

	return plugins;
}

/**
 * File-convention favicon detection — `src/favicon.svg` (preferred: one
 * scalable source renders every size) or `src/favicon.png`, relative to the
 * project root. `public/favicon.svg` is deliberately NOT detected: Vite
 * copies `public/` verbatim, so the plugin's emitted `favicon.svg` would
 * collide with it.
 *
 * Uses `process.cwd()` by default — vite.config.ts always evaluates with
 * cwd = project root (same assumption every file-convention Vite plugin
 * makes at construction time; the resolved Vite root isn't known until the
 * `config` hook, which is too late to decide the plugin list).
 *
 * @internal exported for testing
 */
export function detectConventionFavicon(root: string = process.cwd()): string | null {
	for (const candidate of ["src/favicon.svg", "src/favicon.png"]) {
		if (existsSync(join(root, candidate))) return candidate;
	}
	return null;
}

/**
 * Injects zero's pre-paint `themeScript` into every page `<head>` (prepend,
 * so it runs before stylesheets paint — that's the whole FOUC-prevention
 * point). Content is the same `themeScript` string users previously pasted
 * manually, so `themeScriptCspHash` covers the injected tag under a strict
 * CSP unchanged.
 */
function themeScriptInjectPlugin(): Plugin {
	return {
		name: "pyreon-zero-theme-script",
		transformIndexHtml: {
			order: "pre",
			handler() {
				return [
					{
						tag: "script",
						children: themeScript,
						injectTo: "head-prepend" as const,
					},
				];
			},
		},
	};
}

/**
 * Dev-mode API-route dispatcher. Loads the `virtual:zero/api-routes` virtual
 * module, builds a Web `Request` from the Node `IncomingMessage`, and invokes
 * the matching route's HTTP-method handler.
 *
 * Returns `true` if the API middleware handled the request (response written).
 * Returns `false` if no route matched (caller falls through to next middleware).
 *
 * Mirrors what `createServer` wires up in production via `createApiMiddleware`,
 * but adapted for Vite's connect-style middleware stack — needs a Node→Web
 * request adapter.
 */
async function dispatchApiRoute(
	server: ViteDevServer,
	req: IncomingMessage,
	res: ServerResponse,
): Promise<boolean> {
	let apiRoutes: ApiRouteEntry[];
	try {
		const mod = await ssrLoadModuleQuiet(server, VIRTUAL_API_ROUTES_ID);
		apiRoutes = (mod.apiRoutes ?? []) as ApiRouteEntry[];
	} catch {
		return false;
	}
	if (apiRoutes.length === 0) return false;

	const host = req.headers.host ?? "localhost";
	const url = new URL(req.url ?? "/", `http://${host}`);
	const pathname = url.pathname;

	// Quick gate: only build the Web Request when the path actually matches
	// an api route. Reuses the same `matchApiRoute` that `createApiMiddleware`
	// uses internally — including catch-all `:param*` patterns from
	// `[...slug].ts` API routes — so the gate and the dispatcher agree on
	// what counts as a match. Avoids per-request body buffering for SSR /
	// static traffic that doesn't target an API route.
	const anyMatch = apiRoutes.some((r) => matchApiRoute(r.pattern, pathname) !== null);
	if (!anyMatch) return false;

	// Convert Node IncomingMessage → Web Request. Stream the request body
	// for non-GET/HEAD via `Readable.toWeb` instead of buffering — large
	// uploads (multipart, file POSTs) don't have to fit in memory before
	// the handler sees them. `duplex: 'half'` is required by the WHATWG
	// fetch spec when `body` is a `ReadableStream`.
	const method = (req.method ?? "GET").toUpperCase();
	const headers = new Headers();
	for (const [key, value] of Object.entries(req.headers)) {
		if (value !== undefined) {
			headers.set(key, Array.isArray(value) ? value.join(", ") : String(value));
		}
	}
	const requestInit: RequestInit & { duplex?: "half" } = { method, headers };
	if (method !== "GET" && method !== "HEAD") {
		// `Readable.toWeb` returns Node's `node:stream/web` `ReadableStream`;
		// `RequestInit.body` expects the DOM `ReadableStream`. They're
		// structurally identical at runtime but TS keeps them as separate
		// types — `as unknown as` is the standard bridge per TS's own
		// "convert to unknown first" suggestion.
		requestInit.body = Readable.toWeb(req) as unknown as ReadableStream<Uint8Array>;
		requestInit.duplex = "half";
	}
	const webReq = new Request(url.href, requestInit);

	const middleware = createApiMiddleware(apiRoutes);
	const response = await middleware({
		req: webReq,
		url,
		path: pathname + url.search,
		headers: new Headers(),
		locals: {},
	});

	if (!response) return false;

	// Pipe the Web Response body directly to the Node response stream
	// instead of buffering with `arrayBuffer()`. Critical for SSE, large
	// downloads, and any handler that returns a `Response` constructed
	// from a streaming source — buffering would defeat the streaming
	// contract and OOM on large payloads.
	res.statusCode = response.status;
	response.headers.forEach((v, k) => {
		res.setHeader(k, v);
	});
	if (response.body) {
		// `pipe(res)` ends `res` automatically on stream completion and
		// auto-cancels the upstream Web ReadableStream if the client
		// disconnects (Node ≥18). We don't await — once the headers and
		// pipe are wired, the function's job is done. The connect chain
		// doesn't call `next()` because we resolved with `true`.
		// `response.body` is a DOM `ReadableStream`; `Readable.fromWeb`
		// expects `node:stream/web`'s `ReadableStream`. Cross-realm types
		// don't unify in TS — bridge via `unknown` per TS's own guidance.
		Readable.fromWeb(
			response.body as unknown as import("node:stream/web").ReadableStream,
		).pipe(res);
	} else {
		res.end();
	}
	return true;
}

/**
 * 404 handler for unmatched URLs in dev. Three behaviours:
 *
 *   1. If the URL matches a real route pattern, return false (caller falls
 *      through to the next middleware — Vite's SPA shell etc.).
 *   2. Otherwise, try `renderSsr`. Even for `mode: 'ssg'` / `mode: 'spa'`
 *      apps (no upstream SSR middleware registered) this works in dev: the
 *      router's `findNotFoundFallback` (PR L5 / M1.2) walks the routes
 *      tree, finds a `notFoundComponent` (`_404.tsx` / `_not-found.tsx`)
 *      attached to the deepest matching parent layout, builds a synthetic
 *      chain `[...layouts, syntheticLeaf]`, and renderSsr produces 404
 *      HTML INSIDE the layout's chrome — matching what `dist/404.html`
 *      ships at build time.
 *   3. If renderSsr returns null (no `notFoundComponent` reachable from
 *      any layout), fall back to a bare static HTML page so the user
 *      gets SOMETHING.
 *
 * **Pre-fix this function ALWAYS emitted the bare static page in step 3**,
 * ignoring any user-provided `_404.tsx` / `_not-found.tsx`. For
 * `mode: 'ssr'` apps the upstream SSR middleware caught the 404 first
 * (so a `_404.tsx` worked there), but for `mode: 'ssg'` / `mode: 'spa'`
 * apps the SSR middleware never registered and unmatched URLs fell
 * through here directly — dev showed the bare fallback while the
 * SSG-built `dist/404.html` shipped the branded version. Production-
 * vs-dev drift; no warning.
 *
 * For `mode: 'ssr'` apps the upstream SSR middleware is still the
 * primary path (cheap when matched). renderSsr may be called twice on a
 * truly-unmatched URL (once by the upstream middleware, once here as
 * fallback). The duplicate cost is purely a no-op `resolveRoute` call
 * returning `matched: []` again — no extra render work.
 *
 * Returns true if the 404 was handled (response sent), false if the path
 * actually matches a route (caller continues to next middleware).
 */
async function handle404(
	server: import("vite").ViteDevServer,
	_routesDir: string,
	pathname: string,
	res: import("http").ServerResponse,
	root: string,
	originalUrl: string,
): Promise<boolean> {
	const mod = await ssrLoadModuleQuiet(server, VIRTUAL_ROUTES_ID);
	const routes = mod.routes as Array<{ path?: string; children?: unknown[] }>;
	const patterns = flattenRoutePatterns(routes);

	if (patterns.some((pattern) => matchPattern(pattern, pathname))) {
		return false; // Route matches — not a 404
	}

	// Try the router-driven path: renderSsr → resolveRoute →
	// findNotFoundFallback. Returns layout-wrapped 404 HTML + status 404 if
	// any reachable `notFoundComponent` matches; returns null only when no
	// `_404.tsx` / `_not-found.tsx` exists anywhere in the routes tree.
	//
	// Try/catch protects against ssrLoadModule failures (e.g. the user's
	// `app.ts` has a syntax error in dev): we'd rather serve the bare
	// fallback than crash the 404 handler. The caller's error path catches
	// `next(err)` if renderSsr rejects in a way we can't recover from.
	try {
		const result = await renderSsr(server, root, originalUrl, pathname);
		// A loader-thrown redirect on the 404 path is nonsensical (skipLoaders
		// isn't set here, but the not-found probe rarely has loaders) — treat
		// anything that isn't rendered HTML as "fall through to the bare page".
		if (result !== null && result.kind === "html") {
			res.statusCode = result.status;
			res.setHeader("Content-Type", "text/html; charset=utf-8");
			res.setHeader("Content-Length", Buffer.byteLength(result.html));
			res.end(result.html);
			return true;
		}
	} catch {
		// Fall through to bare HTML below.
	}

	// No `notFoundComponent` reachable + renderSsr returned null — emit a
	// minimal static page so the user gets SOMETHING. Apps that want
	// branded 404s should add `_404.tsx` (or `_not-found.tsx`) to their
	// routes tree.
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
	req?: Request,
): Promise<
	| { kind: "html"; html: string; status: number }
	| { kind: "redirect"; to: string; status: number }
	| null
> {
	const routesMod = await ssrLoadModuleQuiet(server, VIRTUAL_ROUTES_ID);
	const routes = routesMod.routes as Array<{
		path?: string;
		children?: unknown[];
	}>;

	// Read + transform index.html (Vite injects the HMR client / JSX prelude).
	// Cache the raw file content across requests; handleHotUpdate invalidates
	// on file change. Saves a disk read per SSR request in dev mode.
	if (_indexHtmlCache === null) {
		_indexHtmlCache = await readFile(join(root, "index.html"), "utf-8");
	}
	const template = await server.transformIndexHtml(
		originalUrl,
		_indexHtmlCache,
	);

	// Phase 1 (render-pipeline unification): the per-page render sequence is
	// the SHARED `renderPage` from @pyreon/server — the same function the
	// production handler and the SSG prerender entry run. Dev only supplies
	// the app/router and composes into the Vite-transformed template.
	//
	// Both `@pyreon/server` and `@pyreon/zero/server` load through Vite's SSR
	// module graph (`ssrLoadModule`) so the `@pyreon/core` / `@pyreon/router` /
	// `@pyreon/head` instances renderPage imports are the SAME instances the
	// user's route components see. A direct Node `import("@pyreon/server")`
	// would resolve those packages via Node's module graph, producing
	// duplicate context registries that never connect (the documented
	// dual-instance hazard — same reason `createApp` loads via ssrLoadModule).
	//
	// Don't auto-load `_layout.tsx` as an outer Layout — fs-router already
	// emits it as a parent route in the matched chain; wrapping again double-
	// mounts (duplicate <nav>, hydration mismatches; see app.ts:createApp).
	const serverPkg = (await ssrLoadModuleQuiet(
		server,
		"@pyreon/server",
	)) as unknown as typeof import("@pyreon/server");
	const appMod = (await ssrLoadModuleQuiet(
		server,
		"@pyreon/zero/server",
	)) as unknown as typeof import("./server");
	const { App, router: routerInst } = appMod.createApp({
		routes: routes as import("@pyreon/router").RouteRecord[],
		routerMode: "history",
		url: pathname,
	});

	// M1.2 — Unmatched URLs no longer bail to a static 404 page here; the
	// router's `resolveRoute` (PR L5) builds a synthetic `notFoundComponent`
	// chain with `isNotFound: true` and the render produces 404 HTML inside
	// the layout chrome. `bailOnUnmatched` covers the remaining case (no
	// reachable `notFoundComponent` → `matched` stays empty → fall through
	// to `handle404`'s static fallback).
	const result = await serverPkg.renderPage(
		App as Parameters<typeof serverPkg.renderPage>[0],
		routerInst as Parameters<typeof serverPkg.renderPage>[1],
		pathname,
		{
			...(req ? { request: req } : {}),
			bailOnUnmatched: true,
		},
	);

	if (result.kind === "unmatched") return null;
	if (result.kind === "redirect") {
		// Surface the loader-thrown `redirect()` AS DATA — the dev middleware
		// (the caller) converts it to a real HTTP Location response, exactly
		// as it did pre-unification when the throw propagated as a rejection.
		// (The first unification cut returned a meta-refresh page here, which
		// REGRESSED the redirect-status contract — caught by the cpa e2e's
		// permanent-redirect spec: 200-with-meta-refresh instead of 308.)
		return { kind: "redirect", to: result.to, status: result.status };
	}

	const html = template
		.replace("<!--pyreon-head-->", result.head)
		.replace("<!--pyreon-app-->", result.appHtml)
		.replace("<!--pyreon-scripts-->", result.loaderScript);
	return { kind: "html", html, status: result.status };
}

/**
 * Extract all URL patterns from a nested route tree.
 *
 * The fs-router emits ABSOLUTE paths for every route, including grandchildren —
 * `{ path: "/app/dashboard" }` not `{ path: "dashboard" }`. The matcher reads
 * each route's `path` as-is; no prefix accumulation. Pre-fix, this function
 * concatenated `${prefix}${route.path}` which produced patterns like
 * `///app/app/dashboard` (prefix `'/app'` + path `'/app/dashboard'`). After
 * `path.split('/').filter(Boolean)` those became `['app', 'app', 'dashboard']`
 * — which can't match a real `/app/dashboard` request — so dev-server returned
 * 404 for every nested-layout route. Re-enables the nested-layout specs
 * that rely on `/app/*` routing.
 */
function flattenRoutePatterns(
	routes: Array<{ path?: string; children?: unknown[] }>,
): string[] {
	const patterns: string[] = [];
	for (const route of routes) {
		if (!route.path) continue;
		patterns.push(route.path);
		if (route.children) {
			patterns.push(
				...flattenRoutePatterns(
					route.children as Array<{ path?: string; children?: unknown[] }>,
				),
			);
		}
	}
	return patterns;
}
