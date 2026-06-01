# @pyreon/zero

## 0.26.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/head@0.26.2
  - @pyreon/router@0.26.2
  - @pyreon/runtime-server@0.26.2
  - @pyreon/server@0.26.2
  - @pyreon/vite-plugin@0.26.2
  - @pyreon/meta@0.26.2

## 0.26.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/head@0.26.1
  - @pyreon/router@0.26.1
  - @pyreon/runtime-server@0.26.1
  - @pyreon/server@0.26.1
  - @pyreon/vite-plugin@0.26.1
  - @pyreon/meta@0.26.1

## 0.26.0

### Minor Changes

- [#1115](https://github.com/pyreon/pyreon/pull/1115) [`c2d0f34`](https://github.com/pyreon/pyreon/commit/c2d0f34578624f7284842f4f8558e613e969053d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(zero): ISR cross-user header leak — extend isCacheable + add responseFilter (PR 4)

  **Bug**: ISR's `isCacheable` checked ONLY status code + presence of `Set-Cookie`. Responses carrying `Cache-Control: private | no-store | no-cache`, `Authorization`, or `Vary: Cookie | Authorization` were happily cached and replayed to OTHER users via the default `cacheKey: url.pathname`. Cross-user data leak — an auth-gated page rendered for user Alice could be served from cache to user Bob.

  **Why security-shaped**: the default `cacheKey: url.pathname` makes this trivially exploitable. RFC 7234 explicitly lists these directives as "do not share across users"; honoring them is table-stakes for any HTTP cache.

  **Fixes**:

  1. **Extended `isCacheable` checks** (defense in depth at both cache-miss + revalidate sites):
     - `Cache-Control: private | no-store | no-cache` → refuse
     - `Authorization` response header → refuse
     - `Vary: Cookie | Authorization | *` without explicit `cacheKey` → refuse (with dev warning)
     - `Vary: Cookie | Authorization` WITH explicit `cacheKey` → ALLOW (user opted into per-cookie keying)
     - Case-insensitive directive matching throughout
  2. **New `responseFilter?: (res: Response) => Response | null` config** — final-say override. Returns `null` to bypass cache, or a NEW Response to cache instead. Runs BEFORE body consumption so re-construction with `res.body` works.

  **Bisect-verified**: 12 new regression tests in `isr.test.ts`; 9 fail with reverted source (`expected 'MISS' to be 'BYPASS'` across all the Cache-Control / Vary / Authorization disqualifiers). Restored → 1017/1018 zero tests pass.

  The remaining items from the audit's ISR cluster (auto-wire `mode: 'isr'`, AbortController for revalidation timeout, get-then-delete race, null-revalidate forever-stale) are bundled into **PR 5** (week-2 SSR correctness sprint) per the campaign plan.

- [#1112](https://github.com/pyreon/pyreon/pull/1112) [`537f0a5`](https://github.com/pyreon/pyreon/commit/537f0a5e326a6cc37dd95dd978b474c9a51867e6) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(zero)!: drop internal RouterProvider from `createApp` — fixes production SSR loader-data drop + cross-request data leak (S1)

  **Bug (production SSR only)**: `createServer` calls `createApp({ routes })` ONCE at module init. The returned `App` wrapped itself in `<RouterProvider router={buildTimeRouter}>`. `createHandler` then wraps a SECOND time with the per-request router. `useContext` picks the innermost frame → every `RouterView` / `useLoaderData()` consumer reads the **build-time** router, not the per-request one.

  **Symptoms**:

  - SSR HTML ships with empty loader sections (loaders write to per-request router; readers see build-time router)
  - Concurrent requests cross-contaminate via the shared build-time `_loaderData` Map (request-specific data crosses users)

  **Why undetected**: dev `renderSsr` calls `createApp` per-request (masks the bug). SSG `renderPath` calls per-path (masks). Tests passed bare components to `createHandler` (bypassed `createApp`). Only production `createServer` exposed the bug.

  **Fix**: `App` is now router-agnostic. The per-request `RouterProvider` lives at every call site:

  - `createHandler` (production SSR) — unchanged
  - `renderSsr` (dev) — now wraps with `routerInst`
  - `renderPath` (SSG) — now wraps with the per-path router
  - `startClient` (browser) — now wraps with the client router

  **Breaking change**: `createApp` still returns `{ App, router }` for back-compat, but consumers must no longer rely on `App`'s internal RouterProvider — every call site must wrap with `<RouterProvider router={...}>` explicitly. The four shipped call sites are already updated.

  Bisect-verified by 2 new regression tests in `app.test.ts`: (1) `loader data reaches RouterView in production SSR via createApp→createHandler`; (2) `concurrent requests with different loaders do NOT cross-contaminate`. Both fail with the source reverted (`expected '...' to contain 'value:loader-output'` / `'who:alice'`).

  125/125 e2e tests pass (main + ssg-i18n + ssg-subpath). 1007/1008 zero unit tests pass (1 pre-existing skip). Typecheck + lint clean.

- [#1113](https://github.com/pyreon/pyreon/pull/1113) [`5ee742a`](https://github.com/pyreon/pyreon/commit/5ee742aa8a83e66664220494dc0e20a3bb16d8b7) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(zero)!: server actions security baseline — full UUID + CSRF Origin check + auto-wire (S2)

  **Bug (security-critical)**: `defineAction()` IDs were `crypto.randomUUID().slice(0, 8)` (32 bits → birthday collision at ~65k actions). The `/_zero/actions/<id>` endpoint accepted any POST with **no Origin / Referer check, no CSRF token, no SameSite enforcement**. Action IDs are bundled in client JS (trivially discoverable via DevTools). **Any malicious origin a logged-in Pyreon user visits could POST to any defined action** — classic CSRF.

  Compounded by: `createActionMiddleware` was NEVER auto-wired by `createServer()`. The endpoint just 404'd for users who didn't manually wire — but those who DID wire it got insecure-by-default.

  **Fixes (in this PR)**:

  1. **Full 128-bit UUID** for action IDs ([actions.ts:70](packages/zero/zero/src/actions.ts#L70)). Matches the registry's UUID space — was just truncated.
  2. **Same-origin Origin/Referer check** by default. Cross-origin POSTs are rejected with HTTP 403. Opt in to specific cross-origin callers via `corsOrigins: ['https://admin.example.com']`. Algorithm:
     - No Origin/Referer → ALLOW (server-to-server, curl, integration tests — the auth layer's job to gate on user identity).
     - Origin/Referer present → require same-origin OR an entry in `corsOrigins`.
     - Otherwise → 403.
  3. **Auto-wire** `createActionMiddleware()` in `createServer()` when any `defineAction()` has registered (detected via the module-level registry size). Sits between API routes and route middleware. Pass `actions: false` to opt out, or `actions: { corsOrigins: [...] }` to configure.

  **Breaking change**: Cross-origin POSTs to action endpoints now require explicit `corsOrigins` opt-in. Same-origin POSTs (the common case) work unchanged. Matches Astro Actions / SvelteKit csrf / Next Server Actions defaults.

  **Out of scope for this PR** (separate follow-up):

  - Per-session CSRF token + double-submit cookie pattern
  - Encrypted action IDs tied to session (Next.js-style)
  - Progressive-enhancement `<Form>` component

  Bisect-verified: 4 of 8 new tests fail with source reverted (`expected 'action_6faddc85' to match /full-UUID-shape/`; `expected 200 to be 403` on 3 cross-origin REJECT tests). Restored → 1012/1013 zero tests pass (1 pre-existing skip + 8 new). Typecheck + lint clean. 115 e2e green.

### Patch Changes

- [#989](https://github.com/pyreon/pyreon/pull/989) [`cbef2e7`](https://github.com/pyreon/pyreon/commit/cbef2e7b016da3ac515099f9f403807baeeb4589) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Chat audit (T4.3) — fix W24 (dev 404 handler shadowed user `/api/*`
  middleware) + document W25 (passing `computed<T>` as a child prop).

  **W24**: `@pyreon/zero`'s dev 404 handler at
  `packages/zero/zero/src/vite-plugin.ts:364` caught BOTH HTML requests
  AND wildcard-Accept requests (`*/*`) for any unmatched path, including
  `/api/*`. When a user plugin registered its own dev API middleware
  (via `configureServer`) AFTER zero in the plugin array — the typical
  order — Zero's 404 handler ran first (Vite registers middlewares in
  plugin-array order) and shadowed the user's handler for requests sent
  with `Accept: */*` (curl, `fetch()` default). The user's middleware
  NEVER ran for those paths.

  Fix: the 404 handler now skips paths starting with `/api/`, so user
  middleware registered after Zero is no longer shadowed regardless of
  plugin order. The existing dev API-route dispatcher at line ~277
  already handles fs-router `src/routes/api/*` paths; anything else
  under `/api/*` falls through to user middleware OR to Vite's terminal
  404 — both correct outcomes. `enforce: 'pre'` doesn't help because
  `configureServer` hooks fire in plugin-array order independent of
  `enforce`.

  Bisect-verified: revert the path-skip → `examples/chat`'s
  `/api/history/general` returns 404 (smoke fails with `messages
visible: 0`); restored → 200 + history loads + 60 messages render.
  The chat audit example is the canonical test case (no prior audit
  hit this — only the streaming-primitive surface area surfaces it).

  **W25** is doc-only — when passing a `computed<T>()` declaration to
  a child as a JSX prop, the compiler auto-calls the variable
  (yielding the value, not an accessor), so the child's type signature
  should be the value type `T` not `() => T`. Documented in
  `examples/chat/WALLS.md` with the canonical call-site shape
  (`<Comp prop={visible()} />`).

- [#927](https://github.com/pyreon/pyreon/pull/927) [`5602146`](https://github.com/pyreon/pyreon/commit/5602146b7ccac45d3d9ee0b752b00a5f702821e9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - T4.2 — User-walls audit + three DX fixes shipped together.

  ## What

  Built a Hacker News clone from scratch using `create-pyreon-app` to find real
  DX friction. Documented 8 walls in `examples/hn-clone/WALLS.md` + fixed the
  three highest-leverage ones in source:

  ### W4 (BLOCKER) — `_error.tsx` template now exposes the actual error in DEV

  The scaffold's default error boundary route used to render a generic "Something
  went wrong" page with **zero information** about what threw — no message in
  the rendered output, no `console.error`, no stack trace. A misuse of any
  framework API surfaced as a silent 500 page, undebuggable without bisecting.

  **Fix** in `packages/zero/create-zero/templates/app/src/routes/_error.tsx`:

  - Now accepts `error?: unknown` prop (the framework already passes it).
  - Calls `console.error("[Pyreon] route error boundary caught:", err)` so the
    browser devtools / `page.on('pageerror')` listeners see the error.
  - In `import.meta.env.DEV` mode, renders the error message + full stack trace
    inline in a styled `<details>` block. Production builds keep the generic
    message (no internal leakage) but still log to console.

  This is the single biggest DX improvement in this PR. Cost me ~15 minutes
  debugging a 3-character typo; would cost a non-fluent user hours.

  ### W1 (HIGH) — Scaffold no longer leaves dangling `app.store.X` refs

  When scaffolding with `--features` excluding `store`, the layout template's
  `useAppStore` import + `const app = useAppStore()` line were stripped but
  the next two lines were left behind:

  ```ts
  // scaffold output — broken
  const sidebarOpen = app.store.sidebarOpen; // app is undefined
  const toggleSidebar = app.store.toggleSidebar; // app is undefined
  ```

  These threw `ReferenceError` at render time, the error was caught by the
  framework's (then-silent) error boundary, and the dev server returned an
  empty body. Combined with W4, this was completely undebuggable.

  **Fix** in `packages/zero/create-zero/src/scaffold.ts`:

  - Added two regexes that strip `const X = useAppStore()` AND
    `const X = app.store.X` lines from the body.
  - Fixed the existing import-strip regex which only matched single-quoted
    paths (template uses double quotes).

  ### W6 — Internal `use-intersection-observer` no longer warns about itself

  The framework's own `useIntersectionObserver` helper (used by
  `<Link prefetch="viewport">`) registered `onUnmount(...)` INSIDE the
  `onMount(...)` body, which trips the "onUnmount() called outside component
  setup" dev warning. This warning fired on every page load — eroding the
  warning system's signal-to-noise: real bugs hid behind the constant noise.

  **Fix** in `packages/zero/zero/src/utils/use-intersection-observer.ts`:

  - Switched from `onUnmount(cleanup)` inside `onMount` to `return cleanup`
    from `onMount`. Pyreon supports this cleanup-return shape and it stays
    synchronous w.r.t. the setup phase, so no warning.

  ## What also landed

  `examples/hn-clone/` — a real HN clone built from scratch using the scaffold:

  - 7 routes (top / new / ask / show / jobs / item / user) with the public
    HNPWA API
  - 3 shared components (`StoryRow`, `FeedPage`, `CommentTree`)
  - HN-style CSS, all server-side prerendered for the 5 static routes
  - `WALLS.md` — 412-line live-narration of every friction point hit while
    building, with severity + fix suggestions for the 8 walls and 5
    architectural recommendations for the open-work plan

  ## Walls deliberately NOT fixed in this PR

  5 of 8 walls remain — flagged for follow-up:

  - **W2** (HIGH): `mode: 'ssg'` in dev produces client-only rendering with
    no warning. The dev startup banner labels routes "SSR" misleadingly.
  - **W3** (LOW): file deletions under `src/routes/` need dev restart.
  - **W5** (MEDIUM): `useTypedSearchParams` returns `[get, set]` tuple in a
    signal-first framework — inconsistent with other `use*` accessors.
  - **W7** (MEDIUM): SSG build output duplicates `dist/client` into
    `dist/output/client` + prints confusing "Skipping SSG" log after success.
  - **W8** (HIGH, architectural): SSG + `useQuery` = shell-only prerender.
    Content sites silently ship "Loading…" to crawlers. Needs either doctor
    check, scaffold update, or doc page on data-layer choice.

  The three fixes in this PR are the immediately-fixable, high-leverage,
  low-blast-radius ones. The other 5 need design / scope decisions before
  implementation.

  ## Tests

  - `@pyreon/zero` — 998 tests pass, 1 skipped (no regressions)
  - `examples/hn-clone` — all 7 routes render correctly in real Chromium
  - W4 verified: `/throw` test route surfaces "Intentional test error..."
    message + stack in the rendered body + `console.error`
  - W1 verified: scaffold output of `create-pyreon-app w1-test-2 --features
query` has zero `app.store.` or `useAppStore` references
  - W6 verified: `page.on('console')` warning capture returns empty on every
    page load (previously: one warning per page)

- [#1147](https://github.com/pyreon/pyreon/pull/1147) [`95663b9`](https://github.com/pyreon/pyreon/commit/95663b943be3f02f61fce7b7532df8c2efa153b4) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(zero): remove racy `localeSignal.set(locale)` from the i18nRouting middleware

  PR-S7's first cut closed the IN-ALS race via `_runInLocaleStore` but left a "best effort" `localeSignal.set(locale)` in the dev middleware so DEFERRED readers (effects scheduled inside a request but resolving after the ALS unwinds, post-render hooks, island serialization that outlives `runWithRequestContext`) could fall back to the module signal.

  That fallback was racy by construction: two concurrent SSR requests with different locales raced on the same module-global, and "last writer wins" for any deferred reader regardless of which request scheduled the deferred work. A request rendering /en/posts could see `useLocale() === 'de'` from an effect scheduled mid-render that resolved after a concurrent /de/posts request's middleware fired.

  The author of PR-S7 acknowledged it in the comment ("Pre-fix this module write WAS the bug") but kept the write for back-compat with non-ALS callers. Identified in the post v0.25.1 framework audit as the remaining surviving race.

  **Fix**: drop the module-signal write entirely. The ALS store is the authoritative SSR source. Deferred fallback callers now see the signal's CSR-set value (or initial default) — predictable + race-free, vs the previous "fresh but cross-request-contaminated". The client-side `setLocale()` write still updates the signal (single-threaded, no race on the client). `useLocale()` semantics unchanged: ALS-active → per-request value (race-free); ALS-inactive → module signal (CSR or stale default).

  No public API surface change. The middleware's behavior change is internal-only — any deferred SSR reader that previously observed a contaminated locale now observes the signal's last CSR-set value (typically `'en'` on a server with no client-side `setLocale()` calls). User code that intentionally read `useLocale()` from a deferred SSR context was already broken under concurrency; the fix surfaces that explicitly instead of silently corrupting it.

  Bisect-verified-with-restore: 3 new regression specs in `packages/zero/zero/src/tests/i18n-routing.test.ts` under "Audit [#1](https://github.com/pyreon/pyreon/issues/1): i18nRouting middleware does NOT write to module localeSignal":

  1. Single request leaves `localeSignal` at the prior sentinel value.
  2. Concurrent requests with different locales leave `localeSignal` at the prior sentinel.
  3. Concurrent requests STILL get correct per-request locale via the ALS store (regression — fix must not break PR-S7).

  Restoring the `localeSignal.set(locale)` line fails all 3 specs (the third with `expected 'cs' to be 'xx'` — proving cross-request contamination of the module signal). Removing the line → 76/76 i18n-routing specs green + 1069/1069 zero suite green.

- [#982](https://github.com/pyreon/pyreon/pull/982) [`cc8e6ac`](https://github.com/pyreon/pyreon/commit/cc8e6ac08faaea4e486cbb09d1ea22404421e8b6) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Kanban audit (T4.2) — close all 6 walls (W18-W23).

  **W23 — P0 reactivity bug fix** (`@pyreon/reactivity`). `runUntracked`
  now suspends `_innerEffectCollector` in lock-step with `activeEffect`.
  Child component effects created inside `mountFor`'s `runUntracked` wrap
  (PR [#490](https://github.com/pyreon/pyreon/issues/490)) were auto-registered as inner effects of the For's outer
  effect, then silently disposed on the For's next re-run — breaking
  every effect-derived subscription in the child subtree on the first
  source-signal mutation. Was a SHOWSTOPPER for any Trello/Notion/Linear/
  spreadsheet-shaped app. Bisect-verified.

  **W21 — incidentally fixed by W23 patch.** For-with-computed-indirection
  shapes (nested inside outer For-with-mutating-source) now propagate
  correctly.

  **W22 — documented** (`@pyreon/core`). `For` JSDoc + `ForProps.children`
  JSDoc now carry the canonical fix pattern (pass ID, child reads its own
  data from store).

  **W18 — cross-list groupId** (`@pyreon/dnd`). `useSortable` accepts an
  optional `groupId` — two instances with the same `groupId` share a drop
  universe via `onCrossListDrop(item)` (source removes) +
  `onCrossListReceive(item, index)` (destination inserts). No `groupId`
  keeps per-instance isolation (backward compat).

  **W19 — auto-inject entry-client** (`@pyreon/zero`). `transformIndexHtml`
  hook injects `<script type="module" src="${entryClient}">` before
  `<!--pyreon-scripts-->` automatically. Configurable via
  `zero({ entryClient: '/src/main.ts' })` or `entryClient: false` to opt
  out. Default `/src/entry-client.ts`.

  **W20 — already covered** by existing `pyreon/no-map-in-jsx` rule —
  test extended for the reactive-accessor shape `{() => items().map(...)}`.

  Closes the kanban example end-to-end. Full add → delete → filter →
  multi-mutation → reload sequence is green in real-Chromium e2e.

- [#1114](https://github.com/pyreon/pyreon/pull/1114) [`f911be8`](https://github.com/pyreon/pyreon/commit/f911be8f4ac99f3bcecb35d93d765b8fb1ae4ca0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(zero): parseCookies preserves values containing `=` (JWTs / base64 sessions) — S3

  **Bug**: `parseCookies` (used by the i18n middleware to read the locale cookie) did `pair.trim().split('=')` then destructured `[key, value]` — taking only the first two elements of an N-element split. Any cookie value containing `=` (every base64-encoded session ID's `=` padding, every JWT, any URL-encoded `=` in value position) got silently truncated.

  **Today's impact is bounded**: only the locale cookie is currently read via this helper. But the shared parser is a latent footgun for any future auth / session cookie consumer; the same parsing function copy-pasted into user middleware would silently corrupt every JWT it touched.

  **Fix**: split on the FIRST `=` only via `indexOf('=') + slice`. Matches the working pattern in `packages/core/router/src/match.ts:51-59` (`parseQuery`). Exposes the helper as `_parseCookiesForTesting` (internal, not part of public API) so the regression suite can exercise the parser directly.

  Audited all `split('=')` destructure patterns in `packages/zero/zero/src/`, `packages/core/server/src/`, `packages/core/router/src/` — only the just-fixed instance exists. A `pyreon/no-truncating-split-destructure` lint rule to prevent recurrence is tracked as a follow-up in the [audit-fix campaign plan](.claude/plans/jaunty-herding-kazoo.md) (PR 3 has the rule on its docket; deferred to keep this PR scope tight).

  8 new regression tests in `i18n-routing.test.ts` covering: base64 padding, multi-`=` values, JWT-shaped tokens, multi-cookie boundary safety, URL-encoded value decode, empty / malformed entries, missing header. All 8 fail with source reverted; restored → 1013/1014 zero tests pass (1 pre-existing skip).

- [#960](https://github.com/pyreon/pyreon/pull/960) [`8333f05`](https://github.com/pyreon/pyreon/commit/8333f05e3a2b3d8b31cd03c3d835a4234a6e689c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix 4 more framework DX walls surfaced by deep-audit of the HN-clone ([#942](https://github.com/pyreon/pyreon/issues/942)) — all bisect-verified at the unit level.

  **W13 — `@pyreon/zero/client` strips URL query string on SPA cold-start.**
  `startClient` called `router.replace(router.currentRoute().path)` to kick
  off the loader pipeline, but `currentRoute().path` is the pathname ONLY
  (query + hash stripped by `resolveRoute`). The `router.replace(pathname)`
  then wrote the bare URL via `history.replaceState`, silently dropping any
  query params present on the initial-load URL. Direct-link sharing of
  `/search?q=react` was broken on cold-start — `useUrlState('q')` /
  `useTypedSearchParams` read empty `window.location.search` and fell back
  to defaults. Fix: pass the FULL URL (pathname + search + hash) instead.

  **W14 — `@pyreon/hotkeys` sequential combos (`'g t'`) didn't work.**
  CLAUDE.md documented vim/Gmail-style `g t` / `g n` combos but the
  implementation only split on `+`. So `'g t'` parsed as a single key
  literal `'g t'` (with space) that could never match a keystroke. Fix:
  `registerHotkey` now splits the shortcut on whitespace into a sequence
  of sub-combos. Each non-first combo is recorded as `entry.sequence[]`
  and matched against subsequent keystrokes within a 1-second timeout
  window. Three-step sequences (`a b c`) and combos with modifiers
  (`ctrl+k p`) both work. 9 new specs cover the contract.

  **W16 — `@pyreon/runtime-dom`'s `<Transition>` crashed with null ref**
  when wrapped inside `<Portal>`/`<Show>`/other reactive wrappers. The
  `appear: true` path queued `applyEnter(ref.current as HTMLElement)`
  in a microtask, but the child commit could be one or more microtasks
  behind. `applyEnter(null)` → `el.classList.remove(...)` → "Cannot read
  properties of null (reading 'classList')". Fix: `safeApplyEnter`
  retries up to 16 microtasks for the ref to populate before silently
  giving up. Bisect-verified spec.

  **W17 — `@pyreon/feature`'s `feature.useForm()` didn't invalidate the
  list query after submit.** `useForm`'s `onSubmit` called `http.create()`
  / `http.update()` DIRECTLY, bypassing the `useCreate()` / `useUpdate()`
  mutation pipeline that wires `client.invalidateQueries` in `onSuccess`.
  So after the form submitted, the list view didn't refetch and the UI
  silently failed to show the new/updated item until manual reload. Fix:
  `useForm`'s onSubmit now invalidates `queryKeyBase` (and the per-id key
  in edit mode), matching the behaviour of `useCreate()` / `useUpdate()`.
  96 feature tests still pass.

  Discovered by deep-auditing every interactive flow in the HN-clone
  (`[#942](https://github.com/pyreon/pyreon/issues/942)`) with Playwright. Each is bisect-verified — revert the source
  fix → the new test fails; restore → it passes.

- [#1101](https://github.com/pyreon/pyreon/pull/1101) [`52c1298`](https://github.com/pyreon/pyreon/commit/52c1298e0a2be04bd62b35f43416ecb9bb16b451) Thanks [@vitbokisch](https://github.com/vitbokisch)! - perf(zero): dev-mode renderSsr index.html cache + SSG mkdir dedup

  Two independent zero-package optimizations:

  **1. `vite-plugin.ts` — cache index.html across dev SSR requests.** `renderSsr` re-read + transformed `index.html` from disk on every dev request. The raw file rarely changes during a dev session; cache it at module level and invalidate via `handleHotUpdate` when the file actually changes. `transformIndexHtml` is NOT cached (its output may carry per-request timestamps/nonces from other plugins). Saves a disk read per dev SSR request (~0.5-2ms/request — perceptible on multi-page apps with fast navigation).

  **2. `ssg-plugin.ts` — dedup `mkdir` across the SSG render loop.** Concurrent workers (default 4) often mkdir the SAME directory (sibling paths under `/blog/`, `/docs/`, etc.). New `mkdirOnce(dir)` helper caches the Promise per directory; first call launches mkdir, concurrent callers await the SAME Promise. After resolution the Promise stays cached — subsequent paths skip mkdir entirely. Cache reset at start of each `closeBundle` so a `vite build --watch` cycle that wipes `dist/` between builds doesn't reuse stale entries. For a 1000-page site with N shared parent dirs, saves up to N-1 mkdir syscalls per build.

  No bench harness available for zero (server/build code, not browser runtime); changes are structural with documented expected impact. 1005/1006 zero tests pass (1 pre-existing skip); typecheck + lint clean.

- [#1129](https://github.com/pyreon/pyreon/pull/1129) [`9ef3922`](https://github.com/pyreon/pyreon/commit/9ef3922a1849aa36aa012284aae6922cdf1715cd) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `expandRoutesForLocales` shallow-clones every output + locale-major loop ordering (PR-S10)

  Two correctness improvements to the i18n route expansion path:

  **1. Shallow-clone the default-locale routes.** Pre-fix `expanded.push(route)` on the `prefix-except-default` default-locale pass shared the input `FileRoute` reference. A downstream consumer mutating any flat field on the returned route (e.g. a build tool that sets `route._buildId = ...`) would corrupt the original `routes` input. Real-world hazard: `expandRoutesForLocales` is called by BOTH `vite-plugin.ts`'s virtual-route module load AND `ssg-plugin.ts`'s pre-render path expansion — both pass the SAME `routes` array. One mutating the other's view is a class of cross-build corruption.

  The non-default locale path was already correct (it spreads `{ ...route, urlPath, dirPath, depth }`). The default-locale path now does the same minimal `{ ...route }` shallow clone. Shallow is sufficient: every FileRoute field is a primitive or a stable (immutable-treated) object — the only nested field is `exports`, which is a boolean-flags + literal-values record that no consumer mutates.

  **2. Locale-major loop ordering.** Pre-fix the outer loop was route-major (`for route in routes { for locale in locales }`), producing output sorted by route → locale: `/about, /de/about, /cs/about, /contact, /de/contact, /cs/contact`. Locale-major (`for locale in locales { for route in routes }`) produces `/about, /contact, /de/about, /de/contact, /cs/about, /cs/contact` — all default-locale routes first, then each non-default locale's full subtree together. More predictable for debugging and stable under route additions (a new route inserts into its own locale block instead of fanning across the whole output). The route-tree builder doesn't depend on ordering, so this is safe.

  **Regression coverage**: 6 new tests in `i18n-routing.test.ts` under the `PR-S10: expandRoutesForLocales shallow-clone + locale-major` describe block (shallow-clone identity, mutation-doesn't-affect-input, two-calls-isolated, locale-major-ordering, empty-locales no-op, single-default-locale no-op). Bisect-verified: reverting `i18n-routing.ts` fails 4 of 6 with documented error messages; restored → 73/73 i18n tests + 1028/1029 zero tests pass.

  **No public API change**: function signature unchanged; output is `FileRoute[]` shallow-cloned from input. Behavioral observable change is the ordering (consumers that asserted output order — none of which exist in the monorepo — would notice).

- [#1133](https://github.com/pyreon/pyreon/pull/1133) [`a27d7db`](https://github.com/pyreon/pyreon/commit/a27d7db43509c02b29ec59af18e5da18d7d57d41) Thanks [@vitbokisch](https://github.com/vitbokisch)! - ISR lifecycle hygiene (PR-S5) — wire `mode: 'isr'` + AbortController + revalidation race fix + null-revalidate forever-stale fix

  Four ISR correctness bugs bundled because they share the same surface (`isr.ts` revalidate path + `entry-server.ts` mode dispatch) and the same fix shape (lifecycle hygiene). Splitting into four PRs would add review overhead with no gain.

  **1. `mode: 'isr'` was typed-but-not-wired** (Pattern D from the audit). `RenderMode` accepted `'isr'` and `ISRConfig` was fully exported, but `createServer` never inspected `config.mode` — apps that configured `mode: 'isr'` silently got plain SSR behavior with `config.isr` ignored and no signal pointing at the cause. The new `wireRenderMode(mode, baseHandler, config)` makes the dispatch explicit and exhaustive: `'isr'` wraps with `createISRHandler` (with a `revalidate: 60` default when `config.isr` is absent); `'ssr'` / `'spa'` / `'ssg'` pass-through. A compile-time `_AssertExhaustive` assertion fails typecheck if a new `RenderMode` value is added without a case, AND a runtime drift test in `entry-server.test.ts` enumerates the known modes to lock the behavior.

  **2. Revalidation timeout did NOT abort the inner handler** (Pattern C). The pre-fix `Promise.race([handler(req), setTimeout-reject])` rejected the race promise on timeout but the inner handler kept running — DB queries, network calls, etc. all continued in the background, pinning request resources. Now an `AbortController` is created per revalidation, passed into the default revalidate Request as `signal`, and `controller.abort()` fires on timeout so handlers observing the signal can cancel their work.

  **3. `revalidateNow()` had a get-then-delete race with concurrent in-flight revalidation** (Pattern C). Pre-fix: revalidate() in flight → revalidateNow() reads `existed` and calls `store.delete(key)` → meanwhile the revalidate's `handler(req)` completes and calls `store.set(key, ...)` AFTER our delete → cache is RE-POPULATED with the data we just tried to invalidate. The CMS-webhook caller saw `{ dropped: true }` but the next request served stale-thought-fresh content. Fix: per-key epoch counter (`_keyEpoch`). `revalidate()` snapshots `startEpoch` at entry, then checks `_currentEpoch(key) === startEpoch` before `store.set` — if `revalidateNow` (or `revalidateAll`) bumped the epoch mid-revalidation, the racing write is skipped. `revalidateNow` bumps the epoch BEFORE touching the store; `revalidateAll` bumps every in-flight key AND every previously-bumped key (the union of `revalidating ∪ _keyEpoch.keys()`).

  **4. `revalidateRequest: () => null` left the entry forever-stale** (Pattern B — incomplete semantics). The auth-gated opt-out use case (return `null` to skip revalidation for logged-in users) used to bail without touching the cache — so every subsequent request triggered revalidate → null → bail → stale-served → loop forever. Fix: when `revalidateRequest` returns `null`, `store.delete(key)` runs before the bail so the next request MISSes and re-renders fresh.

  **Regression coverage**: 4 new ISR tests + 10 new entry-server tests (7 `wireRenderMode` + 3 `createServer` integration). All bisect-verified — reverting `isr.ts` + `entry-server.ts` to the pre-fix state fails 12 of the new tests with the documented error messages; restoring passes all 42.

  **No public API change**: `wireRenderMode` is `@internal` (exported only for the drift gate). The `mode: 'isr'` config field now behaves as documented.

- [#1125](https://github.com/pyreon/pyreon/pull/1125) [`3ebd25f`](https://github.com/pyreon/pyreon/commit/3ebd25fbdd06f8d9f473e8a9281bce27effca209) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Per-request locale via `AsyncLocalStorage` + new lint rule `pyreon/no-module-signal-in-server-package` (PR-S7)

  **Pattern A from the deep-audit campaign** — module-global state in server context. The `@pyreon/zero` `localeSignal` was a module-level `signal('en')` that the dev i18n middleware wrote per-request via `localeSignal.set(locale)`. Server packages are concurrent — two simultaneous SSR requests with different locales (say `/de/about` + `/cs/about`) race the writes; the later-arriving render's `useLocale()` reads the wrong locale because the module signal is single-instance per process.

  **The fix** (Pattern A canonical shape):

  1. **Per-request locale store via `AsyncLocalStorage`**: a new `_localeAls = new AsyncLocalStorage<LocaleStore>()` tracks the locale per-request. The middleware wraps the rest of the request in `_localeAls.run(perRequestStore, next)` — `AsyncLocalStorage` propagates through async hops (Vite middleware chain, ssrLoadModule, Pyreon handler, render), so every downstream `useLocale()` call reads the right store.
  2. **`useLocale()` prefers the ALS store**: server context reads from `_localeAls.getStore()` if present, falls back to the module signal for non-ALS contexts (client, plain test harness without middleware).
  3. **`setLocale()` writes to the ALS store** when one is active, otherwise writes the module signal (CSR contract).
  4. **Module signal stays exported** as a CSR contract + best-effort fallback. The browser is single-threaded — the module signal is fully authoritative there. On the server it's now a fallback, not the source of truth.

  **New lint rule `pyreon/no-module-signal-in-server-package`** (architecture, error) catches the bug class at edit time. Flags `export const X = signal(...)` (or `computed(...)`) at module scope in source files matching the server-package roots (`packages/zero/zero/src/`, `packages/core/server/src/`, `packages/core/runtime-server/src/`). Detects both `signal` and `computed` calls; ignores nested-function-scope signals (per-call allocation = no race). Test files and configurable `exemptPaths` directories are skipped. `additionalPaths` option extends the default set for out-of-tree consumers. No auto-fix — the right shape depends on the call site (ALS vs context vs closure capture).

  **Regression coverage**: 4 new tests in `i18n-routing.test.ts` under `PR-S7: useLocale per-request isolation` (concurrent-request isolation, ALS-precedence, ALS-ignores-module-signal-writes, setLocale-writes-to-ALS); bisect-verified — reverting `i18n-routing.ts` fails 3 of 4 (the 4th is a fallback sanity check that passes either way). 7 new tests in `rule-batch-2.test.ts` for the lint rule (top-level + non-export + computed + nested-function-skip + non-server-package-skip + test-file-skip + exemptPaths + additionalPaths). All 71 zero i18n tests pass; all 903 lint package tests pass.

  **Monorepo audit** found one additional Pattern A instance (`@pyreon/zero/src/theme.tsx` — `theme` + `_osPrefersDark` module signals). Exempted in `.pyreonlintrc.json` with a follow-up audit note — the theme system currently has `setSSRThemeDefault` set at server startup, so the race doesn't materialize today, but a future PR should refactor it to per-request ALS for consistency.

  **No public API change**: `useLocale` / `setLocale` / `localeSignal` keep their existing signatures. The `_runWithLocale` ALS helper is `@internal` (exported only for regression tests).

- [#1132](https://github.com/pyreon/pyreon/pull/1132) [`eaa36d7`](https://github.com/pyreon/pyreon/commit/eaa36d720210e8bed9676692fcb819c063dd91c6) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `closeBundle` resets `_mkdirCache` in a finally block (defense-in-depth) (PR-S13)

  **Pattern A from the deep-audit campaign** — module-global state with eviction-on-success-only. Pre-PR-S13 `_resetMkdirCache()` was called at the START of `closeBundle` — fresh state for THIS build. But if the render loop threw mid-build, the cache stayed populated for any subsequent in-process consumer (e.g. another SSG plugin instance, a test harness running multiple builds in the same Node process). The next build's start-of-build reset would catch it in the common case, but a build that aborts BEFORE reaching `closeBundle` (e.g. a build error in a prior plugin) leaves the cache dirty.

  **The fix**: wrap the entire `closeBundle` body in `try { ... } finally { _resetMkdirCache() }`. Symmetric with the start-of-build reset (already present pre-PR-S13) — defense in depth so the cache is guaranteed clean after EVERY build attempt, regardless of crash. Structurally analogous to PR I's `try { ... } finally { delete process.env[SSG_BUILD_FLAG] }` pattern that wraps the inner SSR sub-build.

  The mkdirOnce cache exists to deduplicate concurrent `fs.mkdir` calls during the per-path write loop (with `concurrency: 4` (PR D) up to 4 paths can ask for the same dist subdirectory concurrently). Stale entries are unsafe because `dist/` may have been wiped between builds (CI pipelines, `vite build --watch` + manual clean) and the resolved Promise would point at a no-longer-existing directory creation.

  **Regression coverage**: 4 new tests in `ssg-plugin.test.ts` under the `mkdirOnce cache (PR-S13)` describe block — 3 contract tests for the cache primitive (`deduplicates per directory string`, `_resetMkdirCache() clears every entry`, `repopulates after reset`) + 1 source-level regression catcher (`closeBundle structure: finally-block reset is present`) that asserts the `try { ... } finally { _resetMkdirCache() }` pattern appears in the source. Bisect-verified: reverting `ssg-plugin.ts` fails all 4 tests (3 because the new `_internal` exports are missing, 1 because the source-level pattern is absent); restored → 115 ssg-plugin tests + 1026 zero tests pass.

  The source-level test is the load-bearing regression catcher — the contract tests cover the cache primitive's behavior; a regression that removes the finally block would leave the cache primitive correct but the closeBundle wiring broken. The source pattern check catches the wiring regression directly.

  **No public API change**: `_mkdirCache` / `mkdirOnce` / `_resetMkdirCache` are internal. The new `_internal` exports (`mkdirOnce`, `_resetMkdirCache`, `_peekMkdirCacheSize`) are `@internal` testing surface only.

- [#1130](https://github.com/pyreon/pyreon/pull/1130) [`c19018d`](https://github.com/pyreon/pyreon/commit/c19018ddad0577c82caaa63414ceea6e792d5244) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `buildRevalidateManifest` resolves each concrete path to its most-specific route (PR-S11)

  Pre-fix `buildRevalidateManifest` iterated routes outer × paths inner, setting `manifest[concretePath] = value` on every match. If two routes matched the same concrete path (a static route AND a catch-all), whichever route iterated LAST won — silently wrong because the static route is structurally more specific and should claim the path.

  **Real-world hazard**: a route tree with `/blog/special/static.tsx` (static, no revalidate export) alongside `/blog/[...slug].tsx` (catch-all, `revalidate = 3600`) would map `/blog/special/static` to `3600` in the revalidate manifest — even though the static route owns that path at runtime. The adapter (Vercel / Cloudflare / Netlify ISR) would then attempt to revalidate the path via the catch-all's TTL, but the runtime router serves the static page instead. Result: stale-vs-fresh confusion, or the adapter ignores the revalidation entirely.

  **The fix**: invert the loop direction. For each concrete path, find ALL matching candidate routes, sort by specificity (more static segments wins, more total segments breaks ties), pick the top one, and ONLY emit its `revalidateLiteral` (if any) into the manifest. If the most-specific match has no revalidate export, the path is OMITTED from the manifest — the catch-all's TTL doesn't claim a path it doesn't structurally own.

  Candidate matchers + specificities are precomputed once per `buildRevalidateManifest` call (linear in route count). Per-path resolution is `O(routes)` worst case but with cheap predicate-and-arithmetic ops. For typical SSG sites with ~50 routes and ~1000 written paths, this is microseconds total.

  **Regression coverage**: 4 new tests in `ssg-plugin.test.ts` under the `buildRevalidateManifest (PR I)` describe block (static-wins-over-catchall, static-revalidate-wins-over-catchall-revalidate, dynamic-vs-catchall-tiebreaker, declaration-order-independence). Bisect-verified: reverting `ssg-plugin.ts` fails 3 of 4 with documented assertions; the 4th is a sanity test that passes either way (no overlapping paths). Restored → 115 ssg-plugin tests + 1026 zero tests pass.

  **No public API change**: function signature unchanged; the manifest shape (`Record<string, number | false>`) is byte-identical. The observable change is the per-path resolution semantics — apps relying on the (wrong) last-route-wins behavior would notice, but that behavior was never documented or expected.

- Updated dependencies [[`fce4e86`](https://github.com/pyreon/pyreon/commit/fce4e868611a3f5e006f20a031d43435441901e5), [`448073c`](https://github.com/pyreon/pyreon/commit/448073c3066bda0e54c71d85cf6bcfebc148a6f0), [`885d6d9`](https://github.com/pyreon/pyreon/commit/885d6d95f02b9dd1b462c1ba1114ecf94350671a), [`f4e8b66`](https://github.com/pyreon/pyreon/commit/f4e8b66b3544b00f0ff36c1e64c37a2aec50524e), [`dcc81a9`](https://github.com/pyreon/pyreon/commit/dcc81a98f237a46487b3a331e748423359edc7f3), [`cc8e6ac`](https://github.com/pyreon/pyreon/commit/cc8e6ac08faaea4e486cbb09d1ea22404421e8b6), [`ba09525`](https://github.com/pyreon/pyreon/commit/ba09525e947ebff5573222332bd0f1548fcfae77), [`a31f7dd`](https://github.com/pyreon/pyreon/commit/a31f7dd8f8ddba6864c69bbf53117d36ddd477a3), [`71901d4`](https://github.com/pyreon/pyreon/commit/71901d4366e993542a0a8252647b7a4b0e8ec3d2), [`06d66e9`](https://github.com/pyreon/pyreon/commit/06d66e976ad3e5da9777e61eb0f09c70f7b2b871), [`9275a00`](https://github.com/pyreon/pyreon/commit/9275a00f72f071edfeb66584516e093b074b6986), [`434b83f`](https://github.com/pyreon/pyreon/commit/434b83f202060c3a517e67e1ebf4d147369a69c8), [`f54cec8`](https://github.com/pyreon/pyreon/commit/f54cec8f13dffb7fdeceb05021005e342bb856a9), [`f8fbb3b`](https://github.com/pyreon/pyreon/commit/f8fbb3b240fd8aab94900b97e9bab6be3d822b28), [`4204f49`](https://github.com/pyreon/pyreon/commit/4204f49f1dad0997b77fd6a9a90d047f8621010d), [`1921168`](https://github.com/pyreon/pyreon/commit/192116843a0547c777e884f0254ffc51a69bfae1), [`749c2f4`](https://github.com/pyreon/pyreon/commit/749c2f435909740ea43d528ebfc00a2155e64f74), [`b1e3087`](https://github.com/pyreon/pyreon/commit/b1e30879335bbeb29eb8c56520828b841f89db08), [`3ed3134`](https://github.com/pyreon/pyreon/commit/3ed31342e04e0c59b71240ef2b7af0038d70dddb), [`04cb153`](https://github.com/pyreon/pyreon/commit/04cb153ea454dd86d365ccbac5fd8d764aa8be01), [`8333f05`](https://github.com/pyreon/pyreon/commit/8333f05e3a2b3d8b31cd03c3d835a4234a6e689c)]:
  - @pyreon/runtime-dom@1.0.0
  - @pyreon/vite-plugin@1.0.0
  - @pyreon/reactivity@1.0.0
  - @pyreon/core@1.0.0
  - @pyreon/router@1.0.0
  - @pyreon/server@1.0.0
  - @pyreon/head@1.0.0
  - @pyreon/runtime-server@1.0.0
  - @pyreon/meta@1.0.0

## 0.25.1

### Patch Changes

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
  - @pyreon/server@0.25.1
  - @pyreon/head@0.25.1
  - @pyreon/meta@0.25.1
  - @pyreon/runtime-server@0.25.1
  - @pyreon/vite-plugin@0.25.1

## 0.25.0

### Patch Changes

- [#883](https://github.com/pyreon/pyreon/pull/883) [`6075127`](https://github.com/pyreon/pyreon/commit/60751278894a6ff843c0f6f6c4894c76bcb6a720) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Singleton sentinel default-on across every `@pyreon/*` package with module-level state (PR A of the bullet-proof cross-module-instance plan, `.claude/plans/jaunty-herding-kazoo.md`).

  Each package's `src/index.ts` now calls `registerSingleton('@pyreon/<name>', <version>, import.meta.url)` at module load. The first registration records a marker on `globalThis`; a second registration with a DIFFERENT normalized location triggers detection. Default mode throws an actionable Error naming both file paths and three concrete fixes (Vite `resolve.dedupe`, `npm ls`, `bun ls`). `PYREON_SINGLE_INSTANCE=warn` demotes to `console.error`; `PYREON_SINGLE_INSTANCE=silent` opts out entirely (browser extensions, micro-frontends, nested SSR via `rocketstyle-collapse`).

  **HMR-aware.** Vite re-evaluates modules with the SAME path but possibly different query params (`?v=12345`, `?t=12345`, `?import`). The sentinel normalizes the location (strips query string) before comparing — same normalized location → HMR re-eval → silently allowed; different location → genuine dual-instance → throws.

  **Per-package detection.** The earlier prototype put the sentinel only in `@pyreon/reactivity` — insufficient because `@pyreon/core` (and every other package) has its own module-level state that can be silently corrupted under dual-load. The full plan requires per-package registration, which this PR ships.

  **Zero behavior change in correct setups.** Apps that already have a single instance of each `@pyreon/*` package (the overwhelmingly common case) see no runtime change. Apps with silently-tolerated duplicates today (sub-dep version mismatch, custom bundler config) will see their app throw at startup after upgrading with an error message naming the fix. `PYREON_SINGLE_INSTANCE=warn` is the immediate mitigation for any consumer surprised by the change.

  **Test coverage.** Contract tests at `packages/core/reactivity/src/tests/singleton-sentinel.test.ts` (57 specs) exercise the sentinel directly with synthetic `file://` URLs: default-mode throw + actionable error message, HMR re-eval allowance, `PYREON_SINGLE_INSTANCE=warn` / `=silent` escape hatches, per-package coverage across all 24 registered packages, and cross-package isolation. Bisect-verified — neutralizing the throw branch fails 49 positive-case tests; restored passes all 57. The synthetic-URL approach replaces the heavier filesystem dual-load reproducer (it's the sentinel's normalized-string comparison that matters, not Node's ESM loader behaviour).

- [#895](https://github.com/pyreon/pyreon/pull/895) [`f71fb4c`](https://github.com/pyreon/pyreon/commit/f71fb4c1b219e19189a58afeadcd6a7c9f5957fb) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Post-audit fixes for the bullet-proof cross-module-instance architecture (PRs [#883](https://github.com/pyreon/pyreon/issues/883)/[#884](https://github.com/pyreon/pyreon/issues/884)/[#886](https://github.com/pyreon/pyreon/issues/886)/[#889](https://github.com/pyreon/pyreon/issues/889)). Closes 1 HIGH-severity race condition + 2 correctness bugs surfaced by the deep release-readiness audit.

  **1. HIGH — race condition in sentinel opt-out under concurrent `Promise.all`** (`@pyreon/reactivity` + `@pyreon/zero` + `@pyreon/vite-plugin`).

  The env-var dance pattern (`process.env.PYREON_SINGLE_INSTANCE = 'silent'` / capture+restore) used by `ssrLoadModuleQuiet`, SSG-plugin's built-handler import, and rocketstyle-collapse's nested-SSR resolver was race-prone under `Promise.all` of N opt-out scopes:

  1. Call A: captures `prev=undefined`, sets `'silent'`
  2. Call B: captures `prev='silent'` (post-A's write), sets `'silent'`
  3. A's `finally` deletes env (prev was undefined)
  4. B's `finally` restores `'silent'` ← **leaked permanently**

  Effect: the sentinel was silently disabled for the entire dev / SSG / collapse-resolver process lifetime. Bisect-verified with a focused reproducer; the leak fires with 5 concurrent scopes in `renderSsr`.

  **Fix**: `@pyreon/reactivity` ships two new exports:

  - `withSilent(fn): Promise<T>` — async refcount-based scope. Increments `silentDepth` on the sentinel state, awaits the fn, decrements in `finally`. Order-independent under concurrency.
  - `withSilentSync(fn): T` — sync variant.

  All three call sites updated to use `withSilent` instead of the env-var dance. The env-var (`PYREON_SINGLE_INSTANCE`) is preserved as the documented user-facing escape hatch for browser extensions / micro-frontends.

  `@pyreon/vite-plugin` gains a runtime dep on `@pyreon/reactivity` (rocketstyle-collapse).

  **2. BUG — pnpm v9 peer-suffix false-positive duplicate** (`@pyreon/cli`).

  `pyreon doctor --check-dedup`'s `_parsePnpmLock` regex parsed `/@pyreon/core@1.0.0(react@19.0.0):` keys with the peer suffix INCLUDED in the version. Two installs sharing the same `1.0.0` but resolved against different peers were counted as TWO distinct versions → false-positive `multiple-versions` finding.

  **Fix**: strip the `(...)` suffix when adding to the version set. Build-metadata versions (`1.0.0+build.42` — no `(`) round-trip unchanged. Genuine multi-version dups remain detectable. 3 new regression specs.

  **3. BUG — `PYREON_DISABLE_DEDUPE` only triggered on literal `'1'`** (`@pyreon/vite-plugin`).

  Users reaching for an escape-hatch env var under stress reach for `true` / `yes` / `on` first. The strict `=== '1'` check silently no-op'd those alternatives — worst-of-both-worlds (escape hatch present but doesn't fire).

  **Fix**: `_isTruthyEnv(v)` accepts `1` / `true` / `yes` / `on` case-insensitively. 11 new specs covering both positive (truthy) and negative (falsy / unrecognized) values.

  All three fixes are bisect-verified — neutralizing each fails its dedicated test(s); restored passes. Full repo validation: 3,978 tests pass across 10 affected packages (`reactivity` 444, `core` 531, `router` 521, `runtime-dom` 681, `runtime-server` 150, `head` 115, `server` 168, `cli` 177, `vite-plugin` 193, `zero` 998). `pyreon doctor` clean on all changed files. Bundle budgets clean.

- Updated dependencies [[`7da5b2b`](https://github.com/pyreon/pyreon/commit/7da5b2bcbc2aebd9600cb8fdefb763ace7f78c1a), [`bc145f3`](https://github.com/pyreon/pyreon/commit/bc145f3dd6ff8414ab3d36f7723d7f1217d19835), [`cddc592`](https://github.com/pyreon/pyreon/commit/cddc5926f2f23d1b600d01f60fa4e72513d2b6fe), [`6075127`](https://github.com/pyreon/pyreon/commit/60751278894a6ff843c0f6f6c4894c76bcb6a720), [`f71fb4c`](https://github.com/pyreon/pyreon/commit/f71fb4c1b219e19189a58afeadcd6a7c9f5957fb), [`da3b768`](https://github.com/pyreon/pyreon/commit/da3b76842971d51b882549743c25e23f0171753b)]:
  - @pyreon/reactivity@0.25.0
  - @pyreon/core@0.25.0
  - @pyreon/router@0.25.0
  - @pyreon/runtime-dom@0.25.0
  - @pyreon/runtime-server@0.25.0
  - @pyreon/head@0.25.0
  - @pyreon/server@0.25.0
  - @pyreon/vite-plugin@0.25.0
  - @pyreon/meta@0.25.0

## 0.24.6

### Patch Changes

- Updated dependencies [[`378efde`](https://github.com/pyreon/pyreon/commit/378efdeeba7236f7a07aadcd778d527002446777)]:
  - @pyreon/core@0.24.6
  - @pyreon/head@0.24.6
  - @pyreon/reactivity@0.24.6
  - @pyreon/router@0.24.6
  - @pyreon/runtime-dom@0.24.6
  - @pyreon/runtime-server@0.24.6
  - @pyreon/server@0.24.6
  - @pyreon/vite-plugin@0.24.6
  - @pyreon/meta@0.24.6

## 0.24.5

### Patch Changes

- Updated dependencies [[`172b366`](https://github.com/pyreon/pyreon/commit/172b3663095ac9888d59d719a545f4473d238e52)]:
  - @pyreon/vite-plugin@0.24.5
  - @pyreon/core@0.24.5
  - @pyreon/head@0.24.5
  - @pyreon/reactivity@0.24.5
  - @pyreon/router@0.24.5
  - @pyreon/runtime-dom@0.24.5
  - @pyreon/runtime-server@0.24.5
  - @pyreon/server@0.24.5
  - @pyreon/meta@0.24.5

## 0.24.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.4
  - @pyreon/head@0.24.4
  - @pyreon/reactivity@0.24.4
  - @pyreon/router@0.24.4
  - @pyreon/runtime-dom@0.24.4
  - @pyreon/runtime-server@0.24.4
  - @pyreon/server@0.24.4
  - @pyreon/vite-plugin@0.24.4
  - @pyreon/meta@0.24.4

## 0.24.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.3
  - @pyreon/head@0.24.3
  - @pyreon/reactivity@0.24.3
  - @pyreon/router@0.24.3
  - @pyreon/runtime-dom@0.24.3
  - @pyreon/runtime-server@0.24.3
  - @pyreon/server@0.24.3
  - @pyreon/vite-plugin@0.24.3
  - @pyreon/meta@0.24.3

## 0.24.2

### Patch Changes

- Updated dependencies [[`1c1b135`](https://github.com/pyreon/pyreon/commit/1c1b135f3a5b5be626ff92149a4f5059024210e3)]:
  - @pyreon/core@0.24.2
  - @pyreon/head@0.24.2
  - @pyreon/reactivity@0.24.2
  - @pyreon/router@0.24.2
  - @pyreon/runtime-dom@0.24.2
  - @pyreon/runtime-server@0.24.2
  - @pyreon/server@0.24.2
  - @pyreon/vite-plugin@0.24.2
  - @pyreon/meta@0.24.2

## 0.24.1

### Patch Changes

- [#792](https://github.com/pyreon/pyreon/pull/792) [`48ac675`](https://github.com/pyreon/pyreon/commit/48ac6758f266843d9b8db679cf19cee29b3a309d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Dev server now renders user-provided `_404.tsx` / `_not-found.tsx` for `mode: 'ssg'` and `mode: 'spa'` apps — closes production-vs-dev drift.

  **Before**: in `mode: 'ssg'` / `mode: 'spa'` apps, the dev server emitted a hardcoded `<h1>404 — Not Found</h1>` fallback on any unmatched URL, completely ignoring the user's `_404.tsx` / `_not-found.tsx`. The SSG build output (`dist/404.html`) rendered the user's component correctly with full layout chrome — but dev didn't, so developers iterating on the 404 page locally never saw what production would actually ship.

  **Root cause**: the dev SSR middleware (`renderSsr`) was gated `if (config.mode === 'ssr')` (vite-plugin.ts:238). For ssg/spa modes the SSR middleware never registered, and unmatched URLs fell straight through to the `handle404` middleware — which called `render404Page(undefined)`, never reading the routes tree's `notFoundComponent`. An inline comment in `vite-plugin.ts:629` claimed "add `_404.tsx` to your routes tree (canonical pattern)" was the user-side fix, but that advice only worked in `mode: 'ssr'` because the SSR middleware was the only path that consulted the router.

  **Fix**: `handle404` now delegates to `renderSsr` before falling back to the bare HTML. The router's `findNotFoundFallback` (PR L5 / M1.2) walks the routes tree, finds the deepest matching layout's `notFoundComponent`, builds a synthetic chain `[...layouts, syntheticLeaf]`, and `renderSsr` produces 404 HTML wrapped in the layout's chrome — matching what `dist/404.html` ships at build time. Works for ssr / ssg / spa modes uniformly. The bare-HTML static fallback remains for apps that genuinely ship no `_404.tsx` / `_not-found.tsx`.

  For `mode: 'ssr'` apps the upstream SSR middleware is still the primary path. `renderSsr` may be called twice on a truly-unmatched URL (once by the upstream middleware, once via the `handle404` fallback). The duplicate cost is purely a no-op `resolveRoute` call that returns `matched: []` again — no extra render work.

  **Bisect-verified**: reverting `handle404` to skip the `renderSsr` delegation fails the new regression tests with `expected '<h1>404 — Not Found</h1>...' to contain 'Page Not Found'` (the bare fallback's "Not Found" doesn't match the fixture's `<h1>404 — Page Not Found</h1>` from `_404.ts`). Restored → 977/977 zero tests pass + no `TEMP BISECT` remnants.

  **Test coverage**: 5 new regression tests in `src/tests/integration/dev-404-ssg.test.ts`:

  - uses the user's `_404` component on an unmatched URL
  - emits the `_404` component WRAPPED in the layout/app chrome (doctype + html/head/body)
  - known routes still serve normally (not 404)
  - path with deeply-nested segments still routes through `_404`
  - static-asset-shaped paths fall through (don't hit `handle404`)

  No API change.

- Updated dependencies []:
  - @pyreon/core@0.24.1
  - @pyreon/head@0.24.1
  - @pyreon/reactivity@0.24.1
  - @pyreon/router@0.24.1
  - @pyreon/runtime-dom@0.24.1
  - @pyreon/runtime-server@0.24.1
  - @pyreon/server@0.24.1
  - @pyreon/vite-plugin@0.24.1
  - @pyreon/meta@0.24.1

## 0.24.0

### Patch Changes

- Updated dependencies [[`dfaefb8`](https://github.com/pyreon/pyreon/commit/dfaefb8e9e06eaff9039c001ad7731476b6b5732), [`c41aa1a`](https://github.com/pyreon/pyreon/commit/c41aa1ae90efe00d82c97f623a02ed17acb2427c), [`bc65b82`](https://github.com/pyreon/pyreon/commit/bc65b825505016e4433b50cd1276c9982ef10b8a), [`67e1f37`](https://github.com/pyreon/pyreon/commit/67e1f371a20219481ee9564d2d7421ec2a0b5ddf), [`ab4d980`](https://github.com/pyreon/pyreon/commit/ab4d9806a677b2ccd28f417280e52d72be9b1bd9), [`b8fb31c`](https://github.com/pyreon/pyreon/commit/b8fb31cf1a59578fc33f27d539695d2bc164b2f1), [`f400e85`](https://github.com/pyreon/pyreon/commit/f400e85282a370276d5ae0266ba501c41dce4f3e), [`891ca43`](https://github.com/pyreon/pyreon/commit/891ca4300727119dafd66ceaacd7cb39e68f3b4e), [`d4ec777`](https://github.com/pyreon/pyreon/commit/d4ec777643446ed2c51dedb1e74fbd8dce70bdfd), [`2abb672`](https://github.com/pyreon/pyreon/commit/2abb672d8a8bf7f4940af422bf8bf802aa129cdd), [`84cd28f`](https://github.com/pyreon/pyreon/commit/84cd28feba1899d70696e9a292bb078601558e8f), [`49cc686`](https://github.com/pyreon/pyreon/commit/49cc6869c42e3d3a7ef9e6568f7aade0be23edc0), [`73a6949`](https://github.com/pyreon/pyreon/commit/73a694940a0121508dee84b8a88812753e26fb10)]:
  - @pyreon/core@0.24.0
  - @pyreon/runtime-server@0.24.0
  - @pyreon/runtime-dom@0.24.0
  - @pyreon/vite-plugin@0.24.0
  - @pyreon/reactivity@0.24.0
  - @pyreon/head@0.24.0
  - @pyreon/router@0.24.0
  - @pyreon/server@0.24.0
  - @pyreon/meta@0.24.0

## 0.23.0

### Minor Changes

- [#745](https://github.com/pyreon/pyreon/pull/745) [`f833a99`](https://github.com/pyreon/pyreon/commit/f833a997bbc04aa5ba94d0d5dd334628871aaa9a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat: close the three deferred SSR/ISR gaps from the deep-analysis pass

  Three independent fixes that close gaps explicitly deferred in earlier
  PRs ([#738](https://github.com/pyreon/pyreon/issues/738)/[#740](https://github.com/pyreon/pyreon/issues/740)/[#742](https://github.com/pyreon/pyreon/issues/742)/[#744](https://github.com/pyreon/pyreon/issues/744)) but called out as required by the goal-hook.

  ### 1. `renderToStream(root, { signal })` — AbortSignal threading

  `renderToStream` now accepts `{ signal?: AbortSignal }`. The internal
  controller forwards client-disconnect (`ReadableStream.cancel()`) AND
  upstream aborts to a shared signal; the drain loop races each pending
  Suspense batch against the abort-promise so the stream closes promptly
  when the consumer hangs up. Per-boundary resolvers check
  `ctx.signal.aborted` before enqueueing post-resolve HTML.

  Before: a client navigating mid-stream left in-flight Suspense work
  awaited server-side until its 30s timeout. Wasted CPU per dropped
  connection.

  After: cancellation propagates within ms; pending boundaries skip the
  swap. Tests (`tests/integration.test.ts`): upstream-abort skips
  post-resolve enqueue, pre-aborted signal still emits sync portion,
  `ReadableStream.cancel()` closes the stream within 100ms (well under
  the 200ms test boundary's pending work).

  ### 2. `ISRConfig.revalidateRequest` — auth-gated revalidation hook

  New optional `(req: Request) => Request | null`. Lets auth-gated
  `cacheKey` setups scope revalidation explicitly:

  - Return a custom `Request` (e.g. stripped cookies for anonymous
    revalidation) — used in place of the original.
  - Return `null` — SKIP revalidation entirely for this entry (stale
    stays stale until next live request).

  Closes the footgun where the default behaviour re-uses the original
  user's cookies for the background revalidation — if the session has
  expired since cache-write, the new render may misbehave or embed
  stale auth data. Tests: 2 specs covering null=skip and custom-request
  scrubbing cookies.

  ### 3. Cloudflare `_worker.js` runtime-contract gate

  New regression assertion in `adapters.test.ts` cloudflare suite: the
  emitted `_worker.js` MUST contain none of `node:` imports / `fs` /
  `path` / `__dirname` / `__filename` / `fileURLToPath` / `Buffer` /
  `process.env`. Locks the Web-standard runtime contract — any future
  template change that accidentally grows a Node API fails CI here
  instead of 500ing in production on Cloudflare Workers (which doesn't
  expose those APIs without the `nodejs_compat` flag).

  The `node:fs/promises` / `node:path` USE inside cloudflare.ts itself
  is build-time-only (runs in Node during `vite build`) and is
  unaffected — this check covers the EMITTED file.

  ### Net diff

  +220 / -10 lines (impl + 5 new tests + JSDoc + changeset). All
  existing suites pass unchanged: runtime-server 35+ tests, zero ISR
  15/15, adapters 37/37, typecheck + lint + build clean across both
  packages, gen-docs + check-doc-claims green.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

- [#742](https://github.com/pyreon/pyreon/pull/742) [`36767f6`](https://github.com/pyreon/pyreon/commit/36767f69887f8da39c2a14c57da2ca59f3780b3d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(zero): ISR external-store interface — `ISRStore` + `createMemoryStore`; multi-instance production unlock

  `createISRHandler` was previously hard-wired to `new Map<string, CacheEntry>`
  — per-process, never shared. Multi-instance deploys (load-balanced Node,
  autoscaled containers, edge functions) hit a wall: each pod had its own
  cache, so a revalidation in pod A was invisible to pod B. Sticky
  sessions or external cache plumbing was the framework user's problem.

  New: pluggable backing store.

  ```ts
  // ISRConfig.store accepts any backing matching:
  interface ISRStore<E = ISRCacheEntry> {
    get(key: string): Promise<E | undefined> | E | undefined;
    set(key: string, entry: E): Promise<void> | void;
    delete?(key: string): Promise<void> | void;
  }
  ```

  Sync OR async returns — in-memory stays cheap (no Promise allocation per
  request), external stores return their native promises naturally. The
  handler `await`s the result either way.

  **Default unchanged**: `createMemoryStore({ maxEntries })` (extracted
  from the previous in-place `Map` logic) — drop-in pass-through,
  behaviour-identical for existing callers. `config.maxEntries` is
  ignored when a custom `config.store` is supplied (the custom store owns
  its own eviction/TTL policy).

  New exports from `@pyreon/zero/server`:

  - `ISRStore<E>` interface
  - `ISRCacheEntry` interface (`{ html, headers, timestamp }`)
  - `createMemoryStore({ maxEntries? })` — the default factory

  Example Redis adapter:

  ```ts
  import { Redis } from "ioredis";
  import type { ISRStore } from "@pyreon/zero/server";

  const redis = new Redis(/* ... */);
  const store: ISRStore = {
    async get(key) {
      const v = await redis.get(`isr:${key}`);
      return v ? JSON.parse(v) : undefined;
    },
    async set(key, entry) {
      await redis.set(`isr:${key}`, JSON.stringify(entry), "EX", 86400);
    },
    async delete(key) {
      await redis.del(`isr:${key}`);
    },
  };

  const handler = createISRHandler(ssrHandler, { revalidate: 60, store });
  ```

  Tests: 6 new specs in `tests/isr.test.ts` "pluggable store" describe —
  default backwards-compat, `createMemoryStore` LRU bump on `get`,
  fake-Redis call sequence, async store roundtrip, cache-hit short-
  circuit, non-cacheable response does NOT call `set`. 19/19 ISR specs
  pass total. Typecheck + lint + build clean.

  **No breaking change**: omitting `config.store` keeps prior behaviour
  exactly (`createMemoryStore` defaults `maxEntries` to 1000 just like
  the previous hard-coded Map+LRU did).

- [#758](https://github.com/pyreon/pyreon/pull/758) [`c459330`](https://github.com/pyreon/pyreon/commit/c459330e248397438892c9a8c1817bd75cfb8b3e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `createISRHandler` now exposes imperative cache invalidation via `revalidateNow(key)` and `revalidateAll()`. The returned handler is still callable for `Bun.serve({ fetch: handler })` — these are methods attached to the callable, not a return-shape change. Non-breaking.

  The pluggable store ([#742](https://github.com/pyreon/pyreon/issues/742)) already supported `delete?(key)` on the interface, but there was no public surface to invoke it. Runtime ISR previously relied purely on TTL-based stale-while-revalidate, which means a CMS update → ISR cache reflection always has a stale window (the TTL). The new methods close that window: a webhook fires → `revalidateNow(path)` → the very next visitor sees fresh content.

  **New surface**:

  ```ts
  import { createISRHandler } from "@pyreon/zero/server";

  const isr = createISRHandler(ssrHandler, { revalidate: 60 });

  // As before — Bun.serve({ fetch: isr }) still works
  Bun.serve({ fetch: isr });

  // CMS webhook → drop one cache entry, next request renders fresh
  const result = await isr.revalidateNow("/posts/123");
  // → { dropped: true } if entry existed AND store supports delete
  // → { dropped: false } otherwise (honest signal for TTL-only stores)

  // Admin "purge cache" endpoint → drop everything
  await isr.revalidateAll();
  // throws clear error if store has no clear() method
  ```

  **Honest no-store-support behavior**: external stores (Redis TTL-only, custom shapes) may omit `delete?` or `clear?` on the `ISRStore` interface. `revalidateNow` returns `{ dropped: false }` when the store can't physically drop the entry (instead of lying about success). `revalidateAll` throws a clear error pointing at the missing `clear()` method when called against an incompatible store.

  **`ISRStore` interface gains `clear?()`** — optional, non-breaking. The default `createMemoryStore` implements it.

  **Internal hygiene**: both methods also clear the in-flight `revalidating` flag for the dropped key(s) so the next request re-renders fresh rather than short-circuiting on the stale-revalidate guard.

  **Tests**: 7 new specs in `isr.test.ts` under `revalidateNow + revalidateAll` covering:

  1. drops a cached entry — next request MISSes
  2. dropped:false for keys that never existed
  3. idempotent (call twice — sensible flags)
  4. clears in-flight revalidation flag (the subtle one — prevents a stale-then-evicted entry's flag from blocking the next request)
  5. revalidateAll drops every entry
  6. revalidateAll throws against a store without clear()
  7. revalidateNow against a store without delete() returns dropped:false honestly

  **Bisect-verified**: replaced `revalidateNow` body with a no-op `return { dropped: false }` → 3 of 7 specs failed (the real ones — `drops a cached entry`, `idempotent`, `clears in-flight flag`); the 4 edge-case specs still passed (they were testing shapes that happen to fall through identically to a no-op). Restored → all 27 isr tests pass, full zero suite **969/969** (1 skipped pre-existing), MCP suite **497/497** (api-reference regen didn't break anything). Lint + typecheck clean. No lockfile drift. No `TEMP BISECT` remnants.

  Manifest entry for `createISRHandler` updated to document the new surface + the 5 foot-guns. `gen-docs --check` clean.

### Patch Changes

- [#759](https://github.com/pyreon/pyreon/pull/759) [`51b81f0`](https://github.com/pyreon/pyreon/commit/51b81f0d92bdbc9c4fd6acc3b5b9b0a8043078a9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `createActionMiddleware` — surface server-action errors to operator logs + distinguish client errors (400) from server errors (500).

  Continuation of the swallow-error audit pattern from PR [#755](https://github.com/pyreon/pyreon/issues/755) (cloud adapters) and PR [#753](https://github.com/pyreon/pyreon/issues/753) (node adapter). The same shape — `catch (err) { return 500 }` with **no `console.error(err)`** — was hiding in `executeAction` for server actions. Production crashes inside a user's action handler returned a generic 500 to the client AND emitted **zero diagnostic info** to server logs, leaving operators unable to diagnose failures.

  **Fix 1 — log handler crashes:**

  ```ts
  } catch (err) {
    console.error('[Pyreon Action] handler failed:', err)
    // ...
  }
  ```

  The same `[Pyreon SSR] handler failed:` / `[Pyreon Action] handler failed:` prefix family makes failures trivially greppable across log streams.

  **Fix 2 — distinguish parse errors (400) from runtime errors (500):**

  Pre-fix, `await req.json()` and `await req.formData()` throwing on malformed payloads (truncated JSON, invalid UTF-8, etc.) were caught by the same outer `catch` that handled handler crashes — and returned **500**. That conflated client errors (bad payload — the client's fault) with server errors (handler crashed — the server's fault).

  Now the parse step has its own try/catch and returns **400 (Bad Request)** with a generic `{ error: 'Invalid request body' }` payload. The generic message also prevents leaking parser internals (`Unexpected token X in JSON at position N` could expose sensitive offset / state info to hostile clients).

  **Tests (3 new specs in `actions.test.ts`):**

  1. **logs action runtime errors to console.error with prefix** — `vi.spyOn(console, 'error')` asserts the `[Pyreon Action] handler failed:` log fires with the error attached.
  2. **returns 400 (not 500) on malformed JSON request body** — `body: '{not valid json'` with `Content-Type: application/json` → 400 + `{ error: 'Invalid request body' }` + `console.error` captures the parse error.
  3. **does NOT leak internal parser error messages to the client** — null bytes + junk body → generic message; asserts the response body does NOT match `/position|token|offset/i` so even strict parsers (with offset reporting) can't leak.

  **Bisect-verified per fix:**

  - Drop `console.error` from the handler-error catch → "logs action runtime errors" fails; other 2 pass. Restored → 3/3.
  - Restore single outer try/catch (pre-fix shape) → "returns 400" + "leak internal" both fail (status 500 + parser internals leaked); logging spec still passes. Restored → 3/3.

  Full zero suite **965/965** pass (1 skipped pre-existing). Lint + typecheck clean for the changed files. No lockfile drift. No `TEMP BISECT` remnants.

  The 2 `no-console` lint warnings emitted are intentional and match the existing convention (`console.warn` in adapter `revalidate` methods — production logging).

- [#752](https://github.com/pyreon/pyreon/pull/752) [`1bb5988`](https://github.com/pyreon/pyreon/commit/1bb598872a7178a5c20af257c49e62a6ae82bf36) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `bunAdapter` — fix `Bun.resolveSync` crash on SSR routes + add runtime-contract gate.

  The emitted Bun.serve harness used `Bun.resolveSync(filePath, ".")` for its static-file / path-traversal check. `Bun.resolveSync` is MODULE resolution (looks for a JS module on disk), not path normalization — it throws `ENOENT` on any non-existent file. So **every GET request whose URL didn't match a literal static file** (i.e. every SSR route) crashed inside the static-file branch with `Cannot find module '<clientDir>/<route>' from '.'` and returned 500 instead of reaching the SSR handler.

  The harness now decodes the URL once, normalizes the path via `node:path.normalize`, asserts the candidate stays within `clientDir`, then checks `Bun.file(candidate).exists()`. Same security guarantees (path traversal rejected, null bytes rejected, malformed percent-encoding rejected with 400), but `normalize` is pure string arithmetic — never throws on missing files. SSR routes now correctly fall through to the handler.

  **New gate**: `bun adapter — runtime contract` describe block in `packages/zero/zero/src/tests/adapters.test.ts` spawns `bun run dist/index.ts` as a subprocess against the mock build fixture and drives real HTTP requests against the emitted server:

  1. SSR fallback: `GET /api/anything` → handler response (`"ok"`).
  2. Static file: `GET /` → mock `index.html` with `cache-control` header.

  Skipped when `bun` isn't in PATH (vitest can run under Node too); auto-detected at test time. Each spec takes ~60ms (bun spawn is fast).

  **Bisect-verified**: reverting the adapter fix to the `Bun.resolveSync` shape → both runtime-contract tests FAIL with `expected 500 to be 200` (the SSR route and the static `/` route BOTH crash with `Cannot find module`); restored → both pass × 5 stability runs. Full zero suite 957/957 (1 skipped pre-existing). Lint + typecheck clean.

  Path-traversal-specific test was deliberately NOT added: both `Bun.serve`'s HTTP parser AND the URL spec's mandatory `new Request(url)` normalization collapse `..` segments BEFORE the bytes reach the fetch handler (empirically verified — `GET /../../etc/passwd` arrives as `/etc/passwd` no matter whether the client is fetch, undici, curl, or a raw `node:net` socket). The traversal check in the harness is still useful defense-in-depth for non-Bun.serve consumers (e.g. embedding the entry into Deno / edge runtimes that don't normalize), but it can't be exercised through a spec-compliant HTTP path; the SSR-fallback test proves the load-bearing fix.

  First adapter to gain a runtime-contract gate. Cloudflare / Vercel / Netlify gates need their respective CLI emulators (`wrangler dev` / `vercel dev` / `netlify dev`) which add ~150MB install each — they're separate follow-up PRs.

- [#755](https://github.com/pyreon/pyreon/pull/755) [`5934570`](https://github.com/pyreon/pyreon/commit/59345703bcf7a4d946ace655a69514ee438e9006) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Cloud adapter audit pass — fix swallow-error in Cloudflare + Netlify emitted servers, hoist per-request dynamic import in Vercel, remove dead code in Cloudflare worker.

  Follow-up to the bun ([#752](https://github.com/pyreon/pyreon/issues/752)) and node ([#753](https://github.com/pyreon/pyreon/issues/753)) adapter audits, which each found 1-2 real bugs in their emitted server harnesses under runtime-contract gates. The cloud adapter family (vercel/cloudflare/netlify) doesn't have runtime-contract gates yet (each needs its own CLI emulator install — wrangler dev / vercel dev / netlify dev, ~150 MB each), but a static audit pass surfaces four concrete production bugs that don't need runtime emulation to diagnose:

  **Cloudflare** (`packages/zero/zero/src/adapters/cloudflare.ts`)

  - **Silent catch**: the emitted `_worker.js` had `try { ... } catch (err) { return new Response("Internal Server Error", { status: 500 }) }` with NO `console.error(err)`. Production crashes shipped a bare 500 to clients AND ZERO diagnostic info to Cloudflare Tail logs (the standard Workers debugging surface). Now logs `[Pyreon SSR] handler failed:` + the full error.
  - **Dead code**: the emitted worker computed `const ext = url.pathname.split(".").pop()` then ran an `if (ext && ...) { /* comment */ }` block with an **empty body** — pure dead code that did nothing at runtime, just consumed cold-start budget per request. Removed.

  **Netlify** (`packages/zero/zero/src/adapters/netlify.ts`)

  - **Silent catch**: same shape as Cloudflare — `catch (err) { return 500 }` with no log. Now logs to Netlify Function logs panel (also reachable via `netlify functions:log`).

  **Vercel** (`packages/zero/zero/src/adapters/vercel.ts`)

  - **Per-request dynamic import**: the emitted function called `(await import("./entry-server.js")).default` inside the handler — Node's module cache makes subsequent calls near-free, but the FIRST request on every fresh serverless instance (i.e. every cold start) paid the full module evaluation cost inside the request budget, observable as a TTFB spike on cold starts. Now hoisted to module scope (`import handler from "./entry-server.js"` at the top), evaluated once at function-init before the first request.
  - **No error logging**: pre-fix the handler had NO try/catch — SSR throws propagated to Vercel's launcher which logged them generically. Now wrapped with the same `[Pyreon SSR] handler failed:` prefix so the cause is trivially greppable in the dashboard log stream.

  Shape assertions added to the existing `vercel/cloudflare/netlify adapter build` tests:

  - Cloudflare: asserts `console.error([Pyreon SSR]` present, asserts the dead `ext` computation is absent.
  - Netlify: asserts `console.error([Pyreon SSR]` present.
  - Vercel: asserts `import handler from "./entry-server.js"` is hoisted at module-scope, asserts `await import("./entry-server.js")` is absent, asserts `console.error([Pyreon SSR]` present.

  **Bisect-verified per fix**: reverting just one adapter's source (TEMP BISECT) fails ONLY that adapter's test; the other two stay green. All three restores → 957/957 zero tests pass. No `TEMP BISECT` remnants. Lint + typecheck clean. No lockfile drift.

  Out of scope (follow-up PRs): full runtime-contract gates via `wrangler pages dev` / `vercel dev` / `netlify dev` — each adds a ~150 MB CLI install to CI and likely surfaces additional bugs. The shape-level audit pass here is the cheap first cut.

- [#754](https://github.com/pyreon/pyreon/pull/754) [`6454cb7`](https://github.com/pyreon/pyreon/commit/6454cb794bb82db11e7842cb4a62a3765e3dd3ac) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(security): close 17 CodeQL alerts (real bugs + workflow hardening; 20 false positives dismissed)

  Sweep through `github.com/pyreon/pyreon/security/code-scanning`. 37
  open alerts triaged into **17 real fixes + 20 false-positive
  dismissals**. The 4 remaining alerts are OpenSSF Scorecard project-
  posture metrics (CodeReview, Maintained, CIIBestPractices, Fuzzing)
  which can't be closed by a code PR — they're external posture
  checks.

  ### Real fixes (8 code + 9 polynomial-redos + 6 workflow)

  **Code:**

  - **[#27](https://github.com/pyreon/pyreon/issues/27) `@pyreon/zero` `fs-router.ts:1110`** — `import("${fullPath}")`
    interpolated `fullPath` raw into emitted JS. Path is developer-
    controlled (project's own filesystem scan), but a quote / backslash
    / newline in the path would corrupt the generated module source.
    Fixed: `JSON.stringify(fullPath)` — matches the existing `hmrId`
    pattern two lines above.
  - **[#37](https://github.com/pyreon/pyreon/issues/37) `@pyreon/lint` `anchor-is-valid.ts:67`** —
    `trimmed.toLowerCase().startsWith('javascript:')` only catches the
    one canonical scheme. CodeQL's `js/incomplete-url-scheme-check`
    expects the curated dangerous-scheme set. Added `vbscript:`
    (dead on modern browsers but a no-cost completion). `data:`
    intentionally omitted — legitimate `data:image/png;base64,…`
    href usage exists.
  - **[#20](https://github.com/pyreon/pyreon/issues/20)/[#21](https://github.com/pyreon/pyreon/issues/21)/[#22](https://github.com/pyreon/pyreon/issues/22) `@pyreon/solid-compat` `createStore` setStore** —
    `Object.assign(obj, value)` + dynamic `obj[key] = …` with user-
    supplied path keys allowed prototype pollution via
    `setStore('__proto__', evil)` or `setStore({ __proto__: … })`.
    Added a `DANGEROUS_KEYS` Set (`__proto__` / `constructor` /
    `prototype`) and a `safeAssign` helper — same shape as
    `@pyreon/reactivity reconcile.ts:34`. Path-key writes at any
    depth refuse the dangerous identifiers.

  **Polynomial-redos (`@pyreon/compiler`, `@pyreon/vite-plugin`):**

  - **[#9](https://github.com/pyreon/pyreon/issues/9)/[#10](https://github.com/pyreon/pyreon/issues/10)/[#11](https://github.com/pyreon/pyreon/issues/11) `pyreon-intercept.ts` pre-filter regexes** — bound
    `[^}]+` / `[^)]+` greedy quantifiers with `{0,500}` / `{1,500}`
    caps. Pre-filter is a SCAN before the precise AST walker; losing
    detector recall on pathologically long single-line input is
    acceptable.
  - **[#12](https://github.com/pyreon/pyreon/issues/12)/[#13](https://github.com/pyreon/pyreon/issues/13) `ssg-audit.ts` dynamic-route detection** — replaced
    `/\[.+\]/` with `/\[[^\]]+\]/`. Filename basenames are OS-bounded
    (~255 chars) anyway, but `[^\]]+` removes the backtrack potential
    entirely.
  - **[#16](https://github.com/pyreon/pyreon/issues/16) `vite-plugin.ts` ISLAND_CALL_RE** — bound `[\s\S]*?` lazy
    match to `[^}]{0,500}`. Real island() option blocks are tiny.
  - **[#17](https://github.com/pyreon/pyreon/issues/17) `vite-plugin.ts` NAMED_EXPORT_RE** — bound `[^}]+` to
    `[^}]{1,500}`. Real `export { … }` blocks fit easily.
  - **[#18](https://github.com/pyreon/pyreon/issues/18)/[#19](https://github.com/pyreon/pyreon/issues/19) `vite-plugin.ts` `split(/\s+as\s+/)`** — replaced with
    a pre-compiled `AS_SPLIT_RE = /\s{1,10}as\s{1,10}/` at module
    scope. Bounded `{1,10}` quantifiers eliminate worst-case
    backtracking while keeping every realistic import-specifier
    formatting matchable.

  **Workflows (`.github/workflows/`):**

  - **[#1](https://github.com/pyreon/pyreon/issues/1) perf.yml + [#54](https://github.com/pyreon/pyreon/issues/54) audit-leak-classes.yml** — added top-level
    `permissions: contents: read` block. Both workflows are read-only
    (perf records artifacts; audit reports findings).
  - **[#2](https://github.com/pyreon/pyreon/issues/2) release.yml** — restructured permissions: top-level
    `contents: read` (default), per-job `contents: write` +
    `pull-requests: write` + `id-token: write` on `stable` and
    `prerelease` (both publish via OIDC trusted publishing).
  - **[#55](https://github.com/pyreon/pyreon/issues/55)/[#56](https://github.com/pyreon/pyreon/issues/56)/[#57](https://github.com/pyreon/pyreon/issues/57) audit-leak-classes.yml** — pinned `actions/checkout`,
    `oven-sh/setup-bun`, `actions/upload-artifact` by full commit SHA.
    Same SHAs as the rest of `.github/workflows/` (the project's
    existing pinning convention).

  ### Dismissed via API (20 false positives / won't fix)

  **True false positives (9):**

  - **[#28](https://github.com/pyreon/pyreon/issues/28)** `js/clear-text-logging` on `batch.ts:120` — CodeQL matched
    "MAX_PASSES" as if it contained "password". Log is about
    effect-flush pass count.
  - **[#25](https://github.com/pyreon/pyreon/issues/25)/[#26](https://github.com/pyreon/pyreon/issues/26)** `js/bad-code-sanitization` on `vite-plugin.ts:1037,1307`
    — `JSON.stringify()` IS the canonical safe-embed for a string into
    emitted JS code.
  - **[#23](https://github.com/pyreon/pyreon/issues/23)/[#24](https://github.com/pyreon/pyreon/issues/24)** `js/prototype-pollution-utility` on `reconcile.ts:103,107`
    — `DANGEROUS_KEYS.has(key)` guard at line 93 already blocks
    `__proto__` / `constructor` / `prototype` before the assignment.
  - **[#34](https://github.com/pyreon/pyreon/issues/34)/[#35](https://github.com/pyreon/pyreon/issues/35)/[#36](https://github.com/pyreon/pyreon/issues/36)** `js/incomplete-sanitization` on `manifest/render.ts`
    - `mcp/index.ts` — `.replace(/\|/g, '\\|')` is markdown table-cell
      escaping of INTERNAL manifest API metadata (built at gen-docs time
      from `defineManifest()` values), not user-input sanitization.
  - **[#52](https://github.com/pyreon/pyreon/issues/52)** `js/http-to-file-access` on `font.ts` — deterministic font-
    file fetch resolved from CSS `@font-face` declarations parsed at
    build time, then written to a per-project cache dir keyed by a
    base64 hash of the URL. Not user-driven HTTP content writing to
    arbitrary paths.

  **Won't fix (internal dev tooling, not security boundaries):**

  - **[#42](https://github.com/pyreon/pyreon/issues/42)/[#43](https://github.com/pyreon/pyreon/issues/43)/[#44](https://github.com/pyreon/pyreon/issues/44)/[#45](https://github.com/pyreon/pyreon/issues/45)/[#47](https://github.com/pyreon/pyreon/issues/47)/[#48](https://github.com/pyreon/pyreon/issues/48)** `js/file-system-race` — CLI scaffolding
    (`pyreon context`, `create-zero`), build-time Vite plugin
    (`icons-plugin`), internal scripts (`check-bundle-budgets`,
    `serve-ssg`). Single-process, single-developer environments; no
    malicious actor with concurrent filesystem access in the threat
    model.
  - **[#30](https://github.com/pyreon/pyreon/issues/30)/[#31](https://github.com/pyreon/pyreon/issues/31)** `js/shell-command-injection-from-environment` —
    internal repo audit (`audit-codebase`) + benchmark harness
    (`bench/run-all`). Args controlled entirely by the script author,
    not external input.
  - **[#49](https://github.com/pyreon/pyreon/issues/49)/[#50](https://github.com/pyreon/pyreon/issues/50)** `js/indirect-command-line-injection` — internal git-
    affected-packages selectors (`affected.ts`, `e2e-affected.ts`).
    Args are git refs from the GitHub Actions workflow event.
  - **[#3](https://github.com/pyreon/pyreon/issues/3)** `PinnedDependenciesID` on `release-native.yml:252`
    (`npm install -g npm@latest`) — npm 11.5.1+ is the documented
    requirement for OIDC trusted publishing. Pinning an exact version
    blocks security patches; the OIDC token + Sigstore provenance is
    the actual supply-chain guarantee.

  ### Remaining (cannot be closed by a code PR)

  - **[#4](https://github.com/pyreon/pyreon/issues/4) CodeReviewID** — Scorecard counts review approvals per merge;
    squash-merge with self-review by maintainer doesn't count.
    Project-policy issue, not code.
  - **[#5](https://github.com/pyreon/pyreon/issues/5) MaintainedID** — auto-tracks repo activity, improves
    organically.
  - **[#6](https://github.com/pyreon/pyreon/issues/6) CIIBestPracticesID** — requires registering at
    bestpractices.coreinfrastructure.org. Out of scope for this PR.
  - **[#8](https://github.com/pyreon/pyreon/issues/8) FuzzingID** — requires OSS-Fuzz integration. Significant
    infra work, out of scope.

  ### Validation

  - `@pyreon/zero` 957/958 tests pass (1 pre-existing skip)
  - `@pyreon/compiler` 1257/1257 tests pass
  - `@pyreon/vite-plugin` 104/104 tests pass
  - `@pyreon/solid-compat` 218/218 tests pass
  - `@pyreon/lint` 672/672 tests pass
  - Lint + typecheck clean across all 5 packages

  ### Closes the security/code-scanning sweep

  37 alerts → 17 fixed in code + 20 dismissed with rationale + 4
  external-posture deferred. Net open count expected after CodeQL
  re-scans: 4 (Scorecard meta-checks).

- [#747](https://github.com/pyreon/pyreon/pull/747) [`802e88b`](https://github.com/pyreon/pyreon/commit/802e88b3d132d5c73901571c805e8987eec4612a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(perf-harness): 6 leak-class diagnostic counters across the [#725](https://github.com/pyreon/pyreon/issues/725)-[#741](https://github.com/pyreon/pyreon/issues/741) fix sites

  Adds dev-gated perf-harness counters at every site fixed during the
  8-PR leak-class sweep ([#725](https://github.com/pyreon/pyreon/issues/725)-[#741](https://github.com/pyreon/pyreon/issues/741)). The counters are zero-cost in
  production (`process.env.NODE_ENV` gate folds to `false`; the optional-
  chain on `globalThis.__pyreon_count__?.()` short-circuits when no
  consumer is installed) and free in dev unless `perfHarness.install()`
  is called by the consumer.

  Diagnostic shape: each counter emits at a load-bearing point in the
  fix's code path. If the fix regresses (clearTimeout falls out of a
  finally, refcount guard fails, sweep doesn't fire), the counter
  either stops emitting OR diverges from its expected pair. CI's
  nightly perf-results comparison via `bun run perf:diff` will surface
  the regression before it ships.

  ### 6 new counters

  | Counter                                      | Class | Fix site                                                                             | Healthy shape                        |
  | -------------------------------------------- | ----- | ------------------------------------------------------------------------------------ | ------------------------------------ |
  | `isr.revalidate.timerClear`                  | I     | [#734](https://github.com/pyreon/pyreon/issues/734) `isr.ts revalidate()`            | = revalidate-attempt count           |
  | `theme.initRefAcquire`                       | D     | [#734](https://github.com/pyreon/pyreon/issues/734) `theme.tsx initTheme()`          | bounded by # of mounted ThemeToggles |
  | `theme.initRefRelease`                       | D     | same                                                                                 | paired with acquire, monotonic       |
  | `solid-compat.createResource.staleDiscarded` | F     | [#737](https://github.com/pyreon/pyreon/issues/737) `createResource`                 | non-zero under refetch races         |
  | `solid-compat.createStore.signalEvicted`     | C     | [#737](https://github.com/pyreon/pyreon/issues/737) `createStore` sweep              | spikes during sweep cycles           |
  | `svelte-compat.subscribe.cachedRePush`       | D     | [#739](https://github.com/pyreon/pyreon/issues/739) `writable.subscribe` cached path | non-zero during parent re-renders    |
  | `vite-plugin.watchChange.delete`             | C     | [#741](https://github.com/pyreon/pyreon/issues/741) watchChange hook                 | grows with file-deletion count       |

  ### Catalog wiring

  `COUNTERS.md` gains 7 new entries (6 counters + the `theme.initRef*` pair).
  Each documents:

  - Exact source file
  - "Healthy number looks like" description (the diagnostic semantics)
  - The leak-class label + originating PR

  `catalog-drift.test.ts` `INSTRUMENTED_PACKAGE_ROOTS` adds 3 new entries:

  - `packages/tools/solid-compat/src`
  - `packages/tools/svelte-compat/src`
  - `packages/tools/vite-plugin/src`

  The existing `packages/zero/zero/src` entry is unchanged (already
  present for the `ssg.*` namespace). The bidirectional catalog gate
  (every emit must be cataloged; every cataloged name must have an
  emit) enforces the link going forward.

  ### Validation

  - 1555/1556 tests pass across the 5 modified packages (1 pre-existing
    zero skip):
    - `@pyreon/zero` 953/954
    - `@pyreon/solid-compat` 218/218
    - `@pyreon/svelte-compat` 55/55
    - `@pyreon/vite-plugin` 104/104
    - `@pyreon/perf-harness` 225/225 (including the catalog-drift gate)
  - Lint + typecheck clean across all 5 packages
  - Zero public-API surface change — counters are dev-only sink emissions

  ### Closes the MEDIUM followup recommendation

  Per the post-[#743](https://github.com/pyreon/pyreon/issues/743) review. Production monitoring stories for leak-class
  regressions are now structurally observable via the existing
  `perfHarness.snapshot()` / `perf:diff` flow. The LOW followup
  (`scripts/audit-leak-classes.ts` static-analysis tool) follows in a
  separate PR.

- [#753](https://github.com/pyreon/pyreon/pull/753) [`f0a33da`](https://github.com/pyreon/pyreon/commit/f0a33daff7826cd12bcbc5e6ae96ca161723d89a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `nodeAdapter` — fix two production bugs in the emitted server + add runtime-contract gate.

  The bun adapter PR ([#752](https://github.com/pyreon/pyreon/issues/752)) added the first adapter runtime-contract gate and found a real bug under it. Repeating the audit on the node adapter (the gap's most-similar sibling) surfaced **two more concrete bugs** in the emitted server harness:

  **Bug A — `GET /` falls through to SSR instead of serving the static `index.html`.** The harness mapped `/` → `clientDir/index.html` in its filePath builder but the next gate `if (ext && ext !== ".html")` excluded `.html` files from the static branch — so the root index was never served and every request for `/` ran through the SSR handler. For static-export-first deploys where `index.html` is an SPA shell, this broke the canonical pattern entirely (and disagreed with the bun adapter's behaviour, which DID serve `/` as static). Fix: drop the `.html` exclusion. `if (ext)` now serves any extension; SSR routes still have no extension and correctly fall through.

  **Bug B — `mode: 'stream'` SSR was silently buffered into a single chunk.** The harness called `await response.text()` to drain the entire Response body into a string BEFORE writing to the client socket. For Suspense streaming this defeats the whole point — every chunk queued server-side and arrived at the client all at once at the end (strictly worse than `mode: 'string'` because the buffering happens twice). Fix: pipe the Response body's `ReadableStream` reader directly to `res.write` chunk-by-chunk. For `mode: 'string'` the body is a single chunk and the loop runs once with identical observable behaviour. For `mode: 'stream'` chunks land at the client incrementally.

  **New gate**: `node adapter — runtime contract` describe block in `packages/zero/zero/src/tests/adapters.test.ts` adds 5 specs:

  1. SSR fallback for non-static paths.
  2. Static `.js` file served with `immutable` cache-control.
  3. **`GET /` serves the static `index.html`** (Bug A regression lock).
  4. **Streamed SSR chunks arrive incrementally** (Bug B regression lock — the 3-chunk × 150ms-spaced mock produces a >100ms gap between first and last chunk arrival; pre-fix the gap was ~0).
  5. SSR response status + headers correctly forwarded.

  **Bisect-verified per fix**:

  - Revert just Bug A's `.html` exclusion → spec [#3](https://github.com/pyreon/pyreon/issues/3) fails with `expected received string to contain "STATIC INDEX HTML"`; other 4 pass. Restored → all 5 pass.
  - Revert just Bug B's pipe → spec [#4](https://github.com/pyreon/pyreon/issues/4) fails with `Node server failed to start within 10000ms` (the buffered server can't respond to the 200ms readiness ping during the 300ms streaming delay — a great demonstration of Bug B's real impact); other 4 pass. Restored → all 5 pass.
  - Both restored together: 5/5 pass × 5 stability runs, full zero suite 962/962 (1 skipped pre-existing). Lint + typecheck clean. No lockfile drift.

  Second adapter to gain a runtime-contract gate (after bun, [#752](https://github.com/pyreon/pyreon/issues/752)). Same proven shape — spawn the emitted entry as a subprocess, drive real HTTP requests, assert on responses. Each spec ~60-370ms (300ms for the streaming spec, 60ms for the others). The four-spec pattern (SSR fallback / static asset / root index / response forwarding) generalises to the remaining cloud adapters (Cloudflare via `wrangler dev`, Vercel via `vercel dev`, Netlify via `netlify dev`) — separate follow-up PRs since each needs its own ~150 MB CLI install.

  Path-traversal-specific test deliberately omitted — same rationale as the bun PR (both `node:http`'s parser and the URL spec's `new Request(url)` normalization collapse `..` segments BEFORE the bytes reach the handler; the in-harness check is defense-in-depth that can't be exercised through a spec-compliant HTTP path).

- [#734](https://github.com/pyreon/pyreon/pull/734) [`6eb1f57`](https://github.com/pyreon/pyreon/commit/6eb1f5745dde032dd94b91965f5299ea54ab5a63) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(zero): post-[#725](https://github.com/pyreon/pyreon/issues/725)/[#729](https://github.com/pyreon/pyreon/issues/729)/[#730](https://github.com/pyreon/pyreon/issues/730)/[#733](https://github.com/pyreon/pyreon/issues/733) leak-class sweep — `<ThemeToggle>` matchMedia/effect pile-up + ISR `revalidate` orphaned setTimeout

  Audit pass across `packages/zero/*` (4 packages) for the same patterns
  behind [#725](https://github.com/pyreon/pyreon/issues/725) (position-based pop on shared module-level stack),
  [#729](https://github.com/pyreon/pyreon/issues/729) (sibling-unmount LIFO violation), [#730](https://github.com/pyreon/pyreon/issues/730) (refcount under-count +
  inflight-cache rejection), and [#733](https://github.com/pyreon/pyreon/issues/733) (vue-compat context-stack leak +
  lint AstCache unbounded).

  Surface area is large (~5,500 lines of plugin + runtime code across
  zero, zero-cli, create-zero, meta) but the **zero packages are
  structurally clean** — no `[#725](https://github.com/pyreon/pyreon/issues/725)`-shape position-based stack ops on
  shared mutable state, no `[#730](https://github.com/pyreon/pyreon/issues/730)`-shape promise-queue rejection bugs,
  and every module-level cache (`prefetched` Map in `link.tsx`, ISR
  LRU + revalidating Set, rate-limit store, `entry-server` request
  WeakMap, vite-plugin WeakMap caches) is already bounded.

  This PR fixes the 2 real-impact bugs the audit surfaced and
  documents 1 minor dev-only HMR consideration.

  ### 1. `<ThemeToggle>` — N instances → N matchMedia listeners + N effects

  `initTheme()` was non-idempotent. Each `<ThemeToggle />` instance
  called `initTheme()` in its render body, and `initTheme()` registered
  an `onMount(() => …)` callback. The callback added one
  `matchMedia('(prefers-color-scheme: dark)').change` listener AND one
  `effect()` to mirror the resolved theme to the document — both
  pointed at the SAME module-level `_osPrefersDark` signal and the
  SAME `document.documentElement`.

  Real-app symptom: an app with 2+ `<ThemeToggle>` widgets (header +
  footer is the canonical shape) — or `<ThemeToggle>` mounted
  alongside an explicit `initTheme()` call in `_layout.tsx` (which
  the JSDoc literally recommends) — registers N media-query listeners

  - N effects. Each OS color-scheme flip then fires N redundant
    updates writing the SAME value to `document.documentElement.dataset.theme`
    and the SAME value to N favicon links. Class D event-listener pile-up.

  Fix: refcount-based idempotent setup. First mount runs the real
  setup (localStorage read + matchMedia listener + effect); subsequent
  mounts only bump the refcount. Each unmount decrements; when the
  count returns to 0 the shared teardown runs. The fix preserves the
  "all instances unmounted, new instance mounts" symmetry — the
  refcount can return to 0 and re-arm.

  ### 2. `createISRHandler.revalidate()` — orphaned timeout per success

  `revalidate()` set a 30s `setTimeout` via `Promise.race` to bound
  hung handlers, then did NOT clear the timer when `handler(req)` won
  the race (the success path — i.e. every healthy revalidation). Each
  background revalidation therefore left one pending timer for up to
  `REVALIDATE_TIMEOUT_MS` (default 30s), each pinning a closure + the
  rejection callback. Under sustained revalidation traffic on a
  high-RPS deployment, hundreds of pending timers pile up before
  they self-clear.

  Fix: capture the timer id and `clearTimeout` in `finally` so the
  success path tears down the rejection branch immediately.

  ### 3. `actionRegistry` — dev-only HMR caveat (documented, not coded)

  `defineAction()` mints a fresh `crypto.randomUUID()` and stores
  `{ id, handler }` in a module-level Map. Under Vite HMR, the module
  re-runs → new UUID → orphaned entry. Bounded by the count of
  distinct UUIDs minted in the session; a realistic dev session sees
  <50 entries, total dev-memory cost <5KB. **Production registers
  each module exactly once at startup — no leak.** A
  FinalizationRegistry-based purge is tracked as a follow-up; the
  current cost is too small to justify the WeakRef/finalizer
  complexity (the playbook precedent — [#733](https://github.com/pyreon/pyreon/issues/733)'s `lint/AstCache` —
  fixed a leak that grew to hundreds of MB).

  Documented inline in `actions.ts` so future contributors see the
  trade-off before reaching for a "fix."

  ### Regression tests + bisect

  - `packages/zero/zero/src/tests/theme-init-leak-repro.test.ts`
    (2 specs) — 3 and 5 mounted ThemeToggles register exactly ONE
    matchMedia listener. **Bisect-verified**: reverted refcount logic
    in `initTheme` → both specs fail with `expected 1 times, but got
3 times` / `got 5 times`; restored → 2/2 pass.
  - `packages/zero/zero/src/tests/isr-revalidate-timer-leak-repro.test.ts`
    (1 spec) — 5 successful revalidations leave zero pending revalidate
    timers (instruments `globalThis.setTimeout` / `clearTimeout`).
    **Bisect-verified**: removed `clearTimeout(timeoutId)` from the
    `finally` block → spec fails with `expected 5 to be 0`; restored
    → 1/1 pass.

  ### Validation

  - `@pyreon/zero` 947/948 tests pass (1 pre-existing skip, +3 new
    regression specs)
  - Lint + typecheck clean across all 4 zero packages
  - Zero public-API breakage; `_resetInitThemeForTests` is `@internal`

  ### Audit byproducts (NOT in this PR — deliberately scoped follow-ups)

  The audit also surfaced several LOW patterns worth noting:

  1. **`@pyreon/zero` `ssg-plugin.ts` 3× same `Promise.race` shape** —
     lines 517, 1159, 1402 (build-time SSG render timeouts, mode
     switch timeouts). Lower impact than `isr.ts` because each runs
     during `vite build`, not per-request — total pending-timer count
     is bounded by the route count + finished within the build window.
     Worth fixing for consistency; deferred to keep this PR small.
  2. **`@pyreon/zero` `csp.ts` `_clientNonce` cross-request mutation** —
     mutable module-level variable used as a request-scoped fallback.
     Correctness hazard (cross-request bleed) more than a leak; the
     primary read path uses the per-request locals object so the
     fallback is rare. Worth a follow-up to remove the module-level
     mutation entirely.
  3. **`@pyreon/zero` `actions.ts` FinalizationRegistry purge** — as
     described above, the WeakRef/finalizer treatment of `actionRegistry`
     for HMR cleanup. Tracked, deferred for cost/benefit.

  Plus several confirmed-bounded patterns NOT changed: `link.tsx`
  `prefetched` Map (200-entry FIFO cap), `isr.ts` cache (LRU-capped),
  `rate-limit.ts` store (10000-cap + expired sweep), `entry-server.ts`
  request-keyed WeakMap (GC-safe), `vite-plugin.ts` per-instance
  WeakMap caches (GC-safe).

  ### `pyreon doctor` baseline

  Saved at `/tmp/doctor-zero-baseline.json`. 25 findings across
  `packages/zero/*`: 0 errors + 20 warnings + 5 infos. Top patterns:
  `no-error-without-prefix` (8), `no-unbatched-updates` (4),
  `no-raw-addeventlistener` (2), `process-dev-gate` (2),
  `raw-remove-event-listener` (2). Separate hardening pass; this PR
  addresses the structural bugs not caught by static lint rules.

- [#735](https://github.com/pyreon/pyreon/pull/735) [`1a23287`](https://github.com/pyreon/pyreon/commit/1a23287ebd180aeae14a31eca21fd490145b989e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(zero): ssg-plugin Promise.race timer leaks (×2, same shape as [#734](https://github.com/pyreon/pyreon/issues/734)) + csp.ts `_clientNonce` cross-request bleed

  Follow-up to [#734](https://github.com/pyreon/pyreon/issues/734)'s leak-class sweep, closing 2 of the 3 LOW patterns
  disclosed in that PR's "audit byproducts" section.

  ### 1. `ssg-plugin.ts` — orphaned 30s timeout per successful render (×2)

  Same exact shape as [#734](https://github.com/pyreon/pyreon/issues/734)'s `isr.ts revalidate()` fix. Two sites in
  `ssg-plugin.ts` ran `Promise.race([work, new Promise((_, reject) =>
setTimeout(reject, 30_000))])` without clearing the timer when `work`
  won the race:

  - `renderOne(p)` — per-path SSG render (line 1156)
  - 404 render loop — per-locale 404 emission (line 1399)

  Each successful render left one pending 30s timer pinning a closure +
  rejection callback. Bounded by route count + finished within the build
  window so the production impact is small (every modern Node GC handles
  N pending timers fine until they self-clear), but worth fixing for
  consistency with the isr.ts repair AND because the per-path concurrent
  worker pool (default `concurrency: 4`) can have up to 4 timer closures
  in flight simultaneously on large sites.

  Fix: capture the timer id and `clearTimeout` in a new `finally` block
  on each try/catch. Identical pattern to the isr.ts fix.

  The audit's prior "3 sites" disclosure was off — line 517 is the
  `_atomicSeq` variable, not a Promise.race timer. Only 2 sites needed
  fixing.

  ### 2. `csp.ts` — `_clientNonce` cross-request bleed

  `cspMiddleware` wrote per-request nonces to a module-level
  `_clientNonce` variable, then `useNonce()` read that variable as a
  "client-side fallback" when `locals.cspNonce` was undefined. Two
  problems:

  1. **Server-side cross-request bleed**: with concurrent SSR requests,
     request A's nonce would overwrite `_clientNonce` before B finished
     rendering. If any render path bypassed the locals-context plumbing
     (a custom middleware order, a route renderer that didn't go through
     `provideRequestLocals`), B's `useNonce()` could read A's nonce.
  2. **Client-side fallback was always-`''`**: the "Client/dev: falls
     back to module-level variable set by middleware" JSDoc claim was
     broken-by-design. Middleware doesn't run in the browser, so
     `_clientNonce` was always the build-time initial value `''` on
     the client.

  Fix: remove the module-level variable entirely. `useNonce()` returns
  `''` when no per-request locals context is active. Nonces are SSR-only
  by design — a script-tag nonce should be rendered during SSR through
  `useNonce()` so the value the browser sees IS the value the response's
  `Content-Security-Policy` header authorized. JSDoc updated to clarify
  this contract.

  ### Regression tests + bisect

  - `packages/zero/zero/src/tests/csp.test.ts` updated. Removed the
    "useNonce returns the nonce set by middleware" test (it was
    inadvertently exercising the bug — it called `useNonce()` outside
    any request context and asserted it returned `localsA.cspNonce`,
    which only worked via the `_clientNonce` cross-request bleed).
    Added: "useNonce returns empty string outside any request context
    (no cross-request bleed)" — runs the middleware TWICE with
    different nonces, asserts `useNonce()` returns `''` between and
    after both. **Bisect-verified**: restored `_clientNonce` + module
    writes → spec fails with `expected '<base64 nonce>' to be ''`;
    restored → 16/16 csp tests pass.
  - ssg-plugin fix is **mechanical copy-paste** of the same `let
timeoutId; try { ... } finally { if (timeoutId) clearTimeout }`
    shape proven by [#734](https://github.com/pyreon/pyreon/issues/734)'s `isr-revalidate-timer-leak-repro.test.ts`.
    A dedicated test would require extracting `renderOne` from inside
    `closeBundle`'s closure (significant refactor); the isr.ts test
    already proves the pattern works, and full `@pyreon/zero` 947/948
    tests still pass.

  ### Validation

  - `@pyreon/zero` 947/948 tests pass (1 pre-existing skip)
  - Lint + typecheck clean across all 4 zero packages
  - No public-API breakage — `useNonce()` signature unchanged

  ### Remaining `actions.ts` follow-up

  The 3rd LOW pattern from [#734](https://github.com/pyreon/pyreon/issues/734) (`actionRegistry` HMR FinalizationRegistry
  purge) stays deferred — <5KB dev-only ceiling is too small to justify
  the WeakRef/finalizer complexity. The JSDoc note added in [#734](https://github.com/pyreon/pyreon/issues/734) already
  documents the trade-off.

- Updated dependencies [[`6454cb7`](https://github.com/pyreon/pyreon/commit/6454cb794bb82db11e7842cb4a62a3765e3dd3ac), [`6571df8`](https://github.com/pyreon/pyreon/commit/6571df8209c5dc72619194ffe19359765b1d2d7f), [`97b0e19`](https://github.com/pyreon/pyreon/commit/97b0e19533056e9cb3d9997401effc79b0f6760b), [`af4d5d8`](https://github.com/pyreon/pyreon/commit/af4d5d83fc087d738dbe5084950476566d488d77), [`f833a99`](https://github.com/pyreon/pyreon/commit/f833a997bbc04aa5ba94d0d5dd334628871aaa9a), [`1d825c2`](https://github.com/pyreon/pyreon/commit/1d825c2374a39833881c490887602354a7d590af), [`e1939bd`](https://github.com/pyreon/pyreon/commit/e1939bd49d185c6522b61f06c5a27cf2b91392a4), [`0036dfc`](https://github.com/pyreon/pyreon/commit/0036dfcb58a0ad33bce8118a3d927f1c09c63b27), [`2976aa8`](https://github.com/pyreon/pyreon/commit/2976aa84213b479b4d045a83143b3a4a3d89aedf), [`802e88b`](https://github.com/pyreon/pyreon/commit/802e88b3d132d5c73901571c805e8987eec4612a), [`7632934`](https://github.com/pyreon/pyreon/commit/763293492a26d48e4a7b1b28e42a519677702b35), [`441b5df`](https://github.com/pyreon/pyreon/commit/441b5dfa64ae52002d3e6612ec68566344ae999d), [`f40c1eb`](https://github.com/pyreon/pyreon/commit/f40c1eb35055e86fbac273352904bc2b04542f1f)]:
  - @pyreon/vite-plugin@0.23.0
  - @pyreon/core@0.23.0
  - @pyreon/server@0.23.0
  - @pyreon/runtime-server@0.23.0
  - @pyreon/head@0.23.0
  - @pyreon/runtime-dom@0.23.0
  - @pyreon/reactivity@0.23.0
  - @pyreon/router@0.23.0
  - @pyreon/meta@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies [[`33ce726`](https://github.com/pyreon/pyreon/commit/33ce726710d776abc563f7a0fed6a8ac93c9213d)]:
  - @pyreon/head@0.22.0
  - @pyreon/server@0.22.0
  - @pyreon/meta@0.22.0
  - @pyreon/core@0.22.0
  - @pyreon/reactivity@0.22.0
  - @pyreon/router@0.22.0
  - @pyreon/runtime-dom@0.22.0
  - @pyreon/runtime-server@0.22.0
  - @pyreon/vite-plugin@0.22.0

## 0.21.0

### Patch Changes

- [#713](https://github.com/pyreon/pyreon/pull/713) [`95ff116`](https://github.com/pyreon/pyreon/commit/95ff1160e43adceb024c0a897353fb675d20c7bf) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(favicon): SVG favicon now follows the theme toggle (was silently dead)

  `faviconPlugin({ source: 'x.svg', darkSource: 'x-dark.svg' })` emitted a single static `<link rel="icon" type="image/svg+xml" href="/favicon.svg">` with no `data-favicon-theme`/`media`. The theme-swap script + `initTheme()` only toggle `[data-favicon-theme]` links, and browsers prefer an SVG favicon over PNG when both are present — so the carefully theme-toggled PNG variants were never displayed and the favicon never changed with the app theme, in dev or prod, in every modern browser. The `darkSource` JSDoc also documented a `prefers-color-scheme` mechanism that was unimplemented (and would only track the OS, not a manual in-app toggle).

  Fix — the SVG favicon now participates in the same `data-favicon-theme` contract as the PNG dual-variant, across every surface:

  - `transformIndexHtml` + `faviconLinks` (SSR): when `darkSource` is set, emit two theme-aware SVG links — `/favicon-light.svg` (`data-favicon-theme="light"`) and `/favicon-dark.svg` (`data-favicon-theme="dark"`, `media="not all"`) — instead of one static link. The existing swap script / `initTheme()` already toggle them; the `?v=` cache-bust loop already stamps them.
  - Build (`generateFaviconSet`) emits `favicon-light.svg` (source) + `favicon-dark.svg` (darkSource) alongside the existing wrapped `favicon.svg` (kept as the no-JS / direct-`/favicon.svg`-reference OS-`prefers-color-scheme` fallback only).
  - Dev (`configureServer`) serves `/favicon-light.svg` → source and `/favicon-dark.svg` → darkSource (locale-aware; dev-badge / `devSource` applies to the light/active variant, matching the `/favicon.svg` handler).
  - `darkSource` JSDoc rewritten to describe the actual app-toggle behaviour.

  No-dark and PNG sources are unchanged (single `/favicon.svg`, no `data-favicon-theme`). Bisect-verified regression tests added (`favicon-plugin-hooks.test.ts` transform path + `favicon.test.ts` SSR `faviconLinks`).

- [#711](https://github.com/pyreon/pyreon/pull/711) [`82b2e3b`](https://github.com/pyreon/pyreon/commit/82b2e3b983d97039999da8d5a1518a387ad683a3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(image-plugin): dev-mode `?optimize` served raw filesystem paths → 404

  `loadDevImage` decided the dev URL with `rawPath.startsWith('/') ? rawPath : '/@fs/' + absPath`. Since the build-mode `resolveId` fix made `rawPath` an absolute filesystem path for relative/aliased imports (`/Users/…/img.png`), `startsWith('/')` was `true`, so the browser fetched `http://localhost:5173/Users/…/img.png` → 404 / broken image in `vite dev`. Build mode was unaffected (separate `processImage` path, emits hashed `dist/` assets).

  `loadDevImage` now uses the same `existsSync(rawPath)` discriminator the `absPath` derivation already uses: a real on-disk file (relative/aliased import) is routed through Vite's `/@fs/` prefix; only an unresolved `/foo.png`-style public-dir web path is served as-is (Vite serves `public/` at the web root). Bisect-verified regression test added covering both branches.

- [#714](https://github.com/pyreon/pyreon/pull/714) [`9204800`](https://github.com/pyreon/pyreon/commit/9204800d79b5c8167ff176e78ba5f324f43de9e2) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(zero): ship the `?optimize` / `?component` / `?raw` ambient types out of the box

  `@pyreon/zero` documents `import hero from './x.jpg?optimize'` and exports the exact `ProcessedImage` return type, but shipped no resolvable ambient `declare module` for its custom Vite import queries — so the documented usage failed `tsc --noEmit` for every consumer, each forced to hand-author a `declare module "*?optimize"` and keep it manually in sync with `ProcessedImage` (silent drift). Ecosystem precedent: `vite/client`, `vite-imagetools/client`, `vite-plugin-pwa/client` all ship their query ambients.

  Root cause was a **packaging gap, not missing types**: the correct ambient declarations (covering `*.{jpg,jpeg,png,webp,avif}?optimize` → `ProcessedImage`, `*.svg?component` → `ComponentFn`, `*.svg?raw` → `string`) already existed, but there was no `exports["./image-types"]`, so the documented `/// <reference types="@pyreon/zero/image-types" />` could not resolve.

  Fix:

  - Wire `./image-types` as a real build entry — `{ "bun": "./src/image-types.ts", "import": "./lib/image-types.js", "types": "./lib/types/image-types.d.ts" }` (mirroring `./client`). `vl_rolldown_build` derives a build **entry** from every exports subpath, so the source must be a buildable `src/image-types.ts` — a hand-authored `.d.ts` with no `.ts` failed the zero build with `[UNRESOLVED_ENTRY] src/image-types.ts`. The build compiles it to an empty `lib/image-types.js` and DTS-emits the ambients verbatim to `lib/types/image-types.d.ts` (a real `.d.ts` → always ambient + `moduleDetection`-exempt for consumers).
  - `src/image-types.ts` is excluded from zero's own `tsc --noEmit`: the repo tsconfig sets `moduleDetection: force`, which would read `declare module '*.svg?raw'` in a `.ts` as an augmentation of a non-existent module (TS2664). It carries no logic; the emitted `.d.ts` is the contract (covered by the build's DTS emit + the regression test).
  - The internal `ProcessedImage` import uses the package self-ref `import('@pyreon/zero/image-plugin')` — resolution-stable in the published layout (resolves through the consumer's `./image-plugin` export to the clean `lib/types` declaration, not the full `src` `.ts`) and re-uses the plugin's own type so the ambient **can never drift**.

  Consumers now add one line to any tsconfig-covered `.d.ts`:

  ```ts
  /// <reference types="@pyreon/zero/image-types" />
  ```

  Additive, non-breaking. Packaging regression test added (`image-types-export.test.ts`, 7 specs) pinning the build-entry export shape, the deleted `.d.ts`, exclusion from zero's tsc, every declared query module, and the resolution-stable self-ref.

- Updated dependencies [[`2b39231`](https://github.com/pyreon/pyreon/commit/2b3923112e6b06b5fd2cd3a3daa1425e7a6f755c), [`d04eca2`](https://github.com/pyreon/pyreon/commit/d04eca2eb8a91da3e660253a2f1cb47a96280adc)]:
  - @pyreon/head@0.21.0
  - @pyreon/meta@0.21.0
  - @pyreon/core@0.21.0
  - @pyreon/reactivity@0.21.0
  - @pyreon/router@0.21.0
  - @pyreon/runtime-dom@0.21.0
  - @pyreon/runtime-server@0.21.0
  - @pyreon/server@0.21.0
  - @pyreon/vite-plugin@0.21.0

## 0.20.0

### Patch Changes

- [#655](https://github.com/pyreon/pyreon/pull/655) [`cc3003c`](https://github.com/pyreon/pyreon/commit/cc3003c3e7ab2e8b9649c3aa6b5e001506916a0d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `faviconPlugin`: (1) fail the production build loudly when `sharp` is missing instead of silently shipping zero favicons; (2) cache-bust injected favicon `<link>` hrefs with a content-hash `?v=` query so a changed icon is actually re-downloaded by returning visitors.

  Previously, if a `source` was configured but `sharp` wasn't installed, the plugin emitted a single swallow-able `console.warn` and generated nothing — `vite build` "succeeded" and the deployed site had **no favicons at all**, with no signal. That's the footgun.

  Now: **dev** keeps the soft one-time warning (favicons just don't appear locally — iteration isn't blocked). A **production `vite build`** with a configured `source` and `sharp` missing is a **hard, actionable error** (`this.error` in `generateBundle`) — the build aborts with the install command, the source path, and the opt-out. To intentionally build without favicons, remove `faviconPlugin()`.

  Bisect-proven via real `vite build`:

  - `sharp` missing → build aborts with the actionable message, **no `dist`** (won't silently ship faviconless).
  - `sharp` installed → build succeeds; all 8 assets (`favicon.ico/.svg`, 16/32 png, apple-touch-icon, icon-192/512, `site.webmanifest`) emitted **and** every `<head>` tag injected (`icon` svg+png, `apple-touch-icon`, `manifest`, `theme-color`).

  **Cache-busting (same PR):** browsers cache favicons extremely aggressively, so a changed icon was never re-fetched by returning visitors (stable URLs, no hash). The injected `<link>` hrefs now carry a `?v=<hash>` derived from the source file content (FNV-1a) — same bytes → identical query (no cache churn), changed bytes → new query → browser re-downloads. The dev middleware strips the query before name-matching (dev serves fresh anyway). Theme-reactive favicons are unaffected — the light/dark swap toggles the `media` attribute, not `href`, so it's orthogonal. Documented caveat: the bare `/favicon.ico` convention request (no `<link>`) and the `site.webmanifest`'s internal icon entries keep stable URLs (host cache headers / re-resolved on PWA reinstall). Proven: real 3-build stable→change→revert; bisect-verified (stamp removed → 0 stamped links); pure unit test `favicon-version.test.ts` locks the hash contract.

  Docs: new **Favicons** section in `docs/docs/zero.md` (one-source → full set + auto-injected head tags; `sharp` requirement + the dev-warn vs build-fail contract; cache-busting + caveats). No API change.

- [#655](https://github.com/pyreon/pyreon/pull/655) [`cc3003c`](https://github.com/pyreon/pyreon/commit/cc3003c3e7ab2e8b9649c3aa6b5e001506916a0d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `imagePlugin`: resolve `?optimize` / `?component` imports importer-relative + alias-aware (the way Vite resolves `?url`).

  `resolveId` embedded the raw, unresolved import id into the virtual id, so `load()` had to guess the path with cwd/`public` string math. Two documented patterns were broken (reported on bokisch.com, `@pyreon/zero@0.19.0`):

  - `import x from './img.png?optimize'` — `load()` resolved `./img.png` against **cwd** (project root), not the **importer's** directory → `ENOENT` for the exact src-tree pattern the JSDoc advertises. (`?url` worked because Vite resolves it itself.)
  - `import x from '~/assets/img.png?optimize'` (alias) — arrived already-absolute, then `join(root,'public',absPath)` **doubled** the path → `ENOENT`.

  Only an image physically in `public/` imported as `/foo.png?optimize` worked.

  Fix: `resolveId(id, importer)` now resolves the bare specifier via `this.resolve(bare, importer, { skipSelf: true })` (importer-relative + alias + extension resolution, identical to `?url`) and carries the **absolute** path through the virtual id. `load()` trusts an existing absolute path and only falls back to `<root>/public/…` for an unresolved leading-slash web path (`/foo.png?optimize`, where `this.resolve` returns null) — so that case keeps working. The same fix covers the SVG `?component` branch (same bug class).

  Regression test `image-plugin-resolve.test.ts` (sharp-free): asserts the resolveId contract for relative + alias + public-path, and exercises `load()` end-to-end through the `?component` branch. Bisect-verified: reverting `resolveId` to the raw-id form fails 3/4 (the relative, alias, and load cases); restored → 4/4.

- Updated dependencies [[`3499594`](https://github.com/pyreon/pyreon/commit/3499594585b7fcb650ac0f80be4bc355f741491b), [`2f38584`](https://github.com/pyreon/pyreon/commit/2f3858453c00e901b134dd4c15dad1eb3f793189), [`65e61eb`](https://github.com/pyreon/pyreon/commit/65e61eba20741a012b753b4c8c69045f408768b7), [`9aa21a0`](https://github.com/pyreon/pyreon/commit/9aa21a0ae858c9ca88744f4c0d3a730a5d35a29f), [`e348599`](https://github.com/pyreon/pyreon/commit/e3485990cb52c414efb4217d40d3ed24e9c461b7)]:
  - @pyreon/reactivity@0.20.0
  - @pyreon/runtime-dom@0.20.0
  - @pyreon/vite-plugin@0.20.0
  - @pyreon/core@0.20.0
  - @pyreon/head@0.20.0
  - @pyreon/router@0.20.0
  - @pyreon/runtime-server@0.20.0
  - @pyreon/server@0.20.0
  - @pyreon/meta@0.20.0

## 0.19.0

### Minor Changes

- [#595](https://github.com/pyreon/pyreon/pull/595) [`0b3e2b3`](https://github.com/pyreon/pyreon/commit/0b3e2b387d4cd6debe6a466877d2100a96ceceb9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `imagePlugin` — implement the `'color'` placeholder strategy + add per-format quality. Closes a typed-but-unimplemented bug.

  **Closed bug (the `audit-types` class):** `PlaceholderStrategy` typed `'dominant-color'` from the plugin's inception but no code path ever implemented it — the CDN, dev, and build paths each open-coded `generateBlurPlaceholder`, so `placeholder: 'dominant-color'` silently produced a blur and `placeholder: 'none'` was silently ignored in build mode (only the CDN path honored it). All three paths now route through one `generatePlaceholder` dispatcher:

  - `'blur'` (default, unchanged) — downscaled + blurred WebP base64
  - `'color'` — sharp `.stats().dominant` → ~200-byte flat-fill SVG data URI (instant paint, zero layout shift, constant size regardless of source complexity)
  - `'dominant-color'` — **deprecated alias of `'color'`**, normalized via `normalizePlaceholder`
  - `'none'` — now honored in every path, not just CDN

  **Better API — per-format quality.** `quality` now accepts a per-format map in addition to a single number:

  ```ts
  imagePlugin({ formats: ["avif", "webp"], quality: { avif: 55, webp: 75 } });
  ```

  AVIF reaches WebP-equivalent perceived quality at a much lower number, so one flat value either over-spends bytes on AVIF or under-delivers on WebP. Formats omitted from the map fall back to 80. A bare number still works unchanged (backward-compatible). Resolved once into a per-format lookup (`resolveQuality`) threaded through the CDN / dev / build paths.

  Backward-compatible: default placeholder stays `'blur'`, default quality stays `80`, the `placeholder` string contract is unchanged so `<Image>` consumes every strategy identically. `generatePlaceholder` / `resolveQuality` / `normalizePlaceholder` are `@internal` exports for unit testing (19 specs, including the bisect-locking `'none' produces no placeholder` regression that fails against the pre-dispatcher build path).

  ThumbHash placeholders, rich import queries (`?inline` / `?url` / `?meta`), and a wasm sharp-fallback are deliberately deferred to follow-up PRs.

- [#607](https://github.com/pyreon/pyreon/pull/607) [`5d40b3f`](https://github.com/pyreon/pyreon/commit/5d40b3f70ba50ecd5adbff505db45e38975f61a8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<Icon>` + `createIcon` — renders a FULL loaded SVG (Image/Link/Script family).

  `<Icon>` does **not** synthesize its own `<svg>` around hand-authored `<path>`
  children. You load a complete svg (it already contains the `<svg>` root) and
  Icon makes it container-sizable + theme-aware. Two source props:

  - `as` — an imported SVG **component** (`import X from './x.svg?component'`).
    Rendered **directly, no host wrapper**; svg attributes forward. Recommended.
  - `svg` — the raw `<svg>…</svg>` **markup string**
    (`import x from './x.svg?raw'`). Inlined via a single `<span>` host (a markup
    string can't mount without a parent — this one host is unavoidable).

  ```tsx
  import { Icon, createIcon } from '@pyreon/zero'
  import Check from './check.svg?component'
  import checkRaw from './check.svg?raw'

  <span style="width:2rem"><Icon as={Check} /></span>      // no wrapper
  <span style="width:2rem"><Icon svg={checkRaw} /></span>  // one <span> host

  export const Star = createIcon(Check)      // component → rendered directly
  export const Tick = createIcon(checkRaw)   // raw string → inlined
  ```

  Container-fill defaults (`fill="currentColor"`,
  `display:block;width:100%;height:100%`) spread-overridable; no fixed size (the
  consumer's wrapper sizes it); `fill="currentColor"` themes via CSS `color`.
  Two layers (mirrors `createLink`/`Link`, `createImage`/`Image`):
  `createIcon(source)` per-glyph factory + `Icon` one-off. Intentionally **no
  `useIcon` hook** — an icon has no composable behaviour. New exports: `Icon`,
  `createIcon`, `IconProps` (extends `SvgAttributes`), `SvgComponent`.
  Backward-compatible; no existing API changed.

  Verification: real-`h()` happy-dom mount tests in
  `packages/zero/zero/src/tests/icon.test.ts` (component form renders direct / no
  host, raw form inlines via `<span>`, defaults + prop override, `createIcon`
  both source kinds, no-source → null); manifest entries (`Icon`, `createIcon`) +
  regenerated MCP api-reference; snapshot count 25 → 27.

- [#609](https://github.com/pyreon/pyreon/pull/609) [`7eaa4f0`](https://github.com/pyreon/pyreon/commit/7eaa4f03c6a9e0d48f38647127e1fd5998dc09d1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `iconsPlugin` named multi-sets — per-set typed components, no `IconName` clash.

  Builds on `iconsPlugin` (single-set). New `sets` form:

  ```ts
  iconsPlugin({
    sets: {
      ui: { dir: "./src/icons/ui" },
      brand: { dir: "./src/icons/brand", mode: "image" },
    },
  });
  ```

  ```tsx
  import { UiIcon, BrandIcon } from './icons.gen'
  <UiIcon name="arrow-left" />     // typed UiIconName
  <BrandIcon name="logo-mark" />   // typed BrandIconName — independent union
  ```

  One generated file, one `createNamedIcon` import, a strictly-typed component
  PER set under **namespaced** names so two sets never clash: `ui` →
  `<UiIcon>` + `type UiIconName`, `brand` → `<BrandIcon>` + `type
BrandIconName`. Per-set binding prefixes (`ui_check` / `brand_check`) keep two
  sets sharing a glyph filename collision-free. `mode` is per-set (a colorful
  brand set can be `image` while the system set stays `inline`).

  `dir` and `sets` are mutually exclusive — the plugin throws `[Pyreon]
iconsPlugin: provide EXACTLY ONE of dir or sets` at config time if both or
  neither is given. The dev watcher watches every set's folder; regeneration is
  still idempotent. New exports: `IconSetConfig`, `NamedSetInput`,
  `generateNamedIconSetsSource`, `componentNameFromSetKey` (server entry);
  `IconsPluginConfig.dir` is now optional alongside the new `sets` field.
  Backward-compatible — the single-`dir` form is unchanged.

  **Not in this PR (explicit follow-up):** monorepo package-sourced sets +
  copy-to-public for `mode: 'image'` assets (Vite `emitFile` / stable-URL
  contract — its own design).

  Verification: pure-generator unit tests (`src/tests/icons-plugin.test.ts` —
  `componentNameFromSetKey` PascalCase + sanitize, `generateNamedIconSetsSource`
  namespaced-per-set + one shared import + no bare `Icon`/`IconName` + per-set
  binding-prefix collision-freedom, `iconsPlugin` dir/sets XOR throw + both
  accept-forms); manifest `iconsPlugin` entry updated for the multi-set form +
  regenerated MCP api-reference; CLAUDE.md updated. typecheck 0, lint 0,
  gen-docs --check clean.

- [#607](https://github.com/pyreon/pyreon/pull/607) [`5d40b3f`](https://github.com/pyreon/pyreon/commit/5d40b3f70ba50ecd5adbff505db45e38975f61a8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `iconsPlugin` + `createNamedIcon` — point at a folder of SVGs, get a strictly-typed `<Icon name="…" />`.

  `iconsPlugin({ dir })` (from `@pyreon/zero/server`) scans `*.svg`, derives a
  kebab `name` from each filename, and writes a gitignored generated
  `icons.gen.tsx` that exports a strictly-typed `<Icon>`. Add an svg → the `name`
  union widens; remove one → an invalid `name` fails typecheck. Regenerates on
  add/unlink in dev (idempotent — never rewrites identical content).

  ```ts
  // vite.config.ts
  import { iconsPlugin } from "@pyreon/zero/server";
  plugins: [iconsPlugin({ dir: "./src/icons" })];
  ```

  ```tsx
  // app — autocompletes, rejects typos, real go-to-definition:
  import { Icon } from "./icons.gen";
  <span style="width:2rem">
    <Icon name="check-circle" />
  </span>;
  ```

  The generated file calls `createNamedIcon(REGISTRY)`, so `keyof typeof
REGISTRY` IS the type surface — zero per-app wiring. It writes a **real file**
  (not a virtual module) deliberately: the published `@pyreon/zero` can't
  `import` a plugin virtual module (Rolldown resolves static imports before
  plugin `resolveId` — the same constraint that makes islands need
  `hydrateIslandsAuto(registry)` with an explicit import).

  Two render modes per the colorful-vs-system split:

  - `mode: 'inline'` (default) — **system icons**. Each svg inlined as `?raw`
    markup via `Icon`; `currentColor`-themeable, recolor via CSS `color`.
  - `mode: 'image'` — **colorful / brand icons**. Each svg emitted as a static
    asset, rendered `<img>`. NO mutation, original colors preserved.

  `createNamedIcon<R>(registry, { mode? })` is the exported runtime half (typed
  by `keyof R`) — normally called by the generated file, callable directly for a
  hand-maintained set. New exports: `iconsPlugin`, `iconNameFromFile`,
  `scanIconDir`, `generateIconSetSource`, `IconsPluginConfig` (server entry);
  `createNamedIcon`, `IconMode`, `NamedIconProps` (client entry). Builds on the
  `Icon` / `createIcon` leaf; backward-compatible, no existing API changed.

  **Not in this PR (explicit follow-up):** named multi-sets (per-set typed
  `<UiIcon>` / `<BrandIcon>`, no `IconName` clash) + monorepo package-sourced
  sets + copy-to-public for `mode: 'image'` assets.

  Verification: pure scanner/generator unit tests
  (`src/tests/icons-plugin.test.ts` — `iconNameFromFile` kebab cases,
  `scanIconDir` filter/sort/missing-dir, `generateIconSetSource` inline vs image

  - binding-collision guard + empty set) and real-`h()` happy-dom mount tests for
    `createNamedIcon` both modes (`src/tests/icon.test.ts`); manifest entries
    (`iconsPlugin`, `createNamedIcon`) + regenerated MCP api-reference; snapshot
    count 27 → 29.

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

- [#641](https://github.com/pyreon/pyreon/pull/641) [`078b1e7`](https://github.com/pyreon/pyreon/commit/078b1e72343828b2d73f97c03e0b5b0f335fe979) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Repo sweep: duplication removal + two SSG correctness/robustness fixes.

  **`@pyreon/document` — duplication removal (behaviour-preserving).**

  - `getTextContent` (recursive node-tree → text flatten) was copy-pasted **byte-identically into 13 of the 18 renderers** (svg/pdf/pptx/xlsx/docx + every chat target). Consolidated into the package's `nodes.ts` as the single source of truth; the 13 copies replaced with an import. (text/markdown/html deliberately walk the tree differently and were left untouched.)
  - The HTML/XML escape function (`& < > "`) was copy-pasted **4×** under three names (`escapeHtml`/`escapeXml`/`esc`) into html/svg/email/telegram. Consolidated into `sanitize.ts` as `escapeXml`; renderers import it (aliased to their local names — zero call-site churn). The intentionally-distinct escapes (csv quoting, runtime-server's 5-char+perf-counter variant, the standalone compiler escapes) were correctly left alone — different algorithm/layer.
  - Net: ~80 LOC of true duplication removed, no API/behaviour change. Proven by the full `@pyreon/document` suite (441/441) — the per-renderer text/escape tests exercise the consolidated path; identical-body removal verified by `diff` (0 lines).

  **`@pyreon/zero` — sitemap duplicate `<url>` (correctness bug).** `generateSitemap` built `allPaths = [...routeScan, ...additionalPaths]` with **no dedup**. The i18n cluster path dedups via `byUnPrefixed`, but the non-i18n branch is a raw 1:1 map — so a static route present in BOTH the route scan AND `additionalPaths` (routine: SSG-emitted paths merged via `seoPlugin`) emitted a **duplicate `<url>`/`<loc>`**. (The nearby "merge dedups" comment was itself inaccurate — that merge is a plain spread.) Now deduped by path (first-wins, order-preserving) at the single source, covering both branches. Regression test: a path in both inputs → exactly one `<loc>`, `<url>` count correct. Bisect-verified.

  **`@pyreon/zero` — SSG path-escape + duplicate-path robustness (edge cases).**

  - `expandUrlPattern` substituted `getStaticPaths` param values verbatim into what becomes a `dist/<path>/index.html` write target. An unsanitized CMS slug containing `/` (in a single non-catch-all `:slug`) or `.`/`..` traversal segments would escape the intended structure. Now rejected with a clear error (catch-all `:rest*` still spans segments but still rejects `.`/`..`). Bisect-verified.
  - `autoDetectStaticPaths` had no dedup — a `getStaticPaths` returning a duplicate slug (CMS dup, pagination overlap) or i18n fan-out collision rendered the same `dist/<path>/index.html` twice (wasted work + last-write race) and fed a duplicate into the SSG→sitemap merge. Now order-preserving deduped. Bisect-verified.

  Validation: lint 0 errors; typecheck clean (document + zero); `bun run coverage` exit 0 (document 94.27 %, zero 89.24 %, all thresholds met); `verify-modes` 16/16 (all SSG cells incl. `cpa-pw-blog × ssg` which exercises `getStaticPaths` dynamic-slug enumeration end-to-end through the changed path); zero suites seo 40/40 + ssg-plugin 111/111; document 441/441.

  **Deferred (own focused PRs — analysis preserved):** router `findNotFoundFallback` cache — my earlier "just add a WeakMap" estimate was WRONG; its result depends on `urlPath` (not a pure fn of `routes`), so a correct cache needs an enumerate-candidates / pick-by-urlPath refactor, too risky for a sweep. `react-compat`/`preact-compat` `shallowEqual` + React-attr-mapping duplication → core consolidation (medium-risk cross-package). The [#626](https://github.com/pyreon/pyreon/issues/626)-documented styler `insertCache`/DOM-rule unbounded growth + `internElementBundle` css-prop. No new memory leak found this round (prior sweeps already fixed signal.\_d / computed.direct / useSortable / ISR).

- [#596](https://github.com/pyreon/pyreon/pull/596) [`e8e95bc`](https://github.com/pyreon/pyreon/commit/e8e95bc2d6785d397f4b8f85039ce76c2a7f6cea) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Component-level HMR for zero/router apps — editing a route/page component now updates the DOM in place without a manual refresh, preserving module-scope signal state.

  Previously `@pyreon/vite-plugin`'s `injectHmr` emitted a bare `import.meta.hot.accept()` (no callback): Vite re-evaluated the edited module but nothing re-rendered the mounted tree, and the self-accept suppressed Vite's full-reload fallback — so every component/JSX edit produced a silently-stale UI until a manual browser refresh.

  Now the accept callback hands the fresh module to `globalThis.__pyreon_hmr_swap__` (registered by `@pyreon/router` in a dev browser, zero import coupling). The coordinator finds every active matched lazy route whose `_hmrId` matches (emitted by `@pyreon/zero`'s fs-router as `lazy(() => import(…), { hmrId })`), swaps the component, and bumps the loading signal so `RouterView` re-renders only that subtree in place — no page reload, so module-scope signals keep their values via the existing `__pyreon_hmr_registry__`. Edits outside the active route tree (nested components, unrelated routes, signal-only modules) or apps without the coordinator fall back to `import.meta.hot.invalidate()` → an automatic full reload (still no manual refresh). Production is unaffected (dev+browser gated).

- Updated dependencies [[`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a), [`ecd8e52`](https://github.com/pyreon/pyreon/commit/ecd8e526943a1e6b07957ff96f4410fa482baa0d), [`ac1d375`](https://github.com/pyreon/pyreon/commit/ac1d37542b11cd95451a2f0b0a51cc43603d001a), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`c4b6e9a`](https://github.com/pyreon/pyreon/commit/c4b6e9a5850196171c2197fc918163f736708aa8), [`fb40906`](https://github.com/pyreon/pyreon/commit/fb409066e49e44c42f77084a92a68103a4e6c5ef), [`b4de7e0`](https://github.com/pyreon/pyreon/commit/b4de7e0f0eb9134325eb6d87db6250064a494d51), [`8e4b607`](https://github.com/pyreon/pyreon/commit/8e4b607b01c6399153bd504f1411f213db987a9a), [`7150368`](https://github.com/pyreon/pyreon/commit/7150368f85daa783e55f05541d0c45356c13b00d), [`9f03747`](https://github.com/pyreon/pyreon/commit/9f037478763d9f8cd2365feb63dc87fda2545e5d), [`3374150`](https://github.com/pyreon/pyreon/commit/33741500499dfb487d031bbffe77723d74b8f261), [`8a300bf`](https://github.com/pyreon/pyreon/commit/8a300bf0e6fe7532bb6ae4670a8d64258d64e25f), [`fa4e37f`](https://github.com/pyreon/pyreon/commit/fa4e37fa620cf0e3f240053bf789b84bd9668838), [`2ee82eb`](https://github.com/pyreon/pyreon/commit/2ee82eb340c515c16aaa7a652ffc5b0c97b59ed6), [`4f410b6`](https://github.com/pyreon/pyreon/commit/4f410b6403ce1c033f049aa6cd2700f64193b2d1), [`e8e95bc`](https://github.com/pyreon/pyreon/commit/e8e95bc2d6785d397f4b8f85039ce76c2a7f6cea)]:
  - @pyreon/reactivity@0.19.0
  - @pyreon/router@0.19.0
  - @pyreon/server@0.19.0
  - @pyreon/core@0.19.0
  - @pyreon/head@0.19.0
  - @pyreon/runtime-server@0.19.0
  - @pyreon/vite-plugin@0.19.0
  - @pyreon/runtime-dom@0.19.0
  - @pyreon/meta@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies [[`f35e69b`](https://github.com/pyreon/pyreon/commit/f35e69b2ab53474ecf0ffb792866bc27215b68c3)]:
  - @pyreon/vite-plugin@0.18.0
  - @pyreon/runtime-dom@0.18.0
  - @pyreon/core@0.18.0
  - @pyreon/head@0.18.0
  - @pyreon/reactivity@0.18.0
  - @pyreon/router@0.18.0
  - @pyreon/runtime-server@0.18.0
  - @pyreon/server@0.18.0
  - @pyreon/meta@0.18.0

## 0.17.0

### Minor Changes

- [#583](https://github.com/pyreon/pyreon/pull/583) [`af6faf7`](https://github.com/pyreon/pyreon/commit/af6faf78ce02dae1973ed845459bf714adad4fac) Thanks [@vitbokisch](https://github.com/vitbokisch)! - SSG mode now does route-level code splitting by default — parity with SSR/SPA/ISR modes which already had it.

  Pre-this-PR, SSG mode hardcoded `staticImports: true` in the route generator, bundling every route component into the main client chunk. Trade-off was instant post-hydration navigation, but the initial bundle grew linearly with route count — a 50-route docs site shipped all 50 route components on first paint. The pre-existing 3-tier `generateRouteEntry` already handled `lazy(() => import(...))` correctly for SSR/SPA; SSG was an outlier that opted out.

  Now SSG uses the same lazy-splitting logic by default. Only the landing route + its deps load up front; other routes fetch on navigation. Crossover point is ~5-8 routes: below that, single-chunk is fine and the navigation chunk-fetch is the only cost; above that, lazy splitting shrinks the initial bundle by a meaningful amount.

  New opt-out: `ssg.splitChunks: false` restores the pre-2026-Q3 single-chunk behaviour for tiny sites (2-5 pages) that prefer the bundle-everything-then-instant-nav trade.

  ```ts
  // vite.config.ts — opt out for a 3-page marketing site
  zero({
    mode: "ssg",
    ssg: { splitChunks: false },
  });
  ```

  Verified end-to-end against all 7 SSG verify-modes cells including `cpa-pw-blog` (dynamic routes + `getStaticPaths` — the case that exercises the lazy-route + namespace-import-for-build-time-export path). ISR, SSR, SPA modes are unchanged — they already had lazy splitting.

  **Migration**: zero behavior change for existing apps. To preserve the pre-this-PR behaviour, set `ssg.splitChunks: false`. The default flip is the win.

### Patch Changes

- [#582](https://github.com/pyreon/pyreon/pull/582) [`53b264b`](https://github.com/pyreon/pyreon/commit/53b264b87897a35d8418ad37ce85c805a5b7874f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/zero` Vite plugin now defaults to port 3000 — matching `zero dev` / `zero preview` (already 3000), the runtime adapter (already 3000), and Next.js / Remix / Astro convention.

  Precedence (verified end-to-end against a running example):

  1. **Vite CLI `--port N` flag** — the plugin's `config()` hook detects `--port` / `--port=N` / `-p N` / `-p=N` in `process.argv` and omits its `server.port` entirely so Vite's CLI parsing wins (proven empirically: `vite --port 5174 --strictPort` binds 5174, not 3000).
  2. **User `vite.config.ts` `server: { port: N }`** — user config beats plugin in Vite's merge order.
  3. **`zero({ port: N })`** — resolved into `config.port` and applied unconditionally (even when CLI has `--port` — explicit user intent in vite.config.ts wins over the argv detection).
  4. **Default 3000** — applied when no other source set a port (proven empirically: bare `vite` against `zero({})` binds 3000).

  The argv-detection layer is load-bearing — PR [#579](https://github.com/pyreon/pyreon/issues/579) closed because returning `server.port: 3000` from `config()` unconditionally clobbered `vite --port 517N --strictPort` in the e2e webServer (Vite's CLI flag does NOT override a plugin `config()` hook's `server.port` return — counterintuitive but empirically confirmed). The new approach uses `argvHasPortFlag(process.argv)` at the hook's firing point to decide whether to apply the default.

  Bisect-verified across 7 unit tests + 6 helper-fn tests + 2 real-Vite end-to-end runs (no flag → 3000, `--port 5174` → 5174).

- Updated dependencies [[`35af0e2`](https://github.com/pyreon/pyreon/commit/35af0e22b670151052e0b1df5006977fca759128), [`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c)]:
  - @pyreon/core@0.17.0
  - @pyreon/head@0.17.0
  - @pyreon/router@0.17.0
  - @pyreon/runtime-dom@0.17.0
  - @pyreon/runtime-server@0.17.0
  - @pyreon/server@0.17.0
  - @pyreon/reactivity@0.17.0
  - @pyreon/vite-plugin@0.17.0
  - @pyreon/meta@0.17.0

## 0.16.0

### Patch Changes

- [#555](https://github.com/pyreon/pyreon/pull/555) [`f82584b`](https://github.com/pyreon/pyreon/commit/f82584b3dfb1362d376065354d023647fdbdfa02) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `router.preload(path, request?, options?)` gains an optional third `options` argument with `skipLoaders: true` — bypasses the loader-running step while keeping lazy-component resolution intact (so the synthetic chain still renders cleanly). The SSG plugin's `__renderNotFound` now passes `{ isNotFound: true }` through `renderPath` → `router.preload(probePath, undefined, { skipLoaders: true })`, so auth-touching parent-layout loaders (`fetchUser`, session reads, private APIs) no longer fire during static 404 generation. Closes the documented "Loaders on parent layouts run during 404 render" limitation. Runtime SSR intentionally still runs loaders for 404 — analytics / audit-logging hooks that fire per-request should keep firing even when the request resolves to a not-found. Bisect-verified at the unit layer (4 new specs in `router.preload — PR C — skipLoaders`). Back-compat: the new arg is positional and optional, so 2-arg callers (`router.preload(path, request)`) continue to work unchanged.

- Updated dependencies [[`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8), [`321bac0`](https://github.com/pyreon/pyreon/commit/321bac062b68cabf66357f0362385384a96b5692), [`f82584b`](https://github.com/pyreon/pyreon/commit/f82584b3dfb1362d376065354d023647fdbdfa02)]:
  - @pyreon/core@0.16.0
  - @pyreon/router@0.16.0
  - @pyreon/meta@0.16.0
  - @pyreon/server@0.16.0
  - @pyreon/head@0.16.0
  - @pyreon/reactivity@0.16.0
  - @pyreon/runtime-dom@0.16.0
  - @pyreon/runtime-server@0.16.0
  - @pyreon/vite-plugin@0.16.0

## 0.14.0

### Patch Changes

- Updated dependencies [[`c97783a`](https://github.com/pyreon/pyreon/commit/c97783a85b6f7ffc5d25ad16fd280c92808b5ea6), [`12dbf14`](https://github.com/pyreon/pyreon/commit/12dbf14c92ea3e107c89039a269181a500cb60d4), [`83aa9ab`](https://github.com/pyreon/pyreon/commit/83aa9abbc52d423dfc9d45a3b0a4e048b161186d)]:
  - @pyreon/runtime-dom@0.14.0
  - @pyreon/runtime-server@0.14.0
  - @pyreon/vite-plugin@0.14.0
  - @pyreon/core@0.14.0
  - @pyreon/head@0.14.0
  - @pyreon/reactivity@0.14.0
  - @pyreon/router@0.14.0
  - @pyreon/server@0.14.0
  - @pyreon/meta@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [[`ec30b4e`](https://github.com/pyreon/pyreon/commit/ec30b4e2188fb493fdde77a77f521abe000beae0), [`a05c4ba`](https://github.com/pyreon/pyreon/commit/a05c4bab713f5168acd56eb233520102735bd80a)]:
  - @pyreon/router@0.13.0
  - @pyreon/core@0.13.0
  - @pyreon/meta@0.13.0
  - @pyreon/head@0.13.0
  - @pyreon/reactivity@0.13.0
  - @pyreon/runtime-dom@0.13.0
  - @pyreon/runtime-server@0.13.0
  - @pyreon/server@0.13.0
  - @pyreon/vite-plugin@0.13.0

## 0.12.15

### Patch Changes

- [#256](https://github.com/pyreon/pyreon/pull/256) [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(zero/isr): bound the in-memory ISR cache with LRU eviction

  `createISRHandler` kept an unbounded `Map<pathname, CacheEntry>` — on
  parametrised routes like `/user/:id` where `:id` is free-form, the
  cache grew without limit over the server's lifetime. Long-running
  deployments accumulated one entry per distinct URL forever.

  Fix: added `ISRConfig.maxEntries` (default: `1000`) with LRU eviction.
  Every cache read `.delete()` + `.set()`s the entry to bump it to newest
  (preserving insertion-order LRU). Writes evict the oldest entries
  until size is under the cap.

- [#256](https://github.com/pyreon/pyreon/pull/256) [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(zero/link): evict DOM `<link>` nodes when the prefetch cache rolls over

  `doPrefetch` injected `<link rel="prefetch">` and `<link rel="modulepreload">`
  elements into `document.head` with NO cleanup. The in-memory `prefetched`
  Set was capped at 200 with FIFO eviction, but the matching DOM nodes
  stayed forever. Long SPA sessions accumulated thousands of stale
  `<link>` nodes in `<head>`.

  Fix: `prefetched` is now a `Map<href, Element[]>` — when the cache
  evicts the oldest href, its matching `<link>` elements are also
  `.remove()`d from `document.head`.

- [#256](https://github.com/pyreon/pyreon/pull/256) [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(zero/theme): make `resolvedTheme()` reactive to OS color-scheme changes

  `resolvedTheme()` read `window.matchMedia('(prefers-color-scheme: dark)').matches`
  as a one-shot check — no signal tracked the OS preference. Components
  reading `resolvedTheme()` subscribed only to the `theme` signal (explicit
  user choice). When the user flipped dark mode at the OS level, the
  `<html data-theme>` attribute updated (via the `onChange` handler in
  `initTheme`), but every component using `resolvedTheme()` stayed on
  stale state — inverse theme effectively not reactive.

  Fix: introduced an `_osPrefersDark` signal that `initTheme` seeds from
  `matchMedia.matches` and updates on every `'change'` event. When
  `theme === 'system'`, `resolvedTheme()` reads `_osPrefersDark()` —
  subscribing components to both the user preference AND the OS
  preference. Changing either now re-renders the whole tree.

- Updated dependencies [[`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa), [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa), [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa), [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa), [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa)]:
  - @pyreon/router@0.12.15
  - @pyreon/runtime-dom@0.12.15
  - @pyreon/runtime-server@0.12.15
  - @pyreon/core@0.12.15
  - @pyreon/head@0.12.15
  - @pyreon/reactivity@0.12.15
  - @pyreon/server@0.12.15
  - @pyreon/vite-plugin@0.12.15
  - @pyreon/meta@0.12.15

## 0.12.14

### Patch Changes

- [#251](https://github.com/pyreon/pyreon/pull/251) [`290ea64`](https://github.com/pyreon/pyreon/commit/290ea64ee90b5e749008d2b437084fc001ad24f1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Zero meta-framework anti-pattern cleanup + lint rule precision

  `@pyreon/zero`:

  - `link.tsx` `doPrefetch`: added `typeof document === 'undefined'` early-return.
    Prefetch only fires from browser-mounted Link interactions but the explicit
    guard documents the SSR-safety contract.
  - `client.ts` `startClient`: added `typeof document === 'undefined' → throw`
    early-return. Browser entry point hard-fails in SSR with a clearer error
    than `document is not defined`.
  - `script.tsx` `loadScript`: typeof-document early-return at function entry
    (the function is only invoked from `onMount` but the rule can't
    AST-trace the indirect call).
  - Error prefix normalisation: `[zero]` / `[zero:adapter]` / `[zero:image]` /
    etc. → `[Pyreon]` across 9 source files. Test assertions updated.
  - `font.ts`: added `[Pyreon] ` prefix to two `Failed to fetch / download`
    errors.

  `@pyreon/lint`:

  - `no-window-in-ssr` and `no-dom-in-setup`: early-return-guard heuristic
    now recognises `throw` as a function-terminating statement (in addition
    to `return`). Common in entry-point functions like `startClient` that
    hard-fail in SSR rather than silently no-op.
  - `no-dom-in-setup`: added the same early-return-on-typeof-document/window
    guard tracking that `no-window-in-ssr` already had — `if (typeof document
=== 'undefined') return …` at function head implicitly guards the rest
    of the body for both rules now.
  - `BROWSER_GLOBALS`: removed `fetch`. It's a universal global in Node 18+,
    Bun, Deno, browsers, and edge runtimes. Code using `fetch` isn't
    browser-specific. (`XMLHttpRequest` and `WebSocket` remain DOM-only.)

  5 new bisect-verified regression tests for the rule changes.

- Updated dependencies [[`95e7e00`](https://github.com/pyreon/pyreon/commit/95e7e00bd3e3b3926bd8348cf91f88494605ccc6), [`779f61f`](https://github.com/pyreon/pyreon/commit/779f61f99e1f403485871c1848fc82489d20960f)]:
  - @pyreon/router@0.12.14
  - @pyreon/server@0.12.14
  - @pyreon/core@0.12.14
  - @pyreon/head@0.12.14
  - @pyreon/reactivity@0.12.14
  - @pyreon/runtime-dom@0.12.14
  - @pyreon/runtime-server@0.12.14
  - @pyreon/vite-plugin@0.12.14
  - @pyreon/meta@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.13
  - @pyreon/head@0.12.13
  - @pyreon/reactivity@0.12.13
  - @pyreon/router@0.12.13
  - @pyreon/runtime-dom@0.12.13
  - @pyreon/runtime-server@0.12.13
  - @pyreon/server@0.12.13
  - @pyreon/vite-plugin@0.12.13
  - @pyreon/meta@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.12
  - @pyreon/head@0.12.12
  - @pyreon/reactivity@0.12.12
  - @pyreon/router@0.12.12
  - @pyreon/runtime-dom@0.12.12
  - @pyreon/runtime-server@0.12.12
  - @pyreon/server@0.12.12
  - @pyreon/vite-plugin@0.12.12
  - @pyreon/meta@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.11
  - @pyreon/head@0.12.11
  - @pyreon/reactivity@0.12.11
  - @pyreon/router@0.12.11
  - @pyreon/runtime-dom@0.12.11
  - @pyreon/runtime-server@0.12.11
  - @pyreon/server@0.12.11
  - @pyreon/vite-plugin@0.12.11
  - @pyreon/meta@0.12.11

## 0.5.0

### Minor Changes

- Bump ecosystem to latest, UI system ^0.3.0, Dependabot, template fixes
  - Bump UI system to ^0.3.0, core ^0.7.12, fundamentals ^0.10.0
  - Add Dependabot for automated dependency updates
  - Fix template for @pyreon/store 0.10.0 API (useAppStore returns { store })
  - Use `latest` in static template to prevent version drift
  - Fix camelCase JSX attributes in templates (onClick, srcSet)

### Patch Changes

- Updated dependencies []:
  - @pyreon/meta@0.5.0

## 0.4.1

### Patch Changes

- Pin GitHub Actions to SHA hashes, add security policy

- Updated dependencies []:
  - @pyreon/meta@0.4.1

## 0.4.0

### Minor Changes

- Bump to Pyreon 0.7.5 core + 0.9.0 fundamentals, add state-tree, strict types
  - Bump core @pyreon/\* to ^0.7.5, fundamentals to ^0.9.0, UI system ^0.2.0
  - Use @pyreon/typescript preset for strict type checking
  - Add @pyreon/state-tree to meta re-exports
  - Fix all noUncheckedIndexedAccess and exactOptionalPropertyTypes errors
  - Add VNodeChild return types to JSX components
  - Fix integration tests with pyreon() compiler plugin
  - Bump TypeScript to 6.0.2, vitest to 4.1.1
  - Add explicit jsxImportSource + customConditions to root tsconfig (bun compat)

### Patch Changes

- Updated dependencies []:
  - @pyreon/meta@0.4.0

## 0.3.0

### Minor Changes

- Bump Pyreon ecosystem to 0.7.0 core, add charts/hotkeys/storage/flow/code
  - Bump all core @pyreon/\* deps to ^0.7.0
  - Bump fundamentals to ^0.6.0, UI system to ^0.2.0
  - Add @pyreon/charts, @pyreon/hotkeys, @pyreon/storage to meta re-exports
  - Add @pyreon/flow and @pyreon/code to meta re-exports
  - Add package strategy choice in create-zero (meta barrel vs individual packages)
  - Add charts, hotkeys, storage, flow, code as create-zero feature options
  - Use pinned version ranges instead of 'latest' in scaffolded projects
  - Fix signal setter API for Pyreon 0.7.0 (count.set/count.update)
  - Document provide() helper and onCleanup() in anti-patterns
  - Add Pyreon MCP server config (.mcp.json)

### Patch Changes

- Updated dependencies []:
  - @pyreon/meta@0.3.0

## 0.2.0

### Minor Changes

- ## @pyreon/zero

  ### New Features

  - **API routes** — file-based `.ts` handlers in `src/routes/api/` with HTTP method exports (GET, POST, PUT, DELETE)
  - **Server actions** — `defineAction()` with automatic client/server boundary detection (direct execution on server, fetch on client)
  - **Per-route middleware** — route files export `middleware` dispatched via `virtual:zero/route-middleware`
  - **Per-route renderMode** — `renderMode` export wired into route `meta.renderMode`
  - **CORS middleware** — configurable origins (string/array/function), credentials, preflight
  - **Rate limiting** — in-memory per-client limiting with `X-RateLimit-*` headers
  - **Compression** — gzip/deflate via native `CompressionStream`
  - **Testing utilities** — `createTestContext`, `testMiddleware`, `createTestApiServer`, `createMockHandler`
  - **Dev error overlay** — styled HTML overlay with source-mapped stack traces for SSR errors
  - **Dev route table** — `zero dev` prints page + API routes on startup

  ### Improvements

  - Bumped all @pyreon/\* core deps to ^0.5.4
  - Added `./actions`, `./api-routes`, `./cors`, `./rate-limit`, `./compression`, `./testing` subpath exports
  - Fixed static adapter build skip for SSG mode
  - 238 unit tests + 11 integration tests (boot real Vite dev server)

  ## @pyreon/zero-cli

  ### New Commands

  - `zero doctor` — detect React patterns (proxies @pyreon/cli)
  - `zero context` — generate AI project context
  - `zero create <name>` — scaffold a new project

  ### Improvements

  - Dev server prints route table on startup (page routes + API routes)

  ## @pyreon/create-zero

  ### New Features

  - **Interactive scaffolding** with @clack/prompts — pick rendering mode, features, AI toolchain
  - Generates customized package.json, vite.config.ts, entry files based on selections
  - AI toolchain opt-in: .mcp.json, CLAUDE.md, doctor scripts

  ## @pyreon/meta

  ### New Packages

  - `@pyreon/machine` — reactive state machines (`createMachine`)
  - `@pyreon/permissions` — reactive permissions (`createPermissions`, `usePermissions`)

  ### Updates

  - All fundamentals: query ^0.5.0, virtual ^0.5.0
  - All UI system: ^0.1.1 (styler, hooks, elements, coolgrid, kinetic, etc.)
  - 75 export verification tests

### Patch Changes

- Updated dependencies []:
  - @pyreon/meta@0.2.0

## 0.2.0

## 0.1.0

### Minor Changes

- Initial public release of Pyreon Zero meta-framework with SSR/SSG/ISR/SPA modes, file-system routing, optimized components (Image, Link, Script), theme system, font optimization, SEO utilities, cache middleware, and Node/Bun/static deployment adapters.
