import { readFile } from 'node:fs/promises'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, sep } from 'node:path'
import { generateActionManifest, isActionSourceFile, mayDefineActions } from './action-manifest'
import { transformServerActions } from './actions-transform'
import { innerBuildActiveInProcess, innerBuildFlagSet } from './build-flags'
import { collectBuildStats, detectColorLevel, formatBuildSummary } from './build-summary'
import { Readable } from 'node:stream'
import type { ConfigEnv, Plugin, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ApiRouteEntry } from './api-routes'
import { generateApiRouteModule } from './api-routes'
import { resolveConfig } from './config'
import { assertPublicEnv, loadPublicEnvVars } from './public-env'
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
	detectIsrAuthRisk,
	warnIsrAuthRisk,
	generateRouteModuleFromRoutes,
	resolveAutoModeSync,
	routesDeclareLoadersSync,
	scanRouteFiles,
	scanRouteFilesWithExports,
	invalidateRouteScanCache,
	assertRouteFileShapes,
} from "./fs-router";
import { validateZeroConfig } from "./config-validation";
import { expandRoutesForLocales } from "./i18n-routing";
import { writeRouteTypes } from "./route-types-gen";
import { render404Page } from "./not-found";
import { aiPlugin } from "./ai";
import { pwaPlugin } from "./pwa";
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
import { serializeServerConfig } from "./server-config";
import { clientFlagsPlugin } from "./client-flags-plugin";
import type { RouteMiddlewareEntry, ZeroConfig } from "./types";

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
 * `.agents/rules/anti-patterns.md` "Sentinel opt-out for legitimate
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
 * PZ-11 — does `url` fall under one of the configured `server.proxy`
 * context keys? Mirrors Vite's own `doesProxyContextMatchUrl` semantics
 * exactly (vite/src/node/server/middlewares/proxy.ts): a context starting
 * with `^` is a RegExp tested against the URL; any other context is a
 * plain prefix match. Vite matches on `req.url` — the FULL url INCLUDING
 * the query string — so callers must pass `req.url`, not a stripped
 * pathname, or the guard and the downstream proxy middleware could
 * disagree on ownership.
 *
 * The one deliberate divergence: an invalid `^…` RegExp is treated as
 * non-matching instead of throwing — a throw here would 500 the request
 * from INSIDE zero's middleware, pointing the stack at the wrong owner
 * (the config error is the user's proxy key, which Vite's own middleware
 * will surface on its first matching request).
 *
 * @internal exported for testing
 */
export function matchesProxyContext(
	url: string,
	contexts: readonly string[],
): boolean {
	for (const context of contexts) {
		if (context[0] === "^") {
			try {
				if (new RegExp(context).test(url)) return true;
			} catch {
				// Invalid RegExp context — see JSDoc.
			}
		} else if (url.startsWith(context)) {
			return true;
		}
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
	validateZeroConfig(userInput);
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
	// Files the current action manifest maps (see action-manifest.ts). The
	// dev watcher regenerates the manifest when a file joins or leaves it.
	let actionManifestFiles = new Set<string>();
	let root: string;
	// PZ-11 — `server.proxy` context keys, captured in configResolved. The
	// dev middlewares below register during `configureServer` (which runs
	// BEFORE Vite installs its internal middlewares, proxy included), so
	// they sit UPSTREAM of the proxy. Any URL owned by a proxy context must
	// fall through (`next()`) or zero's SSR/404 catch-alls swallow it.
	let proxyContexts: string[] = [];

	const mainPlugin: Plugin = {
		name: "pyreon-zero",
		enforce: "pre",

		configResolved(resolvedConfig) {
			// zero() is layered ON TOP of @pyreon/vite-plugin (the JSX
			// transform). Without it every route fails to parse — ten
			// cryptic JSX errors instead of the one cause. Fail once, clearly.
			assertPyreonPluginPresent(resolvedConfig.plugins, `${resolvedConfig.root}/src/routes`);
			root = resolvedConfig.root;
			routesDir = `${root}/src/routes`;
			proxyContexts = Object.keys(resolvedConfig.server?.proxy ?? {});
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

		// Server actions: give every `defineAction()` a build-time id derived
		// from its module path + binding, identical in the client and server
		// bundles, and strip the handler from the client bundle. See
		// `actions-transform.ts`.
		transform(code, id, options) {
			if (id.startsWith("\0") || !/\.[mc]?[jt]sx?(?:\?|$)/.test(id)) return null;
			if (!code.includes("@pyreon/zero/actions")) return null;
			const file = id.split("?")[0] as string;
			const rel = relative(root, file).split(sep).join("/");
			const out = transformServerActions(code, file, rel, options?.ssr === true);
			return out === null ? null : { code: out, map: null };
		},

		async buildStart() {
			// A fresh OUTER build (or dev boot) re-scans the routes tree once;
			// nested SSR/SSG sub-builds share the outer build's memoized scan.
			if (!innerBuildFlagSet() && !innerBuildActiveInProcess()) {
				invalidateRouteScanCache(routesDir);
			}
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
				// Replacer function: `entry` is user config and must not be
				// read as a `$`-replacement pattern.
				return html.replace(
					'<!--pyreon-scripts-->',
					() => `${tag}\n    <!--pyreon-scripts-->`,
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
					// Name the FILE for a route that cannot work (no default export,
					// default-only layout, literal `loader`) instead of a page that
					// spins on its loading state with a 200.
					assertRouteFileShapes(baseRoutes);
					// PR H — fan routes into per-locale variants when `i18n` is
					// configured. No-op when unset; identity-returns the input
					// otherwise so existing apps see byte-identical output.
					const expandedRoutes = config.i18n
						? expandRoutesForLocales(baseRoutes, config.i18n)
						: baseRoutes;
					// mode: 'auto' — inference-as-declaration (see zeroPlugin head).
					const routes = config._autoMode ? applyModeInference(expandedRoutes) : expandedRoutes;
					// Build-time ISR safety: an isr-mode route whose source reads
					// request cookie/authorization state is per-user — with the
					// default cache key (or 'path-only') the runtime REFUSES to
					// cache it (silent per-request refusal in prod logs). Name the
					// file now, at build/dev time. A custom cacheKey FUNCTION is
					// the user opting into per-user caching — suppresses the warn.
					if (typeof config.isr?.cacheKey !== "function") {
						warnIsrAuthRisk(detectIsrAuthRisk(routes, config.mode ?? "ssr", config.routeRules));
					}
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
					const routeModule = generateRouteModuleFromRoutes(routes, routesDir, {
						staticImports: ssgSplitDisabled,
						// Phase 5 — the SSR module graph gets the real serverLoader
						// function imports; the client graph gets only the
						// hasServerLoader marker (the .server.ts sibling is
						// structurally unreachable from the client bundle).
						serverLoaders: loadOptions?.ssr === true,
					});
					// Register the i18n config in BOTH graphs so `useLocale()` can
					// derive the locale from the URL in production SSR, SSG and on
					// the client — not only under the dev middleware's ALS store.
					return config.i18n
						? `${routeModule}\nimport { _registerI18nConfig as __zeroRegisterI18n } from "@pyreon/zero";\n__zeroRegisterI18n(${JSON.stringify(config.i18n)});\n`
						: routeModule;
				} catch (err) {
					// A [Pyreon] diagnostic (invalid route file, loader + server
					// loader conflict, …) names the fix — surface it instead of
					// silently serving an app with no routes.
					if (err instanceof Error && err.message.startsWith("[Pyreon]")) throw err;
					return `export const routes = []`;
				}
			}

			if (id === RESOLVED_VIRTUAL_MIDDLEWARE_ID) {
				// Plus the build-time action manifest (action-manifest.ts): this
				// module is what every server entry and the dev pipeline import,
				// so a fresh server knows every action id up front.
				const generated = generateActionManifest(root);
				actionManifestFiles = generated.files;
				const manifest = generated.code;
				try {
					const files = await scanRouteFiles(routesDir);
					return `${manifest}\n${generateMiddlewareModule(files, routesDir)}`;
				} catch (_err) {
					return `${manifest}\nexport const routeMiddleware = []`;
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
			// PZ-11 — visibility: when the user configures `server.proxy`,
			// zero's dev middlewares yield matching URLs to Vite's proxy
			// (registered downstream). Say so once — the original bug report
			// was a SILENT swallow, so the honoring must be discoverable.
			if (proxyContexts.length > 0) {
				server.config.logger.info(
					`[Pyreon] zero dev: honoring vite server.proxy for: ${proxyContexts.join(", ")}`,
				);
			}

			// Dev-mode API-route middleware — production wires `createApiMiddleware`
			// via `createServer`, but dev had no equivalent. API requests fell
			// through to Vite's default 404. This middleware loads the
			// `virtual:zero/api-routes` module and dispatches matching requests to
			// the route's `GET()` / `POST()` / etc. handler. Mirrors the production
			// flow in `entry-server.ts` minus the ergonomic helpers (auth, cors,
			// etc. — those plug in via user-defined Pyreon middleware which dev
			// doesn't currently load; not in scope here).
			//
			// Registered FIRST so endpoints don't get SSR'd or 404'd. Runs the
			// production request pipeline — see `dispatchDevPipeline`.
			server.middlewares.use((req, res, next) => {
				const pathname = req.url?.split("?")[0] ?? "/";
				if (pathname.startsWith("/@") || pathname.startsWith("/__"))
					return next();
				// Skip files (extension-bearing) — let Vite's static pipeline serve.
				// NOT under `/api`: API routes live only there (top-level `api/`
				// dir), and a dotted path is a legitimate API URL
				// (`/api/users/jane.doe`, `/api/export.csv`, `/api/v1.2/x`) that
				// production dispatches — skipping it in dev returned Vite's 404.
				if (!isApiPathname(pathname) && /\.\w+$/.test(pathname)) return next();

				dispatchDevPipeline(
					server,
					root,
					config,
					req,
					res,
					proxyContexts.length > 0 && matchesProxyContext(req.url ?? "/", proxyContexts),
				).then(
					(handled) => {
						if (!handled) next();
					},
					(err: unknown) => {
						// A throwing middleware answers 500 in production; in dev
						// show it in the overlay AND the terminal it points at.
						const error = err instanceof Error ? err : new Error(String(err));
						server.ssrFixStacktrace(error);
						logDevSsrError(server, req.url, error);
						if (res.headersSent) return res.end();
						const html = renderErrorOverlay(error);
						res.statusCode = 500;
						res.setHeader("Content-Type", "text/html; charset=utf-8");
						res.end(html);
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
					// PZ-11 — honor vite `server.proxy`. This catch-all accepts
					// `Accept: */*` (fetch's default!), so without this guard a
					// proxied `GET /api/backend/x` from client code was swallowed
					// with 404 HTML (renderSsr renders the `_404.tsx` chain for
					// unmatched paths) before Vite's proxy middleware ever saw it.
					// Matched on the FULL `req.url` (incl. query string) with
					// Vite's own context semantics — see `matchesProxyContext`.
					// Dev precedence: fs api routes > server.proxy > SSR/404.
					if (
						proxyContexts.length > 0 &&
						matchesProxyContext(req.url ?? "/", proxyContexts)
					)
						return next();

					const runSsr = () => {
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

						renderSsr(
							server,
							root,
							req.originalUrl ?? pathname,
							pathname,
							webReq,
							// Middleware `locals` (auth user, CSP nonce, …) reach
							// the page render exactly as in the production handler.
							devPipelineCtx(req)?.locals,
						).then(
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
								logDevSsrError(server, req.url, error);
								const html = renderErrorOverlay(error);
								res.statusCode = 500;
								res.setHeader("Content-Type", "text/html; charset=utf-8");
								res.setHeader("Content-Length", Buffer.byteLength(html));
								res.end(html);
							},
						);
					};

					// PZ-11 companion — `/api/*` skip, same W24 rationale as the
					// 404 handler below. The W24 fix landed ONLY on the 404
					// handler, but in mode:'ssr' THIS middleware runs first and is
					// what actually swallows `/api/*` (unmatched → `_404.tsx`
					// chain → 404 HTML), shadowing user dev middleware and
					// `server.proxy` contexts alike. fs api routes were already
					// dispatched by the API middleware above (fs wins); the
					// remaining `/api/*` traffic belongs downstream. One
					// carve-out: a PAGE route under `/api/` is possible —
					// `isApiRoute` only claims `.ts`/`.js` files, so an
					// `api/*.tsx` file scans as a page route — so only skip when
					// no page route matches; a matching page keeps dev SSR
					// (production parity, where the SSR handler has no /api skip).
					if (pathname.startsWith("/api/")) {
						pageRouteMatches(server, pathname).then(
							(matches) => {
								if (matches) runSsr();
								else next();
							},
							() => next(),
						);
						return;
					}

					runSsr();
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
				// PZ-11 — honor vite `server.proxy` (see the SSR middleware
				// above): NON-/api proxy prefixes (`/graphql`, `/backend`, …)
				// were swallowed by this 404 handler in ALL modes — the W24
				// skip only covers `/api/*`. Fall through so Vite's downstream
				// proxy middleware can forward them.
				if (
					proxyContexts.length > 0 &&
					matchesProxyContext(req.url ?? "/", proxyContexts)
				)
					return next();

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
					logDevSsrError(server, req.url, error);
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
				// Any change under the routes dir (content edits change the
				// detected exports too) drops the memoized scan.
				if (path.startsWith(routesDir)) invalidateRouteScanCache(routesDir);
				// The action manifest lives in the route-middleware module: drop it
				// when a source file under src/ joins, leaves or changes inside the
				// manifest — not only on route add/remove. Cheap gate: a file outside
				// the manifest is read only for the marker substring.
				if (
					(event === "add" || event === "change" || event === "unlink") &&
					path.startsWith(join(root, "src")) &&
					isActionSourceFile(path)
				) {
					const inManifest = actionManifestFiles.has(path);
					let defines = false;
					if (event !== "unlink") {
						try {
							defines = mayDefineActions(readFileSync(path, "utf-8"));
						} catch {
							defines = false;
						}
					}
					if (inManifest || defines) {
						const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MIDDLEWARE_ID);
						if (mod) server.moduleGraph.invalidateModule(mod);
					}
				}
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

		config(viteUserConfig, configEnv: ConfigEnv) {
			// Discover all @pyreon/* packages installed in node_modules.
			// The "bun" export condition points to TS source — esbuild's
			// dep optimizer would compile them with the wrong JSX runtime.
			const cwd = viteUserConfig.root ?? process.cwd()
			const pyreonExclude = scanPyreonPackages(cwd)

			// Snapshot public (ZERO_PUBLIC_*) env for build-time inlining — read
			// once here from `.env*` + shell env; both client and SSR bundles get
			// the SAME values so `publicEnv()` is hydration-consistent.
			const publicEnvVars = loadPublicEnvVars(configEnv?.mode ?? 'production', cwd)

			// Router loader flag (production builds only). `false` compiles the
			// router's loader engine out of the bundle (~0.9–1 KB gz); `true` folds
			// the router's own guard away. Defining it EITHER way is the point:
			// left undefined, the guard stays as a runtime check. Dev never sets
			// it, so adding a loader mid-session needs no restart. A value the
			// user defined themselves always wins — it is the escape hatch for
			// routes that live outside src/routes, which createApp checks for.
			const userDefine = viteUserConfig.define ?? {}
			const routerLoadersDefine: Record<string, string> =
				configEnv?.command === "build" &&
				!("globalThis.__PYREON_ROUTER_LOADERS__" in userDefine)
					? {
							"globalThis.__PYREON_ROUTER_LOADERS__": String(
								routesDeclareLoadersSync(
									`${isAbsolute(cwd) ? cwd : join(process.cwd(), cwd)}/src/routes`,
									{ existsSync, readdirSync, readFileSync, statSync },
								),
							),
						}
					: {};

			// Build-time gate: if the app declared `zero({ env })`, validate the
			// PUBLIC env NOW — a missing/invalid declared var FAILS the build (warns
			// in dev), catching "forgot to set ZERO_PUBLIC_X" before it ships to the
			// browser as `undefined`.
			assertPublicEnv(config.env, publicEnvVars, configEnv?.command)

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
					// Public env snapshot — inlined into client + SSR bundles so
					// `publicEnv()` works in the browser. Only ZERO_PUBLIC_* vars.
					__ZERO_PUBLIC_ENV__: JSON.stringify(publicEnvVars),
					// The serializable part of this config, read by
					// `createServer` in the production server bundle. The
					// generated server entry cannot import vite.config.ts,
					// so without it `mode: 'isr'`, `base`, `ssr.mode` and
					// `routeRules` never reached the runtime.
					__ZERO_SERVER_CONFIG__: JSON.stringify(serializeServerConfig(config).value),
					...routerLoadersDefine,
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
	const plugins: Plugin[] = [mainPlugin, clientFlagsPlugin(userConfig, config.mode ?? "ssr")];
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
	if (userConfig.pwa) plugins.push(pwaPlugin(userConfig.pwa, userConfig.mode, userConfig.base));

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

	// End-of-build summary (default ON, `buildSummary: false` opts out) —
	// appended LAST so its closeBundle runs after every zero post-step
	// (SSG prerender, SSR bundle, adapter staging) and reads the FINISHED
	// dist tree. Informational only; never fails the build.
	if (userConfig.buildSummary !== false) plugins.push(buildSummaryPlugin());

	return plugins;
}

/**
 * Prints the branded end-of-build summary (client assets with raw + gzip
 * sizes, server bundle, prerendered pages, wall-clock time) once per
 * TOP-LEVEL CLIENT build. Skips server builds (`build.ssr`) and zero's
 * recursive inner sub-builds (their re-instantiated chain includes this
 * plugin too — `innerBuildFlagSet()` is set for their whole lifetime), so
 * hybrid builds print exactly one summary. Collection + formatting are pure
 * (`build-summary.ts`); this plugin is only the timing + printing shell.
 *
 * `closeBundle` is a PARALLEL rollup hook — without `sequential: true` this
 * handler races the ssg/ssr post-steps (prerender, server bundle, adapter
 * staging) and reads a half-finished dist. `sequential` awaits every
 * previously-registered closeBundle first; being appended last + `order:
 * 'post'` puts it at the very end of the build.
 */
function buildSummaryPlugin(): Plugin {
	let root = process.cwd();
	let outDir = "dist";
	let assetsDir = "assets";
	let isServerBuild = false;
	let startedAt = 0;
	let resolvedOnce = false;
	// The summary is info-level output: suppressed under `logLevel` warn /
	// error / silent, like Vite's own build report.
	// oxlint-disable-next-line no-console
	let logInfo: (msg: string) => void = (msg) => console.log(msg);
	return {
		name: "pyreon-zero-build-summary",
		apply: "build",
		configResolved(cfg) {
			// FIRST resolution only: zero's recursive inner sub-builds REUSE this
			// plugin instance (their chain is built from the same config), so
			// configResolved re-fires with the SERVER sub-build's config —
			// clobbering outDir/ssr right before the outer (sequential, post)
			// closeBundle finally runs. The outer client build resolves first;
			// that's the build this summary describes.
			if (resolvedOnce) return;
			resolvedOnce = true;
			root = cfg.root;
			outDir = cfg.build.outDir;
			assetsDir = cfg.build.assetsDir;
			isServerBuild = Boolean(cfg.build.ssr);
			logInfo = (msg) => cfg.logger.info(msg);
		},
		buildStart() {
			// First build only — inner sub-builds re-fire this on the reused
			// instance and would clobber the wall-clock start (same reuse as
			// configResolved above).
			if (startedAt === 0) startedAt = performance.now();
		},
		closeBundle: {
			sequential: true,
			order: "post",
			handler() {
				if (isServerBuild || innerBuildFlagSet()) return;
				try {
					const dist = isAbsolute(outDir) ? outDir : join(root, outDir);
					const stats = collectBuildStats(dist, assetsDir);
					const lines = formatBuildSummary(stats, {
						color: detectColorLevel(),
						elapsedMs: performance.now() - startedAt,
					});
					for (const line of lines) logInfo(line);
				} catch {
					/* summary is informational only — never fail a finished build */
				}
			},
		},
	};
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

function hasJsxRouteFile(dir: string): boolean {
	if (!existsSync(dir)) return false;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (hasJsxRouteFile(`${dir}/${entry.name}`)) return true;
		} else if (/\.[jt]sx$/.test(entry.name)) return true;
	}
	return false;
}

/**
 * Throw a single actionable error when `@pyreon/vite-plugin` (plugin name
 * `pyreon`) is missing from the Vite config.
 * @internal
 */
export function assertPyreonPluginPresent(
	plugins: readonly { name: string }[] | undefined,
	routesDir: string,
): void {
	if (!plugins || plugins.some((p) => p.name === "pyreon")) return;
	// Only JSX needs the transform — a routes tree of plain `.ts` modules
	// (h() calls) builds without it, so don't refuse those.
	if (!hasJsxRouteFile(routesDir)) return;
	throw new Error(
		'[Pyreon] zero() needs the Pyreon JSX plugin. Add it BEFORE zero() in vite.config.ts:\n\n' +
			'  import pyreon from "@pyreon/vite-plugin"\n' +
			'  import zero from "@pyreon/zero/server"\n\n' +
			"  export default defineConfig({ plugins: [pyreon(), zero()] })\n",
	);
}

/**
 * The dev error overlay tells the user to "check the terminal" — so the
 * terminal must actually carry the error (source-mapped stack included).
 * @internal
 */
export function logDevSsrError(
	server: Pick<ViteDevServer, "config">,
	url: string | undefined,
	error: Error,
): void {
	server.config.logger.error(
		`[Pyreon] SSR error while rendering ${url ?? "/"}:\n${error.stack ?? error.message}`,
		{ error },
	);
}

/** `/api` or anything under it — the only place fs API routes can match. */
export function isApiPathname(pathname: string): boolean {
	return pathname === "/api" || pathname.startsWith("/api/");
}

/** Where a dev request's pipeline context is stashed for the page renderer. */
const DEV_PIPELINE_CTX = Symbol.for("pyreon.zero.devPipelineCtx");

type DevPipelineCtx = import("@pyreon/server").MiddlewareContext;

/** The pipeline context the dev pipeline ran for this request, if any. */
export function devPipelineCtx(req: IncomingMessage): DevPipelineCtx | undefined {
	return (req as unknown as Record<symbol, DevPipelineCtx | undefined>)[DEV_PIPELINE_CTX];
}

const ENTRY_SERVER_CANDIDATES = ["entry-server.ts", "entry-server.tsx", "entry-server.js"];
let warnedEntryLoad = false;

/**
 * The server entry's own `createServer({ middleware, actions })` — loaded
 * through Vite so dev applies the same security headers / auth the
 * production entry does. `undefined` when the app has no entry (zero then
 * generates the canonical one, which has no extra middleware).
 */
async function loadEntryPipelineOptions(
	server: ViteDevServer,
	root: string,
): Promise<{ middleware?: import("@pyreon/server").Middleware[]; actions?: unknown } | undefined> {
	const file = ENTRY_SERVER_CANDIDATES.map((f) => join(root, "src", f)).find((f) => existsSync(f));
	if (!file) return undefined;
	try {
		const mod = await ssrLoadModuleQuiet(server, file);
		const handler = mod.default as Record<symbol, unknown> | undefined;
		return handler?.[Symbol.for("pyreon.zero.pipelineOptions")] as
			| { middleware?: import("@pyreon/server").Middleware[]; actions?: unknown }
			| undefined;
	} catch (err) {
		if (!warnedEntryLoad) {
			warnedEntryLoad = true;
			server.config.logger.error(
				`[Pyreon] zero dev: could not load ${relative(root, file)} — its middleware is NOT applied in dev:\n${
					err instanceof Error ? (err.stack ?? err.message) : String(err)
				}`,
			);
		}
		return undefined;
	}
}

/** Node `IncomingMessage` → Web `Request` (body streamed, not buffered). */
function toWebRequest(req: IncomingMessage): Request {
	const host = req.headers.host ?? "localhost";
	const url = new URL(req.url ?? "/", `http://${host}`);
	const method = (req.method ?? "GET").toUpperCase();
	const headers = new Headers();
	for (const [key, value] of Object.entries(req.headers)) {
		if (value !== undefined) {
			headers.set(key, Array.isArray(value) ? value.join(", ") : String(value));
		}
	}
	const init: RequestInit & { duplex?: "half" } = { method, headers };
	if (method !== "GET" && method !== "HEAD") {
		// `Readable.toWeb` returns Node's `node:stream/web` ReadableStream;
		// structurally identical to the DOM one — bridge via `unknown`.
		init.body = Readable.toWeb(req) as unknown as ReadableStream<Uint8Array>;
		init.duplex = "half";
	}
	return new Request(url.href, init);
}

/** Write a Web `Response` to the Node response, streaming the body. */
function sendWebResponse(res: ServerResponse, response: Response): void {
	res.statusCode = response.status;
	const cookies = response.headers.getSetCookie();
	response.headers.forEach((v, k) => {
		if (k !== "set-cookie") res.setHeader(k, v);
	});
	if (cookies.length > 0) res.setHeader("set-cookie", cookies);
	if (response.body) {
		// `pipe` ends `res` on completion and cancels upstream on disconnect.
		Readable.fromWeb(response.body as unknown as import("node:stream/web").ReadableStream).pipe(res);
	} else {
		res.end();
	}
}

/**
 * Dev request pipeline — the SAME `createRequestPipeline` production's
 * `createServer` builds (app middleware → route middleware → API routes →
 * server islands → `/_pyreon/data` → `/_zero/actions/*`), loaded through
 * Vite's SSR graph so the action / island registries are the ones the
 * route modules register into.
 *
 * Returns `true` when a middleware answered. On fall-through the context is
 * stashed on `req` so the dev page renderer applies the middleware's
 * response headers and `locals`, exactly as the production handler does.
 */
async function dispatchDevPipeline(
	server: ViteDevServer,
	root: string,
	config: ZeroConfig,
	req: IncomingMessage,
	res: ServerResponse,
	proxyOwned: boolean,
): Promise<boolean> {
	const [routesMod, mwMod, apiMod, pipelineMod, entryOptions] = await Promise.all([
		ssrLoadModuleQuiet(server, VIRTUAL_ROUTES_ID),
		ssrLoadModuleQuiet(server, VIRTUAL_MIDDLEWARE_ID),
		ssrLoadModuleQuiet(server, VIRTUAL_API_ROUTES_ID),
		ssrLoadModuleQuiet(server, "@pyreon/zero/pipeline"),
		loadEntryPipelineOptions(server, root),
	]);
	const { createRequestPipeline, pageMethodResponse, readCarriedActionState, runRequestPipeline } =
		pipelineMod as unknown as typeof import("./pipeline");
	const pipeline = createRequestPipeline({
		// A no-JS action post re-renders its page through the dev renderer
		// directly — never back through this pipeline, whose middleware
		// already ran for the POST. The POST's locals + response headers are
		// restored from the pipeline module's own carried state (same module
		// instance the form-action middleware wrote to).
		renderActionPage: (getReq) =>
			renderDevActionPage(server, root, getReq, readCarriedActionState(getReq)),
		routes: (routesMod.routes ?? []) as import("@pyreon/router").RouteRecord[],
		// Production's config is the SERIALIZED one (code-valued options like
		// `zero({ middleware })` are dropped with a build warning) — dev uses
		// the same value so it cannot run middleware production never will.
		config: serializeServerConfig(config).value,
		routeMiddleware: (mwMod.routeMiddleware ?? []) as RouteMiddlewareEntry[],
		apiRoutes: (apiMod.apiRoutes ?? []) as ApiRouteEntry[],
		...(entryOptions?.middleware ? { middleware: entryOptions.middleware } : {}),
		...(entryOptions?.actions !== undefined
			? { actions: entryOptions.actions as import("./actions").CreateActionMiddlewareOptions | false }
			: {}),
	});

	const webReq = toWebRequest(req);
	const url = new URL(webReq.url);
	const ctx: DevPipelineCtx = {
		req: webReq,
		url,
		path: url.pathname + url.search,
		headers: new Headers({ "Content-Type": "text/html; charset=utf-8" }),
		locals: {},
	};
	if (req.socket?.remoteAddress) ctx.locals.remoteAddress = req.socket.remoteAddress;

	const response =
		(await runRequestPipeline(pipeline, ctx)) ??
		// Nothing answered a non-GET/HEAD: production's handler replies
		// 405/204 here. Page form actions (a route `action` export or
		// `?_action=`) are pipeline middleware, so they answer first and
		// never reach this fallback, so dev must too — unless a vite `server.proxy`
		// context owns the URL (the proxy runs downstream of this middleware).
		(proxyOwned ? undefined : pageMethodResponse(webReq.method));
	if (response) {
		sendWebResponse(res, response);
		return true;
	}
	(req as unknown as Record<symbol, DevPipelineCtx>)[DEV_PIPELINE_CTX] = ctx;
	// Headers a middleware set for the PAGE (CSP, security headers, cookies)
	// apply to whatever answers next — the dev SSR render or Vite's SPA shell.
	const cookies = ctx.headers.getSetCookie();
	ctx.headers.forEach((v, k) => {
		if (k !== "content-type" && k !== "set-cookie") res.setHeader(k, v);
	});
	if (cookies.length > 0) res.setHeader("set-cookie", cookies);
	return false;
}

/**
 * Dev page render for a no-JS action post's re-render — the dev twin of
 * production's re-render handler: renderSsr with the POST's restored
 * locals, answering with the headers its middleware set.
 */
async function renderDevActionPage(
	server: ViteDevServer,
	root: string,
	getReq: Request,
	state: { locals: Record<string, unknown>; headers: Headers } | undefined,
): Promise<Response> {
	const url = new URL(getReq.url);
	const result = await renderSsr(
		server,
		root,
		url.pathname + url.search,
		url.pathname,
		getReq,
		state?.locals,
	);
	const headers = new Headers(state?.headers);
	if (result === null) return new Response("Not Found", { status: 404, headers });
	if (result.kind === "redirect") {
		headers.set("Location", result.to);
		return new Response(null, { status: result.status, headers });
	}
	headers.set("Content-Type", "text/html; charset=utf-8");
	return new Response(result.html, { status: result.status, headers });
}

/**
 * Does `pathname` match any PAGE route pattern in the routes tree?
 * Shared by the dev SSR middleware's `/api/*` carve-out (PZ-11 — a page
 * route under `/api/` must keep dev SSR) and `handle404`'s "is this
 * actually a 404?" pre-check, so the two can never drift.
 */
async function pageRouteMatches(
	server: ViteDevServer,
	pathname: string,
): Promise<boolean> {
	const mod = await ssrLoadModuleQuiet(server, VIRTUAL_ROUTES_ID);
	const routes = mod.routes as Array<{ path?: string; children?: unknown[] }>;
	return flattenRoutePatterns(routes).some((pattern) =>
		matchPattern(pattern, pathname),
	);
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
	if (await pageRouteMatches(server, pathname)) {
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
	locals?: Record<string, unknown>,
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
	// `@pyreon/zero/app` — just `createApp`. Loading `@pyreon/zero/server` here
	// pulled the whole server package (vite plugins, SSG, ISR, fonts, OG
	// images, zod, vite itself) into the dev SSR graph for one function:
	// measured 141 modules against 68, plus a font-fallback warning in every
	// dev session.
	const appMod = (await ssrLoadModuleQuiet(
		server,
		"@pyreon/zero/app",
	)) as unknown as typeof import("./app");
	// The router's URL carries the QUERY, exactly as the production handler's
	// (`url.pathname + url.search`): loaders, `useSearchParams` and a <Form>'s
	// query-preserving action all read it. Pathname-only here made dev render
	// every page as if its query were empty — an SSR/hydration mismatch.
	const routerPath = pathname + (req ? new URL(req.url).search : "");
	const { App, router: routerInst } = appMod.createApp({
		routes: routes as import("@pyreon/router").RouteRecord[],
		routerMode: "history",
		url: routerPath,
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
		routerPath,
		{
			...(req ? { request: req } : {}),
			...(locals ? { locals } : {}),
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

	// FUNCTION replacements — a string replacement interprets `$$` / `$&` /
	// `$'` / `` $` `` inside the rendered page (see `fillDevTemplate`).
	const html = fillDevTemplate(template, result);
	return { kind: "html", html, status: result.status };
}

/**
 * Fill the dev SSR template's three Pyreon placeholders with a rendered
 * page. Uses replacer FUNCTIONS, never string replacements: with a string
 * replacement `String.prototype.replace` interprets `$$`, `$&`, `` $` ``,
 * `$'` and `$n` even for a literal search, so a page containing
 * `cost $$5 and $' tail` rendered `$5` plus a copy of the template tail.
 *
 * @internal exported for tests
 */
export function fillDevTemplate(
	template: string,
	result: { head: string; appHtml: string; loaderScript: string },
): string {
	return template
		.replace("<!--pyreon-head-->", () => result.head)
		.replace("<!--pyreon-app-->", () => result.appHtml)
		.replace("<!--pyreon-scripts-->", () => result.loaderScript);
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
