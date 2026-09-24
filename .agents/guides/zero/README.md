# @pyreon/zero — render modes, adapters, dev TLS

Read before touching `packages/zero/**`, a build adapter, SSG/SSR/ISR output, or `https()`.

`verify-modes` and `audit-types` guard the `mode:` API against becoming typed-but-unimplemented again.

## SSG (`ssgPlugin`)

- Per-route HTML is built by a nested Vite SSR sub-build. An env flag stops it re-triggering itself; pages render concurrently via `runWithConcurrency`, with progress through `ssg.onProgress`.
- `getStaticPaths` enumerates dynamic routes (`[id].tsx`).
- `_404.tsx` / `_not-found.tsx` → `dist/404.html`. It renders inside layout chrome: `findNotFoundFallback` builds the chain, loaders are skipped via `router.preload(path, _, { skipLoaders: true })`, and `noindex` is injected.
- A loader-thrown `redirect()` → `dist/_redirects` (Netlify/Cloudflare) + `_redirects.json` (Vercel) + optional meta-refresh HTML.
- Sitemap: `seoPlugin({ sitemap: { useSsgPaths, hreflang } })`.
- Each route gets `<link rel=modulepreload>` for its static import closure only.
- Two routes resolving to the same URL is a build error.
- Options: `ssg.format`, `ssg.onPathError`, `ssg.errorArtifact` (`dist/_pyreon-ssg-errors.json`).
- `ssg.format: 'both'` injects a root-relative canonical to the clean URL into both copies (skipped when a canonical already exists and for meta-refresh stubs).
- Explicit `ssg.paths` replaces auto-detection, and warns when route `getStaticPaths` exports are ignored.
- The build warns on a dynamic route with no `getStaticPaths`, unless the route declares a non-static `renderMode` or is an API route.
- i18n (`expandRoutesForLocales`, strategies `prefix` / `prefix-except-default`):
  - Under `prefix-except-default`, root layouts are not duplicated — they wrap every locale via hierarchical match. Non-root layouts are duplicated.
  - Each locale gets `dist/{locale}/404.html` and hreflang clusters.

## SSR and ISR

- `ssrPlugin` builds `dist/server/entry-server.js` and calls `adapter.build({ kind: 'ssr' })`. `AdapterBuildOptions` is a `kind: 'ssr' | 'ssg'` discriminated union.
- Deploy staging uses `materialize(src, dest)`, which handles same-dir and dest-inside-src. Never `cp` a directory into itself (`ERR_FS_CP_EINVAL`).
- The production template is the built client `index.html` (hashed `<script>` + CSS), copied to `dist/server/template.html` and read by `readBuiltTemplate()`. `clientEntry: false` suppresses the dev entry. Without this the page server-renders but ships `/src/entry-client.ts` and never hydrates.
- The node runner forwards the request body (`Readable.toWeb`, `duplex: 'half'`), builds the origin from `Host` (+ `X-Forwarded-Proto` only with `TRUST_PROXY=1`), catches handler throws (an unhandled rejection used to exit the process), and sets `Symbol.for('pyreon.remoteAddress')` on the Request, which `@pyreon/server` copies to `ctx.locals.remoteAddress` for rate limiting. The bun runner does the same and runs `Bun.serve` with `development: false`. The SSR sub-build bakes `NODE_ENV=production`.
- Cloudflare/workerd has no filesystem and an `undefined` `import.meta.url`:
  - the adapter inlines the template into `globalThis.__PYREON_SSR_TEMPLATE__`, then dynamic-imports the handler (a static import would evaluate first);
  - `normalizeLocation` tolerates `undefined`;
  - the worker needs `nodejs_compat`.
- **`zero({...})` reaches the server through `__ZERO_SERVER_CONFIG__`.** The generated server entry cannot import `vite.config.ts`, so zero's plugin injects the serializable subset (`mode`, `base`, `ssr`, `isr` data fields, `routeRules`, `i18n` — `server-config.ts:serializeServerConfig`) as a define, and `createServer` merges it under the entry's own `config` (`mergeServerConfig`, own wins per key). Before this, ISR, `base`, `ssr.mode` and `routeRules` were build-time only and production served plain SSR. Code-valued options (`middleware`, ISR `store`/`cacheKey` fn/`responseFilter`/…) cannot cross; `ssrPlugin` warns when they are set with no `src/entry-server.ts`. `ssr.mode` defaults to `'string'` (from `resolveConfig`); streaming is opt-in.
- **Request order is a security property** (`entry-server.ts:createServer`): app-wide middleware → route middleware → API routes, island fragments, `/_pyreon/data`, actions → page render. It was the reverse, so auth, rate limits and CORS never applied to endpoints. Route middleware matches `routingPathname()` — the pathname (never `ctx.path`, which carries the query: `/admin?x=1` skipped `/admin`'s gate), base and locale stripped, and for `/_pyreon/data` the TARGET page (the endpoint otherwise handed out any route's serverLoader data ungated). `_layout.tsx` middleware guards the pages under its DIRECTORY (one entry, `patterns[]`), not a URL prefix — a group layout's URL is `/`. Actions and the data/fragment endpoints mount unconditionally (route modules load lazily; a registry-size gate at `createServer` missed them).
- ISR (`createISRHandler`):
  - Caches PAGE renders only: a response must be `text/html`, carry no per-response CSP nonce, and vary on nothing outside the key but `Accept-Encoding`. `createServer` also routes API/`/_pyreon/*`/`/_zero/*` paths around the cache. Stored content type is replayed (it used to force `text/html`, turning an echoing JSON API into stored XSS). Concurrent cold misses coalesce, never for credentialed requests under the default key and never sharing a non-cacheable (e.g. `Set-Cookie`) result. Cold renders are epoch-guarded like revalidations; revalidation failures are logged.
  - The default cache key is `pathname + search`. Per-user pages need an explicit `cacheKey` function. The handler warns at init, and the build warns for any `isr` route whose loader reads cookie/authorization headers without one (`fs-router.ts:detectIsrAuthRisk`).
  - `cacheKey: 'path-only'` strips the query. It does not count as a custom key for the auth refusal.
  - `expireOnTimeout` drops a stale entry when revalidation times out (default: keep stale).
  - Storage is a pluggable `ISRStore` (default `createMemoryStore`).
- Two different revalidate layers:
  - route `export const revalidate` → build-time `dist/_pyreon-revalidate.json` for `Adapter.revalidate(path)`; `vercelRevalidateHandler` validates the path against that manifest;
  - `isr.revalidate` → the runtime stale-while-revalidate TTL.

## Mode visibility and adapter selection

- Every build prints a per-route mode table (`○ ssg · λ ssr · ⟳ isr · ⚡ spa`; `(declared)` marks overrides; more than 40 routes collapse to counts). `ssrPlugin` prints it for server builds, `ssgPlugin` for `mode: 'ssg'`; a hybrid build prints it once.
- The `zero dev` banner shows the app mode, hybrid overrides and per-route modes from `collectFileRouteModes` (file-level twin of `collectRouteModes`; precedence leaf > nearest layout > app mode).
- An unset `adapter` is auto-detected from the platform env (`VERCEL` / `NETLIFY` / `CF_PAGES`; local → node). An explicit adapter always wins.
- A computed (non-literal) `renderMode` works at runtime but is invisible to the file-level mode surfaces, so the build warns.
- Mode build errors carry a pasteable fix line per route.

### `mode: 'auto'` (experimental)

- Per-route inference: `revalidate` → isr; `getStaticPaths` → ssg (even with a loader); loader / serverLoader / guard / middleware → ssr; otherwise ssg. Explicit exports and `routeRules` win.
- `applyModeInference` injects a `renderModeLiteral` before generation, so runtime and build code never need to know about `auto`.
- The app pipeline resolves it with `resolveAutoModeSync` when the zero plugin is created (cwd-based routes dir, announced once).
- `ZeroUserConfig` widens only `zero()`'s parameter. Internal `ZeroConfig.mode` stays narrow; `_autoMode` is the internal marker.

### `routeRules`

- `zero({ routeRules: { '/blog/**': { renderMode: 'isr' } } })` — glob overrides (`*` = one segment, `**` = any depth, most specific wins).
- Precedence: file export > `routeRules` > app mode. Applied the same way in `resolveRenderModeForPath`, `collectRouteModes` and `collectFileRouteModes`, with `via: 'file' | 'rule'` provenance.

## `https()` — dev/preview TLS (`@pyreon/zero/server`)

- Purpose: give a real device a secure context. Localhost is already secure. A phone at `http://192.168.1.24:3000` is not, so the browser silently omits these APIs:
  - hooks: `useGeolocation`, `useDeviceMotion`, `useAudioRecorder`, `useBluetooth`, `useClipboard`, `useNotifications`, `useShare`, `useWakeLock`;
  - service workers.
- Not gated: `useCamera` (a file-input picker), `useSpeech` (only SpeechRecognition is gated) and `usePush` work on http.
- Every gated hook calls `warnIfInsecureContext` (`@pyreon/hooks`), which fires only when `isSecureContext === false`. `hooks/src/tests/secure-context-coverage.test.ts` asserts each gated hook calls it.
- `lan: true` both certifies the LAN address and binds to it. The plugin's `config()` overrides `zero dev`'s inline `host: false`.
- Certificate sources, in order: `{ cert, key }` → an installed `mkcert` CA (no browser warning) → a zero-dependency self-signed leaf (one-time interstitial).
- Pyreon never installs a CA. Trusting one (`mkcert -install`) is the user's decision, because a local CA key can mint certs for any domain.
- Custom hosts: `*.localhost` resolves natively; for anything else the `/etc/hosts` lines are printed, never written.
- X.509 is hand-rolled on `node:crypto` (`src/https/der.ts`, `selfsign.ts`). An IP must be an `iPAddress` SAN. A `dNSName` holding an IP parses fine and browsers ignore it.
- HTTP/1.1 only (Vite dev dropped h2).

## Client build flags (`client-flags-plugin.ts`)

- `__ZERO_HYDRATE__`: defined `false` in a production build only when `isSpaEverywhere` holds (app mode `spa`, no non-spa `routeRules`, no route file mentioning `renderMode` — every doubt keeps hydration). `client.ts` checks it inline, so `hydrateRoot` and the hydration machinery drop out of the bundle (−6.6 KB gz on kanban). If a flagged build still receives markup, the client clears it before mounting rather than duplicating it.
- **Rejected, measured:** grouping the always-loaded runtime into one chunk (`output.codeSplitting.groups`). It cut ssr-showcase by 3.3 KB gz and 14 requests but made kanban 1.7 KB bigger (runtime code only lazy chunks used became eager); with `minShareCount: 2` kanban was neutral but ui-showcase grew 1.5 KB. Not a win for every app, so not shipped.
- Dev SSR loads `createApp` from `@pyreon/zero/app` (one module) rather than the whole `@pyreon/zero/server` package.

## Gates

- `pyreon doctor --check-ssg` and the lint `ssg` category: `revalidate-not-pure-literal`, `missing-get-static-paths` (skips API routes and files without a default export), `invalid-loader-export`.
- `bun run verify-modes` checks built artifacts.
- E2E: `ssr-node`, `isr-node`, `ssg-*`. SSG suites serve `dist/` with `scripts/serve-ssg.ts`, never `vite preview` — its SPA fallback serves `index.html` for every path and hides missing per-route HTML.

## Other features

- The route hydrates in place: `startClient` calls `router.preload(path, undefined, { skipLoaders: true })` before `hydrateRoot`, so the first client render is the real route component rather than a `lazy()` fallback that matches nothing (a rejection still hydrates). The client's first render is the source of truth — any host whose first render is a placeholder must resolve before hydrating, or the server DOM is rebuilt. Islands are unaffected: the client island vnode has no children, so the host adopts the marker and only the island's own `hydrateRoot` touches its interior.
- The main entry is client-safe; server-only code is at `@pyreon/zero/server` (clear stubs on misimport).
- Adapters: Vercel, Cloudflare Pages, Netlify, Node, Bun, static. Immutable caching applies only to `<base><assetsDir>`, keyed on path, never extension.
- CSP: `cspMiddleware` + `useNonce`. `renderPage` reads `useRequestLocals().cspNonce` once and stamps it on the loader-data and store-state `<script>`s, passes it to `collectStyles(nonce)` and `renderWithHead(app, { nonce })`. The client styler inherits the nonce from the reused SSR `<style>` (`.nonce` property). SSG/SPA cannot carry a per-request nonce (use hash-based CSP); the client entry `<script src>` relies on `'self'`.
- Also: `loggerMiddleware`, `aiPlugin` (llms.txt/JSON-LD), `useRequestLocals`.
- Env vars (`@pyreon/zero/env`: `str`/`num`/`bool`/`url`/`oneOf`/`schema`, typed from defaults):
  - `validateEnv` is server-only (reads live `process.env`).
  - `publicEnv()` is isomorphic: the plugin loads `ZERO_PUBLIC_*` at build and inlines the prefix-stripped snapshot as the `__ZERO_PUBLIC_ENV__` define into client and SSR bundles, so both read the same value.
  - Only `ZERO_PUBLIC_*` is inlined (`loadPublicEnvVars` in `src/public-env.ts`); an unprefixed secret cannot reach the client bundle.
  - Both accept any Standard Schema (zod, valibot, arktype, `s`) and receive the raw string, so use a coercing schema (`z.coerce.number()`, `s.stringbool()`). Async schemas are rejected.
  - Inlining is per build: changing a public var needs a rebuild.
  - `zero({ env: { API_URL: url() } })`: `assertPublicEnv` fails the build (warns in dev) on a missing or invalid declared var.
  - Lint rule `pyreon/no-private-env-in-client` flags raw private `process.env` reads in client code.
  - Locked by `env.test.ts`, `public-env-plugin.test.ts`, `e2e/public-env.spec.ts`.
- The dev server honours Vite `server.proxy`: zero's catch-all middlewares run before Vite's proxy, so they `next()` proxy-context URLs via `matchesProxyContext` (mirrors Vite's `doesProxyContextMatchUrl` on the full `req.url`). Precedence: fs API routes > `server.proxy` > SSR/404. An unmatched `/api/*` URL falls through zero's SSR/404 (a `.tsx` page route under `/api/` still SSRs).
- Per-route `export const renderMode = 'ssg' | 'spa' | 'isr' | 'ssr'` (cascades from layouts) overrides the app `mode`; one resolver, `src/route-modes.ts:resolveRenderModeForPath`, drives build and runtime. Inside `mode: 'ssr' | 'isr'`: `ssg` routes prerender at build and are served static-first (manifest `dist/_pyreon-ssg-paths.json`), `spa` routes get the CSR shell, `isr` routes go through the SWR cache. Inside `mode: 'ssg'`, `ssr`/`isr` declarations are a build error.
- Images: `<Image src>` (a `?optimize` descriptor, or a runtime URL with required `width`/`height`), `<OptimizedImage source>`, `<NoOptimize>`/`useNoOptimize()`, `createImageRegistry`, `createImage(Base)`. Placeholders: blur or `'color'` (`'dominant-color'` is a deprecated alias). Ambient types ship at `@pyreon/zero/image-types`.
- Fonts: `usePreloadFont`, `?font` imports (`fontImportPlugin`), `fontPlugin` (`zero({ font })`). `subsets` scopes self-hosted Google Font subsets. `fallbackAdjust` (default on) computes size-adjusted fallback fonts to remove swap CLS and emits a `--pyreon-font-<slug>` CSS variable.
- Resource hints: `usePreconnect`, `useDnsPrefetch`, `usePreload`. Icons: `<Icon>`/`createIcon`, `iconsPlugin`/`createNamedIcon`. Favicons: `faviconPlugin` (sharp required; theme-switched assets need the `data-favicon-theme` attribute). `ogImagePlugin`.
- SSG emits per-route `<link rel=modulepreload>` from static imports only. `ssg.format: 'file' | 'directory' | 'both'` (default `'directory'`). `zero({ perfAdvisor: true })` gives advisory `route-js-budget` and `cls-footgun` findings.
- Typed routes: `zero({ typedRoutes: true })` writes `src/pyreon-routes.d.ts` (page routes only, rewritten on route add/remove, only when content changes) augmenting `RegisteredRoutes`. `RouteHref = RoutePath | (string & {})`. Code: `src/route-types.ts` + `src/route-types-gen.ts`. Gitignore the generated file.
- `@pyreon/zero-content`: compile-time `.md` → Pyreon JSX, typed collections, MDX components from `src/mdx/`.
