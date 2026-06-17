# create-zero

## 0.33.0

### Patch Changes

- [#1566](https://github.com/pyreon/pyreon/pull/1566) [`81a296d`](https://github.com/pyreon/pyreon/commit/81a296de7666f1215e748a055ed1679967fe3251) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(create-zero): two launch-blocking scaffolder bugs

  Both made `npm create @pyreon/zero` fail for real users on 0.32.0.

  1. **Startup crash (ENOENT).** `generators/package-json.ts` read create-zero's
     own `package.json` via `resolve(import.meta.dirname, '..', '..', ...)` —
     correct for the SOURCE location (`src/generators/`) but wrong once the build
     flattens every module into one `lib/index.js` (where `import.meta.dirname`
     is `lib/`, one level under the root). The two-level `..` overshot to a
     non-existent path; as a module-level `const` it threw at IMPORT time,
     crashing EVERY invocation before any scaffold logic ran. The tests passed
     because they run against SOURCE, not the bundle. Fixed with one top-level
     `src/own-version.ts` (correct in both source-run and bundled-run), imported
     by both `generators/package-json.ts` and `scaffold.ts`.

  2. **`workspace:` deps in scaffolded projects.** The `email` integration
     hardcoded `@pyreon/document-primitives` / `document` / `connector-document`
     as `workspace:^` — the monorepo-internal protocol, which fails to resolve in
     any scaffolded (non-workspace) project. So `install` broke for every app
     that selected the email integration, incl. the **dashboard** template by
     default. Fixed to the published version range (via `own-version.ts`); added
     a regression test asserting no `@pyreon/*` dep ever uses `workspace:`.

  Verified end-to-end: all 4 templates (app/blog/dashboard/monorepo) scaffold +
  `install` + `build`, and the app template boots (`zero dev` serves HTTP 200).

## 0.32.0

## 0.31.0

## 0.30.0

## 0.29.0

## 0.28.1

### Patch Changes

- [#1219](https://github.com/pyreon/pyreon/pull/1219) [`a633067`](https://github.com/pyreon/pyreon/commit/a6330675e99fb54f5d25947670ae873b161a8cf8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lift node-side coverage to ≥95% statements. Add `pathExists` helper tests covering file / directory / missing-path branches. Bump `coverageThresholds.statements` 94 → 95, `lines` 94 → 95, `functions` 94 → 95. Updates BELOW_FLOOR_EXEMPTIONS entry.

- [#1274](https://github.com/pyreon/pyreon/pull/1274) [`4d75f2d`](https://github.com/pyreon/pyreon/commit/4d75f2dc5ff6768078b60deb126f75c2dd9f8768) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lift branch coverage 81.81% → 96.15% (≥ 95% target). Added `branch-coverage-edges.test.ts` covering env.example append paths, tanstack non-query/non-table dep version branch (virtual), compat-shim deps (react/vue), package strategies (meta), vite-config compat-flag emit, and unknown-feature defensive paths. Annotated structurally unreachable defensive paths in `integrations.ts` (empty envKeys, non-ENOENT readFile error rethrow) and `template-engine.ts` (non-file dirent, binary copy, listFiles non-existent dir, non-file dirent) with `/* v8 ignore */`. Bumped vitest threshold `branches: 80 → 95`, dropped `@pyreon/create-zero` from `BELOW_FLOOR_EXEMPTIONS` in `scripts/check-coverage.ts`.

## 0.28.0

## 0.27.1

## 0.27.0

## 0.26.3

## 0.26.2

## 0.26.1

### Patch Changes

- [#1155](https://github.com/pyreon/pyreon/pull/1155) [`1779b84`](https://github.com/pyreon/pyreon/commit/1779b84c2719c1e0745ce2630d8940ff3bc25ed0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(create-zero): close file-system-race TOCTOU in .env.example merge

  Previously `existsSync(envPath) ? await readFile(envPath, …) : ''` had
  a race window where the file could be removed/changed between the
  existence check and the read. Replaced with try/catch on `readFile`
  catching `ENOENT` — atomic; no race window. Semantically equivalent
  for the common case (file exists / file missing). Non-ENOENT errors
  (permissions, etc.) now propagate explicitly rather than silently
  becoming empty content.

  Closes CodeQL alert: `js/file-system-race` (high severity, warning level).

## 0.26.0

### Patch Changes

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

- [#946](https://github.com/pyreon/pyreon/pull/946) [`1385728`](https://github.com/pyreon/pyreon/commit/1385728abb19c6a51498df9dec7fc4b51136a115) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(zero-cli): `zero preview` now serves built output (no more HTTP 404 on the homepage)

  `zero build` writes the client bundle to `dist/client/` (see [packages/zero/cli/src/commands/build.ts](packages/zero/cli/src/commands/build.ts)), but `zero preview` was wrapping `vite preview` with no `outDir` override — so vite served from `dist/` (which only contains the `client/`, `server/`, `output/` subdirectories). Every scaffolded SSR / SSG / SPA project returned HTTP 404 from `bun run preview` on the homepage. The build artefact was correct; the preview command just looked in the wrong place.

  `zero preview` now detects `dist/client/` and passes it as `build.outDir` to vite preview. The 30 prior published `@pyreon/zero-cli` releases all had this bug; this lands as part of the next 0.x.

  **DX improvements bundled in `@pyreon/create-zero`:**

  - Every template (`app`, `blog`, `dashboard`) now ships a `README.md` with project-name substitution, getting-started commands, per-template "what's in this project" section, scripts table, deploy notes, and doc links. Previously only the `monorepo` template had a README — the flat templates landed with no documentation at the project root.

  - `scripts/scaffold-smoke.ts` gained a `previewSmoke?:` hook that spawns `bun run preview` against the built output, waits for the local URL, fetches the homepage, and asserts HTTP 200 + non-empty HTML body. Wired into 3 representative cells (app+vercel, blog+cloudflare, dashboard+vercel+full integrations). Bisect-verified: reverting the `zero preview` fix fails `cpa-smoke-app-vercel` with `preview HTTP 404 from http://localhost:NNNN (expected 200)`; restored → passes.

## 0.25.1

### Patch Changes

- [#902](https://github.com/pyreon/pyreon/pull/902) [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Ship source maps in published tarballs.

  Every `@pyreon/*` package now ships its `.js.map` and `.d.ts.map` files. The previous `!lib/**/*.map` exclusion in each package's `files` array left every emitted JS file pointing at a `//# sourceMappingURL=*.map` that wasn't actually published — causing Vite (and other bundlers) to log a "Failed to load source map" warning per file on every cold dev start. Real bug in shipped tarballs, not just dev-noise theory.

  The fix is shipping the maps. They make framework stack traces readable: `at mountChild (node_modules/@pyreon/runtime-dom/src/nodes.ts:147)` instead of `at e (node_modules/@pyreon/runtime-dom/lib/index.js:1:42857)`. This matters most when a user hits a framework bug, opens devtools, or sees an unreadable production error from a server-side render. Sentry / Bugsnag / Rollbar can also translate framework frames using the shipped maps; without them, the framework's part of every captured stack stays opaque.

  Cost: ~350KB-1MB per package in `node_modules`. Bundlers (Vite, Webpack, Rollup, esbuild) strip source maps from production builds automatically; they never reach end users. Every comparable library (React, Vue, Solid, Preact, Svelte, TanStack) does this.

  No API changes. The `check-distribution` CI gate inverts to enforce the new contract (maps must be present, not absent).

## 0.25.0

## 0.24.6

## 0.24.5

## 0.24.4

## 0.24.3

## 0.24.2

## 0.24.1

## 0.24.0

## 0.23.0

## 0.22.0

## 0.21.0

## 0.20.0

## 0.19.0

## 0.18.0

## 0.17.0

## 0.16.0

## 0.14.0

### Minor Changes

- [#305](https://github.com/pyreon/pyreon/pull/305) [`f3c3644`](https://github.com/pyreon/pyreon/commit/f3c3644499b89d4c72644ed8fad112e15fb0f7b0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Enhanced project wizard: compat mode prompt (React/Vue/Solid/Preact migration), @pyreon/lint setup, 4 new features (toast, permissions, url-state, rx), Counter template showcases signal auto-call.

## 0.13.0

## 0.12.15

## 0.12.14

## 0.12.13

## 0.12.12

## 0.12.11

## 0.5.0

### Minor Changes

- Bump ecosystem to latest, UI system ^0.3.0, Dependabot, template fixes
  - Bump UI system to ^0.3.0, core ^0.7.12, fundamentals ^0.10.0
  - Add Dependabot for automated dependency updates
  - Fix template for @pyreon/store 0.10.0 API (useAppStore returns { store })
  - Use `latest` in static template to prevent version drift
  - Fix camelCase JSX attributes in templates (onClick, srcSet)

## 0.4.1

### Patch Changes

- Pin GitHub Actions to SHA hashes, add security policy

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

## 0.2.0

### Minor Changes

- Initial public release under @pyreon scope.

## 0.1.0

### Minor Changes

- Initial public release of Pyreon Zero meta-framework with SSR/SSG/ISR/SPA modes, file-system routing, optimized components (Image, Link, Script), theme system, font optimization, SEO utilities, cache middleware, and Node/Bun/static deployment adapters.
