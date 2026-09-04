# @pyreon/http

## 0.52.0

### Minor Changes

- PMTC now lowers `@pyreon/http`'s endpoint DSL onto the existing PyreonFetch machinery: a same-file `const api = createHttp({ baseUrl })` + `const getUser = api.endpoint('GET /users/:id')` lets `useFetch<T>(getUser({ params: { id: '1' } }))` resolve at compile time to a concrete templated URL + method, emitting identically to `useFetch<T>('/api/users/1', { method: 'GET' })` on both targets. Literal params only — reactive params, a computed baseUrl, and the `.query()` fetcher form warn and stay web. No new emit/IR/stub; `createHttp`/`.endpoint` are metadata and emit nothing. `@pyreon/http`'s manifest declares the `nativeFrontend` (partial crossing). (d873013)

### Patch Changes

- Update third-party dependencies to their latest compatible releases, (ea669a1)
  extending #3174's sweep to every package.json the first pass hadn't reached
  (that pass touched only the root manifest, so nothing there tripped the
  Changeset gate — this one edits per-package manifests directly and does).

  Runtime dependencies that reach consumers: `oxc-parser`/`oxc-transform`
  0.147 → 0.148 (`@pyreon/compiler`, `@pyreon/native-compiler`, `@pyreon/lint`
  — `@oxc-project/types` alongside it), `magic-string` 1.2.2 → 1.2.3
  (`@pyreon/compiler`), the CodeMirror 6 family — `@codemirror/search` and
  `@codemirror/state` 6.7.1 → 6.7.2, `@codemirror/legacy-modes` 6.5.3 → 6.5.4
  (`@pyreon/code`), TipTap 3.30.3 → 3.31.2 (`@pyreon/rich-text`), TanStack Query
  5.102.2 → 5.102.8 across `@tanstack/query-core` and its persist/devtools
  companions (`@pyreon/query`, and the shared root override so `@pyreon/http`
  agrees), `@tanstack/table-core` 9.1.2 → 9.2.4 (`@pyreon/table`), the
  pragmatic-drag-and-drop family (`@pyreon/dnd`) — core 3.0.0 → 3.1.0,
  auto-scroll 3.1.0 → 3.2.0, hitbox 2.1.0 → 2.2.0, all in-range within the
  v3 major this repo already adopted.

  Dev-only comparison/tooling bumps across the touched packages: `rolldown`,
  `react-hook-form`, `hotkeys-js`, `axios`, `ky`, `i18next`, `xstate`, `joi`,
  `typia`, `nuqs`, `@tanstack/react-virtual`, `@tanstack/react-table`,
  `@tanstack/react-query`, `motion`, and `mobx-state-tree` 7.4.0 → 8.0.0 — a
  real major, but its own peer range for `mobx` moved `^6.3.0` → `^7.0.0`,
  which matches what this repo already declares (`^7.0.3`); the OLD pin was
  the one silently out of range.

  `happy-dom` deduped to ONE resolved version repo-wide — three stale copies
  (20.11.6/20.12.0/20.13.2) were co-installed before this pass across the ~17
  packages that each pin it independently. The unification target is
  **20.11.6, not the newest 20.13.2** — bumping past 20.11.6 breaks
  `@pyreon/styler`'s `memory-growth.test.ts` deterministically (5/5 local
  runs, plus a CI failure on `test (fundamentals+ui-system+zero)`), a pure
  `environment: 'happy-dom'` test whose eviction-cycle counting depends on
  CSSOM/`cssRules` behavior that changed somewhere between those versions —
  confirmed by isolating the version with an exact pin, not by assumption; 3/3
  clean at 20.11.6, 5/5 failing at 20.13.2. Verified pre-existing on `main`
  (3/3 passes there, at 20.11.6) so this is the same "routine bump, unvetted
  runtime behavior change" shape as the `@tanstack/virtual-core` finding
  below, just caught before push instead of by CI. The one other consumer
  pinning past 20.11.6 — `@happy-dom/global-registrator` in
  `examples/benchmark`, whose own 20.13.2 release requires `happy-dom
^20.13.2` as a peer — is reverted to `^20.11.6` alongside it, so the whole
  graph resolves to one version again.

  `examples/benchmark`'s framework competitors were refreshed too so the
  "fastest framework" comparisons stay honest against current releases: Vue +
  `@vue/server-renderer` + `@vue/compiler-dom` 3.5.41 → 3.5.42, Svelte 5.56.10
  → 5.57.0, and Octane 0.1.46 → 0.2.2 (its peer `@octanejs/vite-plugin`
  0.1.46 → 0.1.52 alongside it) — a real minor jump, verified with a clean
  production build before committing to it. Octane 0.2.2 replaces the
  `forBlock` fast-path flag the row-list bench's own doc comment describes
  un-handicapping with a new `fastKeyedForBlock` path; the bench impl still
  reaches it (confirmed by compiling `octane.tsrx` through `octane/compiler`
  0.2.2 and reading the emitted flags), so the comparison stays fair, but
  every previously-published Pyreon-vs-Octane number in
  `.claude/skills/pyreon-benchmarks/SKILL.md` was measured against 0.1.46 and
  needs re-verification against 0.2.2 before being cited again — flagged
  there, not restated as fact here.

  Held deliberately, each for a stated reason found by actually reading the
  dependency rather than assuming: TypeScript stays capped `<7.0.0` (removes
  the classic Compiler API `@pyreon/compiler`/`@pyreon/mcp`/`@pyreon/cli` are
  built on). `vitest`/`@vitest/browser`/`@vitest/browser-playwright`/
  `@vitest/coverage-v8` stay on 4.1.11 as one locked unit (5.0.0 just went GA
  and changes `clearMocks` to default `true`, tightens `coverage.include`/
  `exclude` matching, and removes several import entrypoints — exactly the
  class of change this repo's `Coverage (Full)` gate has already rotted on
  three times; a real migration, not a version bump). `@changesets/cli`
  2.31.1 → 3.0.1 and `@changesets/changelog-github` 0.7.0 → 1.0.0 stay put:
  1.0.0 ships `"type": "module"` with no CJS export, and this repo's own
  `.changeset/resilient-changelog.cjs` does `require('@changesets/changelog-
github')` — bumping it would break `changeset version` at release time with
  `ERR_REQUIRE_ESM`, verified by reading the published package's `exports`
  map, not assumed. The root `uuid` override stays at `11.1.1` for the same
  reason, one level removed: it force-pins a transitive dep of `exceljs`
  (`^8.3.0`, itself already outside its own declared range on purpose), and
  `uuid` 12.0.0 dropped CommonJS support entirely — `exceljs`'s own bundled
  code does `require('uuid')`, verified directly in its installed `dist/`, so
  the same ESM-only trap applies one hop further down the graph.

  One more found by actually running the browser test tier, not just typecheck
  and the node/happy-dom suite: `@tanstack/virtual-core` was bumped 3.17.4 →
  3.17.8 in this branch's first pass (a routine-looking override edit, not
  vetted as carefully as the deps above), and it broke
  `@pyreon/virtual`'s real-Chromium `repositions a STAYING row below when row 0
is remeasured taller` test deterministically (3/3 local runs, plus 3/3 CI
  retries) — bisected down to virtual-core's own 3.17.7 "synchronous
  notification for scroll compensation" change, not to anything else in this
  branch (ruled out `@tanstack/react-virtual`, unrelated — not imported by this
  code path at all; ruled out the `oxc-parser`/`magic-string`/`rolldown`
  bumps too, by reverting each in isolation and rebuilding). Reverted back to
  3.17.4, matching what's currently on `main`, and NOT bumped further.

  This surfaced something that predates this PR: `@pyreon/virtual`'s own
  `package.json` has declared `@tanstack/virtual-core: "^3.17.7"` since an
  earlier fix (commit 973c4e323, "the root overrides pinned
  @tanstack/virtual-core to 3.17.4 while three packages declared ^3.17.7, so
  the installed version did not satisfy its own consumers' declared range")
  — but the root override was only ever bumped to 3.17.4 there, not to
  3.17.7+, so the exact mismatch that fix describes is still live on `main`
  today: the declared floor and the resolved version disagree, silently,
  because the currently-resolved 3.17.4 happens to still pass. Bumping the
  override to actually satisfy the package's own declared range (3.17.7,
  confirmed — not just 3.17.8) is what surfaces the real compatibility break
  in `use-virtualizer.ts`'s remeasurement handling. Left as-is here rather
  than fixed, because closing it needs either updating the wrapper for
  virtual-core's new synchronous-notification timing or re-adjudicating the
  test's assumptions against it — real source-level work, not a version
  bump. Tracked as a known gap, not silently left broken: someone picking
  this up should treat `bun run test:browser` in `@pyreon/virtual` as the
  regression gate, not just `bun run test`, which does not exercise this
  path at all (confirmed: the full node/happy-dom suite passes 1805/1805
  regardless of which virtual-core version is resolved).

- Update external dependencies to latest across the workspace: tanstack query/virtual patches, tiptap 3.29.2, codemirror view 6.43.8, shiki 4.4.2, elkjs 0.12, yjs 13.6.32, MCP SDK 1.30, oxc 0.143, magic-string 1.1.0, pragmatic-drag-and-drop 2.0.2, and tooling (vite 8.2.0, playwright 1.62.1 — both previously held back by upstream bugs now fixed). `@pyreon/testing` widens its `@testing-library/jest-dom` peer to `^6.0.0 || ^7.0.0` (v7 verified). TypeScript stays capped `<7.0.0` (TS7 removed the classic Compiler API); `@tanstack/table-core` stays on v8 (v9 is a structural API rewrite that would break `@pyreon/table`'s public options surface — tracked as its own migration). (1d74edc)
- Per-request hot path made ~37% faster (measured — the new `bench:http` head-to-head vs ky/ofetch/redaxios/axios now shows fastest-or-tied on every row; the headline `GET → decoded JSON` flipped from an outright loss to ofetch into a 1.4× win): (0f18357)

  - Static header sources are folded once (lazily, at first request) and cloned per request via one native `new Headers(folded)` instead of re-merging every source through intermediate `Headers` allocations (~360ns/request). Sources from the first function source onward stay dynamic, so accessor headers (rotating tokens) still re-evaluate per request and later sources still override earlier keys. Behavior note: mutating a plain static headers OBJECT after client creation is no longer picked up by later requests — that was never the documented dynamic mechanism; use the function-source form (`headers: () => ({...})`), which is unchanged.
  - `HttpResponsePromise` is now a prototype-based thenable class instead of `Object.assign`ing decoders onto the live promise (a measured ~260ns/request shape-transition penalty). `await`, `.then`/`.catch`/`.finally` chaining, and `Promise.all` behave identically; the one observable difference is `p instanceof Promise` → `false` (never part of the documented contract — the contract is the `HttpResponsePromise` interface, and `.then()` still returns a real native promise).
  - The no-signal/no-timeout request path reuses one frozen linked-signal constant, and the no-meta case allocates a bare `{}` instead of double-spreading empty objects.

- Update the benchmark's `ky` comparison arm from 1.x to 2.0.2 (devDependency (b81dc7c)
  only — `ky` is a head-to-head competitor in `bench/http-bench.ts`, not a runtime
  dependency of `@pyreon/http`).

  v2 renames `prefixUrl` → `prefix` and unifies every hook around a single state
  object, so the bench's `afterResponse` moves from `(request, options, response)`
  to `({ response })`.

- Updated dependencies:
  - @pyreon/validation@0.52.0

## 0.51.0

### Minor Changes

- New `@pyreon/http` package — the transport layer beneath `@pyreon/query`. (663ac5a)

  It owns how a request is made (URL building, path params, query encoding, headers, body, cancellation, typed errors, optional response validation) and deliberately owns no cache, no dedup-by-key and no reactive container, because `@pyreon/query`, `useFetch` and `createResource` already do. That split mirrors the one the native runtime already made, where `PyreonFetch` is the reactive result container and `PyreonHttp` the request/response layer beneath it.

  The core has zero dependencies. Each capability lives behind its own entry so an unused one costs nothing: `@pyreon/http/middleware` (`retry`, `dedupe`, `bearer`, `refresh`, `logger`, `forwardHeaders`), `@pyreon/http/schema` (Standard Schema validation), `@pyreon/http/query` (TanStack adapters), `@pyreon/http/mock` (network-free mocking) and `@pyreon/http/server` (per-request SSR context, the only `node:async_hooks` import).

  Middleware is onion-shaped — `(request, next) => response` — because that is the only form in which retry, auth-refresh and short-circuiting are ordinary middleware; an axios-style interceptor pair cannot re-enter the chain. Clients are immutable: `extend()` returns a new instance, so no mutable shared default can leak across concurrent SSR requests. Response validation is three tiers, and only the third costs a dependency: an unchecked cast, any `(raw: unknown) => T` parse function, or any Standard Schema (zod, valibot, arktype, `@pyreon/validate`'s `s`, and `@pyreon/validation`'s typed adapters). `endpoint('GET /users/:id', { response })` derives the callable, a stable cache key and the response type from one declaration, so `queryKey` and URL cannot drift; `.query()` forwards TanStack's `AbortSignal`.

  Defaults are chosen against real failure modes: a 30s timeout is ON because `fetch` has none and a hung request otherwise never settles, while retry is OFF because it compounds with query's own retry into nine requests per logical query.

  `@pyreon/lint` gains three opt-in, dependency-gated rules and a new `http` category: `pyreon/query-fn-must-forward-signal` (a `queryFn` that performs a request but drops the `AbortSignal`, which silently disables cancellation), `pyreon/no-unencoded-path-interpolation` (interpolating into a path skips URL encoding, so a value containing `/` escapes its segment) and `pyreon/no-untimed-raw-fetch` (a raw `fetch` with no signal has no deadline).

### Patch Changes

- Every package manifest now declares its MULTIPLATFORM story as data: (4e53471)
  `multiplatform: { tier: 'shared' | 'service-backend' | 'web-only', rationale }`
  (a discriminated union — `web-only` REQUIRES the rationale sentence). The
  assignments transcribe the classification the multiplatform docs and the PMTC
  compiler's own `WEB_ONLY_PACKAGES` registry already maintain, and the new
  `check-multiplatform-tier` gate (validate-fast family) holds the contract:
  a manifest without a tier, a published package with neither manifest nor
  explicit exemption, a `web-only` without a rationale, or a stale generated
  tier table all fail CI — so a new package can never again silently default
  to web-only while the ecosystem advertises "one codebase, three targets".

  No runtime change in any package: manifests are docs-pipeline inputs and are
  stripped from published tarballs; every generated surface (llms, MCP
  api-reference, reference pages) is byte-identical.

- Updated dependencies:
  - @pyreon/validation@0.51.0
