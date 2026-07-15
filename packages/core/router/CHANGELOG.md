# @pyreon/router

## 0.46.0

### Minor Changes

- [#2245](https://github.com/pyreon/pyreon/pull/2245) [`6164409`](https://github.com/pyreon/pyreon/commit/6164409767c2b7a9668a004ab085406ae8e2178b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(zero): route prefetch injected `rel="modulepreload"` at the route path → strict-MIME error on every hovered link

  `<Link>` / `useLink` / `createLink` / `prefetchRoute`'s hover + viewport prefetch (`doPrefetch`) injected `<link rel="modulepreload" href={routePath}>`. The href is the navigation PATH, which an SSR server returns as `text/html`, so the browser fetched it as a module script and logged `Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html"` on **every** hovered link — plus a wasted HTML round-trip. Navigation still worked (the real chunk loads via the router's lazy loader on nav), so it was cosmetic-but-noisy, in dev and any SSR deployment.

  The chunk is now warmed correctly through the router's own lazy loader: `router.preload(path, undefined, { skipLoaders: true })` imports the real Vite-resolved chunk into the component cache (code only — no loader/data side effects on hover), always the correct chunk URL. Only the valid `rel="prefetch" as="document"` document hint is injected. `@pyreon/router` now exports `getActiveRouter` / `setActiveRouter` (the standalone `prefetchRoute` resolves the active router the same way the hooks do).

### Patch Changes

- [#2305](https://github.com/pyreon/pyreon/pull/2305) [`8f0912c`](https://github.com/pyreon/pyreon/commit/8f0912c3a36055aa625d582777850c0c3ecfbc04) Thanks [@vitbokisch](https://github.com/vitbokisch)! - docs: fix 4 audit-found manifest inaccuracies that shipped wrong claims to AI assistants via MCP

  - **runtime-dom (safety-inverted):** `dangerouslySetInnerHTML` is intentionally RAW (React parity — developer owns sanitization); the manifest claimed it was sanitized. Also corrected: the Sanitizer API (`el.setHTML`) lives only in the `innerHTML` PROP sink (where it bypasses a custom `setSanitizer` policy), `sanitizeHtml()` itself is always the custom-or-DOMParser allowlist; `_bindText` is emitted for non-computed member chains too (with a `caller` 3rd arg preserving `this`), not "only a bare signal identifier"; KeepAlive's non-thunk `active={cond}` THROWS `TypeError` at mount (no `<Show when>`-style value normalization), it is not "captured once".
  - **validate:** `parseReactiveAsync` DOES supersede stale results (internal version counter — an awaited stale frame resolves to the latest run's verdict); the mistakes entry claimed the opposite. The true residual caveat is no AbortSignal (in-flight validators run to completion). Also updated the stale union prod-crash string (`member._runInto is not a function`, not `member["~standard"] is undefined`).
  - **router:** `onBeforeRouteLeave` called outside setup DOES register (unconditional `router.beforeEach`) — the real failure mode is a LEAKED guard (the `onUnmount` auto-removal never attaches), not "never registers". RouterView also accepts an optional `router` prop.
  - **hooks:** `useScrollLock`'s per-instance `isLocked` guard makes an extra `unlock()` a no-op — it can NOT release another component's lock; corrected to teach the real limitation (one instance holds at most one refcount unit and does not nest).
  - **validation:** schema libraries are detected by duck-typing `~standard` with zero dependency records — they are no longer declared as optional peer dependencies.
  - **compiler:** `_bind` is imported from `@pyreon/reactivity` (not runtime-dom/core).

- [#2240](https://github.com/pyreon/pyreon/pull/2240) [`f807c5e`](https://github.com/pyreon/pyreon/commit/f807c5e4e1f64da2a1786b1c3578861c77749d8d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - docs(router): source-verified `mistakes[]` foot-gun catalogs added to the flagship
  APIs that had none — RouterView, useLoaderData, useRoute, useSearchParams,
  onBeforeRouteLeave. Every entry verified against the worktree source: RouterView's
  SSR-blank-on-lazy (`prefetchLoaderData` runs loaders only; the handler must also
  `router.preload`), the single atomic `depthEntry` computed (param changes don't
  remount the layout), useLoaderData's non-reactive context read + per-depth
  provider, useRoute's accessor/destructure trap, useSearchParams' tuple shape, and
  the guard return-value inversion vs useBlocker (guard `false`=cancel/string=redirect
  vs blocker `true`=block — confirmed at router.ts:756-757). Regenerates the MCP
  api-reference router region. Docs/manifest only — no runtime behavior change.

- [#2274](https://github.com/pyreon/pyreon/pull/2274) [`cfb2862`](https://github.com/pyreon/pyreon/commit/cfb2862480f48fa3eeaf647e17e25c70e8bb5a3d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - docs(router): document 6 missing public exports in the manifest — `useNavigate`, `useParams`, `useValidatedSearch`, the `notFound`/`NotFoundBoundary` 404 pair, and `lazy`. `useNavigate`+`useParams` are two of the most-used router hooks framework-wide and had no api[] entry. All signatures, return shapes, and footguns are source-verified: `useNavigate` returns a `void`-typed pusher (drops the NavigationResult); `useParams` returns a string SNAPSHOT (not a live accessor); `useValidatedSearch` is an argument-less READ-ONLY accessor distinct from `useTypedSearchParams`/`useSearchParams`; `notFound()` throws a `Symbol.for('pyreon.notFound')`-branded error and `NotFoundBoundary` re-throws non-notFound errors; `lazy()` returns an inert descriptor cached by the router (not `lazy` itself). Regenerates the MCP api-reference + docs-site reference page.

- [#2291](https://github.com/pyreon/pyreon/pull/2291) [`33d9b55`](https://github.com/pyreon/pyreon/commit/33d9b555bb501b4341c1c5cc92400b162323ced5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - perf(router): faster dynamic route matching — win the realistic-size averages

  Two semantics-preserving cuts to the `resolveRoute` fast lane (`match.ts`),
  both hot on every param-bearing / splat / catch-all match:

  - **Fold `firstSegmentOf` into `scanCleanPath`.** The clean-path scan already
    walks past the first internal `/` while counting segments; it now records
    that offset so the fast lane slices the dispatch-map key directly instead of
    re-scanning with `indexOf('/', 1)`.
  - **Skip the segment-0 re-comparison in `matchFlattenedFast`.** Every candidate
    reached through `segmentDispatch`/`segmentMap` is keyed by its static
    `firstSegment` (=== the path's first segment), so segment 0 is a proven
    match; matching now resumes at segment 1, eliding one `indexOf('/')` + one
    `startsWith` per matched dynamic route. `dynamicFirst` (param-first) routes
    still match from the top.

  Measured (200-route table, 8-router pooled-CI95 protocol, `scripts/bench/core/router.ts`,
  Apple M3 Max / Bun 1.3): `dynamic (1 param)` 102→78ns — now an OUTRIGHT win
  (find-my-way 85, radix3 88); dynamic-2 157→139, nested-dynamic 156→140,
  splat 120→102, catch-all 86→81. Pyreon now wins the realistic-size **averages
  outright at both 50 and 200 routes** (1.00× vs find-my-way 1.05–1.10× / radix3
  1.12×; was 3rd at 200 routes). Static/nested-static unchanged (already fastest).

  Byte-identical to the prior implementation over a 300k-random-path differential
  (query/hash/`//`/`%`/trailing-slash/optional/splat/nested/param-first/miss);
  all 680 router tests pass.

- Updated dependencies [[`8f0912c`](https://github.com/pyreon/pyreon/commit/8f0912c3a36055aa625d582777850c0c3ecfbc04), [`d9a8dd8`](https://github.com/pyreon/pyreon/commit/d9a8dd80627239d864ebd70de830b50d72eae4c9), [`bdea687`](https://github.com/pyreon/pyreon/commit/bdea687b11ce312ce5a9aaec3a96a44bb6c48d30), [`75a49be`](https://github.com/pyreon/pyreon/commit/75a49befac42202c8237911aa4b111efbbfb1a61), [`cc5250d`](https://github.com/pyreon/pyreon/commit/cc5250d4022638286a0bf89facffb5a585fe2a18), [`19c1ce1`](https://github.com/pyreon/pyreon/commit/19c1ce12a54305ac875d1b19682ecf084addc607), [`f67f3fe`](https://github.com/pyreon/pyreon/commit/f67f3fe451f0aeeb74a024501d30f593ce50b7ff), [`d93e7d3`](https://github.com/pyreon/pyreon/commit/d93e7d3f9a4d679b25a3fc646d99673c2fe276c5), [`22d82cf`](https://github.com/pyreon/pyreon/commit/22d82cf46bad096765f5cb174d2bf3fdadb49902), [`853c9b6`](https://github.com/pyreon/pyreon/commit/853c9b615459fa891bb0876d0b2d05d478deb728), [`3124522`](https://github.com/pyreon/pyreon/commit/31245225c087922575846fa644f93523ff6e1435)]:
  - @pyreon/runtime-dom@0.46.0
  - @pyreon/reactivity@0.46.0
  - @pyreon/core@0.46.0
  - @pyreon/sized-map@0.46.0

## 0.45.0

### Patch Changes

- Updated dependencies [[`747cced`](https://github.com/pyreon/pyreon/commit/747cced0efd3611bcff4f0d8ec01417ed5f19e45), [`5cf5387`](https://github.com/pyreon/pyreon/commit/5cf5387fb214108c694e3678a76a113b4d198fa4)]:
  - @pyreon/runtime-dom@0.45.0
  - @pyreon/core@0.45.0
  - @pyreon/reactivity@0.45.0
  - @pyreon/sized-map@0.45.0

## 0.44.0

### Minor Changes

- [#2171](https://github.com/pyreon/pyreon/pull/2171) [`28fbd77`](https://github.com/pyreon/pyreon/commit/28fbd7799f015503d45c8642d8822bff64e9e155) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Router excellence pass — browser-navigation correctness + in-place revalidation:

  - **Browser Back/Forward now runs the FULL navigation pipeline.** Pre-fix, popstate/hashchange did a bare path write — so loaders never re-ran (`useLoaderData()` was `undefined` after pressing Back, since loader data is pruned on leave), guards/blockers/middleware were bypassed, `afterEach` never fired (the a11y route announcer was silent on Back/Forward), and scroll positions + `meta.title` were not maintained. A traversal cancelled by a guard/blocker now restores the URL and history position (`history.go` via a per-entry `history.state.__pyreonIdx` stamp, `replaceState` fallback for entries the router didn't create).
  - **`push()`/`replace()` resolve with a `NavigationResult`** (`'committed' | 'cancelled' | 'superseded'`) instead of `void` — Vue-Router-style navigation-failure detection in value form (`if (await router.push('/x') !== 'committed') …`). Existing `await router.push(...)` call sites keep compiling and behaving identically.
  - **New `router.revalidate()`** — re-runs the CURRENT route's loaders in place and re-renders affected components (the mutation-then-refresh primitive; closes the "`invalidateLoader` only takes effect on next navigation" limitation). A revalidating loader that throws `redirect()` navigates.
  - **`useMiddlewareData()` fixed** — it returned `{}` since inception (data was attached to an in-flight route object that never becomes `currentRoute()`). Middleware data is now published at commit time and read reactively; it resets per navigation.
  - **`<RouterLink>` prefetch dedup** — hover/viewport prefetch now routes through the loader cache + in-flight dedup, so a prefetch and the click that follows share ONE loader run (was a guaranteed double-fetch).
  - Behavioral notes: browser-traversal route updates are now asynchronous (they run the pipeline); when an explicit `scrollBehavior` is configured the router sets `history.scrollRestoration = 'manual'` for its lifetime (restored on `destroy()`) — without one, native scroll restoration keeps owning Back/Forward scroll exactly as before.

### Patch Changes

- [#2184](https://github.com/pyreon/pyreon/pull/2184) [`9ef1b14`](https://github.com/pyreon/pyreon/commit/9ef1b1422313b49a020b7deb1ffa0871a5cc012a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Security: harden user-controlled-key parsers against property injection (CodeQL `js/remote-property-injection`)

  `parseQuery`/`parseQueryMulti` (`@pyreon/router`) write user-controlled query KEYS into the result, and `parseCookies` (`@pyreon/zero` i18n routing) writes client-controlled cookie NAMES — a plain `{}` result let `?__proto__=…` / `Cookie: constructor=…` reach inherited prototype slots. All three now build a **null-prototype** result object (`Object.create(null)`, the `qs`/`query-string` standard), so every user key is a plain own data property: prototype/property injection is structurally impossible, and `?__proto__=x` becomes a retrievable own key rather than a `Object.prototype`-shadowing footgun. Public return types (`Record<string, …>`) are unchanged; consumer access (`q[key]`, `key in q`, `Object.keys`, spread) is unaffected. Regression-locked + bisect-verified in both packages.

- Updated dependencies [[`ae2472e`](https://github.com/pyreon/pyreon/commit/ae2472e4ecb31cd59bde23d1983afe7db1c62d99), [`8413136`](https://github.com/pyreon/pyreon/commit/84131368d6f8790ba50e2af9d383ee289e4b1f5c), [`721618e`](https://github.com/pyreon/pyreon/commit/721618e97dacf995d8356dabea601ef4e98a4a12), [`d859370`](https://github.com/pyreon/pyreon/commit/d8593704b0941ef0e51a427147ebce2a385ecae3)]:
  - @pyreon/runtime-dom@0.44.0
  - @pyreon/reactivity@0.44.0
  - @pyreon/core@0.44.0
  - @pyreon/sized-map@0.44.0

## 0.43.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/sized-map@0.43.1

## 0.43.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.43.0
  - @pyreon/reactivity@0.43.0
  - @pyreon/runtime-dom@0.43.0
  - @pyreon/sized-map@0.43.0

## 0.42.0

### Patch Changes

- Updated dependencies [[`39051db`](https://github.com/pyreon/pyreon/commit/39051dbcec2aa5f3aa9db79c5ac0a9f9197cc1e9)]:
  - @pyreon/runtime-dom@0.42.0
  - @pyreon/core@0.42.0
  - @pyreon/reactivity@0.42.0
  - @pyreon/sized-map@0.42.0

## 0.41.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/sized-map@0.41.2

## 0.41.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/sized-map@0.41.1

## 0.41.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.41.0
  - @pyreon/reactivity@0.41.0
  - @pyreon/runtime-dom@0.41.0
  - @pyreon/sized-map@0.41.0

## 0.40.0

### Minor Changes

- [#2046](https://github.com/pyreon/pyreon/pull/2046) [`0dc1f13`](https://github.com/pyreon/pyreon/commit/0dc1f1379434bbc855ee4e7a7a585759dfc2836e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Respect `prefers-reduced-motion` for route View Transitions (WCAG 2.3.3 "Animation from Interactions"). When the user's OS is set to reduce motion, the router now skips `document.startViewTransition()` and swaps the DOM synchronously via the existing non-VT path — the navigation still happens, only the fade/slide animation is suppressed. The preference is read per-navigation (not cached), so toggling it mid-session takes effect on the next route change. No configuration needed; `meta.viewTransition: false` still opts a route out entirely.

- [#2047](https://github.com/pyreon/pyreon/pull/2047) [`8a7bff0`](https://github.com/pyreon/pyreon/commit/8a7bff0dda93f15afbee9a0d9ab040e2e8969ff0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Announce route changes to screen readers (accessibility). In an SPA, navigation swaps content without a full page load, so assistive tech is never told the page changed. The root `<RouterView>` now writes the new page's name into a visually-hidden `aria-live="polite"` region on every navigation (the new `document.title`, falling back to the pathname) — the same pattern Next.js / Remix / gov.uk ship. Zero config, on by default.

  Only genuine path changes announce (the initial load and same-path query/hash changes don't), and only the root view announces (nested layout views don't double-announce). Opt out with `<RouterView announceRouteChanges={false}>`. SSR-safe (no-op on the server). Layer-safe — mirrors `@pyreon/a11y`'s live-region pattern inline rather than importing it (router is a core-layer package).

### Patch Changes

- [#2068](https://github.com/pyreon/pyreon/pull/2068) [`d61d3d9`](https://github.com/pyreon/pyreon/commit/d61d3d9e3acb483b1b5fa8b79f23c03c309ab2c5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - RouterLink/anchor link-DX fixes (PZ-07 + PZ-06).

  **PZ-07 — `<RouterLink>` without a provider was broken three ways.** `RouterLink` now resolves its router exactly like every router hook does (`useContext(RouterContext) ?? activeRouter` via `getActiveRouter()`), so `setActiveRouter(router)` without a `<RouterProvider>` component renders correct hrefs and client-navigates. With NO router resolvable at all, the link degrades to a **plain anchor**: the `href` is the plain path and clicks are no longer intercepted, so the browser performs a full-load navigation. A dev-only (client-only) warning fires once per `to`: `[Pyreon] <RouterLink to="…"> rendered without a RouterProvider — falling back to a plain anchor…`.

  **BREAKING (pre-1.0, deliberate):** the no-router fallback behavior changed — previously the `href` fell back to a hash URL (`#/path`) and `handleClick` called `preventDefault()` before bailing, leaving a dead link that swallowed clicks. If you relied on the hash-fallback `href` from provider-less links, pass a real router (provider or `setActiveRouter`).

  **PZ-06 — dev-mode warning for full-reload internal anchors.** In dev (client only), `createRouter()` registers ONE document-level click listener that warns when a plain internal `<a href="/x">` is about to trigger a full page reload, with the `<RouterLink to="/x">` replacement in the message. `RouterLink`/framework links never warn (they `preventDefault()` the internal clicks they handle — the discriminator). External/`mailto:`/`#hash` hrefs, modifier/middle clicks, and anchors with `target`/`download` are skipped; deliberate full-load links can also opt out with a `data-allow-reload` attribute. Applies in both history and hash mode; the listener is removed by `router.destroy()` and is dev-only (tree-shaken from production bundles).

  `@pyreon/compiler`: new `diagnoseError` catalog entry teaching the RouterLink-without-provider shape (the dev warning text + the old hash-fallback/dead-click symptoms) with the `<RouterProvider>` fix.

- [#2048](https://github.com/pyreon/pyreon/pull/2048) [`0ea9c60`](https://github.com/pyreon/pyreon/commit/0ea9c6006f19489eb42af9146b790ff826f2a0a3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Internal: satisfy `@pyreon/lint`'s `no-window-in-ssr` for the reduced-motion `matchMedia` guard added in the previous release. The inline `typeof matchMedia === 'function' && matchMedia(...)` check is refactored into a `prefersReducedMotion()` helper with an `if (typeof matchMedia === 'undefined') return false` entry guard (the form the rule recognises). No behavior change — SSR still returns false; the browser still reads `prefers-reduced-motion` per-navigation.

- Updated dependencies [[`e6d3905`](https://github.com/pyreon/pyreon/commit/e6d390586944b903ee8d9c97a71cbaf26eca63d6), [`a5021f6`](https://github.com/pyreon/pyreon/commit/a5021f631729add83b2808a18288a2c48f81c233), [`ea835ad`](https://github.com/pyreon/pyreon/commit/ea835ad364e3dcf0de8337fceed382e9f6762285), [`4958096`](https://github.com/pyreon/pyreon/commit/4958096c01f4ed4f031cc65bf9ff7c26c93d3449), [`e859638`](https://github.com/pyreon/pyreon/commit/e859638a4c382051d5fa6f2605a8c383207f6e66), [`c184330`](https://github.com/pyreon/pyreon/commit/c184330594a7726c4f1f1095cc3a785cfe9ef3f7), [`85d4a91`](https://github.com/pyreon/pyreon/commit/85d4a91c5e015af7348ebdd312e0ba5523950a3d), [`ed364d2`](https://github.com/pyreon/pyreon/commit/ed364d2a34f4b74df94c02f3c2e630b96a4f2e7f)]:
  - @pyreon/runtime-dom@0.40.0
  - @pyreon/reactivity@0.40.0
  - @pyreon/core@0.40.0
  - @pyreon/sized-map@0.40.0

## 0.39.0

### Minor Changes

- [#1962](https://github.com/pyreon/pyreon/pull/1962) [`8e8a0de`](https://github.com/pyreon/pyreon/commit/8e8a0de48a1c4aba4e09fc8e72fb72bc0c1ec68e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(router): typed route paths + automatic external-link handling for `<RouterLink>`

  **Typed routes.** `<RouterLink>` is now generic over its `to` literal (`RouterLink<const T>` + `CheckHref<T>`). Augment the new `RegisteredRoutes` interface (a build step like `@pyreon/zero`'s `typedRoutes` can emit this) and `to` gains autocomplete + a real "did you mean …" type error on a mistyped internal path — while dynamic `string`s and external URLs are still accepted with no cast. Concrete paths validate against `:param` patterns via `InterpolateRoute` (`/user/:id` accepts `/user/42` but rejects `/users/42`). Zero routes registered → `RoutePath` widens to `string` (the historical untyped behaviour, unchanged). This is a strict superset of `to: string`; nothing that compiled before stops compiling.

  `CheckHref<T, Routes = RoutePath>` takes an optional second type argument so other route-aware link components (e.g. `@pyreon/zero`'s `<Link>`) can reuse the validator against their own route registry. New type exports also include `InterpolateRoute`.

  **External links.** `<RouterLink>` classifies `to` at runtime and only intercepts INTERNAL navigations. External `http(s)`/protocol-relative URLs render `<a target="_blank" rel="noopener noreferrer">` and full-navigate (no router intercept); `mailto:`/`tel:`/other schemes and `#hash` anchors render a plain `<a>` the browser owns; same-origin absolute URLs are treated as internal by default. Modifier/middle-clicks always fall through to the browser. Configure globally with `createRouter({ links: { sameOriginAbsolute, externalNewTab, externalRel } })` or override per link with the new `external` / `target` / `rel` props (explicit prop > config > auto-detect).

  New public exports: `RegisteredRoutes`, `RoutePath`, `CheckHref`, `ExternalHref`, `LinkConfig` (types) + `classifyHref`, `toRouterPath` (runtime helpers).

### Patch Changes

- Updated dependencies [[`b15b4b5`](https://github.com/pyreon/pyreon/commit/b15b4b5b823c85babc07b9250bc4fa39a4b22d31), [`a0c82c3`](https://github.com/pyreon/pyreon/commit/a0c82c3270a8e89e69d88046b590f04588f6802f), [`16f2ad1`](https://github.com/pyreon/pyreon/commit/16f2ad130f7ba1fd0e821bf28bc59fe49787790b), [`a401811`](https://github.com/pyreon/pyreon/commit/a40181170cad2c71efa66244aa9306b4b3f8527f), [`9562f24`](https://github.com/pyreon/pyreon/commit/9562f2489e1d7176dd41b1ec52fe0fb39568b100), [`fa95aba`](https://github.com/pyreon/pyreon/commit/fa95aba3aebc24d0178093cd89870b8807beca72), [`794fb27`](https://github.com/pyreon/pyreon/commit/794fb27e6fa67e71608b603cd627cf4eff61a102), [`f7083e5`](https://github.com/pyreon/pyreon/commit/f7083e5a56768fb67e097ec9bc6ee6d1bc6e0d09), [`c82687c`](https://github.com/pyreon/pyreon/commit/c82687c07a2b2ba976787dea74bc891f72a1165a), [`8a1feb0`](https://github.com/pyreon/pyreon/commit/8a1feb07faca643488c98e89db7bfc08d6867a31)]:
  - @pyreon/runtime-dom@0.39.0
  - @pyreon/sized-map@0.39.0
  - @pyreon/reactivity@0.39.0
  - @pyreon/core@0.39.0

## 0.38.0

### Patch Changes

- Updated dependencies [[`cfa422f`](https://github.com/pyreon/pyreon/commit/cfa422fdb6985e50c74e06cf0f4c1318213d6303), [`0376a3d`](https://github.com/pyreon/pyreon/commit/0376a3ddc75dd1fbee582e7cabe98beb01d60073), [`6ee46e7`](https://github.com/pyreon/pyreon/commit/6ee46e7dca1cb01aacaa7c61ef5dbbcf12b30668)]:
  - @pyreon/reactivity@0.38.0
  - @pyreon/runtime-dom@0.38.0
  - @pyreon/core@0.38.0
  - @pyreon/sized-map@0.38.0

## 0.37.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/sized-map@0.37.1

## 0.37.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.37.0
  - @pyreon/reactivity@0.37.0
  - @pyreon/runtime-dom@0.37.0
  - @pyreon/sized-map@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies:
  - @pyreon/runtime-dom@0.36.0
  - @pyreon/core@0.36.0
  - @pyreon/reactivity@0.36.0
  - @pyreon/sized-map@0.36.0

## 0.35.0

### Patch Changes

- [#1841](https://github.com/pyreon/pyreon/pull/1841) [`06971cc`](https://github.com/pyreon/pyreon/commit/06971cc33850a70dbf5ab335e491a535823dd576) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix a parameterised parent layout's `useLoaderData()` going stale across a child navigation.

  PR [#1833](https://github.com/pyreon/pyreon/issues/1833) made parent layouts persist (mount once) across child navigations so their chrome/scroll/state survives — but a NON-leaf depth never re-emitted, and `useLoaderData()` reads a plain (non-reactive) context snapshot. So a parameterised parent layout with its OWN loader (e.g. `/users/:id` whose loader fetches the user) kept showing the first user after navigating `/users/42/profile → /users/99/profile`: the parent record stays the same, the id changed 42→99, its loader re-ran and `_loaderData` updated, but the persisting layout's `useLoaderData()` stayed on user-42. (The leaf was always fine — it re-mounts. `useParams()` was also fine — it keys off the `currentRoute` signal; but loader data is depth-specific and can't fall back to a signal the same way.)

  Fix: a non-leaf depth now re-emits (re-mounts, re-reading `useLoaderData()` in its body) when THIS depth's own loader data changes. Loader-LESS layouts (the common chrome/sidebar case — and the exact case [#1833](https://github.com/pyreon/pyreon/issues/1833) fixed) keep `loaderData === undefined` on both sides, so they still mount once. A same-param child navigation (e.g. switching tabs under the same `/users/42/…`) leaves the parent data unchanged → still no re-mount.

- [#1833](https://github.com/pyreon/pyreon/pull/1833) [`af85ce3`](https://github.com/pyreon/pyreon/commit/af85ce3dfc590db06838834c32d88f434e7f2769) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(router): parent layouts persist across child navigation (restore "layouts mount once")

  `RouterView`'s per-depth `depthEntry` computed dedup included `a.route === b.route`
  in its `equals`. Because `router.currentRoute()` returns a fresh `ResolvedRoute`
  object on every navigation, that comparison was _always_ false on any nav — so the
  component at **every** matched depth re-mounted on every page change, including the
  **parent layout**. That defeated the documented "layouts mount once" contract: a
  layout re-mount tears down its persistent chrome (sidebar/header), resetting things
  like scroll position and flashing the UI on each navigation.

  Now `route` only forces a re-emit at the **leaf** depth (the page that actually
  consumes `params` / `query` / loader data via `renderWithLoader`). Parent layouts
  re-emit only when their own `rec` / `comp` / `errored` changes, so they persist
  across child navigations while the leaf still re-renders with fresh route data.
  Components needing parent-level route data read it reactively (`useParams` /
  `useLoaderData`), which update without a re-mount.

  Verified: a new `integration.test.tsx` contract test (a parent layout's live DOM
  node survives navigation between its children — bisect-verified to fail against the
  old equals), the full 612-test router suite (incl. all loader tests), and the
  `ssr-showcase` e2e (loaders + nested layouts + back/forward + 404 all still pass).

- Updated dependencies [[`8a1345d`](https://github.com/pyreon/pyreon/commit/8a1345d9b14f56130f38823b58745207c7bdf7ef), [`1f29c4b`](https://github.com/pyreon/pyreon/commit/1f29c4b9791e6ad96901ca0e2b90e5335b803895), [`02b77ae`](https://github.com/pyreon/pyreon/commit/02b77aed6b4383554b3458e408b462098fc3e708), [`35d440a`](https://github.com/pyreon/pyreon/commit/35d440a44d92ac913cf19f3f8e21b4603458a165), [`1c98f38`](https://github.com/pyreon/pyreon/commit/1c98f3863ccd2fd16a4ad6e20e82fb778725bca0)]:
  - @pyreon/runtime-dom@0.35.0
  - @pyreon/core@0.35.0
  - @pyreon/reactivity@0.35.0
  - @pyreon/sized-map@0.35.0

## 0.34.0

### Patch Changes

- Updated dependencies [[`c0814b7`](https://github.com/pyreon/pyreon/commit/c0814b7881b01b7bfed19dffd7f48a3269c14199), [`66d44c5`](https://github.com/pyreon/pyreon/commit/66d44c58920bf81848e9ba858c413a88727a3c65)]:
  - @pyreon/runtime-dom@0.34.0
  - @pyreon/sized-map@0.34.0
  - @pyreon/reactivity@0.34.0
  - @pyreon/core@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/runtime-dom@0.33.0
  - @pyreon/sized-map@0.33.0

## 0.32.0

### Minor Changes

- [#1524](https://github.com/pyreon/pyreon/pull/1524) [`f21a439`](https://github.com/pyreon/pyreon/commit/f21a439cfefd219b1c13f1b8d99dbfbbe949fd34) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Server loaders (Phase 5 of the render-modes plan) — `.server.ts` siblings + single-fetch.

  A route file's `.server.ts` sibling can export `serverLoader(ctx)` — it runs in-process on SSR/SSG (full `LoaderContext` incl. `request`), and on client-side navigations the router fetches the whole matched chain's data in **one** request from the auto-mounted `GET /_pyreon/data` endpoint (cookies flow; `redirect()` becomes a client navigation). The client bundle structurally excludes `.server.ts` modules — the client routes module never imports them (CI-gated by an artifact sentinel scan). A route may have `loader` OR a server-loader sibling, not both (build error names the fix).

  Also fixed: route records whose data came from a server loader rendered WITHOUT the `LoaderDataProvider` (both render-gate branches checked only `record.loader`) — `useLoaderData()` read undefined even though preload had populated the data and the hydration blob carried it.

### Patch Changes

- [#1503](https://github.com/pyreon/pyreon/pull/1503) [`0c1ea1e`](https://github.com/pyreon/pyreon/commit/0c1ea1e89e4228e84367efd5d2cb334808955a25) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add canonical runtime environment flags `isServer` / `isClient` to `@pyreon/reactivity` (re-exported from `@pyreon/core`).

  `isServer` is `typeof document === 'undefined'` — the most reliable "is there a DOM" discriminator (more correct than `typeof window`, which misreports Deno and polyfilled Node). Plain runtime constants, evaluated once at module load: correct in every runtime with zero bundler configuration. Use them for small environment guards (module-level singletons, lazy globals, render output that differs server vs client); for heavy server-only code prefer a `/server` subpath export, and for DOM access inside a component prefer `onMount` / `effect` (which never run during SSR).

  Internally, this replaces seven hand-rolled `typeof window` / `typeof document` env consts across `router`, `hooks`, `url-state`, `elements`, `ui-core`, and `styler` with the single primitive — removing the drift (the copies disagreed on `window` vs `document`) and the inconsistency. Behavior is unchanged in browsers and Node; the `window` → `document` switch is a strict improvement for Deno / Web Workers.

  `@pyreon/lint`'s `no-window-in-ssr` rule now recognises an imported `isClient` / `isServer` (or `isBrowser` / `isSSR`) as an SSR guard — but only when imported from `@pyreon/reactivity` or `@pyreon/core`, so `if (isClient) window.x` / `if (isServer) return` / `if (!isClient) return` are clean while a same-named local `const isBrowser = true` or a foreign-source import stays flagged.

- [#1538](https://github.com/pyreon/pyreon/pull/1538) [`fc26160`](https://github.com/pyreon/pyreon/commit/fc26160ac2d3afba0adde20f61d94a4199519b59) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Internal refactor: replace hand-rolled `typeof window/document` environment checks with the canonical `isServer` / `isClient` primitives from `@pyreon/reactivity`. Behavior is identical (`isServer`/`isClient` ARE `typeof document {===,!==} 'undefined'`) — the framework now uses its own primitive instead of dogfooding the pattern its own `pyreon/prefer-isserver` rule flags. No public API change.

  Function-body SSR guards whose SSR branch is verified by deleting `document`/`window` at runtime in tests (e.g. `@pyreon/elements` Overlay positioning, `@pyreon/styler`'s sheet, `@pyreon/head`'s `syncDom`) intentionally KEEP the call-time `typeof` check — a module-load-time `isServer` const can't be re-evaluated by that test method, and the call-time form is equally production-correct. Those files are scoped-off from `prefer-isserver` in `.pyreonlintrc.json` with that rationale.

- [#1502](https://github.com/pyreon/pyreon/pull/1502) [`a359e29`](https://github.com/pyreon/pyreon/commit/a359e2917567419655dd31c5d093d0a4479ba021) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `resolveRoute` hot-path overhaul — Pyreon is now the fastest router at realistic route-table sizes on the cross-framework matching benchmark (`bench:router`, vs find-my-way / Hono / radix3 / react-router / TanStack / vue-router / path-to-regexp): 1.00× (leader) at 50 and 200 routes, ahead of radix3 at every table size; only Hono's mega-regex leads the 10-route toy table (an approach that measures 4.5× SLOWER than Pyreon at 50+ routes). Average throughput improved 13–29% per table size vs the previous implementation.

  What changed (semantics preserved — 599 router specs + zero/server suites pass):

  - **One index probe per resolve.** `buildRouteIndex` self-compiles on miss; a same-`routes`-reference identity memo (the dominant single-router case) replaces even the WeakMap probe.
  - **`validateSearch` precomputed at flatten time.** Each flattened route stores its chain's effective validator (leaf→root, most-specific wins) — resolves no longer walk the matched chain per navigation.
  - **Null-prototype dictionary indexes.** `staticMap` / `segmentMap` switched from `Map` to null-proto objects (~3× faster hit path; hostile keys like `__proto__` are plain own properties).
  - **Offset-walking fast lane.** Plain paths (no `%`, no `//`, no trailing slash — the overwhelmingly common shape) match by walking the URL with offsets: static pattern segments compare in place via `startsWith`, only param values are sliced, no parts array. A single-pass shape scan routes encoded / empty-segment / trailing-slash URLs to the previous split-based matcher, so every edge shape behaves exactly as before by construction.
  - **Per-bucket segment-count dispatch.** All-fixed-count buckets index candidates by count, structurally eliminating count-mismatch rejects; buckets containing splat/optional candidates keep the ordered flat scan so definition-order priority (first match wins) is preserved — locked by a bisect-verified spec.
  - **Frozen empty singletons** for no-params / no-query / no-search results (the `meta` freeze precedent): three fewer allocations per navigation; mutation of an EMPTY `params`/`query`/`search` now throws in strict mode instead of silently polluting a shared object. Non-empty values are still fresh per resolve.

  Also fixed along the way: **URL hash/query split order now follows the WHATWG URL spec.** `resolveRoute('/user/42?tab=posts#bio')` previously leaked the fragment into the query (`{ tab: 'posts#bio' }`) because `?` was split before `#`; a `?` inside a fragment was misread as a query separator. The fragment is now everything after `#`, with the query between `?` and `#`.

- [#1533](https://github.com/pyreon/pyreon/pull/1533) [`698f514`](https://github.com/pyreon/pyreon/commit/698f514f44160e1955582b4573014bddba45a38e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Server-loaders correctness fixes (adversarial review of the Phase 5 release):

  - **`.server.tsx`/`.server.jsx` siblings now excluded from routes.** The exclusion regex matched only `.server.[jt]s`, so a `.server.tsx`/`.jsx` server-loader module silently shipped as a client route — violating the "never reaches the client bundle" guarantee. All four extensions are now excluded, and the sibling-detection probes all four.
  - **Single-fetch no longer collides layout + page data.** The `/_pyreon/data` endpoint keyed loader data by `record.path`; a layout and its index page share a path, so the page's serverLoader data was silently overwritten by the layout's (timing-dependent, reproduced). The endpoint now runs ONLY serverLoaders (not isomorphic loaders — those run client-side; running them here double-fired their side effects) and keys by matched-chain index via the new `router.runServerLoaders(path, request)`.
  - **Render gate** — `useLoaderData()` now resolves for server-loader routes (both RouterView render-gate branches already covered by a shared `carriesLoaderData` predicate from the Phase 5 fix; this PR adds the regression locks).

  Also corrects two Phase 4 server-island docstrings that wrongly claimed zero's `startClient` auto-runs `activateServerIslands` (markers self-activate via a `ref`) and that the manual scan's cleanup aborts in-flight fetches (it doesn't — detached swaps are skipped via `isConnected`).

- Updated dependencies [[`0e38332`](https://github.com/pyreon/pyreon/commit/0e3833212e93ec90994edfccb5f2966f9eb0e926), [`4529407`](https://github.com/pyreon/pyreon/commit/4529407d69ba0875568b5c78ff14e2850aa2d690), [`0c1ea1e`](https://github.com/pyreon/pyreon/commit/0c1ea1e89e4228e84367efd5d2cb334808955a25), [`e36bbe5`](https://github.com/pyreon/pyreon/commit/e36bbe52e7f1417a703b4e6ce23281c448d9132f), [`3d90e89`](https://github.com/pyreon/pyreon/commit/3d90e89b824d346a33732af929acdbc7fdd81094), [`65ccdf2`](https://github.com/pyreon/pyreon/commit/65ccdf2ad95a16b676b58948acea51f957e5cf62), [`fc26160`](https://github.com/pyreon/pyreon/commit/fc26160ac2d3afba0adde20f61d94a4199519b59), [`9eb24f6`](https://github.com/pyreon/pyreon/commit/9eb24f604e6e4be62ef4ad3ba33e0c3fa28e9906), [`7f89196`](https://github.com/pyreon/pyreon/commit/7f89196dd3d99f61b0bba032481b9d389fdd8264), [`5a38b69`](https://github.com/pyreon/pyreon/commit/5a38b69a2a2dc9a331c2e6a8a11375eebc532c63)]:
  - @pyreon/core@0.33.0
  - @pyreon/runtime-dom@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/sized-map@0.33.0

## 0.31.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/runtime-dom@0.33.0
  - @pyreon/sized-map@0.33.0

## 0.30.0

### Patch Changes

- Updated dependencies [[`6feb9d4`](https://github.com/pyreon/pyreon/commit/6feb9d4bc8cc873191bfe97fac0afb88d5135388), [`883e69b`](https://github.com/pyreon/pyreon/commit/883e69baed47d77eb79f4dd09b87da96a0b52894), [`4efa71b`](https://github.com/pyreon/pyreon/commit/4efa71b83af84b9310681ed213a331842248bb65), [`960bb0f`](https://github.com/pyreon/pyreon/commit/960bb0f139839de49508d836878b98556b1c7d07), [`b720267`](https://github.com/pyreon/pyreon/commit/b720267f0d9fbe260398c56d49834dc1dd2b09fb)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/runtime-dom@0.33.0
  - @pyreon/sized-map@0.33.0

## 0.29.0

### Patch Changes

- [#1311](https://github.com/pyreon/pyreon/pull/1311) [`6b97bcc`](https://github.com/pyreon/pyreon/commit/6b97bcc78493586d7fb2134c85714a0b990ff1c9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - test(router): add real tests for redirect / not-found / loader serialization

  17 new tests in `branch-coverage-real.test.ts` covering:

  - `redirect()` + `isRedirectError` + `getRedirectInfo` branch matrix
  - `notFound()` throw + message handling
  - `prefetchLoaderData` with/without optional `request` arg
  - `stringifyLoaderData` circular detection, function-stripping, Date toJSON, `</script>` escape

  Branches lifted 88.06% → 88.17%. Incremental real-test coverage on the smaller files (redirect.ts, loader.ts, not-found.ts) while the larger router.ts (51 uncov) and match.ts (27 uncov) remain for follow-up work.

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

- Updated dependencies [[`c54ce0f`](https://github.com/pyreon/pyreon/commit/c54ce0f284dab0335d9b597488ba75c6dea92b43), [`6d3e085`](https://github.com/pyreon/pyreon/commit/6d3e085183ec42883a842967afe22f806f0ea21d), [`d65d779`](https://github.com/pyreon/pyreon/commit/d65d77982284b3ce8ec871fd536069b5cd36f770), [`34872f9`](https://github.com/pyreon/pyreon/commit/34872f9832564fce87e408411d5f416785c6b484), [`c2874df`](https://github.com/pyreon/pyreon/commit/c2874df8f2b07b19aaa7a64c2f9ff2ab6b11d2f0), [`e1139cc`](https://github.com/pyreon/pyreon/commit/e1139cc20447860a2c0e547e6fc0ed67f359e1fe)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/runtime-dom@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/sized-map@0.33.0

## 0.28.1

### Patch Changes

- [#1213](https://github.com/pyreon/pyreon/pull/1213) [`a8452b5`](https://github.com/pyreon/pyreon/commit/a8452b5780a19695fee8031ae625ab7c384fc3d5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - test(router): cover loader.ts toJSON-returning-primitive + NotFoundBoundary re-throw — 94.93 → 95.09

  Two focused test additions close the gap to 95:

  - `loader.ts` line 140: `detectCycle` early-returns when an object's
    `toJSON()` returns a primitive (Date is the canonical case — `toJSON`
    returns a string, so the cycle detector must NOT recurse into a
    non-existent ancestor chain). Added test using Date + a custom
    `toJSON() → number`.
  - `not-found.ts` line 64: `NotFoundBoundary`'s fallback re-throws when
    the caught error isn't a `notFound()` error. Without this branch, a
    real bug inside the boundary would silently render the 404 fallback,
    masking the error. Added test asserting the notFound fallback does
    NOT render when a regular Error is thrown.

  Statements: 94.93% → 95.09% (now passes the 95 threshold).
  Threshold bumped 94 → 95.

- Updated dependencies [[`a448ff4`](https://github.com/pyreon/pyreon/commit/a448ff4fa5b5627622be0fcd7fbe65b5f8c51991)]:
  - @pyreon/sized-map@0.28.1

## 0.28.0

### Patch Changes

- Updated dependencies [[`1aeb610`](https://github.com/pyreon/pyreon/commit/1aeb610a10ce5069b52b2882a6175a16c16483b3)]:
  - @pyreon/sized-map@0.33.0
  - @pyreon/runtime-dom@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0

## 0.27.1

### Patch Changes

- [#1189](https://github.com/pyreon/pyreon/pull/1189) [`0fae784`](https://github.com/pyreon/pyreon/commit/0fae784fdb1bd1ef0c41ffc2f58472c4392ce781) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix: publish `@pyreon/sized-map` and force topological build order

  The 0.27.0 release silently failed: `bun run --filter='./packages/*/*' build`
  runs in parallel, and seven framework packages (`@pyreon/core/router`,
  `@pyreon/core/runtime-dom`, `@pyreon/tools/lint`, `@pyreon/ui-system/elements`,
  `@pyreon/ui-system/rocketstyle`, `@pyreon/ui-system/kinetic`, `@pyreon/zero/zero`)
  listed `@pyreon/sized-map` in `devDependencies` despite IMPORTING it from `src/`.
  Bun's filter respects `dependencies` for topological ordering but not
  `devDependencies`, so a consumer could start building before sized-map's `lib/`
  existed, crashing with `[UNLOADABLE_DEPENDENCY] Could not load .../sized-map/lib/index.js`.

  This also closes a type-leak: `@pyreon/router/lib/types/index.d.ts:3` carries
  `import { SizedMap } from '@pyreon/sized-map'`, which would degrade to `any`
  for npm consumers if sized-map stayed private.

  Changes:

  - `@pyreon/sized-map` is now publishable to npm (was `private: true`). The
    package is a small, focused, bounded-Map primitive (FIFO or LRU-on-read) —
    safe to use directly even though Pyreon's main consumers are framework-internal.
  - All 7 consumers move `@pyreon/sized-map` from `devDependencies` →
    `dependencies`. This forces `bun run --filter` to respect topological order
    and makes the transitive dep explicit for npm consumers.
  - Added to `.changeset/config.json` `fixed[0]` group so it ships with every
    other framework package at the synced version.

  First-publish is bootstrapped manually following the OIDC trusted-publisher
  procedure documented in CLAUDE.md.

- Updated dependencies [[`0fae784`](https://github.com/pyreon/pyreon/commit/0fae784fdb1bd1ef0c41ffc2f58472c4392ce781)]:
  - @pyreon/sized-map@0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/runtime-dom@0.33.0

## 0.26.3

## 0.26.2

## 0.26.1

## 0.26.0

### Patch Changes

- [#1127](https://github.com/pyreon/pyreon/pull/1127) [`06d66e9`](https://github.com/pyreon/pyreon/commit/06d66e976ad3e5da9777e61eb0f09c70f7b2b871) Thanks [@vitbokisch](https://github.com/vitbokisch)! - HMR coordinator no longer leaks into `_loadingSignal` (PR-S8)

  **Pattern C from the deep-audit campaign** (async cleanup race — counter incremented but never decremented). Pre-PR-S8 the dev-only `_hmrSwap` coordinator bumped `_loadingSignal.update((n) => n + 1)` after each successful component-cache swap to force `RouterView`'s `depthEntry` computed to re-emit. But the bump was never paired with a `n - 1` — so `loading() > 0` (i.e. `useTransition()` / `router.loading()`) was STUCK `true` for the page lifetime after the first HMR swap. Visible to users via permanently-active loading indicators or always-pending transition states in dev.

  Originally surfaced in PR [#783](https://github.com/pyreon/pyreon/issues/783)-era HMR work; the asymmetry was hidden because nothing read `loadingSignal` after the bump in test environments. Real-app development sessions saw the bug after the first edit.

  **The fix**: a dedicated `_hmrTick` signal that `depthEntry` subscribes to alongside `_loadingSignal`. HMR bumps `_hmrTick`; navigation bumps `_loadingSignal`; the two never interfere. The category-confusion fix is structural — a navigation-loading signal is for navigation lifecycle (paired start/end counters), repurposing it for "force re-emit a downstream computed" was the original mistake.

  New `RouterInstance._hmrTick?: Signal<number>` field — optional because production builds tree-shake `_hmrSwap` (which is the only writer); `depthEntry` reads via `router._hmrTick?.()` to no-op gracefully in prod. `depthEntry`'s subscription order is `_loadingSignal()` then `_hmrTick?.()` — both subscriptions track for re-emission triggers.

  **Regression coverage**: 3 new tests in `router.loading` describe block in `router.test.ts` (`_hmrSwap does NOT leak into _loadingSignal`, `_hmrTick is a separate counter from _loadingSignal`, `multiple HMR swaps don't accumulate in _loadingSignal`). Bisect-verified: reverting `router.ts` + `components.tsx` + `types.ts` to the pre-fix state fails all 3 with the documented error messages. Restored → 546/546 router tests pass.

  **No public API change**: `_hmrTick` is `@internal` (prefixed with `_`, same convention as `_loadingSignal` / `_hmrSwap`). `RouterView`'s public behavior is unchanged. Production builds are byte-identical except for the new tree-shaken-out HMR coordinator.

- [#1049](https://github.com/pyreon/pyreon/pull/1049) [`9275a00`](https://github.com/pyreon/pyreon/commit/9275a00f72f071edfeb66584516e093b074b6986) Thanks [@vitbokisch](https://github.com/vitbokisch)! - perf(router): reuse the cached FlattenedRoute meta on dynamic-route navigations

  `resolveRoute` pre-computes each route's merged `meta` once at flatten time (cached in the WeakMap-keyed route index). The static and wildcard fast paths already reuse it, but the two dynamic-route paths re-ran `mergeMeta(matched)` — a fresh object allocation plus a per-record `Object.assign` loop — on every navigation to a dynamic route (the most common case: `/posts/:id`, `/user/:id`).

  `MatchResult` now carries the cached `f.meta`, so the dynamic paths reuse it like the others. Behavior-preserving (the value is byte-identical — it's the same merge). Bisect-verified: two navigations to the same dynamic route now return the SAME `meta` object identity (`tests/meta-cache.test.ts`); pre-fix each allocated a fresh `mergeMeta` result. 522/522 existing router tests pass.

- [#1144](https://github.com/pyreon/pyreon/pull/1144) [`434b83f`](https://github.com/pyreon/pyreon/commit/434b83f202060c3a517e67e1ebf4d147369a69c8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(router): freeze `ResolvedRoute.meta` at flatten time to prevent silent cache corruption

  `resolveRoute` caches each `FlattenedRoute`'s pre-merged `meta` object once at flatten time — the static, wildcard, and dynamic fast paths all return the SAME `f.meta` object identity across every navigation that resolves through the same FlattenedRoute. This is the cache that keeps resolution O(1) (and was extended to the dynamic path in the recent `meta-cache` PR — `/posts/42` and `/posts/99` now share one meta object).

  The cache identity is what makes the design fast — but it also turns any user code that does `(props as any).meta.x = …` (the natural shape for "stash some per-navigation state here") into a permanent cache-poisoning bug. The mutation silently survives every future navigation to the same route AND every sibling navigating through the same parent chain. The footgun was not surfaced anywhere — `ResolvedRoute.meta` was typed `RouteMeta` (mutable), and the JSDoc said nothing about identity stability.

  **Fix**:

  - `Object.freeze` the cached meta in `makeFlatEntry` so mutation throws `TypeError` in strict mode (every Pyreon module file is strict).
  - Mirror the freeze in `mergeMeta` (used by the not-found-fallback path) so the contract is consistent regardless of which resolver path produced the meta.
  - Type-side: tighten `ResolvedRoute.meta` to `Readonly<RouteMeta>` + JSDoc documenting the identity-stability and per-navigation-state guidance ("attach to your own store / context — never write through `route.meta`").

  The framework never writes to `route.meta` — only reads — so the freeze is purely a user-mutation safety net. Verified by typechecking every downstream package (`@pyreon/zero`, `@pyreon/server`, `@pyreon/head`, `@pyreon/core`) — none broke under `Readonly<RouteMeta>`.

  Surfaced by an audit of all framework commits since v0.25.1 (sequential 7-agent workflow).

  Bisect-verified-with-restore: 3 new regression specs in `meta-cache.test.ts` (`meta is frozen at flatten time (cache-mutation safety)` describe block) — `Object.isFrozen(meta)`, `mutation throws TypeError`, `cache stays uncorrupted after a thrown mutation attempt`. Reverting just the two `Object.freeze` lines fails all 3 specs, and the last one (`expected 1 to be undefined`) is the load-bearing proof of real cache corruption — a write on `/posts/42`'s meta leaks onto `/posts/99`'s meta. Restoring → 555/555 green.

- [#1128](https://github.com/pyreon/pyreon/pull/1128) [`f54cec8`](https://github.com/pyreon/pyreon/commit/f54cec8f13dffb7fdeceb05021005e342bb856a9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `findNotFoundFallback` now uses a pre-built prefix trie — O(URL segments) per 404 lookup instead of O(routes-in-tree) (PR-S9)

  Pre-fix `findNotFoundFallback` walked the entire route tree on every 404, re-doing path-prefix checks and chain accumulation for every record. With N notFoundComponent-bearing records, lookup was O(N) and constant-factor heavy (string ops per record). Real i18n × dynamic-route apps with deeply-nested layouts can have dozens of such records — and the walk fires per request (and per render in dev).

  **The fix**: a prefix trie of notFoundComponent records, built once at `buildRouteIndex` time and cached via `_indexCache` (WeakMap keyed on `RouteRecord[]` identity, same pattern as `staticMap`). Lookup walks the URL by segment, descending the trie in O(URL segments) and tracking the deepest layout-best and page-best entries along the way.

  **Implementation details:**

  - New `NotFoundTrieNode` with two parallel tracks per node: `layout` (record with children) and `page` (record without children — used only for layout-less synthetic-chrome fallback). Matches the layout/page distinction the old walk made.
  - Specificity tiebreaker preserved: deeper chain wins; ties go to more specific (more-segments) paths. Encoded as `depth` + `specificity` fields on each trie entry.
  - Path-prefix semantics naturally encoded by the trie structure: `/de` lives at depth 1 (segment `"de"`), so URL `/de/unknown` traverses root → "de" → no match, passing through the `/de` entry. URL `/encyclopedia` traverses root → "encyclopedia" → no match, never seeing the `/de` entry. No more substring-prefix false positives, and no more `startsWith` string comparisons per record.
  - `pathPrefixApplies` helper is gone — its responsibility moved to the trie's structural prefix semantics.
  - `findNotFoundFallback` signature gained a `trie: NotFoundTrieNode` parameter (called by `resolveRoute` after `buildRouteIndex`). The function body collapsed from 100+ lines to ~30 lines.

  **Regression coverage**: 6 new tests in `match.test.ts` under `resolveRoute — PR-S9 notFoundComponent trie` describe block, asserting the trie produces byte-identical results to the old walk across the representative shapes (deepest-prefix wins; substring-prefix doesn't false-match; 3-level nesting; empty tree → null; cache reuse). Plus 1 perf assertion (1000 lookups across a 26-record tree stay sub-100ms — generous threshold, the trie typically lands at 5-20µs/call).

  **No public API change**: the trie + caching are internal. `RouteIndex.notFoundTrie` is a new `@internal` field; no consumer references it. Behavioral contract is preserved (all 543 existing router tests pass unchanged).

- [#1145](https://github.com/pyreon/pyreon/pull/1145) [`f8fbb3b`](https://github.com/pyreon/pyreon/commit/f8fbb3b240fd8aab94900b97e9bab6be3d822b28) Thanks [@vitbokisch](https://github.com/vitbokisch)! - perf(router): `captureSplat` fast path — wildcard route resolution +24%

  `captureSplat` (called for `:path*` splat routes) previously allocated
  a fresh `string[]`, pushed `decodeSafe(segment)` per part, and joined
  with `'/'`. The intermediate array + per-segment function-call
  overhead dominated wildcard match cost.

  Now builds the joined string directly via concatenation, with an
  inlined `indexOf('%')` per-segment decode check that skips
  `decodeURIComponent` on clean paths (the overwhelming majority of
  real URLs). No allocation, no per-segment function call, no array
  round-trip.

  Companion lazy `params` initialization in `matchFlattened`: starts as
  `null` and materializes on first param write, so candidates that fail
  on a static-segment mismatch don't pay the `{}` allocation cost.

  Both changes are semantic-equivalent — no public API change, no
  behavior change on URL decoding (existing `%`-encoded tests pass
  plus 4 new regression tests covering clean + encoded splat paths).
  552 → 556 router tests, all green.

  **Measured impact** (microbench, 50-route table, 7 trials × 1s, median):

  | Test                   | Before      | After       | Δ          |
  | ---------------------- | ----------- | ----------- | ---------- |
  | static `/` (fast path) | 27.5M ops/s | 27.4M ops/s | flat       |
  | dynamic 1-param        | 8.00M       | 7.95M       | flat       |
  | dynamic 2-params       | 6.04M       | 5.98M       | flat       |
  | nested 3-deep          | 5.59M       | 5.67M       | flat       |
  | **wildcard 4-segment** | **4.28M**   | **5.29M**   | **+23.6%** |

  Public bench (`scripts/bench/core/router.ts`) confirms the win
  holds across 10 / 50 / 200-route tables (+25-27% on wildcard rows;
  all other rows flat).

  Bisect-verified: reverting `captureSplat` only → wildcard drops back
  to 4.30M baseline; restoring → climbs to 5.29M. Static and dynamic
  rows unaffected in both states.

- Updated dependencies [[`fce4e86`](https://github.com/pyreon/pyreon/commit/fce4e868611a3f5e006f20a031d43435441901e5), [`885d6d9`](https://github.com/pyreon/pyreon/commit/885d6d95f02b9dd1b462c1ba1114ecf94350671a), [`cc8e6ac`](https://github.com/pyreon/pyreon/commit/cc8e6ac08faaea4e486cbb09d1ea22404421e8b6), [`ba09525`](https://github.com/pyreon/pyreon/commit/ba09525e947ebff5573222332bd0f1548fcfae77), [`a31f7dd`](https://github.com/pyreon/pyreon/commit/a31f7dd8f8ddba6864c69bbf53117d36ddd477a3), [`71901d4`](https://github.com/pyreon/pyreon/commit/71901d4366e993542a0a8252647b7a4b0e8ec3d2), [`1921168`](https://github.com/pyreon/pyreon/commit/192116843a0547c777e884f0254ffc51a69bfae1), [`749c2f4`](https://github.com/pyreon/pyreon/commit/749c2f435909740ea43d528ebfc00a2155e64f74), [`b1e3087`](https://github.com/pyreon/pyreon/commit/b1e30879335bbeb29eb8c56520828b841f89db08), [`8333f05`](https://github.com/pyreon/pyreon/commit/8333f05e3a2b3d8b31cd03c3d835a4234a6e689c)]:
  - @pyreon/runtime-dom@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0

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
  - @pyreon/runtime-dom@0.25.0

## 0.24.6

### Patch Changes

- Updated dependencies [[`378efde`](https://github.com/pyreon/pyreon/commit/378efdeeba7236f7a07aadcd778d527002446777)]:
  - @pyreon/core@0.24.6
  - @pyreon/reactivity@0.24.6
  - @pyreon/runtime-dom@0.24.6

## 0.24.5

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.5
  - @pyreon/reactivity@0.24.5
  - @pyreon/runtime-dom@0.24.5

## 0.24.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.4
  - @pyreon/reactivity@0.24.4
  - @pyreon/runtime-dom@0.24.4

## 0.24.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.3
  - @pyreon/reactivity@0.24.3
  - @pyreon/runtime-dom@0.24.3

## 0.24.2

### Patch Changes

- Updated dependencies [[`1c1b135`](https://github.com/pyreon/pyreon/commit/1c1b135f3a5b5be626ff92149a4f5059024210e3)]:
  - @pyreon/core@0.24.2
  - @pyreon/reactivity@0.24.2
  - @pyreon/runtime-dom@0.24.2

## 0.24.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.1
  - @pyreon/reactivity@0.24.1
  - @pyreon/runtime-dom@0.24.1

## 0.24.0

### Patch Changes

- Updated dependencies [[`dfaefb8`](https://github.com/pyreon/pyreon/commit/dfaefb8e9e06eaff9039c001ad7731476b6b5732), [`c41aa1a`](https://github.com/pyreon/pyreon/commit/c41aa1ae90efe00d82c97f623a02ed17acb2427c), [`bc65b82`](https://github.com/pyreon/pyreon/commit/bc65b825505016e4433b50cd1276c9982ef10b8a), [`67e1f37`](https://github.com/pyreon/pyreon/commit/67e1f371a20219481ee9564d2d7421ec2a0b5ddf), [`b8fb31c`](https://github.com/pyreon/pyreon/commit/b8fb31cf1a59578fc33f27d539695d2bc164b2f1), [`f400e85`](https://github.com/pyreon/pyreon/commit/f400e85282a370276d5ae0266ba501c41dce4f3e), [`891ca43`](https://github.com/pyreon/pyreon/commit/891ca4300727119dafd66ceaacd7cb39e68f3b4e), [`d4ec777`](https://github.com/pyreon/pyreon/commit/d4ec777643446ed2c51dedb1e74fbd8dce70bdfd), [`2abb672`](https://github.com/pyreon/pyreon/commit/2abb672d8a8bf7f4940af422bf8bf802aa129cdd), [`84cd28f`](https://github.com/pyreon/pyreon/commit/84cd28feba1899d70696e9a292bb078601558e8f), [`49cc686`](https://github.com/pyreon/pyreon/commit/49cc6869c42e3d3a7ef9e6568f7aade0be23edc0), [`73a6949`](https://github.com/pyreon/pyreon/commit/73a694940a0121508dee84b8a88812753e26fb10)]:
  - @pyreon/core@0.24.0
  - @pyreon/runtime-dom@0.24.0
  - @pyreon/reactivity@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [[`6571df8`](https://github.com/pyreon/pyreon/commit/6571df8209c5dc72619194ffe19359765b1d2d7f), [`af4d5d8`](https://github.com/pyreon/pyreon/commit/af4d5d83fc087d738dbe5084950476566d488d77), [`441b5df`](https://github.com/pyreon/pyreon/commit/441b5dfa64ae52002d3e6612ec68566344ae999d)]:
  - @pyreon/core@0.23.0
  - @pyreon/runtime-dom@0.23.0
  - @pyreon/reactivity@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.22.0
  - @pyreon/reactivity@0.22.0
  - @pyreon/runtime-dom@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.21.0
  - @pyreon/reactivity@0.21.0
  - @pyreon/runtime-dom@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [[`3499594`](https://github.com/pyreon/pyreon/commit/3499594585b7fcb650ac0f80be4bc355f741491b), [`65e61eb`](https://github.com/pyreon/pyreon/commit/65e61eba20741a012b753b4c8c69045f408768b7), [`9aa21a0`](https://github.com/pyreon/pyreon/commit/9aa21a0ae858c9ca88744f4c0d3a730a5d35a29f)]:
  - @pyreon/reactivity@0.20.0
  - @pyreon/runtime-dom@0.20.0
  - @pyreon/core@0.20.0

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

- [#615](https://github.com/pyreon/pyreon/pull/615) [`8e4b607`](https://github.com/pyreon/pyreon/commit/8e4b607b01c6399153bd504f1411f213db987a9a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - docs: reconcile manifest doc-metadata with source

  `useTransition()` / `useMiddlewareData()` manifest entries documented the
  wrong shape (`{ isTransitioning }` / `<T>(): T`); source returns reactive
  accessors (`() => boolean`, `() => Record<string, unknown>`). The mcp
  `get_pattern` summary said "Eight foundational patterns" — actually 16.
  Manifest-only / regenerated-api-reference; no runtime behavior change.

- [#597](https://github.com/pyreon/pyreon/pull/597) [`7150368`](https://github.com/pyreon/pyreon/commit/7150368f85daa783e55f05541d0c45356c13b00d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `RouterLink` viewport-prefetch polish + prefetch discoverability docs.

  **Code — `prefetch="viewport"` refinements** (`components.tsx`):

  - IntersectionObserver now uses `rootMargin: '200px'` (was the implicit 0px). The prefetch starts _before_ the link is fully on screen, so a fast scroll-then-click typically lands on already-resolved loader data instead of waiting. Matches the margin instant.page / Astro use.
  - The prefetch is scheduled via `requestIdleCallback` (falls back to `setTimeout(1)` on Safari < 16.4 / jsdom) instead of running synchronously inside the observer callback — so it never contends with the scroll the user is actively performing. The observer disconnects _synchronously_ on first intersection before the idle slice is queued, so scroll jitter can't double-schedule.

  No behaviour change for `"intent"` (the default), `"hover"`, or `"none"`.

  **Docs — closed a discoverability gap.** `docs/docs/router.md` previously:

  - Omitted `'intent'` from the `prefetch` type entirely
  - Documented the default as `"hover"` — the actual default is `'intent'` (hover **and** keyboard focus)

  So readers couldn't discover that prefetch is on by default, and keyboard / screen-reader users' coverage (focus-triggered prefetch) was invisible. The Prefetch Strategies section is rewritten: corrected type + default, a strategy table, the accessibility rationale for why `"intent"` is the default, and a note on the viewport polish + dedup/eviction bound. CLAUDE.md's router prefetch line updated to match.

  Bisect-verified: reverted the `components.tsx` polish to the pre-fix shape → the new regression test `viewport prefetch uses 200px rootMargin + idle scheduling` failed at `expect(capturedRootMargin).toBe('200px')`; restored → all 3 viewport-prefetch tests pass. Full `@pyreon/router` suite: 519 tests pass (518 prior + 1 new).

- [#617](https://github.com/pyreon/pyreon/pull/617) [`2ee82eb`](https://github.com/pyreon/pyreon/commit/2ee82eb340c515c16aaa7a652ffc5b0c97b59ed6) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix: `staleWhileRevalidate` route loaders now actually work for the realistic navigate-away-and-back case.

  **The bug.** `commitNavigation` pruned `router._loaderData` on every navigation — deleting any entry whose `RouteRecord` was not in the _new_ matched chain. Navigating away from a `staleWhileRevalidate` route therefore deleted its loader data, so on return `runLoaders`' `r.staleWhileRevalidate && router._loaderData.has(r)` gate was always false and the route went through the **blocking** loader path every time. `revalidateSwrLoaders` never ran; SWR was effectively a no-op (it only worked if you re-navigated to the route _without_ navigating away first — never the real-world pattern).

  **The fix.** The prune now skips `staleWhileRevalidate` records (`!to.matched.includes(record) && !record.staleWhileRevalidate`), so their last-loaded data survives navigating away — which is exactly SWR's contract: on return, serve the stale value immediately and revalidate in the background. Retained data is bounded by the number of SWR route _records_ (a developer-declared set; param routes share one record); per-key freshness/LRU is still handled by `_loaderCache`.

  **Behaviour change (bug fix, not breaking).** Returning to a `staleWhileRevalidate` route now resolves the navigation instantly with stale data + a background revalidation, instead of blocking on a fresh fetch — i.e. the documented behaviour, which previously never happened. No app could have depended on SWR being broken.

  **Note (corrects a prior disclosure).** PR [#612](https://github.com/pyreon/pyreon/issues/612) hypothesised the cause was `resolveRoute` returning fresh `RouteRecord` objects (identity-keyed gate never matching). That was **wrong** — record identity is stable. An instrumented probe pinned the true cause to the `commitNavigation` prune (SWR fires for `/data → /data`, but not `/data → / → /data`).

  **Verification.** The pre-existing `staleWhileRevalidate` test was strengthened into a load-bearing regression guard: the revalidation (2nd) loader call now takes a real ~40 ms delay, and the test asserts that immediately after the return navigation the served data is still the STALE `data-v1` (SWR returned without blocking) — pre-fix that navigation went through the blocking path and the data was already `data-v2`. Bisect-verified (revert the prune-skip → the stale-window assertion fails with `expected 'data-v2' to be 'data-v1'`, and the nav even takes ~45 ms because it blocked on the 40 ms loader; restore → 520/520 router tests pass). `bun run coverage` exits 0 with `@pyreon/router` at 91.19 % (the strengthened test now exercises the real `revalidateSwrLoaders` path).

- [#621](https://github.com/pyreon/pyreon/pull/621) [`4f410b6`](https://github.com/pyreon/pyreon/commit/4f410b6403ce1c033f049aa6cd2700f64193b2d1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix: a failing `staleWhileRevalidate` background revalidation no longer fails silently.

  `revalidateSwrLoaders`' rejection handler was an empty `.catch(() => {})`. A persistently-failing background revalidation loader (auth expiry, API outage, a bug thrown in the loader) therefore produced **zero signal** — the developer saw permanently-stale data with nothing pointing at the cause: exactly the silent-failure anti-pattern the project's own `anti-patterns.md` forbids ("Silent plugin/init error swallowing — always log in `__DEV__` and call the user `onError`").

  Now the rejection is surfaced like every other loader error: a `__DEV__` `console.warn` plus the user-supplied `router.onError(err, route)` hook. It does **not** act on the return value — the navigation already settled on stale data and must not be cancelled/redirected, and a failed revalidation must not clobber the still-valid stale value.

  **Context (why this wasn't fixed before).** This `.catch` was unreachable dead code until [#617](https://github.com/pyreon/pyreon/issues/617): the `commitNavigation` prune deleted SWR loader data on every nav-away, so `revalidateSwrLoaders` never ran for the realistic nav-away/back case. An earlier attempt to surface this error (in [#612](https://github.com/pyreon/pyreon/issues/612)) was correctly **reverted** at the time precisely because the path was dead — adding error-surfacing to unreachable code is not hardening, and it couldn't be tested. [#617](https://github.com/pyreon/pyreon/issues/617) made the SWR path live; this PR is the now-worthwhile, now-**testable** completion.

  **Verification.** New load-bearing regression test: `/data → / → /data` with the revalidation (2nd) loader call rejecting after a real 40 ms delay. Asserts the error reaches `onError` exactly once, the navigation is **not** cancelled (`currentRoute().path === '/data'`), and the stale value is retained (not clobbered by the failed revalidation). Bisect-verified: reverting the `.catch` to the empty body fails the test with `expected "vi.fn()" to be called 1 times, but got 0 times`; restored → 521/521 router tests pass. `bun run coverage` exit 0 (`@pyreon/router` 91.21 %); lint + typecheck clean.

- [#596](https://github.com/pyreon/pyreon/pull/596) [`e8e95bc`](https://github.com/pyreon/pyreon/commit/e8e95bc2d6785d397f4b8f85039ce76c2a7f6cea) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Component-level HMR for zero/router apps — editing a route/page component now updates the DOM in place without a manual refresh, preserving module-scope signal state.

  Previously `@pyreon/vite-plugin`'s `injectHmr` emitted a bare `import.meta.hot.accept()` (no callback): Vite re-evaluated the edited module but nothing re-rendered the mounted tree, and the self-accept suppressed Vite's full-reload fallback — so every component/JSX edit produced a silently-stale UI until a manual browser refresh.

  Now the accept callback hands the fresh module to `globalThis.__pyreon_hmr_swap__` (registered by `@pyreon/router` in a dev browser, zero import coupling). The coordinator finds every active matched lazy route whose `_hmrId` matches (emitted by `@pyreon/zero`'s fs-router as `lazy(() => import(…), { hmrId })`), swaps the component, and bumps the loading signal so `RouterView` re-renders only that subtree in place — no page reload, so module-scope signals keep their values via the existing `__pyreon_hmr_registry__`. Edits outside the active route tree (nested components, unrelated routes, signal-only modules) or apps without the coordinator fall back to `import.meta.hot.invalidate()` → an automatic full reload (still no manual refresh). Production is unaffected (dev+browser gated).

- Updated dependencies [[`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a), [`ecd8e52`](https://github.com/pyreon/pyreon/commit/ecd8e526943a1e6b07957ff96f4410fa482baa0d), [`ac1d375`](https://github.com/pyreon/pyreon/commit/ac1d37542b11cd95451a2f0b0a51cc43603d001a), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`c4b6e9a`](https://github.com/pyreon/pyreon/commit/c4b6e9a5850196171c2197fc918163f736708aa8), [`fb40906`](https://github.com/pyreon/pyreon/commit/fb409066e49e44c42f77084a92a68103a4e6c5ef), [`9f03747`](https://github.com/pyreon/pyreon/commit/9f037478763d9f8cd2365feb63dc87fda2545e5d), [`3374150`](https://github.com/pyreon/pyreon/commit/33741500499dfb487d031bbffe77723d74b8f261), [`fa4e37f`](https://github.com/pyreon/pyreon/commit/fa4e37fa620cf0e3f240053bf789b84bd9668838)]:
  - @pyreon/reactivity@0.19.0
  - @pyreon/core@0.19.0
  - @pyreon/runtime-dom@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/runtime-dom@0.18.0
  - @pyreon/core@0.18.0
  - @pyreon/reactivity@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [[`35af0e2`](https://github.com/pyreon/pyreon/commit/35af0e22b670151052e0b1df5006977fca759128), [`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c)]:
  - @pyreon/core@0.17.0
  - @pyreon/runtime-dom@0.17.0
  - @pyreon/reactivity@0.17.0

## 0.16.0

### Minor Changes

- [#554](https://github.com/pyreon/pyreon/pull/554) [`321bac0`](https://github.com/pyreon/pyreon/commit/321bac062b68cabf66357f0362385384a96b5692) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Auto-wrap layout-less `_404.tsx` in default chrome. Apps that ship a page-level `notFoundComponent` (e.g. `_404.tsx` at the route root without a wrapping `_layout.tsx`) used to render the not-found component bare — the documented "no chrome" limitation in CLAUDE.md. `findNotFoundFallback` now runs a two-pass walk: first the original layout-with-`notFoundComponent` pass (precedence preserved), then a fallback for page records with `notFoundComponent`. When the page-record pass fires, the resolver synthesizes a chain `[DefaultChromeLayout, syntheticLeaf]`. `DefaultChromeLayout` is a new built-in component rendering `<main data-pyreon-default-chrome><RouterView /></main>` — semantic-HTML landmark for accessibility / SEO + a `data-pyreon-default-chrome` attribute for users to target via CSS if they want to customize. No prescribed visual design. Graceful degradation: if `components.tsx` isn't imported (unit-test isolation), the setter doesn't fire and the fallback returns null, falling back to the standalone-render path. Bisect-verified across 4 layout-less specs in `match.test.ts`.

- [#555](https://github.com/pyreon/pyreon/pull/555) [`f82584b`](https://github.com/pyreon/pyreon/commit/f82584b3dfb1362d376065354d023647fdbdfa02) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `router.preload(path, request?, options?)` gains an optional third `options` argument with `skipLoaders: true` — bypasses the loader-running step while keeping lazy-component resolution intact (so the synthetic chain still renders cleanly). The SSG plugin's `__renderNotFound` now passes `{ isNotFound: true }` through `renderPath` → `router.preload(probePath, undefined, { skipLoaders: true })`, so auth-touching parent-layout loaders (`fetchUser`, session reads, private APIs) no longer fire during static 404 generation. Closes the documented "Loaders on parent layouts run during 404 render" limitation. Runtime SSR intentionally still runs loaders for 404 — analytics / audit-logging hooks that fire per-request should keep firing even when the request resolves to a not-found. Bisect-verified at the unit layer (4 new specs in `router.preload — PR C — skipLoaders`). Back-compat: the new arg is positional and optional, so 2-arg callers (`router.preload(path, request)`) continue to work unchanged.

### Patch Changes

- Updated dependencies [[`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8)]:
  - @pyreon/core@0.16.0
  - @pyreon/reactivity@0.16.0
  - @pyreon/runtime-dom@0.16.0

## 0.14.0

### Patch Changes

- Updated dependencies [[`c97783a`](https://github.com/pyreon/pyreon/commit/c97783a85b6f7ffc5d25ad16fd280c92808b5ea6), [`12dbf14`](https://github.com/pyreon/pyreon/commit/12dbf14c92ea3e107c89039a269181a500cb60d4)]:
  - @pyreon/runtime-dom@0.14.0
  - @pyreon/core@0.14.0
  - @pyreon/reactivity@0.14.0

## 0.13.0

### Patch Changes

- [#262](https://github.com/pyreon/pyreon/pull/262) [`ec30b4e`](https://github.com/pyreon/pyreon/commit/ec30b4e2188fb493fdde77a77f521abe000beae0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - QA audit fixes (5 HIGH + 2 MEDIUM):

  - **router**: `useBlocker` uses shared ref-counted `beforeunload` listener instead of per-blocker — prevents listener accumulation across multiple blockers
  - **router**: `destroy()` clears `_activeRouter` global ref and releases remaining blocker listeners — prevents stale router surviving in SSR/re-creation
  - **query/useSubscription**: close WebSocket BEFORE nulling handlers — prevents race where queued message fires null handler
  - **query/useSubscription**: respect `intentionalClose` when reactive deps change — user's explicit `close()` no longer gets overridden by signal change
  - **store**: plugin errors now logged with `__DEV__` console.warn instead of silently swallowed
  - **storage/IndexedDB**: initialization errors (corrupted DB, quota exceeded) now call `onError` callback and log in dev mode instead of silently falling back to default

- [#258](https://github.com/pyreon/pyreon/pull/258) [`a05c4ba`](https://github.com/pyreon/pyreon/commit/a05c4bab713f5168acd56eb233520102735bd80a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Performance rearchitecture: reactive theme/mode/dimension switching via computed (not effect).

  - **styler**: `DynamicStyled` uses one `computed()` per component (not `effect()`) to track theme + mode + dimension signals. The resolve itself runs `runUntracked()` to prevent exponential cascade. String-equality memoization eliminates redundant DOM updates. Per-definition WeakMap cache (Tier 2) skips resolve entirely for repeated identical inputs.
  - **styler**: `ThemeContext` is a `createReactiveContext<Theme>`. `useThemeAccessor()` returns the raw accessor for tracking inside computeds.
  - **ui-core**: `PyreonUI` nested `inversed` prop inherits parent mode reactively — inner section automatically flips when outer mode changes.
  - **unistyle**: `styles()` uses key→index lookup (Tier 1) — 257 descriptor iterations reduced to ~10-20 per call.
  - **rocketstyle**: passes `$rocketstyle`/`$rocketstate` as function accessors tracked by the styled computed.
  - **router**: `RouterLink` guards non-string `props.to` in activeClass (fixes SSR crash with `styled(RouterLink)`).
  - **core**: `popContext()` is a silent no-op on empty stack.

  Expected impact: 2+ GB memory → < 100 MB, 20s render → < 2s for 150-component pages.

- Updated dependencies [[`a05c4ba`](https://github.com/pyreon/pyreon/commit/a05c4bab713f5168acd56eb233520102735bd80a)]:
  - @pyreon/core@0.13.0
  - @pyreon/reactivity@0.13.0
  - @pyreon/runtime-dom@0.13.0

## 0.12.15

### Patch Changes

- [#256](https://github.com/pyreon/pyreon/pull/256) [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(router): don't clobber nav `_abortController` from prefetch/preload; bound scroll-position cache

  Two router issues found during QA:

  1. **Prefetch/preload destroyed navigation abort capability.**
     `prefetchLoaderData` (called from `<Link>` hover) and `router.preload()`
     both assigned `router._abortController = new AbortController()`,
     overwriting the controller owned by an in-flight navigation. The
     navigation's `signal` became orphaned — subsequent calls to
     `router._abortController?.abort()` cancelled the prefetch instead of
     the actual navigation. Fixed: both operations now use a LOCAL
     `AbortController`; only real navigations touch the shared field.

  2. **`ScrollManager._positions` was unbounded.** Saved scroll position
     per distinct URL path, so SPAs with parametrised routes
     (`/user/:id`) or query-string variations accumulated entries
     forever. Added a 100-entry LRU cap — covers typical back-navigation
     depth; beyond that, scroll restoration is a nice-to-have not a
     correctness requirement.

- Updated dependencies [[`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa), [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa), [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa)]:
  - @pyreon/runtime-dom@0.12.15
  - @pyreon/core@0.12.15
  - @pyreon/reactivity@0.12.15

## 0.12.14

### Patch Changes

- [#242](https://github.com/pyreon/pyreon/pull/242) [`95e7e00`](https://github.com/pyreon/pyreon/commit/95e7e00bd3e3b3926bd8348cf91f88494605ccc6) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Router anti-pattern cleanup + lint rule precision

  `@pyreon/router`:

  - `ScrollManager.save()` / `_applyResult()`: added `typeof window === 'undefined'`
    early-return guards so the SSR-safety contract is explicit at the method
    entry instead of relying on callers to pre-check.
  - `useBlocker`: replaced bare `if (beforeUnloadHandler)` guards with
    `if (_isBrowser && beforeUnloadHandler)` — same runtime behaviour (the
    handler is non-null only when `_isBrowser` is true), but links the check
    back to the typeof-derived const so `no-window-in-ssr` can prove the
    body is browser-safe.
  - `destroy()`: same pattern for `_popstateHandler` / `_hashchangeHandler`.
  - Error prefix normalised: `[pyreon-router]` → `[Pyreon]` (matches the
    `no-error-without-prefix` rule + the rest of the framework).

  `@pyreon/lint` — `no-window-in-ssr`:

  - Parameter-shadowing: identifiers like `location`/`history`/`navigator`
    that are FUNCTION PARAMETERS (or destructured parameter patterns) no
    longer false-positive as browser-global references. E.g. `router.push`
    takes a `location` parameter — inside its body, every `location`
    references the parameter, not `window.location`.
  - Typeof-derived `&&` chains in const bindings: `const useVT = _isBrowser
&& meta && typeof document.startViewTransition === 'function'` now
    registers `useVT` as typeof-bound, so `if (useVT) { document.X }` is
    recognised as guarded.

  `@pyreon/lint` — `no-imperative-navigate-in-render`:

  - Full rewrite of the safe-context detection. Previously only recognised
    `onMount`/`effect`/`onUnmount` call callbacks as safe — this false-fired
    on `router.push()` inside any locally-declared event handler
    (`const handleClick = (e) => router.push(...)`). Now tracks a
    `nestedFnDepth` counter across ALL nested functions inside a component
    body, so any nested ArrowFn/FunctionExpression is treated as deferred
    execution. Fires only on direct-in-render-body imperative navigation —
    which is the actual bug the rule is designed to catch.

  `@pyreon/lint` — `no-dom-in-setup`:

  - Extended safe-context set: now includes `onUnmount`, `onCleanup`,
    `renderEffect`, and `requestAnimationFrame`. `document.querySelector`
    inside a `requestAnimationFrame` callback is guaranteed to run in a
    browser frame post-setup, so it doesn't warrant the setup-phase warning.

  9 new bisect-verified regression tests for the three rule precision
  improvements.

- Updated dependencies []:
  - @pyreon/core@0.12.14
  - @pyreon/reactivity@0.12.14
  - @pyreon/runtime-dom@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.13
  - @pyreon/reactivity@0.12.13
  - @pyreon/runtime-dom@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.12
  - @pyreon/reactivity@0.12.12
  - @pyreon/runtime-dom@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.11
  - @pyreon/reactivity@0.12.11
  - @pyreon/runtime-dom@0.12.11

## 0.7.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.2
  - @pyreon/core@0.7.2
  - @pyreon/runtime-dom@0.7.2

## 0.7.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.1
  - @pyreon/core@0.7.1
  - @pyreon/runtime-dom@0.7.1

## 0.7.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.0
  - @pyreon/core@0.7.0
  - @pyreon/runtime-dom@0.7.0

## 0.6.0

### Patch Changes

- feat(core): add `provide()` helper, widen `ComponentFn` return to `VNodeChild`, add `ExtractProps` and `HigherOrderComponent` utility types

  Migrate router, head, preact-compat to use `provide()` instead of manual `pushContext`/`popContext`

- Updated dependencies []:
  - @pyreon/core@0.6.0
  - @pyreon/runtime-dom@0.6.0
  - @pyreon/reactivity@0.6.0

## 0.5.7

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.5.7
  - @pyreon/core@0.5.7
  - @pyreon/runtime-dom@0.5.7

## 0.5.6

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.6
  - @pyreon/runtime-dom@0.5.6
  - @pyreon/reactivity@0.5.6

## 0.5.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.4
  - @pyreon/reactivity@0.5.4
  - @pyreon/runtime-dom@0.5.4

## 0.5.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.3
  - @pyreon/reactivity@0.5.3
  - @pyreon/runtime-dom@0.5.3

## 0.5.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.2
  - @pyreon/reactivity@0.5.2
  - @pyreon/runtime-dom@0.5.2

## 0.5.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.1
  - @pyreon/reactivity@0.5.1
  - @pyreon/runtime-dom@0.5.1

## 0.5.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.0
  - @pyreon/runtime-dom@0.5.0
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
  - @pyreon/reactivity@0.4.0
  - @pyreon/core@0.4.0
  - @pyreon/runtime-dom@0.4.0

## 0.3.1

### Patch Changes

- Router performance: flattened route matching with first-segment dispatch index (39% faster at 200 routes). Core type fixes: export `ReadonlySignal<T>` from reactivity, widen `h()` component overloads to support optional children and generic components, add minimal `process` type declaration so consumers don't need `@types/node`.

- Updated dependencies []:
  - @pyreon/reactivity@0.3.1
  - @pyreon/core@0.3.1
  - @pyreon/runtime-dom@0.3.1

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

## 0.1.2

### Patch Changes

- Improve compat package types (eliminate unnecessary casts), add lint/typecheck CI for all workspaces, split example apps into individual component files.

- Updated dependencies []:
  - @pyreon/reactivity@0.1.2
  - @pyreon/core@0.1.2
  - @pyreon/runtime-dom@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.1.1
  - @pyreon/core@0.1.1
  - @pyreon/runtime-dom@0.1.1
