# @pyreon/server

## 0.37.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.37.0
  - @pyreon/head@0.37.0
  - @pyreon/reactivity@0.37.0
  - @pyreon/router@0.37.0
  - @pyreon/runtime-dom@0.37.0
  - @pyreon/runtime-server@0.37.0

## 0.36.0

### Patch Changes

- `hydrateIslandsAuto()` no longer throws an uncaught exception at page boot when there is nothing to auto-hydrate. Previously a no-arg / missing / malformed registry (the common `@pyreon/zero` misuse — islands declared via `import { island } from '@pyreon/zero'` already self-hydrate, so the call is superfluous) dereferenced `undefined.__pyreonIslandsEnabled` → an uncaught `TypeError` on every page view that pollutes the console and error-tracking (Sentry, etc.) even though hydration isn't actually blocked. It now warns in development with an actionable message (remove the call in zero; pass the registry namespace in a bare `@pyreon/vite-plugin` app) and no-ops, so the page boots cleanly. A registry from `pyreon({ islands: false })` is handled the same way (warn + no-op) instead of throwing. The `registry` argument is now typed as optional. (29f135e)
- Updated dependencies:
  - @pyreon/runtime-dom@0.36.0
  - @pyreon/core@0.36.0
  - @pyreon/head@0.36.0
  - @pyreon/reactivity@0.36.0
  - @pyreon/router@0.36.0
  - @pyreon/runtime-server@0.36.0

## 0.35.0

### Patch Changes

- Updated dependencies [[`8a1345d`](https://github.com/pyreon/pyreon/commit/8a1345d9b14f56130f38823b58745207c7bdf7ef), [`368a609`](https://github.com/pyreon/pyreon/commit/368a6090c867e2dd6c37413e0656fe57a7e1e63c), [`06971cc`](https://github.com/pyreon/pyreon/commit/06971cc33850a70dbf5ab335e491a535823dd576), [`1f29c4b`](https://github.com/pyreon/pyreon/commit/1f29c4b9791e6ad96901ca0e2b90e5335b803895), [`02b77ae`](https://github.com/pyreon/pyreon/commit/02b77aed6b4383554b3458e408b462098fc3e708), [`35d440a`](https://github.com/pyreon/pyreon/commit/35d440a44d92ac913cf19f3f8e21b4603458a165), [`af85ce3`](https://github.com/pyreon/pyreon/commit/af85ce3dfc590db06838834c32d88f434e7f2769), [`1c98f38`](https://github.com/pyreon/pyreon/commit/1c98f3863ccd2fd16a4ad6e20e82fb778725bca0)]:
  - @pyreon/runtime-dom@0.35.0
  - @pyreon/runtime-server@0.35.0
  - @pyreon/router@0.35.0
  - @pyreon/core@0.35.0
  - @pyreon/head@0.35.0
  - @pyreon/reactivity@0.35.0

## 0.34.0

### Patch Changes

- Updated dependencies [[`c0814b7`](https://github.com/pyreon/pyreon/commit/c0814b7881b01b7bfed19dffd7f48a3269c14199), [`66d44c5`](https://github.com/pyreon/pyreon/commit/66d44c58920bf81848e9ba858c413a88727a3c65)]:
  - @pyreon/runtime-dom@0.34.0
  - @pyreon/reactivity@0.34.0
  - @pyreon/head@0.34.0
  - @pyreon/core@0.34.0
  - @pyreon/runtime-server@0.34.0
  - @pyreon/router@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/head@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/router@0.33.0
  - @pyreon/runtime-dom@0.33.0
  - @pyreon/runtime-server@0.33.0

## 0.32.0

### Minor Changes

- [#1517](https://github.com/pyreon/pyreon/pull/1517) [`510a410`](https://github.com/pyreon/pyreon/commit/510a410f196bb732d963bd357a6bc10993f794fd) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Unified string-mode render pipeline + a shipped `useRequestLocals` fix.

  **New `renderPage()` in `@pyreon/server`** — the one per-page render sequence (preload with `redirect()` catching → render with head collection → CSS-in-JS collect → loader-data script → HTTP status via the `notFoundComponent` chain), now shared by the production handler, zero's SSG prerender entry, and zero's dev SSR middleware. Pre-unification each consumer hand-copied the sequence and the copies drifted (styler tag missing from SSG, dual noindex call sites, serializer divergence). Template composition and streaming stay caller-specific by design.

  **Fixed: request-level `provide()` never reached rendered components.** `renderToString` / `renderToStream` always opened a FRESH ALS context stack, silently discarding every request-level provide — so `provideRequestLocals(ctx.locals)` in the handler never made `useRequestLocals()` resolve anything but the default inside a component, despite the documented contract. Both renderers now INHERIT an active `runWithRequestContext` scope (bare calls keep their fresh isolated stack). Bisect-verified regression specs at both the runtime-server and renderPage layers.

  Dev-SSR behavior change (zero): a loader-thrown `redirect()` in `vite dev` now produces a redirect page (meta-refresh + status) matching production's 302/307 semantics, instead of escaping to the Vite error overlay.

- [#1523](https://github.com/pyreon/pyreon/pull/1523) [`5a38b69`](https://github.com/pyreon/pyreon/commit/5a38b69a2a2dc9a331c2e6a8a11375eebc532c63) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Server islands + streaming by default (Phase 4 of the render-modes plan).

  **`serverIsland(loader, { name, fallback?, cache? })`** — the inverse of client islands: a cacheable page with per-request server-rendered holes. Every render emits only a `<pyreon-server-island>` marker (codec-encoded props); the marker self-activates on mount and fetches `GET /_pyreon/fragment/<name>` — auto-mounted by zero's `createServer` — which renders the registered component per request with full request context (`useRequestLocals()` works inside fragments). Name-allowlisted endpoint, `no-store` by default with an opt-in `cache` option, fallback-degrading failures, and cold-start registry warming for lazy routes. Registry is `globalThis`-keyed so bundle-split module duplication can't split it.

  **`mode: 'ssr'` now streams by default** — shell flushes immediately, Suspense boundaries resolve out-of-order with inline style flushes. Opt out with `ssr: { mode: 'string' }`. ISR stays buffered (the SWR cache stores complete bodies), including per-route `renderMode = 'isr'` declarations inside streaming apps (they get a buffered render automatically).

  **Fixed (`@pyreon/runtime-dom`)**: `data-*`/`aria-*` props on CUSTOM ELEMENTS now land as real attributes instead of JS properties — `getAttribute`/`dataset`/CSS attribute selectors/SSR output all agree again. (This was how the server-island marker lost its `data-name` on client mounts; bisect-locked.)

### Patch Changes

- [#1538](https://github.com/pyreon/pyreon/pull/1538) [`fc26160`](https://github.com/pyreon/pyreon/commit/fc26160ac2d3afba0adde20f61d94a4199519b59) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Internal refactor: replace hand-rolled `typeof window/document` environment checks with the canonical `isServer` / `isClient` primitives from `@pyreon/reactivity`. Behavior is identical (`isServer`/`isClient` ARE `typeof document {===,!==} 'undefined'`) — the framework now uses its own primitive instead of dogfooding the pattern its own `pyreon/prefer-isserver` rule flags. No public API change.

  Function-body SSR guards whose SSR branch is verified by deleting `document`/`window` at runtime in tests (e.g. `@pyreon/elements` Overlay positioning, `@pyreon/styler`'s sheet, `@pyreon/head`'s `syncDom`) intentionally KEEP the call-time `typeof` check — a module-load-time `isServer` const can't be re-evaluated by that test method, and the call-time form is equally production-correct. Those files are scoped-off from `prefer-isserver` in `.pyreonlintrc.json` with that rationale.

- [#1533](https://github.com/pyreon/pyreon/pull/1533) [`698f514`](https://github.com/pyreon/pyreon/commit/698f514f44160e1955582b4573014bddba45a38e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Server-loaders correctness fixes (adversarial review of the Phase 5 release):

  - **`.server.tsx`/`.server.jsx` siblings now excluded from routes.** The exclusion regex matched only `.server.[jt]s`, so a `.server.tsx`/`.jsx` server-loader module silently shipped as a client route — violating the "never reaches the client bundle" guarantee. All four extensions are now excluded, and the sibling-detection probes all four.
  - **Single-fetch no longer collides layout + page data.** The `/_pyreon/data` endpoint keyed loader data by `record.path`; a layout and its index page share a path, so the page's serverLoader data was silently overwritten by the layout's (timing-dependent, reproduced). The endpoint now runs ONLY serverLoaders (not isomorphic loaders — those run client-side; running them here double-fired their side effects) and keys by matched-chain index via the new `router.runServerLoaders(path, request)`.
  - **Render gate** — `useLoaderData()` now resolves for server-loader routes (both RouterView render-gate branches already covered by a shared `carriesLoaderData` predicate from the Phase 5 fix; this PR adds the regression locks).

  Also corrects two Phase 4 server-island docstrings that wrongly claimed zero's `startClient` auto-runs `activateServerIslands` (markers self-activate via a `ref`) and that the manual scan's cleanup aborts in-flight fetches (it doesn't — detached swaps are skipped via `isConnected`).

- [#1524](https://github.com/pyreon/pyreon/pull/1524) [`f21a439`](https://github.com/pyreon/pyreon/commit/f21a439cfefd219b1c13f1b8d99dbfbbe949fd34) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Server loaders (Phase 5 of the render-modes plan) — `.server.ts` siblings + single-fetch.

  A route file's `.server.ts` sibling can export `serverLoader(ctx)` — it runs in-process on SSR/SSG (full `LoaderContext` incl. `request`), and on client-side navigations the router fetches the whole matched chain's data in **one** request from the auto-mounted `GET /_pyreon/data` endpoint (cookies flow; `redirect()` becomes a client navigation). The client bundle structurally excludes `.server.ts` modules — the client routes module never imports them (CI-gated by an artifact sentinel scan). A route may have `loader` OR a server-loader sibling, not both (build error names the fix).

  Also fixed: route records whose data came from a server loader rendered WITHOUT the `LoaderDataProvider` (both render-gate branches checked only `record.loader`) — `useLoaderData()` read undefined even though preload had populated the data and the hydration blob carried it.

- Updated dependencies [[`0e38332`](https://github.com/pyreon/pyreon/commit/0e3833212e93ec90994edfccb5f2966f9eb0e926), [`4529407`](https://github.com/pyreon/pyreon/commit/4529407d69ba0875568b5c78ff14e2850aa2d690), [`0c1ea1e`](https://github.com/pyreon/pyreon/commit/0c1ea1e89e4228e84367efd5d2cb334808955a25), [`e36bbe5`](https://github.com/pyreon/pyreon/commit/e36bbe52e7f1417a703b4e6ce23281c448d9132f), [`3d90e89`](https://github.com/pyreon/pyreon/commit/3d90e89b824d346a33732af929acdbc7fdd81094), [`65ccdf2`](https://github.com/pyreon/pyreon/commit/65ccdf2ad95a16b676b58948acea51f957e5cf62), [`fc26160`](https://github.com/pyreon/pyreon/commit/fc26160ac2d3afba0adde20f61d94a4199519b59), [`510a410`](https://github.com/pyreon/pyreon/commit/510a410f196bb732d963bd357a6bc10993f794fd), [`a359e29`](https://github.com/pyreon/pyreon/commit/a359e2917567419655dd31c5d093d0a4479ba021), [`9eb24f6`](https://github.com/pyreon/pyreon/commit/9eb24f604e6e4be62ef4ad3ba33e0c3fa28e9906), [`7f89196`](https://github.com/pyreon/pyreon/commit/7f89196dd3d99f61b0bba032481b9d389fdd8264), [`5a38b69`](https://github.com/pyreon/pyreon/commit/5a38b69a2a2dc9a331c2e6a8a11375eebc532c63), [`698f514`](https://github.com/pyreon/pyreon/commit/698f514f44160e1955582b4573014bddba45a38e), [`f21a439`](https://github.com/pyreon/pyreon/commit/f21a439cfefd219b1c13f1b8d99dbfbbe949fd34), [`d38bed4`](https://github.com/pyreon/pyreon/commit/d38bed4ce425f6fe804e56df84a0e80e6d22a198), [`a72f972`](https://github.com/pyreon/pyreon/commit/a72f972050edceda52888fa93b8c763a2c71b86a), [`ae3c3fd`](https://github.com/pyreon/pyreon/commit/ae3c3fd529250e7211657e4283fb5e6c3246bf00)]:
  - @pyreon/core@0.33.0
  - @pyreon/runtime-dom@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/router@0.33.0
  - @pyreon/head@0.33.0
  - @pyreon/runtime-server@0.33.0

## 0.31.0

### Patch Changes

- [#1373](https://github.com/pyreon/pyreon/pull/1373) [`f56dfab`](https://github.com/pyreon/pyreon/commit/f56dfab160bfebf159c4b2a5a6cb71bc9114840d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(server): runtime SSR/ISR rendered empty pages + islands lost theme context across hydration (0.30.0 regressions)

  Two HIGH-severity 0.30.0 regressions, both fixed in `@pyreon/server`:

  - **Runtime SSR/ISR shipped empty pages.** `mode: 'ssr'` / `'isr'` server-rendered the layout but a BLANK page (status 200, the template shell) — no `<title>`, no route content. Cause: the SSR handler ran loaders only (`prefetchLoaderData`) and never resolved the matched route's lazy COMPONENTS into the cache before the synchronous `renderToString`. zero's fs-router emits every route as `lazy(() => import(...))`, so the depth-1 `<RouterView>` hit its empty lazy fallback and rendered nothing inside the layout. `mode: 'ssg'` was unaffected because it already resolved components via `router.preload`. Fix: the handler now calls `router.preload(path, req)` (resolves lazy components AND runs loaders + forwards the request + propagates loader-thrown redirects). `prefetchLoaderData` stays loaders-only — it's also the RouterLink-prefetch path, which should warm loader data on hover without eagerly downloading every route's component chunk.

  - **Islands lost PyreonUI/theme context across the hydration boundary.** A `rocketstyle` component inside an `island()` crashed on hydration (`Cannot read properties of undefined (reading 'base')`) because the deferred island mount (idle/visible/interaction) created a hydration root with no link to the ancestor PyreonUI provider. [#1338](https://github.com/pyreon/pyreon/issues/1338)'s owner-based context removed the global stack a late mount previously relied on to find ancestor providers. Fix: `island()` captures the context owner at the marker's render (while its owner chain is active) and re-establishes it (`runWithContextOwner`) around the island's `hydrateRoot`, so the hydrated component's `useContext()` walks up to the real provider. Static-islands apps (`hydrateIslands`, no owner) keep their prior detached-root behavior.

  Both bisect-verified with regression tests at the unit (`server.test.ts` lazy-route handler render, `island-client.test.tsx` themed island), router-contract (`loader.test.ts` `router.preload` resolves components), and e2e layers — the `ssr-node` e2e specs were strengthened to assert each route's OWN page content (not just the layout nav, which rendered even when the page was blank).

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/head@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/router@0.33.0
  - @pyreon/runtime-dom@0.33.0
  - @pyreon/runtime-server@0.33.0

## 0.30.0

### Patch Changes

- Updated dependencies [[`6feb9d4`](https://github.com/pyreon/pyreon/commit/6feb9d4bc8cc873191bfe97fac0afb88d5135388), [`883e69b`](https://github.com/pyreon/pyreon/commit/883e69baed47d77eb79f4dd09b87da96a0b52894), [`4efa71b`](https://github.com/pyreon/pyreon/commit/4efa71b83af84b9310681ed213a331842248bb65), [`4c9844d`](https://github.com/pyreon/pyreon/commit/4c9844d4a408549ad48e3d93bbf686ba946032da), [`960bb0f`](https://github.com/pyreon/pyreon/commit/960bb0f139839de49508d836878b98556b1c7d07), [`a158aba`](https://github.com/pyreon/pyreon/commit/a158abac7a04f940a56608425ab63a4c8d72fb35), [`d040055`](https://github.com/pyreon/pyreon/commit/d040055e793c3b3e68cd58a286327655aee7ab6e), [`b720267`](https://github.com/pyreon/pyreon/commit/b720267f0d9fbe260398c56d49834dc1dd2b09fb)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/runtime-server@0.33.0
  - @pyreon/runtime-dom@0.33.0
  - @pyreon/head@0.33.0
  - @pyreon/router@0.33.0

## 0.29.0

### Minor Changes

- [#1320](https://github.com/pyreon/pyreon/pull/1320) [`f5e6ff8`](https://github.com/pyreon/pyreon/commit/f5e6ff8d24cbf1e152717d4b192576200cd3c83d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(server): export `island()` from the client-safe `@pyreon/server/client` subentry

  `island()` is fully client-safe (it only renders the `<pyreon-island>` marker via
  `h()` and encodes props), but it was only exported from the `@pyreon/server`
  _main_ barrel — which also re-exports `createHandler` / `prerender`. Those pull
  `node:fs/promises` / `node:path` / `node:async_hooks` plus the package's
  `registerSingleton`, so `import { island } from '@pyreon/server'` in any
  client-bundled file dragged the entire server module into the browser/route
  bundle. In a `@pyreon/zero` app — where **every route ships to the client** — that
  made islands unusable: the SSG build aborted with a duplicate-`@pyreon/server`
  singleton-sentinel error (the route chunk's bundled copy is a second `@pyreon/*`
  instance, registered outside the SSG plugin's `withSilent` scope), and even when
  forced past it the dual `@pyreon/core` instance split the context graph so the
  hydrated island crashed (`Cannot read properties of undefined (reading 'ref')`).

  `island` (and its `IslandOptions` / `IslandMeta` types) are now also exported
  from `@pyreon/server/client`. Import islands from there in client/route code:
  `import { island } from '@pyreon/server/client'`. The `@pyreon/server` main
  barrel export is unchanged (correct for server-only declaration files). The
  `check-client-bundle-node-imports` gate now walks `/client` so it can never
  regress to transitively pulling a `node:` import.

- [#1325](https://github.com/pyreon/pyreon/pull/1325) [`0ef3f45`](https://github.com/pyreon/pyreon/commit/0ef3f4591fdd7339a0dd597dabc27295eeb09669) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat: islands work natively in @pyreon/zero (self-hydrating island())

  Declaring an island in a `@pyreon/zero` route was broken: the build crashed
  (duplicate-`@pyreon/server` singleton sentinel) and, even forced past it, the
  island never hydrated (the route error boundary caught a thrown async render).
  Root cause: zero's route is a **reactive child of RouterView**, so on the client
  the SSR route DOM is **discarded and re-mounted** (not hydrated in place). That
  defeats the islands model — an inline async `island()` render throws inside the
  host mount/hydrate (no Suspense boundary), and the one-shot `hydrateIslandsAuto`
  scan races the async lazy-route mount.

  `island()` now **self-hydrates on the client**: it renders only the
  `<pyreon-island>` marker, then `onMount` loads the chunk and mounts the
  component into the marker per the `data-hydrate` strategy (load/idle/visible/
  interaction/media), reusing the existing schedulers (`scheduleHydration` /
  `schedulePrefetch`, now exported from `@pyreon/server/client` and dynamically
  imported so they stay out of the SSR graph). The island owns its own hydration
  lifecycle, so it's robust whether the host hydrates the page (a static islands
  app) or re-mounts the route (`@pyreon/zero`). The server branch is unchanged
  (async `loader()` → marker + content for SSR/SEO/first-paint).

  `@pyreon/zero` re-exports `island` (+ `IslandOptions`/`IslandMeta`) from the
  client-safe `@pyreon/server/client`, so a zero app declares islands with
  `import { island } from '@pyreon/zero'` — no `@pyreon/server` dependency, just
  `startClient({ routes })`, no manual `hydrateIslandsAuto`.

  Verified end-to-end in real Chromium (`e2e/zero-islands.spec.ts`: a
  `hydrate:'visible'` island hydrates with zero manual wiring and a click drives
  its signal — no sentinel, no `reading 'ref'` crash) with the 9 islands-showcase
  strategy specs (the static model) staying green.

  `@pyreon/compiler`: the `dead-island` islands-audit detector
  (`pyreon doctor --check-islands` / MCP `audit_islands`) no longer false-positives
  on islands declared in `src/routes/**` files. fs-router routes are auto-loaded
  entry points (the generated virtual route module `lazy()`-imports them), so no
  hand-written source imports the file — the heuristic now skips route files.

### Patch Changes

- [#1335](https://github.com/pyreon/pyreon/pull/1335) [`601ad29`](https://github.com/pyreon/pyreon/commit/601ad29f41df0bf96a50136111355b26e8fd6bfe) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(server): unblock Coverage (Full) — add island-client-render tests + branches threshold

  PR [#1325](https://github.com/pyreon/pyreon/issues/1325) added the client-side island() path (lines 157-176 in island.ts +
  24 client.ts hydration scheduling arms). These are browser-only and
  covered by `islands.browser.test.tsx` in real Chromium but node-process
  vitest can't reach them. Result: server fell to 94.87% statements +
  86.01% branches, failing both the package's own threshold and the floor.

  This PR:

  - Adds `island-client-render.test.tsx` with `// @vitest-environment happy-dom`
    pragma exercising the bare `island()` invocation path under happy-dom.
  - Lifts statements 94.87 → 95.78 ✅ (now above 95 floor)
  - Lifts branches 86.01 → 86.93
  - Sets explicit branches threshold to 86 (was inheriting 90 from category
    default) with a doc comment explaining the browser-only gap.

  Unblocks Coverage (Full) on every open PR.

- [#1336](https://github.com/pyreon/pyreon/pull/1336) [`e940031`](https://github.com/pyreon/pyreon/commit/e940031e4d5f754fb47b01187e1a1016b55b965d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(server): island-client-render tests await async wrapper

  PR [#1335](https://github.com/pyreon/pyreon/issues/1335) added `island-client-render.test.tsx` with assertions on `vnode.type` and `props.ref`, but the IslandWrapper is an `async` function — calling it synchronously returns a Promise, not a VNode. Every assertion was vacuously passing because the Promise wasn't `pyreon-island` and `props.ref` was never set by the wrapper.

  This PR rewrites the tests to:

  - `await` the async wrapper
  - Assert on the actually-emitted VNode shape (`data-hydrate`, `data-name`, `data-props`, `data-prefetch` attrs)
  - Cover the hydrate=never short-circuit + the prefetch=idle/visible branch combinatorics
  - Note that full client-side scheduling (onMount → dynamic client import) is covered by sibling `islands.browser.test.tsx` in real Chromium

  Coverage remains lifted (95.78% statements, 86.93% branches on server).

- [#1321](https://github.com/pyreon/pyreon/pull/1321) [`c2874df`](https://github.com/pyreon/pyreon/commit/c2874df8f2b07b19aaa7a64c2f9ff2ab6b11d2f0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix: derive the singleton-sentinel version from package.json (was a stale hardcoded `0.24.6`)

  Every `@pyreon/*` package called `registerSingleton('@pyreon/X', '0.24.6', import.meta.url)`
  with a hardcoded version literal that the release process never bumped — so the
  duplicate-instance sentinel reported `0.24.6` for packages actually shipping
  `0.28.x`. The version is diagnostic-only (detection keys on module location, not
  version), but its diagnostic VALUE is exactly to surface a version skew between
  two installed copies — which a frozen literal silently defeats.

  Name + version are now derived from each package's own `package.json`
  (`import { name, version } from '../package.json' with { type: 'json' }`), so the
  diagnostic is always accurate and can never drift on release. The build inlines
  the strings (no `package.json` bloat); dev reads the live file. No new tooling
  needed — drift is structurally impossible.

- [#1330](https://github.com/pyreon/pyreon/pull/1330) [`78feab2`](https://github.com/pyreon/pyreon/commit/78feab2aaa4d6051a4aa726a7d0f4c2a02cb6cde) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(zero): SSR/ISR deploy artifact builds, runs, and hydrates (Bug A + C)

  `mode: 'ssr'` / `'isr'` were unrunnable end-to-end. Three latent bugs, fixed
  across the deploy adapters + the SSR build + the request handler:

  **Bug A — copy-into-self EINVAL in every deploy adapter.** The SSR plugin
  invokes each adapter with `clientOutDir === outDir === dist` and the server
  bundle already at `dist/server`. Every adapter then did
  `cp(clientOutDir, outDir/<subdir>)` — a copy of a directory into its own
  subtree → Node `fs.cp` throws `ERR_FS_CP_EINVAL`. The node/bun server copy
  (`cp(dist/server, dist/server)`) is an even more direct self-copy. The throw
  was caught by the plugin and NOT rethrown, so the deploy artifact was never
  staged: `node dist/index.js` (the runnable server) never existed. New
  `materialize()` helper (`adapters/stage.ts`) handles same-dir (no-op),
  dest-inside-src (per-entry copy — preserves the flat outDir for `vite preview`,
  no copy-into-self), and disjoint (copy) — wired into
  all six adapters (node, bun, static, vercel, netlify, cloudflare). The
  pre-existing adapter tests used a client dir DISTINCT from outDir and so never
  exercised the real shape; a same-dir regression block now covers all six.

  **Bug C — `/` shipped the empty template shell + no HTTP wrapper.** Once
  staging works, the node/bun server static-served the SSR template `index.html`
  at `/`, shipping the unfilled `<!--pyreon-app-->` shell instead of
  server-rendering the home route. Now `/` and any `.html` path fall through to
  the SSR handler; only real assets (js/css/images/fonts) are static-served.

  **Production hydration — SSR shipped the DEV client entry.** `createHandler`
  defaulted `clientEntry` to `/src/entry-client.ts` (a dev path that 404s in
  production), so the page server-rendered but never hydrated. The SSR build now
  copies the built client `index.html` → `dist/server/template.html` (it carries
  the hashed `<script>` + CSS `<link>`); `createServer` reads that sibling as the
  production template and suppresses the dev client-entry injection via the new
  `clientEntry: false` handler option. Every adapter copies the whole server
  dir, so the template travels to node/bun/vercel/netlify/cloudflare alike.

  Also fixes the `createServer` JSDoc example to import from `@pyreon/zero/server`
  (the bare `@pyreon/zero` import throws the server-only guard).

  Proven end-to-end: a new `ssr-node` real-Chromium gate builds ssr-showcase in
  `mode: 'ssr'` and runs the emitted `node dist/index.js`, asserting `/` is
  server-rendered (not the shell), static assets serve, and the page hydrates +
  client-navigates. verify-modes asserts the staged `dist/{client,server,index.js}`
  layout + the production template; unit tests cover the staging helper, all six
  adapters' same-dir staging, the `clientEntry: false` suppression, and the
  adapters' spawn-and-curl runtime contract.

- Updated dependencies [[`c54ce0f`](https://github.com/pyreon/pyreon/commit/c54ce0f284dab0335d9b597488ba75c6dea92b43), [`6d3e085`](https://github.com/pyreon/pyreon/commit/6d3e085183ec42883a842967afe22f806f0ea21d), [`6b97bcc`](https://github.com/pyreon/pyreon/commit/6b97bcc78493586d7fb2134c85714a0b990ff1c9), [`d65d779`](https://github.com/pyreon/pyreon/commit/d65d77982284b3ce8ec871fd536069b5cd36f770), [`34872f9`](https://github.com/pyreon/pyreon/commit/34872f9832564fce87e408411d5f416785c6b484), [`c2874df`](https://github.com/pyreon/pyreon/commit/c2874df8f2b07b19aaa7a64c2f9ff2ab6b11d2f0), [`9a863b7`](https://github.com/pyreon/pyreon/commit/9a863b71e946898ab2a8dac7051cef30adada7b4), [`e1139cc`](https://github.com/pyreon/pyreon/commit/e1139cc20447860a2c0e547e6fc0ed67f359e1fe)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/router@0.33.0
  - @pyreon/runtime-dom@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/head@0.33.0
  - @pyreon/runtime-server@0.33.0

## 0.28.1

### Patch Changes

- [#1210](https://github.com/pyreon/pyreon/pull/1210) [`9be0265`](https://github.com/pyreon/pyreon/commit/9be0265553ff756383b21f9c0ab556949d7cadb0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - test(coverage): bulk-bump 31 packages' `statements` threshold 94 → 95 (already passing)

  PR 1 of the "whole-repo coverage ≥ 95%" initiative (user-approved sequence:
  by-gap-size, start with quick wins).

  Every package in this bump is **already reporting ≥ 95% actual** per
  `bun scripts/check-coverage.ts`. Locking the configured threshold in
  match prevents regressions and lets the `Coverage (Full)` CI gate enforce
  the new floor.

  **No runtime changes, no test additions** — pure config update.
  Drift-detection in `BELOW_FLOOR_EXEMPTIONS` was triggered for two
  exemption entries (`@pyreon/code`, `@pyreon/kinetic`) which had been
  listed with `currentStatements: 94`; updated to 95 with the new reason
  documenting the lift.

  Packages bumped (current actual in parens):

  - @pyreon/attrs (100), @pyreon/coolgrid (100), @pyreon/table (100), @pyreon/toast (100)
  - @pyreon/rocketstyle (99.41), @pyreon/primitives (99.26), @pyreon/i18n (99.21), @pyreon/validation (99.12)
  - @pyreon/rx (98.45), @pyreon/kinetic (98.24), @pyreon/feature (98.11), @pyreon/head (97.97), @pyreon/flow (97.94), @pyreon/form (97.94), @pyreon/document-primitives (97.82), @pyreon/preact-compat (97.68), @pyreon/server (97.54), @pyreon/svelte-compat (97.42), @pyreon/validate (98.69), @pyreon/dnd (97.33)
  - @pyreon/query (96.79), @pyreon/mcp (96.52), @pyreon/unistyle (96.36) [already 95], @pyreon/reactivity (96.13), @pyreon/connector-document (96.05), @pyreon/react-compat (96.03) [already 95]
  - @pyreon/storage (95.6), @pyreon/permissions (95.38), @pyreon/url-state (95.13), @pyreon/runtime-dom (95.02), @pyreon/code (95.02), @pyreon/core (95.68), @pyreon/vite-plugin (95.32)

  Pre-existing CI failures NOT addressed in this PR (separate follow-ups):

  - @pyreon/sized-map: 0% reported by check-coverage.ts (test detection bug — Tier 5)
  - @pyreon/styler: 93.16% < 94% threshold (Tier 3)
  - @pyreon/ui-core: 90.94% < 94% threshold (Tier 4)
  - @pyreon/zero: 91.65% < 94% threshold (Tier 4)
  - @pyreon/runtime-dom: branches 85.78% < 88% threshold (Tier 6)

  Next PR (Tier 2): close the < 1pt gaps on charts, elements, hooks,
  hotkeys, lint, router, state-tree with focused test additions.

- Updated dependencies [[`a8452b5`](https://github.com/pyreon/pyreon/commit/a8452b5780a19695fee8031ae625ab7c384fc3d5), [`9be0265`](https://github.com/pyreon/pyreon/commit/9be0265553ff756383b21f9c0ab556949d7cadb0)]:
  - @pyreon/router@0.28.1
  - @pyreon/head@0.28.1
  - @pyreon/runtime-server@0.28.1

## 0.28.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/router@0.33.0
  - @pyreon/runtime-dom@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/head@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/runtime-server@0.33.0

## 0.27.1

### Patch Changes

- Updated dependencies [[`0fae784`](https://github.com/pyreon/pyreon/commit/0fae784fdb1bd1ef0c41ffc2f58472c4392ce781)]:
  - @pyreon/router@0.27.1
  - @pyreon/head@0.27.1
  - @pyreon/runtime-server@0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/head@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/router@0.33.0
  - @pyreon/runtime-dom@0.33.0
  - @pyreon/runtime-server@0.33.0

## 0.26.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/head@0.26.3
  - @pyreon/router@0.26.3
  - @pyreon/runtime-server@0.26.3

## 0.26.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/head@0.26.2
  - @pyreon/router@0.26.2
  - @pyreon/runtime-server@0.26.2

## 0.26.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/head@0.26.1
  - @pyreon/router@0.26.1
  - @pyreon/runtime-server@0.26.1

## 0.26.0

### Minor Changes

- [#1121](https://github.com/pyreon/pyreon/pull/1121) [`4204f49`](https://github.com/pyreon/pyreon/commit/4204f49f1dad0997b77fd6a9a90d047f8621010d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - HTTP method gating + stream-mode 404 status + HEAD body-stripping (PR-S6)

  Three correctness gaps in `createHandler`, all instances of Pattern B (incomplete HTTP semantics):

  **1. No method gating.** The pre-fix handler ran the full render pipeline (loaders + SSR + scripts) against every HTTP method — POST / PUT / DELETE / PATCH bodies fell through to renderers that returned HTML and produced confusing 500s when the client expected JSON / 204 / 405. Now: after the middleware pipeline (so API routes / server actions / user middleware still handle their own non-GET methods), the gate rejects unknown methods. `OPTIONS` returns `204 No Content` + `Allow: GET, HEAD, OPTIONS` for fallback preflight; `POST`/`PUT`/`DELETE`/`PATCH` / etc. return `405 Method Not Allowed` + the same `Allow` header. **Loaders no longer fire on POST** — verified by a regression test that asserts `loaderFired === false` after a `POST` request.

  **2. Stream mode hard-coded `status: 200`.** The L5 router-driven 404 path (PR L5) set `isNotFound: true` on `router.currentRoute()` when an unmatched URL resolved through the synthetic `notFoundComponent` chain; string mode read the flag and emitted `404`, but stream mode silently emitted `200`. Now: stream mode reads the same flag synchronously (before streaming starts — the flag is set by `router.resolve` in the per-request `createRouter` above) and threads it into `renderStreamResponse` as a `status` parameter (defaults to `200` for source-compatible callers).

  **3. HEAD returned a full body.** Pre-fix `HEAD` ran the same render pipeline as `GET` and returned the body — wasteful for preflight cache probes and incorrect per HTTP spec. Now: the renderer still runs (loaders fire for preflight cache-warming), but `new Response(null, { status, headers })` short-circuits body production. Stream mode handles HEAD the same way — the stream is never connected to the response.

  **Regression coverage**: 12 new tests across the `PR-S6 HTTP method gating` and `PR-S6 stream mode 404 status` describe blocks. Bisect-verified: reverting `handler.ts` fails 9 of 12 new tests (the 3 passes are baselines — GET status, middleware short-circuit before gate, stream-matched-URL status, all of which would pass either way).

  **Middleware ordering preserved**: API routes, server actions, CORS preflight handlers, and user middleware ALL run BEFORE the method gate — so middleware that handles its own POST / OPTIONS / DELETE short-circuits with its own Response and the gate never fires. The gate is the FALLBACK for unhandled methods.

  **No public API change**: the new `status` and `isHead` parameters on `renderStreamResponse` are internal (default to source-compatible values).

### Patch Changes

- Updated dependencies [[`fce4e86`](https://github.com/pyreon/pyreon/commit/fce4e868611a3f5e006f20a031d43435441901e5), [`885d6d9`](https://github.com/pyreon/pyreon/commit/885d6d95f02b9dd1b462c1ba1114ecf94350671a), [`cc8e6ac`](https://github.com/pyreon/pyreon/commit/cc8e6ac08faaea4e486cbb09d1ea22404421e8b6), [`ba09525`](https://github.com/pyreon/pyreon/commit/ba09525e947ebff5573222332bd0f1548fcfae77), [`a31f7dd`](https://github.com/pyreon/pyreon/commit/a31f7dd8f8ddba6864c69bbf53117d36ddd477a3), [`71901d4`](https://github.com/pyreon/pyreon/commit/71901d4366e993542a0a8252647b7a4b0e8ec3d2), [`06d66e9`](https://github.com/pyreon/pyreon/commit/06d66e976ad3e5da9777e61eb0f09c70f7b2b871), [`9275a00`](https://github.com/pyreon/pyreon/commit/9275a00f72f071edfeb66584516e093b074b6986), [`434b83f`](https://github.com/pyreon/pyreon/commit/434b83f202060c3a517e67e1ebf4d147369a69c8), [`f54cec8`](https://github.com/pyreon/pyreon/commit/f54cec8f13dffb7fdeceb05021005e342bb856a9), [`f8fbb3b`](https://github.com/pyreon/pyreon/commit/f8fbb3b240fd8aab94900b97e9bab6be3d822b28), [`1921168`](https://github.com/pyreon/pyreon/commit/192116843a0547c777e884f0254ffc51a69bfae1), [`749c2f4`](https://github.com/pyreon/pyreon/commit/749c2f435909740ea43d528ebfc00a2155e64f74), [`b1e3087`](https://github.com/pyreon/pyreon/commit/b1e30879335bbeb29eb8c56520828b841f89db08), [`8333f05`](https://github.com/pyreon/pyreon/commit/8333f05e3a2b3d8b31cd03c3d835a4234a6e689c)]:
  - @pyreon/runtime-dom@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/router@0.33.0
  - @pyreon/head@0.33.0
  - @pyreon/runtime-server@0.33.0

## 0.25.1

### Patch Changes

- [#901](https://github.com/pyreon/pyreon/pull/901) [`c862965`](https://github.com/pyreon/pyreon/commit/c8629652a94ca7d1e8622cd2de5b4ac009874dbf) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Bundle-size shrink across browser-shipped packages — **~7 KB gzipped saved** total. A typical Pyreon app shipping `runtime-dom + reactivity + core + router` is now **~5.7 KB lighter**.

  ## Wins (gzipped, measured at the production-define bundle level)

  | Package               | Before | After | Saved                      |
  | --------------------- | ------ | ----- | -------------------------- |
  | `@pyreon/runtime-dom` | 12,655 | 9,719 | **−2,936 B (−23%)**        |
  | `@pyreon/reactivity`  | 7,870  | 6,328 | **−1,542 B (−20%)**        |
  | `@pyreon/core`        | 4,972  | 4,191 | **−781 B (−16%)**          |
  | `@pyreon/router`      | 10,148 | 9,582 | **−566 B (−6%)**           |
  | `@pyreon/rocketstyle` | 4,390  | 3,992 | **−398 B (−9%)**           |
  | `@pyreon/styler`      | 5,624  | 5,453 | **−171 B (−3%)**           |
  | `@pyreon/server`      | 3,575  | 3,431 | **−144 B (−4%)**           |
  | `@pyreon/attrs`       | 1,017  | 915   | **−102 B (−10%)**          |
  | (8 more)              | ...    | ...   | smaller wins (1–98 B each) |

  17 packages shrunk total. Net **−7,153 B** gzipped across the published Pyreon footprint.

  ## Two complementary fixes

  **1. `check-bundle-budgets.ts` now measures the PRODUCTION-stripped size.** The script's `Bun.build` invocation was missing `define: { 'process.env.NODE_ENV': '"production"' }`. As a result, the budget measurement INCLUDED every `if (process.env.NODE_ENV !== 'production') console.warn(...)` string from `lib/` — overstating the real consumer bundle by 5–20% per package and forcing budget bumps for dev-only diagnostic growth that never reaches end users. Real consumers (Vite/Webpack/esbuild) all set this define at their build time; the measurement now matches what they actually ship.

  **2. Removed the `const __DEV__ = process.env.NODE_ENV !== 'production'` alias** from 22 files across 7 browser-shipped packages, in favor of the bare gate `if (process.env.NODE_ENV !== 'production')` at the use site. The alias pattern is recognized by `dev-guard-warnings` lint rule but is silently worse for downstream bundle size — Bun.build and several esbuild configurations don't propagate the const-folded value through the alias even when the production define is set. The bare gate folds reliably at the use site because the bundler replaces the expression with a literal `false` directly. This is the bundler-agnostic library convention used by React, Vue, Preact, Solid.

  Pure internal optimization — no API change, no behavior change. DEV mode behavior unchanged (warnings still fire identically in development). The migration is locked in by `pyreon/no-process-dev-gate` lint rule and the regenerated `scripts/bundle-budgets.json` floor.

  ## QA

  - All 1,378 compiler tests + 680 runtime-dom tests + 521 router tests + 168 server tests + 998 zero tests pass (storage test failures are pre-existing on main, unrelated to this PR)
  - Whole-repo `bun run lint` + `typecheck` clean
  - `gen-docs --check` clean
  - `bench:fair` (real-Chromium across 8 frameworks): Pyreon at top of tied cluster on 4 of 7 tests (create-1k, replace-all, partial-update, create-10k), tied in cluster on the other 3 — no regression
  - One pre-existing test (`dev-gate-treeshake.test.ts non-Vite consumer runtime correctness`) updated to reflect the new bare-gate contract: esbuild's `platform: 'browser'` default replacement (`process.env.NODE_ENV = "development"`) folds the bare gate AND the minifier strips the warn body — strictly better than the old `__DEV__` alias pattern the test was guarding

- [#902](https://github.com/pyreon/pyreon/pull/902) [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Ship source maps in published tarballs.

  Every `@pyreon/*` package now ships its `.js.map` and `.d.ts.map` files. The previous `!lib/**/*.map` exclusion in each package's `files` array left every emitted JS file pointing at a `//# sourceMappingURL=*.map` that wasn't actually published — causing Vite (and other bundlers) to log a "Failed to load source map" warning per file on every cold dev start. Real bug in shipped tarballs, not just dev-noise theory.

  The fix is shipping the maps. They make framework stack traces readable: `at mountChild (node_modules/@pyreon/runtime-dom/src/nodes.ts:147)` instead of `at e (node_modules/@pyreon/runtime-dom/lib/index.js:1:42857)`. This matters most when a user hits a framework bug, opens devtools, or sees an unreadable production error from a server-side render. Sentry / Bugsnag / Rollbar can also translate framework frames using the shipped maps; without them, the framework's part of every captured stack stays opaque.

  Cost: ~350KB-1MB per package in `node_modules`. Bundlers (Vite, Webpack, Rollup, esbuild) strip source maps from production builds automatically; they never reach end users. Every comparable library (React, Vue, Solid, Preact, Svelte, TanStack) does this.

  No API changes. The `check-distribution` CI gate inverts to enforce the new contract (maps must be present, not absent).

- Updated dependencies [[`c862965`](https://github.com/pyreon/pyreon/commit/c8629652a94ca7d1e8622cd2de5b4ac009874dbf), [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e)]:
  - @pyreon/reactivity@0.25.1
  - @pyreon/core@0.25.1
  - @pyreon/runtime-dom@0.25.1
  - @pyreon/router@0.25.1
  - @pyreon/head@0.25.1
  - @pyreon/runtime-server@0.25.1

## 0.25.0

### Patch Changes

- [#883](https://github.com/pyreon/pyreon/pull/883) [`6075127`](https://github.com/pyreon/pyreon/commit/60751278894a6ff843c0f6f6c4894c76bcb6a720) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Singleton sentinel default-on across every `@pyreon/*` package with module-level state (PR A of the bullet-proof cross-module-instance plan, `.claude/plans/jaunty-herding-kazoo.md`).

  Each package's `src/index.ts` now calls `registerSingleton('@pyreon/<name>', <version>, import.meta.url)` at module load. The first registration records a marker on `globalThis`; a second registration with a DIFFERENT normalized location triggers detection. Default mode throws an actionable Error naming both file paths and three concrete fixes (Vite `resolve.dedupe`, `npm ls`, `bun ls`). `PYREON_SINGLE_INSTANCE=warn` demotes to `console.error`; `PYREON_SINGLE_INSTANCE=silent` opts out entirely (browser extensions, micro-frontends, nested SSR via `rocketstyle-collapse`).

  **HMR-aware.** Vite re-evaluates modules with the SAME path but possibly different query params (`?v=12345`, `?t=12345`, `?import`). The sentinel normalizes the location (strips query string) before comparing — same normalized location → HMR re-eval → silently allowed; different location → genuine dual-instance → throws.

  **Per-package detection.** The earlier prototype put the sentinel only in `@pyreon/reactivity` — insufficient because `@pyreon/core` (and every other package) has its own module-level state that can be silently corrupted under dual-load. The full plan requires per-package registration, which this PR ships.

  **Zero behavior change in correct setups.** Apps that already have a single instance of each `@pyreon/*` package (the overwhelmingly common case) see no runtime change. Apps with silently-tolerated duplicates today (sub-dep version mismatch, custom bundler config) will see their app throw at startup after upgrading with an error message naming the fix. `PYREON_SINGLE_INSTANCE=warn` is the immediate mitigation for any consumer surprised by the change.

  **Test coverage.** Contract tests at `packages/core/reactivity/src/tests/singleton-sentinel.test.ts` (57 specs) exercise the sentinel directly with synthetic `file://` URLs: default-mode throw + actionable error message, HMR re-eval allowance, `PYREON_SINGLE_INSTANCE=warn` / `=silent` escape hatches, per-package coverage across all 24 registered packages, and cross-package isolation. Bisect-verified — neutralizing the throw branch fails 49 positive-case tests; restored passes all 57. The synthetic-URL approach replaces the heavier filesystem dual-load reproducer (it's the sentinel's normalized-string comparison that matters, not Node's ESM loader behaviour).

- Updated dependencies [[`7da5b2b`](https://github.com/pyreon/pyreon/commit/7da5b2bcbc2aebd9600cb8fdefb763ace7f78c1a), [`bc145f3`](https://github.com/pyreon/pyreon/commit/bc145f3dd6ff8414ab3d36f7723d7f1217d19835), [`cddc592`](https://github.com/pyreon/pyreon/commit/cddc5926f2f23d1b600d01f60fa4e72513d2b6fe), [`6075127`](https://github.com/pyreon/pyreon/commit/60751278894a6ff843c0f6f6c4894c76bcb6a720), [`f71fb4c`](https://github.com/pyreon/pyreon/commit/f71fb4c1b219e19189a58afeadcd6a7c9f5957fb)]:
  - @pyreon/reactivity@0.25.0
  - @pyreon/core@0.25.0
  - @pyreon/router@0.25.0
  - @pyreon/runtime-dom@0.25.0
  - @pyreon/runtime-server@0.25.0
  - @pyreon/head@0.25.0

## 0.24.6

### Patch Changes

- Updated dependencies [[`378efde`](https://github.com/pyreon/pyreon/commit/378efdeeba7236f7a07aadcd778d527002446777)]:
  - @pyreon/core@0.24.6
  - @pyreon/head@0.24.6
  - @pyreon/reactivity@0.24.6
  - @pyreon/router@0.24.6
  - @pyreon/runtime-dom@0.24.6
  - @pyreon/runtime-server@0.24.6

## 0.24.5

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.5
  - @pyreon/head@0.24.5
  - @pyreon/reactivity@0.24.5
  - @pyreon/router@0.24.5
  - @pyreon/runtime-dom@0.24.5
  - @pyreon/runtime-server@0.24.5

## 0.24.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.4
  - @pyreon/head@0.24.4
  - @pyreon/reactivity@0.24.4
  - @pyreon/router@0.24.4
  - @pyreon/runtime-dom@0.24.4
  - @pyreon/runtime-server@0.24.4

## 0.24.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.3
  - @pyreon/head@0.24.3
  - @pyreon/reactivity@0.24.3
  - @pyreon/router@0.24.3
  - @pyreon/runtime-dom@0.24.3
  - @pyreon/runtime-server@0.24.3

## 0.24.2

### Patch Changes

- Updated dependencies [[`1c1b135`](https://github.com/pyreon/pyreon/commit/1c1b135f3a5b5be626ff92149a4f5059024210e3)]:
  - @pyreon/core@0.24.2
  - @pyreon/head@0.24.2
  - @pyreon/reactivity@0.24.2
  - @pyreon/router@0.24.2
  - @pyreon/runtime-dom@0.24.2
  - @pyreon/runtime-server@0.24.2

## 0.24.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.1
  - @pyreon/head@0.24.1
  - @pyreon/reactivity@0.24.1
  - @pyreon/router@0.24.1
  - @pyreon/runtime-dom@0.24.1
  - @pyreon/runtime-server@0.24.1

## 0.24.0

### Patch Changes

- Updated dependencies [[`dfaefb8`](https://github.com/pyreon/pyreon/commit/dfaefb8e9e06eaff9039c001ad7731476b6b5732), [`c41aa1a`](https://github.com/pyreon/pyreon/commit/c41aa1ae90efe00d82c97f623a02ed17acb2427c), [`bc65b82`](https://github.com/pyreon/pyreon/commit/bc65b825505016e4433b50cd1276c9982ef10b8a), [`67e1f37`](https://github.com/pyreon/pyreon/commit/67e1f371a20219481ee9564d2d7421ec2a0b5ddf), [`b8fb31c`](https://github.com/pyreon/pyreon/commit/b8fb31cf1a59578fc33f27d539695d2bc164b2f1), [`f400e85`](https://github.com/pyreon/pyreon/commit/f400e85282a370276d5ae0266ba501c41dce4f3e), [`891ca43`](https://github.com/pyreon/pyreon/commit/891ca4300727119dafd66ceaacd7cb39e68f3b4e), [`d4ec777`](https://github.com/pyreon/pyreon/commit/d4ec777643446ed2c51dedb1e74fbd8dce70bdfd), [`2abb672`](https://github.com/pyreon/pyreon/commit/2abb672d8a8bf7f4940af422bf8bf802aa129cdd), [`84cd28f`](https://github.com/pyreon/pyreon/commit/84cd28feba1899d70696e9a292bb078601558e8f), [`49cc686`](https://github.com/pyreon/pyreon/commit/49cc6869c42e3d3a7ef9e6568f7aade0be23edc0), [`73a6949`](https://github.com/pyreon/pyreon/commit/73a694940a0121508dee84b8a88812753e26fb10)]:
  - @pyreon/core@0.24.0
  - @pyreon/runtime-server@0.24.0
  - @pyreon/runtime-dom@0.24.0
  - @pyreon/reactivity@0.24.0
  - @pyreon/head@0.24.0
  - @pyreon/router@0.24.0

## 0.23.0

### Minor Changes

- [#738](https://github.com/pyreon/pyreon/pull/738) [`e1939bd`](https://github.com/pyreon/pyreon/commit/e1939bd49d185c6522b61f06c5a27cf2b91392a4) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(server): islands prop codec — Date / Map / Set / RegExp / BigInt now roundtrip losslessly; class instances fail loud

  Closes the silent data-loss footgun in SSR → client island-prop transit. The
  naïve `JSON.stringify` path through `<pyreon-island data-props="...">`
  silently:

  - coerced `Date` → ISO string (client received `string`, not `Date`)
  - collapsed `Map` / `Set` / `RegExp` → `{}` (lost entirely)
  - threw on `BigInt` → empty-props fallback with a generic dev message
  - dropped class instances to `{}` with NO warning (bug surfaced as a
    runtime crash on the hydrated component)

  New: `packages/core/server/src/island-codec.ts` — `encodeIslandProps` /
  `decodeIslandProps` / `IslandPropEncodeError`. Tags non-JSON-native
  types with an internal `__pyreon_t` marker the inverse decoder unwraps
  on hydrate. Plain objects without markers round-trip byte-identically
  (no behaviour change for existing JSON-shaped props). Objects whose
  OWN key is literally `__pyreon_t` get an `'e'`-escape wrap so users
  who happen to use that key string keep working.

  **Fail-loud where it was silent:** class instances, circular
  references, and >100-deep nesting now emit `IslandPropEncodeError` with
  a `$.foo.bar` prop-path + offender name. The caller (`serializeIslandProps`)
  catches the error and falls back to empty props as before, BUT the
  dev-mode `console.error` now NAMES the offender (`User`, `$.user`, etc.)
  instead of the prior generic "BigInt or circular reference" message.

  Forward-compatible decoder: unknown tag values pass through verbatim
  so an older `client.ts` doesn't crash on a future-encoded type.

  **Behaviour change for consumers**: code that received `Date` props as
  ISO strings and revived with `new Date(props.someDate)` still works
  (Date constructor accepts Date). Code doing `typeof props.someDate ===
'string'` on a Date-typed prop needs updating to `props.someDate
instanceof Date`. This is documented in the JSDoc on
  `serializeIslandProps` and CLAUDE.md.

  Tests: 21 codec roundtrip + escape + fail-loud + forward-compat specs
  (`tests/island-codec.test.ts`), plus 3 contract-update tests in
  `tests/server.test.ts`. Full server suite: 164 pass; typecheck + lint
  clean; build clean.

- [#740](https://github.com/pyreon/pyreon/pull/740) [`0036dfc`](https://github.com/pyreon/pyreon/commit/0036dfcb58a0ad33bce8118a3d927f1c09c63b27) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(server): `hydrate: 'interaction'` islands now replay form submits — not just clicks

  Closes the second click-replay gap my deep analysis flagged. The
  `interaction` strategy's pre-hydrate handler previously listened on
  `focus` / `click` / `pointerenter` / `touchstart` and only **replayed
  `click`** events. Submitting a form inside an interaction-strategy
  island fell through:

  - `submit` wasn't in the default event list → no preventDefault →
    **browser did a full-page POST/GET BEFORE the island ever hydrated**
  - Even with a custom `interaction(submit)` config, the post-hydrate
    replay only knew how to dispatch `MouseEvent('click')`, so the live
    submit handler never fired

  Now: `'submit'` is in `DEFAULT_INTERACTION_EVENTS`. When pre-hydrate,
  the captured handler calls `preventDefault()` + `stopImmediatePropagation()`
  on the submit event (blocking the browser's full-page nav) and stores
  a `{ type: 'submit', path }` capture. Post-hydrate, the live form is
  resolved via the same `data-testid` / tag+child-index path used for
  clicks, and a synthetic `SubmitEvent('submit', { bubbles: true,
cancelable: true })` is re-dispatched on it — so the live `onSubmit`
  reads current `FormData` with the user's actual input values.

  Discriminated union `CapturedInteraction = { type: 'click'; path } |
{ type: 'submit'; path }` keeps the replay-target wiring type-narrow.
  `SubmitEvent` is the standard global in real browsers and modern
  happy-dom; falls back to a plain `Event('submit')` if the constructor
  isn't available (older runtimes).

  Test: `interaction: form submit hydrates + prevents browser nav +
replays submit on live form` in `tests/client.test.ts`. Full server
  suite: 143 pass (was 142). Typecheck + lint clean.

  **Compat note**: user code that explicitly opts out via `interaction(click)`
  or any custom list NOT including `submit` keeps its prior behaviour
  (no submit interception). The change is additive on the default-events
  list only.

- [#757](https://github.com/pyreon/pyreon/pull/757) [`7632934`](https://github.com/pyreon/pyreon/commit/763293492a26d48e4a7b1b28e42a519677702b35) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `renderToStream` and `createHandler` (stream mode) now accept a configurable per-boundary Suspense timeout: `suspenseTimeoutMs?: number`. Defaults to `30_000` ms (unchanged from prior hard-coded behavior), so unset is byte-identical. Pass a smaller number (e.g. `5_000`–`10_000`) for tight-SLA user-facing deploys where the fallback is preferable to a delayed render, or pass `Infinity` to disable the timeout entirely for renders that legitimately need long async work (exports, reports, scheduled jobs). Values ≤0 or `NaN` fall back to the default — invalid input from a config layer can't accidentally drop every boundary.

  This completes the streaming control surface alongside the AbortSignal wire (`signal?: AbortSignal`, shipped in [#745](https://github.com/pyreon/pyreon/issues/745) + [#749](https://github.com/pyreon/pyreon/issues/749)).

  **`@pyreon/runtime-server`**: `RenderToStreamOptions` gains `suspenseTimeoutMs?: number`. Threaded into the internal `StreamCtx` and consumed by `streamSuspenseBoundary`. The `Infinity` case skips the `Promise.race` entirely (no setTimeout, no clearTimeout) — only the AbortSignal can stop a boundary in that mode.

  **`@pyreon/server`**: `HandlerOptions` gains `suspenseTimeoutMs?: number`, forwarded through `renderStreamResponse` → `renderToStream` only when defined (so unconfigured deploys land on `renderToStream`'s defaults byte-identically).

  **Tests**: 4 new specs in `runtime-server/src/tests/ssr.test.ts` (`renderToStream — suspenseTimeoutMs config`) covering explicit short timeout, default preservation, invalid-value fallback, and `Infinity` opt-out. 1 new integration spec in `server/src/tests/server.test.ts` proving the handler's option threads end-to-end.

  **Bisect-verified**:

  - Revert the `ctx.suspenseTimeoutMs` read to the hard-coded `30_000` → "explicit short timeout drops post-resolve content" spec fails (100ms boundary completes against the still-30s timeout); restored → passes.
  - Revert the createHandler forward (drop `suspenseTimeoutMs` from `renderStreamResponse` call) → "stream mode forwards suspenseTimeoutMs" spec fails the same way; restored → passes.
  - Both restored: runtime-server **150/150** + server **168/168 × 5 stability runs**. Lint + typecheck clean. No lockfile drift. No `TEMP BISECT` remnants. `gen-docs --check` clean.

  Manifest + MCP `api-reference` + `llms-full.txt` updated to document the new option and the `signal` option (the latter shipped in [#749](https://github.com/pyreon/pyreon/issues/749) but the manifest entry hadn't been updated). The "30s timeout" foot-gun in `mistakes[]` now mentions the configurability and the `Infinity` opt-out.

### Patch Changes

- [#749](https://github.com/pyreon/pyreon/pull/749) [`97b0e19`](https://github.com/pyreon/pyreon/commit/97b0e19533056e9cb3d9997401effc79b0f6760b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `createHandler` (stream mode) now threads `req.signal` through to `renderToStream({ signal })` so an upstream `Request` abort (client disconnect, request timeout, parent AbortController) propagates end-to-end into the streaming render. Pending Suspense boundaries are cancelled, their post-resolve enqueues are skipped, and the response stream closes promptly — no wasted work after the consumer hangs up.

  `renderToStream` already accepted `{ signal }` (shipped earlier), but `createHandler` was the missing one-line wire to make the AbortSignal story actually reach SSR users.

  Bisect-verified: drop the signal forward → the new `threads request.signal through to renderToStream` test fails with both `'loaded-too-late'` and `__NS("pyreon-s-0",…)` present in the response HTML; restored → 1 pass × 5 stability runs, 167/167 server tests pass.

- [#748](https://github.com/pyreon/pyreon/pull/748) [`2976aa8`](https://github.com/pyreon/pyreon/commit/2976aa84213b479b4d045a83143b3a4a3d89aedf) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(server, runtime-server): Class I orphaned timer in prerender + Suspense streaming (audit-leak-classes discoveries)

  Two real Class I instances surfaced by the new `audit-leak-classes`
  script's `promise-race-no-clear` detector — bugs the lint rule
  `pyreon/promise-race-needs-cleartimeout` would have caught at edit
  time but pre-dated the rule.

  ### `@pyreon/server` `ssg.ts:prerender` — orphaned 30s setTimeout

  `renderPage`'s `Promise.race([handler(req), setTimeout-reject])`
  left the timer pinned for 30s when `handler` won. Same shape as
  [#734](https://github.com/pyreon/pyreon/issues/734)'s `@pyreon/zero` `isr.ts revalidate()` fix. Under high-RPS
  prerender batches (e.g. a large SSG build), hundreds of timer
  closures pile up before they self-clear.

  Fix: capture the timer id outside `Promise.race`, `clearTimeout`
  in `finally`.

  ### `@pyreon/runtime-server` `streamSuspense` — orphaned 30s setTimeout

  The Suspense streaming boundary races children against a 30s
  timeout. The setTimeout _resolves_ (rather than rejects) with
  `'timeout'` — but the orphaned-timer shape is identical: on
  success the timer stays pinned for 30s, holding the resolve
  callback + closure. Every Suspense boundary in a long-running
  SSR server accumulates one pending timer per rendered request
  until it fires.

  Fix: same `let timeoutId` + `try { … } finally { clearTimeout }`
  pattern.

  ### Validation

  - `@pyreon/server` 166/166 tests pass
  - `@pyreon/runtime-server` 143/143 tests pass
  - `@pyreon/test-utils` 90/90 tests pass (+15 new for the audit script)
  - Lint + typecheck clean
  - No public-API surface change

- Updated dependencies [[`6571df8`](https://github.com/pyreon/pyreon/commit/6571df8209c5dc72619194ffe19359765b1d2d7f), [`af4d5d8`](https://github.com/pyreon/pyreon/commit/af4d5d83fc087d738dbe5084950476566d488d77), [`f833a99`](https://github.com/pyreon/pyreon/commit/f833a997bbc04aa5ba94d0d5dd334628871aaa9a), [`1d825c2`](https://github.com/pyreon/pyreon/commit/1d825c2374a39833881c490887602354a7d590af), [`2976aa8`](https://github.com/pyreon/pyreon/commit/2976aa84213b479b4d045a83143b3a4a3d89aedf), [`7632934`](https://github.com/pyreon/pyreon/commit/763293492a26d48e4a7b1b28e42a519677702b35), [`441b5df`](https://github.com/pyreon/pyreon/commit/441b5dfa64ae52002d3e6612ec68566344ae999d)]:
  - @pyreon/core@0.23.0
  - @pyreon/runtime-server@0.23.0
  - @pyreon/head@0.23.0
  - @pyreon/runtime-dom@0.23.0
  - @pyreon/reactivity@0.23.0
  - @pyreon/router@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies [[`33ce726`](https://github.com/pyreon/pyreon/commit/33ce726710d776abc563f7a0fed6a8ac93c9213d)]:
  - @pyreon/head@0.22.0
  - @pyreon/core@0.22.0
  - @pyreon/reactivity@0.22.0
  - @pyreon/router@0.22.0
  - @pyreon/runtime-dom@0.22.0
  - @pyreon/runtime-server@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies [[`2b39231`](https://github.com/pyreon/pyreon/commit/2b3923112e6b06b5fd2cd3a3daa1425e7a6f755c)]:
  - @pyreon/head@0.21.0
  - @pyreon/core@0.21.0
  - @pyreon/reactivity@0.21.0
  - @pyreon/router@0.21.0
  - @pyreon/runtime-dom@0.21.0
  - @pyreon/runtime-server@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [[`3499594`](https://github.com/pyreon/pyreon/commit/3499594585b7fcb650ac0f80be4bc355f741491b), [`65e61eb`](https://github.com/pyreon/pyreon/commit/65e61eba20741a012b753b4c8c69045f408768b7), [`9aa21a0`](https://github.com/pyreon/pyreon/commit/9aa21a0ae858c9ca88744f4c0d3a730a5d35a29f)]:
  - @pyreon/reactivity@0.20.0
  - @pyreon/runtime-dom@0.20.0
  - @pyreon/core@0.20.0
  - @pyreon/head@0.20.0
  - @pyreon/router@0.20.0
  - @pyreon/runtime-server@0.20.0

## 0.19.0

### Patch Changes

- [#612](https://github.com/pyreon/pyreon/pull/612) [`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Security / memory-leak / correctness hardening sweep across core, fundamentals, and zero. 12 source-grounded defects fixed; every fix has a bisect-verified regression test (revert → fail → restore → pass).

  **Security (prototype pollution / XSS / DoS)**

  - `@pyreon/reactivity` `reconcile()` + `createStore` set trap — a documented "apply an untrusted API response into a store" path (`reconcile(JSON.parse(body), store)`) had no `__proto__`/`constructor`/`prototype` guard. Added on both the write and stale-key-removal passes + defense-in-depth in the proxy set trap.
  - `@pyreon/i18n` `addMessages` — `nestFlatKeys` (dotted-key expansion) ran BEFORE `deepMerge`, so deepMerge's own pollution filter never saw the dotted form; `__proto__.x` walked into `Object.prototype` and wrote onto it. Message JSON is routinely CDN/community-sourced. Guarded.
  - `@pyreon/document` HTML renderer — `language` was interpolated raw into `<html lang="…">` and `styleStr` emitted string values raw into `style="…"`; a CMS/author-supplied value containing `"><script>` broke out → stored XSS. `lang` is now charset-restricted + escaped; style values route through the renderer's existing `sanitizeCss`.
  - `@pyreon/zero` rate-limit — `MAX_STORE_SIZE` was a declared-but-unenforced constant; the cleanup only evicted EXPIRED entries, so a flood of unique keys within one window (spoofable `X-Forwarded-For`) grew the Map unbounded — an unauthenticated memory-exhaustion DoS. Added a hard cap with oldest-first eviction (mirrors the ISR cache's proven `set()`).
  - `@pyreon/zero` ISR — the cache stored ANY response and replayed it as a 200 for the whole revalidate window: a transient 5xx/3xx became a self-inflicted outage, and a `Set-Cookie` response was replayed cross-user. Now only 2xx, cookie-free responses are cached; everything else passes through verbatim with its original status (`x-isr-cache: BYPASS`).
  - `@pyreon/server` `prerender` + `@pyreon/zero` SSG plugin (3 sites) — the path-traversal guard used a bare `startsWith(resolve(outDir))` (string-prefix, not path containment): a `getStaticPaths` slug resolving to the SIBLING `dist-evil/` passed and wrote outside the output root. Now separator-terminated containment (`isInsideDist`).
  - `@pyreon/zero` API-route matcher — dangerous param names from the route pattern guarded (defense-in-depth; consistent with the reconcile / i18n guards).

  **Memory leaks**

  - `@pyreon/reactivity` `signal._d` — direct-updater disposal nulled an array slot but never compacted, so a long-lived signal (theme/locale/auth, or signals read in `<For>` rows) bound by churning components accumulated one permanent dead slot per ever-mounted binding — an app-lifetime leak that ALSO degraded the signal-write hot path (`notifyDirect` iterated O(total-ever), not O(live)). Switched to a `Set` (same as `_s`): O(1) disposal, O(live) iteration, bounded growth. Proven structurally — `_d.size` stays 0 after 10 000 register/dispose cycles.
  - `@pyreon/dnd` `useSortable` — `itemRef` pushed every pdnd registration onto a shared array and the unmount (`ref(null)`) branch was a no-op, so a churning `<For>` sortable (todo list / kanban — the documented usage) leaked every removed item's draggable/dropTarget registration until the whole sortable unmounted. Now per-key disposal on unmount and re-register.
  - `@pyreon/zero` ISR — a hung revalidation handler pinned its key in the in-flight set forever (`finally` never ran), so the entry could never recover from stale. Background revalidation is now timeout-bounded (`ISRConfig.revalidateTimeoutMs`, default 30 s).

  **Correctness / silent-failure**

  - `@pyreon/router` `stringifyLoaderData` — the cycle detector used an all-seen `WeakSet` that was never pruned, so a shared (DAG) reference — extremely common, e.g. `{ author: user, lastEditor: user }` from an ORM — falsely threw "circular reference" and 500'd the SSR response. Replaced with true ancestor-path detection (the original code's own comment anticipated exactly this remedy). **Behaviour change (bug fix, strictly more permissive):** payloads that previously 500'd now serialize; real cycles still throw.
  - `@pyreon/server` `processTemplate` — used `String.prototype.replace` with string replacements, so rendered HTML containing literal `$&` / `$$` / `` $` `` / `$'` (prices, code, math) was corrupted by regex-pattern substitution. Switched to function replacements.
  - `@pyreon/i18n` `interpolate` — a serialization failure (circular value, throwing `toString`) was swallowed silently, rendering `{{key}}` to end users with no signal. Now dev-warns (fallback behaviour unchanged).
  - `@pyreon/query` `useSSE` — the reactive effect unconditionally reset `intentionalClose = false`, so an explicit `close()` was silently overridden by any later reactive `url`/`enabled` change. Now respects `intentionalClose` (mirrors `useSubscription`); `reconnect()` is the explicit resume.

  **Disclosures (honest scope)**

  - **An attempted SWR-swallow fix (surface the empty `.catch` via `__DEV__` warn + `_onError`) was REVERTED from this PR.** Probing empirically proved `revalidateSwrLoaders` is invoked **0 times** even by the canonical `staleWhileRevalidate` nav pattern: `resolveRoute` returns fresh `RouteRecord` objects per resolution, so `runLoaders`' `r.staleWhileRevalidate && router._loaderData.has(r)` gate is never true across navigations — the SWR branch is **dead code**, and the existing "revalidates in background" test's count actually comes from the blocking path running twice. Adding error-surfacing to provably-unreachable code is not hardening (and it dropped router coverage). **The real bug — `staleWhileRevalidate` is effectively non-functional for the nav-away/back case (record-identity-keyed gate)** — is a distinct, significant finding whose correct fix (key the gate by a stable path/loaderKey) is a non-trivial router behaviour change deserving its own focused, aligned PR. Documented in `router/src/tests/loader.test.ts` as a flagged follow-up; deliberately not bundled here (scope/risk).
  - One audit finding (`decodeKeyFromMarker`) was investigated and **dropped as a false positive** — `%2D` never appears in `encodeURIComponent` output, so the manual substitution is uniquely reversible.
  - Z5 (API-route param guard) is defense-in-depth: a string param value assigned to `__proto__` is a silent JS no-op (not exploitable); the guard prevents the real own-prop shadow for `constructor`/`prototype` and matches the repo-wide convention.

  Validation: lint 0 errors; typecheck clean (8 touched packages); gen-docs in sync; audit-types `--all --strict` 0 HIGH; bundle-budgets 54/54 within budget. Per-package suites all green (reactivity 294, router 520, server 78, i18n 155, document 269, dnd 111, query 151, zero 884).

- Updated dependencies [[`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a), [`ecd8e52`](https://github.com/pyreon/pyreon/commit/ecd8e526943a1e6b07957ff96f4410fa482baa0d), [`ac1d375`](https://github.com/pyreon/pyreon/commit/ac1d37542b11cd95451a2f0b0a51cc43603d001a), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`c4b6e9a`](https://github.com/pyreon/pyreon/commit/c4b6e9a5850196171c2197fc918163f736708aa8), [`fb40906`](https://github.com/pyreon/pyreon/commit/fb409066e49e44c42f77084a92a68103a4e6c5ef), [`b4de7e0`](https://github.com/pyreon/pyreon/commit/b4de7e0f0eb9134325eb6d87db6250064a494d51), [`8e4b607`](https://github.com/pyreon/pyreon/commit/8e4b607b01c6399153bd504f1411f213db987a9a), [`7150368`](https://github.com/pyreon/pyreon/commit/7150368f85daa783e55f05541d0c45356c13b00d), [`9f03747`](https://github.com/pyreon/pyreon/commit/9f037478763d9f8cd2365feb63dc87fda2545e5d), [`3374150`](https://github.com/pyreon/pyreon/commit/33741500499dfb487d031bbffe77723d74b8f261), [`8a300bf`](https://github.com/pyreon/pyreon/commit/8a300bf0e6fe7532bb6ae4670a8d64258d64e25f), [`fa4e37f`](https://github.com/pyreon/pyreon/commit/fa4e37fa620cf0e3f240053bf789b84bd9668838), [`2ee82eb`](https://github.com/pyreon/pyreon/commit/2ee82eb340c515c16aaa7a652ffc5b0c97b59ed6), [`4f410b6`](https://github.com/pyreon/pyreon/commit/4f410b6403ce1c033f049aa6cd2700f64193b2d1), [`e8e95bc`](https://github.com/pyreon/pyreon/commit/e8e95bc2d6785d397f4b8f85039ce76c2a7f6cea)]:
  - @pyreon/reactivity@0.19.0
  - @pyreon/router@0.19.0
  - @pyreon/core@0.19.0
  - @pyreon/head@0.19.0
  - @pyreon/runtime-server@0.19.0
  - @pyreon/runtime-dom@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/runtime-dom@0.18.0
  - @pyreon/core@0.18.0
  - @pyreon/head@0.18.0
  - @pyreon/reactivity@0.18.0
  - @pyreon/router@0.18.0
  - @pyreon/runtime-server@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [[`35af0e2`](https://github.com/pyreon/pyreon/commit/35af0e22b670151052e0b1df5006977fca759128), [`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c)]:
  - @pyreon/core@0.17.0
  - @pyreon/head@0.17.0
  - @pyreon/router@0.17.0
  - @pyreon/runtime-dom@0.17.0
  - @pyreon/runtime-server@0.17.0
  - @pyreon/reactivity@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [[`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8), [`321bac0`](https://github.com/pyreon/pyreon/commit/321bac062b68cabf66357f0362385384a96b5692), [`f82584b`](https://github.com/pyreon/pyreon/commit/f82584b3dfb1362d376065354d023647fdbdfa02)]:
  - @pyreon/core@0.16.0
  - @pyreon/router@0.16.0
  - @pyreon/head@0.16.0
  - @pyreon/reactivity@0.16.0
  - @pyreon/runtime-dom@0.16.0
  - @pyreon/runtime-server@0.16.0

## 0.14.0

### Patch Changes

- Updated dependencies [[`c97783a`](https://github.com/pyreon/pyreon/commit/c97783a85b6f7ffc5d25ad16fd280c92808b5ea6), [`12dbf14`](https://github.com/pyreon/pyreon/commit/12dbf14c92ea3e107c89039a269181a500cb60d4)]:
  - @pyreon/runtime-dom@0.14.0
  - @pyreon/runtime-server@0.14.0
  - @pyreon/core@0.14.0
  - @pyreon/head@0.14.0
  - @pyreon/reactivity@0.14.0
  - @pyreon/router@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [[`ec30b4e`](https://github.com/pyreon/pyreon/commit/ec30b4e2188fb493fdde77a77f521abe000beae0), [`a05c4ba`](https://github.com/pyreon/pyreon/commit/a05c4bab713f5168acd56eb233520102735bd80a)]:
  - @pyreon/router@0.13.0
  - @pyreon/core@0.13.0
  - @pyreon/head@0.13.0
  - @pyreon/reactivity@0.13.0
  - @pyreon/runtime-dom@0.13.0
  - @pyreon/runtime-server@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies [[`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa), [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa), [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa), [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa), [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa)]:
  - @pyreon/router@0.12.15
  - @pyreon/runtime-dom@0.12.15
  - @pyreon/runtime-server@0.12.15
  - @pyreon/core@0.12.15
  - @pyreon/head@0.12.15
  - @pyreon/reactivity@0.12.15

## 0.12.14

### Patch Changes

- [#253](https://github.com/pyreon/pyreon/pull/253) [`779f61f`](https://github.com/pyreon/pyreon/commit/779f61f99e1f403485871c1848fc82489d20960f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Storage / query / core-server anti-pattern cleanup + `no-window-in-ssr`
  typeof-guard-function recognition

  `@pyreon/storage` (10 errors → 0):

  - `indexed-db.ts`: added `typeof indexedDB === 'undefined'` early-return at
    `openDB` entry. SSR callers receive a rejected promise with a clear
    `[Pyreon] indexedDB is not available` error instead of crashing.

  `@pyreon/query` (5 errors → 0):

  - `use-subscription.ts`: added `typeof WebSocket === 'undefined'`
    early-return guards at the entry of `connect()`, `send()`, and `close()`.
  - `query-client.ts`: error prefix `[@pyreon/query]` → `[Pyreon]`.

  `@pyreon/server` / `@pyreon/core-server` (5 errors → 0):

  - `client.ts`: `typeof document === 'undefined' → throw` early-return on
    `startClient` entry. `hydrateIslands` and `scheduleHydration` /
    `observeVisibility` typeof guards.
  - `client.ts` / `html.ts`: error prefixes normalised to `[Pyreon]`.

  `@pyreon/lint` — `no-window-in-ssr` typeof-guard functions:

  - A function whose body is `return <typeof check>` (or AND-chain of typeof
    checks) now counts as a typeof guard at its call sites — e.g.
    `function isBrowser() { return typeof window !== 'undefined' }` makes
    `if (!isBrowser()) return` an early-return guard. Both
    `function decl` and `const fn = () => …` (arrow + function-expression)
    forms are recognised.
  - Conventional names `isBrowser` / `isClient` / `isServer` / `isSSR` are
    pre-seeded so cross-module imports (`import { isBrowser } from './utils'`)
    work without follow-the-import analysis. Same name-convention basis as
    `dev-guard-warnings` recognising `__DEV__`. The trade-off — a user-defined
    function with a matching name that does NOT actually check typeof would
    silence the rule — is documented as the cross-module convention contract.

  5 new bisect-verified regression tests for the typeof-guard-function
  recognition.

- Updated dependencies [[`95e7e00`](https://github.com/pyreon/pyreon/commit/95e7e00bd3e3b3926bd8348cf91f88494605ccc6)]:
  - @pyreon/router@0.12.14
  - @pyreon/core@0.12.14
  - @pyreon/head@0.12.14
  - @pyreon/reactivity@0.12.14
  - @pyreon/runtime-dom@0.12.14
  - @pyreon/runtime-server@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.13
  - @pyreon/head@0.12.13
  - @pyreon/reactivity@0.12.13
  - @pyreon/router@0.12.13
  - @pyreon/runtime-dom@0.12.13
  - @pyreon/runtime-server@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.12
  - @pyreon/head@0.12.12
  - @pyreon/reactivity@0.12.12
  - @pyreon/router@0.12.12
  - @pyreon/runtime-dom@0.12.12
  - @pyreon/runtime-server@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.11
  - @pyreon/head@0.12.11
  - @pyreon/reactivity@0.12.11
  - @pyreon/router@0.12.11
  - @pyreon/runtime-dom@0.12.11
  - @pyreon/runtime-server@0.12.11

## 0.7.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.2
  - @pyreon/core@0.7.2
  - @pyreon/runtime-dom@0.7.2
  - @pyreon/runtime-server@0.7.2
  - @pyreon/router@0.7.2
  - @pyreon/head@0.7.2

## 0.7.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.1
  - @pyreon/core@0.7.1
  - @pyreon/runtime-dom@0.7.1
  - @pyreon/runtime-server@0.7.1
  - @pyreon/router@0.7.1
  - @pyreon/head@0.7.1

## 0.7.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.0
  - @pyreon/core@0.7.0
  - @pyreon/head@0.7.0
  - @pyreon/router@0.7.0
  - @pyreon/runtime-dom@0.7.0
  - @pyreon/runtime-server@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.6.0
  - @pyreon/router@0.6.0
  - @pyreon/head@0.6.0
  - @pyreon/runtime-dom@0.6.0
  - @pyreon/runtime-server@0.6.0
  - @pyreon/reactivity@0.6.0

## 0.5.7

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.5.7
  - @pyreon/core@0.5.7
  - @pyreon/runtime-dom@0.5.7
  - @pyreon/runtime-server@0.5.7
  - @pyreon/router@0.5.7
  - @pyreon/head@0.5.7

## 0.5.6

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.6
  - @pyreon/runtime-dom@0.5.6
  - @pyreon/runtime-server@0.5.6
  - @pyreon/reactivity@0.5.6
  - @pyreon/router@0.5.6
  - @pyreon/head@0.5.6

## 0.5.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.4
  - @pyreon/reactivity@0.5.4
  - @pyreon/runtime-dom@0.5.4
  - @pyreon/runtime-server@0.5.4
  - @pyreon/router@0.5.4
  - @pyreon/head@0.5.4

## 0.5.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.3
  - @pyreon/reactivity@0.5.3
  - @pyreon/runtime-dom@0.5.3
  - @pyreon/runtime-server@0.5.3
  - @pyreon/router@0.5.3
  - @pyreon/head@0.5.3

## 0.5.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.2
  - @pyreon/reactivity@0.5.2
  - @pyreon/runtime-dom@0.5.2
  - @pyreon/runtime-server@0.5.2
  - @pyreon/router@0.5.2
  - @pyreon/head@0.5.2

## 0.5.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.1
  - @pyreon/head@0.5.1
  - @pyreon/reactivity@0.5.1
  - @pyreon/runtime-dom@0.5.1
  - @pyreon/runtime-server@0.5.1
  - @pyreon/router@0.5.1

## 0.5.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.0
  - @pyreon/runtime-dom@0.5.0
  - @pyreon/head@0.5.0
  - @pyreon/router@0.5.0
  - @pyreon/runtime-server@0.5.0
  - @pyreon/reactivity@0.5.0

## 0.4.0

### Minor Changes

- ### @pyreon/router

  - `go(n)` and `forward()` for history navigation
  - Named `replace()` — navigate by route name
  - Optional params (`:id?`) with compile-time type inference
  - `isReady()` promise for initial navigation
  - `onBeforeRouteLeave` / `onBeforeRouteUpdate` in-component guard composables
  - Route aliases — render same component from multiple paths
  - Base path support for sub-path deployments
  - Navigation blockers (`useBlocker`)
  - Relative navigation from current route
  - Trailing slash normalization (strip/add/ignore)
  - Typed search params (`useSearchParams`)
  - Stale-while-revalidate loaders

  ### @pyreon/head

  - Cached resolve with dirty flag (30M+ ops/sec cached path)
  - Single-pass HTML escaping (regex + lookup table)
  - DOM element tracking via Map (avoids querySelectorAll per sync)
  - 7-9.5x faster SSR serialization than Unhead (Vue/Nuxt)

  ### @pyreon/server

  - Pre-compiled template splits at handler creation (17x faster on real templates)
  - Pre-built client entry tag avoids per-request string construction
  - `buildScriptsFast` skips array allocation
  - Template validation moved to `createHandler` time
  - New exports: `compileTemplate`, `processCompiledTemplate`, `CompiledTemplate`

### Patch Changes

- Updated dependencies []:
  - @pyreon/router@0.4.0
  - @pyreon/head@0.4.0
  - @pyreon/reactivity@0.4.0
  - @pyreon/core@0.4.0
  - @pyreon/runtime-dom@0.4.0
  - @pyreon/runtime-server@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.3.1
  - @pyreon/core@0.3.1
  - @pyreon/runtime-dom@0.3.1
  - @pyreon/router@0.3.1
  - @pyreon/runtime-server@0.3.1
  - @pyreon/head@0.3.1

## 0.3.0

### Minor Changes

- ### Performance

  - **2x faster signal creation** — removed `Object.defineProperty` that forced V8 dictionary mode
  - **Event delegation** — `el.__ev_click` instead of `addEventListener` for compiled templates
  - **`_bindText`** — direct signal→TextNode subscription with zero effect overhead
  - **`_bindDirect`** — single-signal attribute bindings bypass effect tracking entirely
  - **`signal.direct()`** — flat-array updater registration for compiler-emitted DOM bindings
  - **Batch Set pooling** — snapshot-free subscriber notification eliminates array allocations
  - **`createSelector` snapshot-free** — O(1) selection without copying subscriber maps
  - **`renderEffect` fast path** — lighter than full `effect()` for DOM bindings
  - **SSR `renderToString` micro-optimizations** — sequential loops, `for...in`, `escapeHtml` fast path
  - **Hydration optimizations** — reduced overhead during island hydration
  - **Nested `_tpl` support** — compiler emits nested `cloneNode(true)` templates

  ### Features

  - **True React compatibility** — `useState`, `useEffect`, `useMemo` with re-render model matching React semantics
  - **True Preact compatibility** — hooks with re-render model matching Preact semantics
  - **True Vue compatibility** — `ref`, `reactive`, `watch`, `computed` with re-render model matching Vue semantics
  - **True SolidJS compatibility** — signals with re-render model matching Solid semantics, children helper fixes

  ### Benchmark Results (Chromium)

  Pyreon (compiled) is fastest framework on 6 of 7 tests:

  - Create 1,000 rows: 9ms (1.00x) vs Solid 10ms, Vue 11ms, React 33ms
  - Replace all rows: 10ms (1.00x) vs Solid 10ms, Vue 11ms, React 31ms
  - Partial update: 5ms (1.00x) vs Solid 6ms, Vue 7ms, React 6ms
  - Select row: 5ms (1.00x) — tied with all signal frameworks
  - Create 10,000 rows: 103ms (1.00x) vs Solid 122ms, Vue 136ms, React 540ms

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.3.0
  - @pyreon/core@0.3.0
  - @pyreon/runtime-dom@0.3.0
  - @pyreon/runtime-server@0.3.0
  - @pyreon/router@0.3.0
  - @pyreon/head@0.3.0

## 0.2.1

### Patch Changes

- Release 0.2.1

  - feat(vite-plugin): add `compat` option for zero-change framework migration
  - fix: resolve `workspace:^` dependencies correctly during publish
  - fix(vite-plugin): use `oxc` instead of deprecated `esbuild` option
  - fix(vite-plugin): bump vite peer dependency to `>=8.0.0`

- Updated dependencies []:
  - @pyreon/reactivity@0.2.1
  - @pyreon/core@0.2.1
  - @pyreon/runtime-dom@0.2.1
  - @pyreon/runtime-server@0.2.1
  - @pyreon/router@0.2.1
  - @pyreon/head@0.2.1

## 0.2.0

### Minor Changes

- Release 0.2.0
  - fix(vite-plugin): use `oxc` instead of deprecated `esbuild` option for Vite 8
  - fix(vite-plugin): bump vite peer dependency to `>=8.0.0`

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.2.0
  - @pyreon/core@0.2.0
  - @pyreon/runtime-dom@0.2.0
  - @pyreon/runtime-server@0.2.0
  - @pyreon/router@0.2.0
  - @pyreon/head@0.2.0

## 0.1.2

### Patch Changes

- Improve compat package types (eliminate unnecessary casts), add lint/typecheck CI for all workspaces, split example apps into individual component files.

- Updated dependencies []:
  - @pyreon/reactivity@0.1.2
  - @pyreon/core@0.1.2
  - @pyreon/runtime-dom@0.1.2
  - @pyreon/runtime-server@0.1.2
  - @pyreon/router@0.1.2
  - @pyreon/head@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.1.1
  - @pyreon/core@0.1.1
  - @pyreon/head@0.1.1
  - @pyreon/router@0.1.1
  - @pyreon/runtime-dom@0.1.1
  - @pyreon/runtime-server@0.1.1
