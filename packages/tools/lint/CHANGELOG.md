# @pyreon/lint

## 0.24.5

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.24.5

## 0.24.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.24.4

## 0.24.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.24.3

## 0.24.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.24.2

## 0.24.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.24.1

## 0.24.0

### Minor Changes

- [#777](https://github.com/pyreon/pyreon/pull/777) [`f400e85`](https://github.com/pyreon/pyreon/commit/f400e85282a370276d5ae0266ba501c41dce4f3e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - LPIH: zero-config cache path convention. `startLpihPolling()` and `writeLpihCache()` now default to `<cwd>/.pyreon-lpih.json` when called with no path; the LSP server auto-discovers the same file by walking up from the source file to the nearest `package.json`. No env var required for the common case.

  ```ts
  // Before (foundation PR):
  import { startLpihPolling } from "@pyreon/reactivity/lpih";
  startLpihPolling("/tmp/pyreon-lpih.json", 250);
  // + set PYREON_LPIH_CACHE=/tmp/pyreon-lpih.json on the LSP

  // Now (zero config):
  import { startLpihPolling } from "@pyreon/reactivity/lpih";
  startLpihPolling(); // writes to <cwd>/.pyreon-lpih.json
  // LSP auto-discovers; no env var needed
  ```

  **`@pyreon/reactivity/lpih`**:

  - `writeLpihCache(path?)` — `path` is now optional, defaults to `getDefaultLpihCachePath()` (which returns `<cwd>/.pyreon-lpih.json`)
  - `startLpihPolling(path?, intervalMs?)` — same default; throws synchronously if no default can be resolved AND no path given (better than silently never writing)
  - New export `getDefaultLpihCachePath(): string | null` — returns the resolved path or null in environments without `process.cwd()` (web workers, etc.)
  - New export `LPIH_DEFAULT_FILENAME = '.pyreon-lpih.json'` — canonical filename constant

  **`@pyreon/lint`** LSP:

  - `_resolveLpihCachePath(filePath)` — new helper that resolves the cache path for a given source file. Priority: `PYREON_LPIH_CACHE` env (explicit override) → `<project-root>/.pyreon-lpih.json` discovered by walking up to nearest `package.json` (zero-config default) → `undefined` (LPIH inactive)
  - `_findProjectRoot(filePath, maxDepth?)` — memoized walk-up helper. Caches results per-file for the LSP-process lifetime; cleared on `_resetOpenDocuments()`. Synchronous (one `existsSync` per level, typically <10 levels = negligible cost).
  - `_LPIH_DEFAULT_FILENAME` — exported constant locked to `.pyreon-lpih.json` (matches `@pyreon/reactivity/lpih`'s `LPIH_DEFAULT_FILENAME` — a drift gate test in `lsp-lpih.test.ts` validates the agreement).

  **Discovery priority** (matches across writer + reader):

  1. `PYREON_LPIH_CACHE` env var on the LSP (explicit override) — unchanged
  2. `<project-root>/.pyreon-lpih.json` (auto-discovered) — new default
  3. No cache → LPIH inactive (degrades to static Reactivity-Lens hints only) — unchanged

  **Multi-session safety**: each project gets its own cache file under its own `package.json` boundary. Two dev sessions in different projects can't collide silently (was a footgun with the previous shared `/tmp/pyreon-lpih.json` convention from the foundation docs).

  **Tests**: +18 new tests across both packages (8 for the runtime default + 10 for LSP discovery), all green. Bisect-verified: removing the `_resolveLpihCachePath` wiring breaks the "auto-discover" LSP integration test.

  **Docs**: `docs/docs/lpih.md` quickstart updated to the zero-config flow; `.gitignore` mention added; custom-path / env-override examples preserved at the bottom of the page.

- [#769](https://github.com/pyreon/pyreon/pull/769) [`891ca43`](https://github.com/pyreon/pyreon/commit/891ca4300727119dafd66ceaacd7cb39e68f3b4e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Live Program Inlay Hints (LPIH) — runtime + compiler + LSP foundation. A new category of editor surface: **live runtime data displayed at the source line, the same way TypeScript shows inferred types**. No reactive framework today shows fire counts / subscriber counts / effect re-run rates at the cursor — developers context-switch to a separate devtools panel. LPIH closes that gap.

  ```tsx
  function App() {
    const count = signal(0); // 🔥 signal fired 240×
    const doubled = computed(() => count() * 2); // 🔥 derived fired 240×
    effect(() => console.log(doubled())); // 🔥 effect fired 241×
    return <div>{count()}</div>;
  }
  ```

  **`@pyreon/reactivity`**: source-location capture at every `signal()` / `computed()` / `effect()` creation, wired through `_rdRegister` and exposed via `getFireSummaries()`. The runtime bridge ships at the new subpath export `@pyreon/reactivity/lpih`: `writeLpihCache(path)` + `startLpihPolling(path, intervalMs)` writes the current fire snapshot to a JSON cache file atomically (tmp + rename — readers never see a half-written file; failed renames clean up the tmp). Subpath keeps the main entry slim — bridge depends on `node:fs/promises` (Node-only) and is dev-mode glue, not a core primitive. New main-entry exports: `SourceLocation`, `FireSummary`, `getFireSummaries`. New `/lpih` subpath exports: `writeLpihCache`, `startLpihPolling`. **Zero production cost** (existing `process.env.NODE_ENV !== 'production'` gate tree-shakes the entire capture path — verified by the existing `reactive-devtools-treeshake.test.ts`). Dev-mode opt-in cost: `_active === true` triggers `new Error().stack` capture (~2.2µs per creation). At realistic real-app creation rates (100-1000 signals total / 100/sec peak), per-session cost is **0.2-2.3ms** — invisible. Stack-parser handles V8, JSC, and SpiderMonkey formats. 21 new tests (15 source-location + 6 bridge).

  **`@pyreon/compiler`**: two new pure functions that bridge runtime fire data to LSP inlay hints. `mergeFireDataIntoFindings(findings, fires, file)` enriches static Reactivity-Lens findings with fire counts at matching source lines. `firesToCreationSiteFindings(fires, file)` synthesizes inlay-hint findings DIRECTLY from fires — creation-line hints showing `signal fired 240×` at the line where `signal()` was called. New exports: `mergeFireDataIntoFindings`, `firesToCreationSiteFindings`, `LPIHFireDatum`, `LPIHMergeOptions`. 24 new tests covering merge semantics, kind filtering (footguns/static spans NOT enriched), file normalization, aggregation, custom formatters, plus end-to-end `analyzeReactivity + merge` integration.

  **`@pyreon/lint`**: LSP `textDocument/inlayHint` handler reads `PYREON_LPIH_CACHE` env var on each request, parses the cache file (silent failure on missing/malformed JSON), and emits creation-site inlay hints with the `🔥 signal fired N×` label. Opt-in via env var — when unset, LPIH path is a no-op and existing static Reactivity-Lens hints work unchanged. New internal exports: `_readLpihCache`, `LPIHCacheEntry`, `LPIHCacheFile`. 15 new JSON-RPC roundtrip tests covering cache file parsing (malformed JSON, missing entries, shape validation), LSP handler integration (env-var-driven cache read, visible-range filtering with LPIH active, graceful degradation), end-to-end `initialize → didOpen → inlayHint` with real cache file.

  **Measured impact (reproducible via `bun .claude/experiments/lpih-measurement.ts`)**:

  | Metric                                          | Value                                          |
  | ----------------------------------------------- | ---------------------------------------------- |
  | LSP roundtrip latency (median, 20-trial)        | **0.32 ms**                                    |
  | LSP roundtrip latency (p95)                     | **2.78 ms**                                    |
  | User-perceived save→hint (incl. 150ms debounce) | **~150 ms**                                    |
  | Bridge write (atomic JSON file)                 | **1.5 ms**                                     |
  | End-to-end bridge-to-editor                     | **~1.8 ms + 250ms poll interval**              |
  | Production overhead                             | **0 ns** (tree-shaken)                         |
  | Dev-mode active overhead                        | 2.2 µs per signal creation                     |
  | Workflow "which signal fires most?"             | 9 → 2 steps (**4.5× reduction**)               |
  | Workflow "is this effect over-running?"         | 8 → 2 steps (**4× reduction**)                 |
  | Workflow "did memoization help?"                | 10 → 4 steps (**2.5× reduction**)              |
  | Information surface per medium component        | ~9 hints inline vs 0 in editor (devtools-only) |

  **Architecture**: Three-layer (runtime captures source location → bridge writes JSON cache file → LSP reads + merges into inlay hints). Bisect-verified: reverting the LSP wiring fails 11/15 integration tests; restored, 15/15 pass. The cache-file bridge mechanism is filesystem-only (no IPC, no WebSocket) — chosen because LSP servers are stdio-only and filesystem is the universal lowest-common-denominator transport. The LSP re-reads on every inlay-hint request so live edits land immediately. Future build-time location injection via `@pyreon/vite-plugin` will replace stack capture with compile-time literals, eliminating the dev-mode 2.2µs/creation overhead entirely. The editor extension (VS Code / Neovim) that auto-bridges devtools fire data to the cache file is a follow-up.

  **Docs**: new VitePress page at [docs/docs/lpih.md](docs/docs/lpih.md) with quickstart, API reference, measured numbers, and 3 concrete bug-hunting scenarios (with vs without LPIH workflow comparison).

- [#782](https://github.com/pyreon/pyreon/pull/782) [`cc536f0`](https://github.com/pyreon/pyreon/commit/cc536f071244c0a5f791da899e1bc52b20819f1b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - LPIH: `PYREON_LPIH_PATH_MAP` env var for remote-dev path remapping. In Codespaces, devcontainers, Docker dev, or any setup where the runtime captures paths from one filesystem view (e.g. `/host/proj/src/x.ts`) while the LSP serves files from another (`/workspaces/proj/src/x.ts`), inlay hints used to stay invisible — fire-data file paths never matched the LSP's source-file path.

  Now: `PYREON_LPIH_PATH_MAP=/host/proj=/workspaces/proj pyreon-lint --lsp` rewrites captured paths inside `_readLpihCache` before matching. Multiple mappings via `;` (longest `from` wins; malformed entries silently dropped). The runtime side stays untouched — it keeps capturing its native filesystem paths.

  Closes R7 from the LPIH foundation PR ([#769](https://github.com/pyreon/pyreon/issues/769)) recommendations queue. Bisect-verified: disabling the path-map rewrite in `_readLpihCache` fails 3 of the 53 LSP-LPIH specs (`rewrites file paths via PYREON_LPIH_PATH_MAP-style source`, `applies longest-prefix-wins across multiple rules`, `reads PYREON_LPIH_PATH_MAP from process.env by default`); restored → 53/53. Exposed surface: `_parseLpihPathMap`, `_applyLpihPathMap`, `LPIHPathMapEntry` (`@internal` underscore-prefixed for tests, not stable public API).

### Patch Changes

- Updated dependencies [[`275eb20`](https://github.com/pyreon/pyreon/commit/275eb2038f32374e90c9fe0c3d55f35895f43450), [`47073eb`](https://github.com/pyreon/pyreon/commit/47073ebdd7552c63985f461a663ba98d93538606), [`572212f`](https://github.com/pyreon/pyreon/commit/572212f631907a18b98118f48dea3621dd5a95b1), [`f22902a`](https://github.com/pyreon/pyreon/commit/f22902a9a9c5f5b8a5192da086a6b4299291dd57), [`891ca43`](https://github.com/pyreon/pyreon/commit/891ca4300727119dafd66ceaacd7cb39e68f3b4e), [`d4ec777`](https://github.com/pyreon/pyreon/commit/d4ec777643446ed2c51dedb1e74fbd8dce70bdfd), [`572212f`](https://github.com/pyreon/pyreon/commit/572212f631907a18b98118f48dea3621dd5a95b1)]:
  - @pyreon/compiler@0.24.0

## 0.23.0

### Minor Changes

- [#743](https://github.com/pyreon/pyreon/pull/743) [`c19084c`](https://github.com/pyreon/pyreon/commit/c19084c6a57ca6651f62acdd584f17ad3a81aaab) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(lint): two new preventative rules distilled from the [#725](https://github.com/pyreon/pyreon/issues/725) → [#741](https://github.com/pyreon/pyreon/issues/741) leak-class sweep

  Adds two preventative lint rules — `pyreon/promise-race-needs-cleartimeout`
  (performance) and `pyreon/init-fn-needs-idempotency` (lifecycle) — that
  would have caught the structural bugs fixed across the 8-PR leak-class
  sweep ([#725](https://github.com/pyreon/pyreon/issues/725), [#729](https://github.com/pyreon/pyreon/issues/729), [#730](https://github.com/pyreon/pyreon/issues/730), [#733](https://github.com/pyreon/pyreon/issues/733), [#734](https://github.com/pyreon/pyreon/issues/734), [#735](https://github.com/pyreon/pyreon/issues/735), [#737](https://github.com/pyreon/pyreon/issues/737), [#739](https://github.com/pyreon/pyreon/issues/739), [#741](https://github.com/pyreon/pyreon/issues/741)) BEFORE
  they shipped.

  ### 1. `pyreon/promise-race-needs-cleartimeout` (performance, warn)

  Flags `Promise.race([work, new Promise((_, reject) => setTimeout(reject,
MS))])` inside a try block where the enclosing `finally` block does NOT
  contain a `clearTimeout` call. The bug class: when `work` wins the race
  (the success path — every healthy invocation), the rejection branch's
  setTimeout fires later, pinning a closure + reject callback for up to
  MS ms. Under sustained traffic, hundreds of pending timers pile up.

  **Caught real cases (would have surfaced at edit time)**:

  - [#734](https://github.com/pyreon/pyreon/issues/734) — `@pyreon/zero` `isr.ts revalidate()` — 30s setTimeout per
    successful revalidation, hundreds piled up under load.
  - [#735](https://github.com/pyreon/pyreon/issues/735) — `@pyreon/zero` `ssg-plugin.ts` per-path render + per-locale
    404 render (×2), 30s setTimeout per successful render.

  **Heuristic**: targets the canonical `new Promise((_, reject) =>
setTimeout(...))` shape used in every real case. Conservative — doesn't
  attempt to detect anonymous-arrow setTimeouts deeply nested in arbitrary
  arguments.

  **Tests (7 specs)**: 3 FIRES (canonical, no-finally, multi-line) + 4
  DOES-NOT-FIRE (clearTimeout present, no setTimeout branch, plain
  setTimeout outside race, no try/catch). **Bisect-verified**: disabled
  the `TryStatement` visitor body → 3 FIRES specs fail with `expected
[] to include 'pyreon/promise-race-needs-cleartimeout'`. Restored →
  7/7 pass.

  ### 2. `pyreon/init-fn-needs-idempotency` (lifecycle, warn)

  Flags an exported `init*` function that:

  1. Has at least one `onMount(...)` call in its body.
  2. Is ALSO called from another function in the SAME module.
  3. Lacks a module-level refcount / boolean guard variable
     (`let _x = 0` / `let _flag = false` / `let _disposeShared = null`).

  **Caught real case**:

  - [#734](https://github.com/pyreon/pyreon/issues/734) — `@pyreon/zero` `initTheme()` ThemeToggle pile-up. `initTheme`
    was exported from `theme.tsx` AND called from `ThemeToggle`'s render
    body, with no refcount guard. Every mounted ThemeToggle registered a
    fresh matchMedia listener + effect (N components → N listeners).

  **Conservative by construction (deliberate FN tolerance)**:

  - Same-module call requirement means cross-module reentrancy is out of
    scope (would need a full project scan, way beyond per-file lint).
    Legit one-shot inits (`initApp()` exported and called only from a
    separate entry file) don't fire.
  - Guard detection looks for module-level `let X = 0|false|null` — the
    refcount / flag patterns the playbook PRs used. A WeakMap-keyed
    dedup wouldn't match, but that's an acceptable false negative.
  - Name pattern `/^init[A-Z]/` only — `useX` / `setupX` / lowercase
    function names skip the rule (those have different semantics in
    Pyreon's component conventions).

  **Tests (7 specs)**: 2 FIRES ([#734](https://github.com/pyreon/pyreon/issues/734) shape, multi-callsite) + 5
  DOES-NOT-FIRE (refcount guard, boolean guard, one-shot init with no
  same-module call, useX hook, init with no onMount). **Bisect-verified**:
  disabled the `Program` visitor's report loop → 2 FIRES specs fail
  with `expected [] to include 'pyreon/init-fn-needs-idempotency'`.
  Restored → 7/7 pass.

  ### Validation

  - `@pyreon/lint` 653/653 tests pass (+14 new — 7 per new rule)
  - Lint + typecheck clean
  - Manifest + CLAUDE.md + lint README + lint docs updated to 82 rules /
    18 categories (lifecycle 5→6, performance 5→6)
  - Doc-claims gate clean (`bun run check-doc-claims`)
  - Generated llms.txt / llms-full.txt / MCP api-reference regenerated
    via `bun run gen-docs`
  - Both rules ship as `warn` severity, present in the `recommended`
    preset by default (matches every other performance/lifecycle rule)

  ### Closes the systemic-prevention arm of [#733](https://github.com/pyreon/pyreon/issues/733)/[#734](https://github.com/pyreon/pyreon/issues/734)'s follow-up sweep

  The fixes-side of the audit-byproducts trail closed in [#735](https://github.com/pyreon/pyreon/issues/735), [#737](https://github.com/pyreon/pyreon/issues/737),
  [#739](https://github.com/pyreon/pyreon/issues/739), [#741](https://github.com/pyreon/pyreon/issues/741) (the 4 MEDIUM patterns from [#733](https://github.com/pyreon/pyreon/issues/733)+[#734](https://github.com/pyreon/pyreon/issues/734)'s audit). These two
  rules close the PREVENTION-side — going forward, the same bug shapes
  fail at edit time instead of shipping.

  Other rule categories the audit surfaced but didn't bottom out:

  - "Wrapper-callable forwards .direct without \_v" — already covered
    by `pyreon/storage-signal-v-forwarding` (existing rule).
  - "Module-level mutable cross-request bleed" (the csp.ts pattern) —
    too context-dependent to detect statically without high FP rates.
    Documented in `.claude/rules/anti-patterns.md` as a manual checklist.

### Patch Changes

- [#736](https://github.com/pyreon/pyreon/pull/736) [`5c9e45b`](https://github.com/pyreon/pyreon/commit/5c9e45b4797bfc3043d6be9e0d5c022e49639f54) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(kinetic, elements, lint): audit + defense-in-depth for the iterate-children bug class

  PR [#731](https://github.com/pyreon/pyreon/issues/731) fixed the kinetic-mode `StaggerRenderer` + `TransitionItem` against
  the Pyreon-compiler-prop-inlining + iterate-children bug. PR [#732](https://github.com/pyreon/pyreon/issues/732) added the
  compiler-side carve-out for stable references at the JSX call site. This PR
  closes the **3 parallel library sites** the audit found and ships a lint
  rule (`pyreon/no-iterate-children-without-resolve`) to prevent recurrence
  in any future library code.

  ## Background — the bug class

  The Pyreon vite-plugin's prop-inlining pass rewrites `<Comp>{children}</Comp>`
  (where `children` is a local `const` derived from a getter — typically
  `const children = childHolder.children` after `splitProps`) as
  `Comp({ ..., children: () => h.children })`. Receiving components see
  `props.children` as a FUNCTION instead of the expected `VNode | VNode[]`.

  DOM-consuming code routes through `mountChild` which handles function
  children correctly via `mountReactive` — invisible bug for the common
  forwarding pattern. Libraries that iterate children at the VNode level
  or `cloneVNode` them directly are silently broken: the function spread
  produces `{type: undefined}` and the DOM renders literal `<undefined>`
  tags. Real-app reproducer: `examples/bokisch.com` Intro section.

  ## Library fixes (3 sites — parallel to PR [#731](https://github.com/pyreon/pyreon/issues/731)'s renderers fix)

  PR [#731](https://github.com/pyreon/pyreon/issues/731) fixed the kinetic-mode renderers under `packages/ui-system/kinetic/src/kinetic/`.
  It missed the parallel TOP-LEVEL components in the same package + a
  subtle Iterator shape.

  - **`@pyreon/kinetic` top-level `Stagger.tsx`** — `(Array.isArray(own.children) ? own.children : [own.children]).filter(isVNode)` collapsed to `[]` when `own.children` is a function. Fixed by calling `resolveChildren(own.children)` at body entry (same helper PR [#731](https://github.com/pyreon/pyreon/issues/731) shipped in `kinetic/src/utils.ts`).
  - **`@pyreon/kinetic` top-level `Transition.tsx`** — 3 × `cloneVNode(props.children, …)` + 1 × `(props.children.props ?? {})` reads. The cloneVNode-on-function shape produces `<undefined>` tags; the `.props` read returns undefined and silently drops the merge-ref. Fixed by resolving once at body entry (`const child = resolveChildren(props.children)`).
  - **`@pyreon/elements` `Iterator`** — falls through to `renderChild(function)` which calls `render(function, props)` and interprets the function as a component. Doesn't crash but loses per-item metadata (`first`/`last`/`position`/`index`/`odd`/`even`). Fixed by unwrapping at body entry with the inline `typeof rawChildren === 'function' ? rawChildren() : rawChildren` ternary.

  ## Lint rule — `pyreon/no-iterate-children-without-resolve`

  New error-level rule under the `reactivity` category. Detects:

  1. **`cloneVNode(EXPR, …)`** where EXPR ends with `.children`.
  2. **`(Array.isArray(EXPR) ? EXPR : [EXPR]).METHOD(…)`** where METHOD is one of `filter` / `map` / `forEach` / `reduce` / `every` / `some` / `find` / `findIndex` / `flatMap`.
  3. **`EXPR.props`** reads where EXPR ends with `.children` (the merge-ref pattern from `Transition.tsx`).

  **Acceptable mitigations** (per-function scope, inherits through nested arrow functions):

  - `resolveChildren(…)` call.
  - `typeof EXPR === 'function' ? EXPR() : EXPR` ternary.
  - `typeof EXPR === 'function'` guard anywhere.
  - `const NAME = <mitigation expression>` — marks NAME as safe-aliased.

  **Out of scope** (deliberate precision trade-offs):

  - Pass-through `...(Array.isArray(EXPR) ? EXPR : [EXPR])` SpreadElement → mountChild handles function children. Naturally not flagged by the call-site detection.
  - `if (Array.isArray(X)) return X.map(…)` IfStatement-guarded iteration. Framework primitives (`Dynamic`, `Show`, `Switch`) use this with direct h() rest args that never reach the auto-wrap; out of scope.
  - Variable-bound iteration patterns (`const xs = COND; xs.METHOD(…)`). Out of scope — detection at the inline `.METHOD(…)` call site.

  **Bisect-verified at two layers**: 19 unit specs (10 FIRES + 9 CONTROL + real-world shapes), reverting the rule fails all 10 FIRES; full repo sweep against `packages/**` after library fixes → 0 hits (zero false positives, zero remaining real bugs).

  ## Surfaces updated

  - `packages/ui-system/kinetic/src/Stagger.tsx` — top-level Stagger fix
  - `packages/ui-system/kinetic/src/Transition.tsx` — top-level Transition fix
  - `packages/ui-system/elements/src/helpers/Iterator/component.tsx` — Iterator fix
  - `packages/ui-system/kinetic/src/__tests__/top-level-transition-stagger-function-children.test.tsx` — 4 regression specs (2 FIRES per component + 2 CONTROL)
  - `packages/ui-system/elements/src/__tests__/iterator-function-children.test.tsx` — 2 regression specs (1 FIRES + 1 CONTROL)
  - `packages/tools/lint/src/rules/reactivity/no-iterate-children-without-resolve.ts` — new rule
  - `packages/tools/lint/src/tests/no-iterate-children-without-resolve.test.ts` — 19 unit specs
  - `packages/tools/lint/src/rules/index.ts` — register rule + bump reactivity count to 14
  - `packages/tools/lint/src/tests/runner.test.ts` — update rule count assertions (80 → 81, reactivity 13 → 14)
  - `CLAUDE.md`, `packages/tools/lint/README.md`, `packages/tools/lint/src/manifest.ts`, `docs/docs/lint.md` — rule count claims updated (locked by `check-doc-claims`)
  - `.claude/rules/anti-patterns.md` — new bug-class entry under Architecture Mistakes

  ## Validation

  - All 3 library packages pass tests (kinetic 220, elements 463 → +new regression specs)
  - All 650 lint tests pass (19 new specs)
  - `check-doc-claims` clean (count claims locked)
  - Real-app sweep: 0 hits across 1041 source files (rule is precision-tuned to avoid false positives on framework primitives, pass-through patterns, and unrelated `Array.isArray` shapes in non-VNode domains)

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

- [#751](https://github.com/pyreon/pyreon/pull/751) [`9be148b`](https://github.com/pyreon/pyreon/commit/9be148b21ef6a31a5e5c98ead363f5f532ee0399) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(lint): close the two scope gaps on `pyreon/no-iterate-children-without-resolve`

  PR [#736](https://github.com/pyreon/pyreon/issues/736) shipped the rule with two deliberate scope deferrals: (a)
  variable-bound iteration (`const xs = Array.isArray(X) ? X : [X];
xs.filter(…)`) was only caught at the inline `.METHOD(…)` call site,
  (b) the inner-component foot-gun (outer unwraps `props.children`,
  inner inline-defined component iterates its own `innerProps.children`)
  relied on per-source-path mitigation tracking that was implemented but
  not regression-tested. This PR closes both gaps with bisect-verified
  unit specs.

  ## Gap 2 — variable-bound iteration

  The risky shape now caught:

  ```js
  const Stagger = (props) => {
    const [own] = splitProps(props, ["children"]);
    const xs = Array.isArray(own.children) ? own.children : [own.children];
    const filtered = xs.filter(isVNode); // ← FIRES (was silent pre-fix)
    return h("div", null, ...filtered);
  };
  ```

  Detection: a new per-scope `boundIterationTargets: Map<NAME, sourceKey>`
  records `const NAME = Array.isArray(EXPR) ? EXPR : [EXPR]` bindings
  (parenthesized form supported) at `VariableDeclarator` visit time. The
  `CallExpression` visitor's `MemberExpression`/`ITER_METHODS` branch then
  adds an `Identifier` case: if `obj.name` is in any enclosing scope's
  `boundIterationTargets`, the same risky-iteration flag fires keyed on
  the underlying source path.

  The mitigation contract still wins by source-path:

  ```js
  // Does NOT fire — mitigation tracked per-source-path, applies to bound forms too.
  const resolved = resolveChildren(own.children);
  const xs = Array.isArray(resolved) ? resolved : [resolved];
  xs.filter(isVNode);
  ```

  ## Gap 3 — per-source-path mitigation precision

  The contract was already correct in the rule's `isCovered` lookup (keys
  on `exprKey`, not "any mitigation in scope"), but no regression spec
  locked it in. Added the canonical Outer/Inner shape that exercises it:

  ```js
  const Outer = (props) => {
    const child = resolveChildren(props.children); // mitigates `props.children`
    const Inner = (innerProps) => cloneVNode(innerProps.children, { ref }); // ← FIRES — different source path
    return Inner({});
  };
  ```

  `Outer`'s mitigation marks `unwrappedSources = {'props.children'}` +
  `safeIdents = {'child'}`. `Inner` receives a fresh `innerProps`
  parameter, so `innerProps.children` is a DIFFERENT source key the outer
  mitigation never covered. The function-shape bug fires per-prop-source,
  not per-component-tree, and now has the regression to prove it.

  Bisect-verified at the over-permissive `isCovered` (returns true if ANY
  mitigation exists in scope) — that spec fails; restored → 23/23 pass.

  ## Coverage

  - 4 new unit specs (now 23 total, up from 19): 2 FIRES for Gap 2 + 1
    CONTROL for Gap 2 mitigation + 1 FIRES for Gap 3 cross-component
    precision.
  - Repo sweep across 988 source files in `packages/**` (excluding tests,
    fixtures, manifest.ts) → **0 hits**: no new false positives from the
    broader Gap-2 detection, and no remaining real bugs (consistent with
    PR [#736](https://github.com/pyreon/pyreon/issues/736)'s library-side fixes leaving the tree clean).
  - Gap 1 (Iterator-fallthrough shape: `if (Array.isArray(x)) return
x.map(…); … return renderChild(x)`) remains intentionally out of
    scope — that shape is the precise pattern framework primitives
    (`Dynamic`, `Show`, `Switch`) use with direct `h()` rest args that
    never reach the auto-wrap, so detection would false-positive on
    every primitive's hot path.

  ## Surfaces updated

  - `packages/tools/lint/src/rules/reactivity/no-iterate-children-without-resolve.ts`
    — `ScopeFrame.boundIterationTargets` + `findBoundIteration` helper +
    `VariableDeclarator` extension + `CallExpression` `Identifier` branch
  - `packages/tools/lint/src/tests/no-iterate-children-without-resolve.test.ts`
    — 4 new specs (3 in "FIRES" + 1 in "DOES NOT FIRE (mitigation present)")

- [#733](https://github.com/pyreon/pyreon/pull/733) [`441b5df`](https://github.com/pyreon/pyreon/commit/441b5dfa64ae52002d3e6612ec68566344ae999d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(tools): post-[#725](https://github.com/pyreon/pyreon/issues/725)/[#729](https://github.com/pyreon/pyreon/issues/729)/[#730](https://github.com/pyreon/pyreon/issues/730) leak-class sweep — vue-compat provide/createApp context-stack leaks + lint AstCache unbounded growth

  Audit pass across all 12 `packages/tools/*` packages for the same patterns behind [#725](https://github.com/pyreon/pyreon/issues/725) (position-based pop on shared module-level stack under non-LIFO unmount), [#729](https://github.com/pyreon/pyreon/issues/729) (sibling-unmount LIFO violation), and [#730](https://github.com/pyreon/pyreon/issues/730) (refcount under-count + inflight-cache rejection). Found 3 HIGH suspects + 4 MEDIUM patterns. This PR fixes the three HIGH suspects.

  ### 1. `@pyreon/core` — export `removeContextFrame`

  The internal identity-based stack-frame remover already existed in `packages/core/core/src/context.ts` (used by `provide()` post-[#725](https://github.com/pyreon/pyreon/issues/725)) but wasn't exported. Compat layers and advanced consumers that call `pushContext` directly need this primitive to do safe identity-based cleanup. Now exported alongside `popContext` / `pushContext` from the package root. No behavior change for existing code — purely an additive export.

  ### 2. `@pyreon/vue-compat` `provide(key, value)` — context-stack frame leak (exact [#725](https://github.com/pyreon/pyreon/issues/725) shape)

  Vue's `provide(key, value)` semantics use string/symbol keys with a key→Context registry. The vue-compat implementation pushed a Map onto Pyreon's global context stack and registered `unmountCallbacks.push(() => popContext())` — the _position-based_ `stack.pop()` that [#725](https://github.com/pyreon/pyreon/issues/725) explicitly flagged as unsafe.

  `@pyreon/core/context.ts` documents: _"The `provide()` helper does NOT use this — it uses identity-based removal via `removeContextFrame` because reactive boundaries can push snapshot frames between a component's `provide(ctx, value)` and its eventual unmount, making the top-of-stack unsafe to assume."_ vue-compat bypassed that safety.

  Real-app symptom: two sibling components both call `provide('K', …)`. They unmount in renderer-driven order (keyed `<For>` removing a non-last item, `<Show>` flipping a non-last sibling, route nav unmounting an outer of nested provider chains). The first-unmounted's `popContext` removed the LAST sibling's frame instead of its own; the surviving sibling's frame was orphaned at the top of the global stack forever.

  Fix: capture the frame at push, register `unmountCallbacks.push(() => removeContextFrame(frame))`. Mirror of the framework's own `provide()` fix from [#725](https://github.com/pyreon/pyreon/issues/725).

  ### 3. `@pyreon/vue-compat` `createApp(C).provide(k, v).mount(el)` — app-level provisions pushed but never popped

  `createApp.mount()` ran `pushContext(new Map([[ctx.id, value]]))` for each app-level provision but the returned unmount function only ran `pyreonMount`'s cleanup — leaving the app-level frames on the global stack forever, one per provision per mount cycle.

  Real-app symptom: test harness or app entry calls `createApp(C).provide('A', a).provide('B', b).mount(el)` then unmounts. Two app-level frames stay on the context stack forever. SSG / re-mount cycles compound this.

  Fix: track every pushed frame in a local array during `mount()`, remove each by identity (reverse order) in the returned unmount closure.

  ### 4. `@pyreon/lint` `AstCache` — unbounded growth in LSP / `--watch` sessions

  `AstCache` (used by `lint` programmatic API, the LSP server, and `pyreon-lint --watch`) keyed by FNV-1a hash of source text with `cache: Map<string, …>` and NO eviction strategy. Each entry holds a multi-MB oxc-parsed AST + `LineIndex`. A long-running LSP session editing across many files accumulates one entry per UNIQUE content snapshot ever seen — after hours of editing, hundreds of MB of heap.

  Fix: LRU bound (default 256 entries). `Map` preserves insertion order, so the first key is the least-recently-used. `get` / `set` on an existing key refresh recency by re-inserting at the tail. Apps that lint thousands of distinct files in tight succession can bump the cap via `new AstCache(2048)`.

  ### Regression tests + bisect

  - `packages/tools/vue-compat/src/tests/provide-stack-leak-repro.test.ts` (2 specs) — `createApp().provide().mount(el); unmount()` returns the global context stack to baseline; 100 mount/unmount cycles do NOT accumulate frames. **Bisect-verified**: revert `vue-compat/src/index.ts` → both specs fail with stack-length assertions; restored → pass.
  - `packages/tools/lint/src/tests/ast-cache-lru.test.ts` (5 specs) — cache never exceeds `maxEntries`, evicts LRU on overflow, `get`/`set` refresh recency, re-setting an existing key doesn't double-count, default cap is 256. **Bisect-verified**: revert `lint/src/cache.ts` → all 5 fail; restored → pass.

  ### Validation

  - `@pyreon/core` 510/510 tests pass
  - `@pyreon/vue-compat` 218/218 tests pass (+ 2 new regression specs)
  - `@pyreon/lint` 639/639 tests pass (+ 5 new LRU specs)
  - Lint + typecheck clean across all 3 packages
  - Zero public-API breakage (`removeContextFrame` is a purely additive export)

  ### Audit byproducts (NOT in this PR — deliberately scoped follow-ups)

  The 12-package audit also surfaced 4 MEDIUM-risk patterns documented in the audit report. Each filed-worthy as a separate small follow-up:

  1. **`@pyreon/solid-compat` `createStore` per-path signal map grows unbounded** — one signal per UNIQUE read-path string. Problematic for stores with dynamic key spaces (dictionaries, pagination, logs).
  2. **`@pyreon/solid-compat` `createResource` has the Class-F stale-resolution race** — `fetchPromise` overwritten on refetch with no AbortSignal; old promise's success handler still runs `setData`. Same shape as [#730](https://github.com/pyreon/pyreon/issues/730)-charts/storage inflight-promise bug.
  3. **`@pyreon/svelte-compat` ChildInstance preservation discards `unmountCallbacks` without firing them** — the cached `writable.subscribe` short-circuit doesn't re-register the unsub after the reset. Subtle; needs a targeted reproducer.
  4. **`@pyreon/vite-plugin` per-instance caches (`signalExportRegistry`, `resolveCache`, `pyreonWorkspaceDirCache`, `islandRegistry`) never evict** stale entries when source files are deleted/renamed during a long `vite dev` session. Bounded by source tree size in practice, but no invalidation on file delete.

  Plus 6 LOW-risk patterns (devtools `expandedIds` accumulating across panel session, lint LSP debounceTimers not cleared on didClose, svelte-compat globalThis CTX_REGISTRY, vite-plugin HMR registry never deletes, vue-compat `_contextRegistry` global map, etc.) — none real leaks in practice, all bounded by user surface.

  ### `pyreon doctor` baseline

  Saved at `/tmp/doctor-tools-baseline.json`. 94 findings across `packages/tools/*`: 51 errors + 24 warnings + 19 infos. Top patterns: `lint/pyreon/no-window-in-ssr` (51, mostly devtools Chrome-extension false positives), `lint/pyreon/no-children-access` (10), `lint/pyreon/no-error-without-prefix` (10), `lint/pyreon/no-raw-addeventlistener` (9), `lint/pyreon/no-dom-in-setup` (7). Separate hardening pass; this PR addresses the structural bugs not caught by static lint rules.

- Updated dependencies [[`6454cb7`](https://github.com/pyreon/pyreon/commit/6454cb794bb82db11e7842cb4a62a3765e3dd3ac), [`eea2972`](https://github.com/pyreon/pyreon/commit/eea29723e36088ec32d3e817e0f5f61606c9b949)]:
  - @pyreon/compiler@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.21.0

## 0.20.0

### Patch Changes

- [#656](https://github.com/pyreon/pyreon/pull/656) [`abda63c`](https://github.com/pyreon/pyreon/commit/abda63c541343cfe967a5c70ce223a6675ceaa8e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `pyreon-lint` text output now follows the Pyreon brand handoff ([#651](https://github.com/pyreon/pyreon/issues/651)) — CLI spec §6.5 — matching the `pyreon doctor` change.

  New self-contained `lint/src/ansi.ts` (mirrors `@pyreon/cli`'s `doctor/render/ansi.ts`; no shared module — both are separate published packages that deliberately avoid a runtime ANSI dependency). Brand tokens map to their nearest **xterm-256** index, emitted as 8-bit SGR (`38;5;N`) — the handoff mandates _"256-color terminal palette must survive (no truecolor-only colors)"_, so there is no `38;2;r;g;b`. Mapping: error→ember-core `#FF5E1A` (202), warning→ember-warm `#FFC83D` (220), info→cyan `#22D3EE` (45); severity glyphs `✗` / `!` / `ℹ` per §6.5; file path `bold`, loc/ruleId `dim`. Ember stays scarce by construction (only the error + warning severities), as the brand mandates.

  Also closes a pre-existing correctness gap: `reporter.ts` previously emitted raw ANSI (`\x1b[31m`) **unconditionally** — colored output even when piped to a file or under `NO_COLOR`. `ansi.ts` adds the standard gate (`NO_COLOR` → off, `FORCE_COLOR=0/set` → off/on, else `process.stdout.isTTY`), parity with the doctor renderer.

  `--format json` and `--format compact` are untouched (machine formats, never colored). Verified: dependency-free proof the emitted codes are exactly `38;5;{202,220,45}` with zero `38;2` truecolor, and `NO_COLOR` yields plain text; `@pyreon/lint` reporter tests 10/10 pass; oxlint clean.

- Updated dependencies [[`c3df9db`](https://github.com/pyreon/pyreon/commit/c3df9dbbcf9e939c92e1c4843b59686cdd25589e), [`9a54705`](https://github.com/pyreon/pyreon/commit/9a54705c645ff2c3bee54fa8c6d411d1530b3187), [`bbccaaf`](https://github.com/pyreon/pyreon/commit/bbccaaf3ec2f5dc3eed3e7195a09023fc59575d1), [`24a063c`](https://github.com/pyreon/pyreon/commit/24a063ccfa2ef267927dfd68886be24c397ccd72), [`a086769`](https://github.com/pyreon/pyreon/commit/a0867699bdeca87f34e60fef7aa867a75a24d815), [`65e61eb`](https://github.com/pyreon/pyreon/commit/65e61eba20741a012b753b4c8c69045f408768b7)]:
  - @pyreon/compiler@0.20.0

## 0.19.0

### Minor Changes

- [#632](https://github.com/pyreon/pyreon/pull/632) [`bcc3cd5`](https://github.com/pyreon/pyreon/commit/bcc3cd50d3cc19b486a8169fbe941848edd793c7) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(lint): opt-in, dependency-auto-detected best-practice rules (frontend a11y/CLS + query/rx/form)

  Adds 7 best-practice rules across 3 new categories plus a new opt-in
  preset and the dependency-detection foundation that makes them
  zero-config and zero-noise. `pyreon doctor` surfaces them automatically
  (its lint gate already maps every lint category), so no `@pyreon/cli`
  change is needed.

  **New rules (74 rules / 16 categories total, up from 67/13):**

  - `frontend` (4): `pyreon/require-img-alt` (a11y — error), `pyreon/img-requires-dimensions` (CLS/layout-shift — warn), `pyreon/no-positive-tabindex` (a11y, **auto-fixable** → `0`), `pyreon/prefer-zero-image` (asset optimization — info, gated on `@pyreon/zero`).
  - `query` (1): `pyreon/query-options-as-function` — `useQuery`/`useInfiniteQuery`/`useQueries`/`useSuspenseQuery` with an options **object literal** breaks signal-tracked refetch; wrap in `() => ({ ... })` (error; `useMutation` excluded).
  - `rx` (1): `pyreon/rx-prefer-pipe` — nested rx transforms → compose with `pipe(...)` for one computed (info).
  - `form` (1, extends the existing category): `pyreon/no-signal-in-form-initial-values` — a signal read in `useForm({ initialValues })` snapshots once; pass the plain value / use a reactive field (warn).

  **Configurability (all three levels):**

  1. **Opt-in by default** — every new rule sets `meta.optIn: true`: forced
     OFF in `recommended` / `strict` / `app` / `lib` (never a surprise
     score/CI penalty). The new `best-practices` preset enables them
     wholesale; per-rule `.pyreonlintrc.json` config always overrides.
  2. **Dependency auto-detection** — library-scoped rules self-gate on the
     project's `package.json` (`dependencies` / `devDependencies` /
     `peerDependencies` / `optionalDependencies`, + the package's own name
     for in-lib source) via the new `utils/project-deps:isProjectDependency`
     (cached per manifest). A project that doesn't use `@pyreon/query`
     never sees query rules.
  3. **Path exemption** — all support `exemptPaths` like the other
     exemptable rules.

  **AI-actionable:** every rule's message is prescriptive (states the fix),
  so an assistant reading `pyreon doctor` / `pyreon-lint` output knows
  exactly how to resolve it; `no-positive-tabindex` autofixes with `--fix`.

  New public surface: `PresetName` gains `'best-practices'`; `RuleCategory`
  gains `'frontend' | 'query' | 'rx'`; `RuleMeta` gains optional `optIn`;
  `isProjectDependency` exported from `@pyreon/lint`. Backward-compatible
  (opt-in default = no behavior change for existing consumers).

  Bisect-verified per rule (FIRES / DOES-NOT-FIRE + dep-absent specs);
  `@pyreon/lint` 576 tests pass; foundation covered by dedicated
  `project-deps.test.ts` + `best-practices-preset.test.ts`.

- [#634](https://github.com/pyreon/pyreon/pull/634) [`82d78b4`](https://github.com/pyreon/pyreon/commit/82d78b4889344bad26175d4adf07c682d639dfa3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(lint): autofix `query-options-as-function` + extend best-practice rules to i18n & router (76 rules / 17 cat)

  Follow-up to [#632](https://github.com/pyreon/pyreon/issues/632) (extend more libraries + autofix the mechanically-safe ones).

  - **`pyreon/query-options-as-function` is now auto-fixable** (`--fix`): the
    options object literal is wrapped in `() => (...)` (pure syntactic
    thunk; the intended reactivity fix, no other behavior change).
  - **New opt-in rule `pyreon/i18n-prefer-trans-for-rich-jsx`** (`i18n`
    category — new; severity `info`; dep-gated `@pyreon/i18n`): flags
    `{t('…')}` interleaved with JSX element siblings (rich content) —
    use `<Trans>`. Zero-FP: a single element's children-array check;
    plain-text `{t('title')}` never fires.
  - **New opt-in rule `pyreon/prefer-typed-search-params`** (`router`
    category; severity `info`; dep-gated `@pyreon/router`): manual
    `new URLSearchParams(...)` in a router-aware file → use
    `useTypedSearchParams()`. Zero-FP: literal `new URLSearchParams` +
    in-file `@pyreon/router` import.

  Both new rules follow the [#632](https://github.com/pyreon/pyreon/issues/632) contract: `meta.optIn: true` (off in
  `recommended`/`strict`/`app`/`lib`; enabled by the `best-practices`
  preset or per-rule config), `package.json` dependency auto-detection,
  `exemptPaths`, prescriptive AI-actionable messages. `RuleCategory` gains
  `'i18n'`. Backward-compatible (opt-in default = no behavior change).

  Bisect-verified per rule + per autofix; `@pyreon/lint` 595 tests pass
  (incl. updated count/category/opt-in-set meta-tests + a new
  `bp-extend-rules.test.ts`). Docs (CLAUDE.md, lint.md, README,
  anti-patterns.md, manifest) updated.

- [#639](https://github.com/pyreon/pyreon/pull/639) [`8f1aad3`](https://github.com/pyreon/pyreon/commit/8f1aad3cc44d86f9248cfd4b7def10c914748bb0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(lint): 4 opt-in best-practice rules — frontend a11y + dep-gated @pyreon/storage

  Adds 4 opt-in rules (80 rules / 18 categories, up from 76 / 17) on the
  existing `meta.optIn` + dependency-auto-detection foundation. `pyreon
doctor` surfaces them automatically (its lint gate is category-agnostic,
  keyed on `meta.optIn`); the `recommended`/`strict`/`app`/`lib` presets
  force them OFF, the `best-practices` preset enables them at declared
  severity. Backward-compatible (opt-in default = no behavior change).

  **Frontend a11y (category `frontend`, all `optIn`):**

  - `pyreon/no-autofocus` (warn, **fixable**) — the `autoFocus`/`autofocus`
    attribute moves focus on mount, disorienting screen-reader/keyboard
    users. Skips `autoFocus={false}`. Fix removes the attribute.
  - `pyreon/no-redundant-role` (warn, **fixable**) — a `role` that
    duplicates the element's implicit ARIA role. Conservative tag→role map
    (zero-FP: `a`→`link` only with a static `href`; dynamic values and
    component elements skipped). Fix removes the attribute.
  - `pyreon/anchor-is-valid` (warn) — `<a>` with no `href`, or `href` of
    `""` / `#` / `javascript:`. Not fixable (button-vs-link intent is
    ambiguous); `href={dynamic}` skipped.

  **Library best-practice (new category `storage`, `optIn` + dep-gated):**

  - `pyreon/no-storage-write-as-call` (error, **fixable**) — gated on a
    declared `@pyreon/storage` dependency. `useStorage` /
    `useSessionStorage` / `useCookie` / `useIndexedDB` / `useMemoryStorage`
    return a `StorageSignal`; `s(next)` reads-and-discards the argument
    like any signal call. Same proven conservative shape as the
    `signal-write-as-call` detector (tracks the `const s = useStorage(...)`
    binding, fires only on a bare-identifier call with ≥1 arg, skips
    `.set`/`.update`/`.remove` and zero-arg reads). Fix: `s(x)` → `s.set(x)`.

  Deferred with rationale (NOT silently dropped): `control-needs-label`
  and broad machine/hotkeys/permissions/state-tree rules — label/aria
  association and those surfaces need cross-element id / scope / type
  resolution an AST walker can't do without false positives (the explicit
  "high-risk cliff" the codebase avoids for detectors).

  Each rule ships paired FIRES / DOES-NOT-FIRE specs (the dep-gated one
  also a "dep absent → silent" spec); bisect-verified (disabling
  `context.report` in `no-storage-write-as-call` fails its 3 fire/fix
  specs, restored → 9/9). New public surface: `RuleCategory` gains
  `'storage'`. Meta-tests updated (rule count 76→80, category counts,
  `best-practices-preset` opt-in set 9→13). `@pyreon/lint` 634 tests
  pass; manifest regenerated `llms-full.txt` + MCP `api-reference.ts`
  (`gen-docs --check` clean); oxlint + typecheck clean.

- [#601](https://github.com/pyreon/pyreon/pull/601) [`9de49da`](https://github.com/pyreon/pyreon/commit/9de49dab97c91c8707decd10ce89085d8d6942e0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - New rule `pyreon/no-heavy-import-only-in-handler` (performance, warn).

  Flags a statically-imported heavy module (`@pyreon/charts` / `code` / `flow` / `document`, plus any extra modules configured via the `heavyModules` option) that is referenced **only** inside deferred scopes — JSX `on*` event handlers or `onMount` / `onUnmount` / `onCleanup` lifecycle callbacks. The static `import` forces the heavy chunk into the initial bundle even though nothing touches it until the user interacts; the fix is a dynamic `await import()` inside the handler.

  ```tsx
  // ✗ flagged — @pyreon/charts only used in a click handler
  import { renderChart } from '@pyreon/charts'
  <button onClick={() => renderChart(el)}>Show chart</button>

  // ✓ heavy chunk stays out of the initial bundle
  <button onClick={async () => {
    const { renderChart } = await import('@pyreon/charts')
    renderChart(el)
  }}>Show chart</button>
  ```

  The precise, actionable counterpart to the blunt info-level `pyreon/no-eager-import` (which fires on every heavy static import including ones genuinely needed at render). This rule fires only when **every** reference is provably deferred, so the recommended fix is unambiguous. Conservative by construction: any eager reference at all — a `<Chart/>` JSX element, a module-eval `const x = heavy`, a plain helper called at render — suppresses the report (a false negative is acceptable; telling someone to defer an import they need at render is not).

  `effect` / `renderEffect` are deliberately **not** treated as deferred: their callbacks run synchronously during component setup, so a heavy module used in an effect body is a render-time dependency, not a deferrable one.

  Rule count 67, performance category 5. No breaking changes.

- [#611](https://github.com/pyreon/pyreon/pull/611) [`070a0ec`](https://github.com/pyreon/pyreon/commit/070a0ec687ad598cf15963e5615bb1d8c81933a3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - **Reactivity Lens (experimental)** — surface the compiler's already-computed reactivity analysis back to the author at the source.

  Pyreon's [#1](https://github.com/pyreon/pyreon/issues/1) silent footgun: whether code is reactive is invisible at the moment you write it. The compiler ALREADY decides this per-expression for codegen and discards the analysis. The Lens pipes it back.

  - `@pyreon/compiler`: additive opt-in `TransformOptions.reactivityLens` → `TransformResult.reactivityLens: ReactivitySpan[]` (emitted code byte-identical with it on/off; all existing compiler tests pass unchanged). New exports `analyzeReactivity()` / `formatReactivityLens()` + `ReactivityKind` / `ReactivitySpan` / `ReactivityFinding` types. `analyzeReactivity` merges the structural compiler facts with the existing `detectPyreonPatterns` footgun detectors under one taxonomy.
  - `@pyreon/lint`: the existing `--lsp` server gains an `inlayHintProvider` + `textDocument/inlayHint` handler rendering `live` / `static` / `live·prop` / `hoisted` ghost-text at each reactive/baked-once expression; footguns publish as `pyreon-lens` warning diagnostics. Adds a `@pyreon/compiler` dependency.

  JS-backend only (native Rust sidecar parity is a follow-up). The positive "this is live" claim is a faithful record of the codegen branch, not a heuristic — drift-gated + bisect-verified.

### Patch Changes

- [#638](https://github.com/pyreon/pyreon/pull/638) [`dcd2136`](https://github.com/pyreon/pyreon/commit/dcd21360cca7528cbfe87020428394a11aa30ea0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(cli): doc-claims gate covers lint-rule / lint-category / detector-code counts

  Extends the `doc-claims` gate (consumed by `pyreon doctor` AND
  `scripts/check-doc-claims.ts`) from 2 to 5 source-of-truth counters,
  7 → 19 claim sites:

  - **lint rule count** — the `allRules` array in
    `packages/tools/lint/src/rules/index.ts`. Claim sites: CLAUDE.md (×3),
    the package README, `docs/docs/lint.md`, `lint/src/manifest.ts` (6×).
  - **lint category count** — distinct `category:` literals across the
    rule files. Claim sites: CLAUDE.md (×2), README, manifest.
  - **detector-code count** — the `PyreonDiagnosticCode` union in
    `packages/core/compiler/src/pyreon-intercept.ts`. Claim sites:
    `.claude/rules/anti-patterns.md`, CLAUDE.md.

  New `ClaimSpec.all` flag asserts EVERY occurrence of a pattern in a file
  agrees (not just the first) — `manifest.ts` carries the rule count 6×;
  bumping 5 of 6 would otherwise pass silently.

  **Counters TEXT-PARSE in-repo source via `repoRoot`, never
  `import { allRules }`.** A dynamic import resolves via bun's module
  cache to a STALE published snapshot (observed: 0.18.0 cache → 66 rules
  while the working tree had 76); asserting against that is worse than no
  gate. Same `repoRoot`-relative approach the existing hook/doc-page
  counters already use.

  Fixes the live drift this gate immediately surfaced on `main`:
  `lint/src/manifest.ts` (`62`/`67`/`13` → `76`/`76`/`17` across 3
  occurrences) and `.claude/rules/anti-patterns.md` ("flags 12" → 15).
  The `@pyreon/lint` manifest correction regenerates `llms-full.txt` +
  the MCP `api-reference.ts` region (`bun run gen-docs`).

  Bisect-verified: stubbing `countLintRules → 0` fails the real-repo
  shape + 2 new specs; restored → all 27 cli gate tests pass. Gate green
  (19/19); `gen-docs --check`, lint manifest-snapshot, oxlint, cli +
  lint typecheck all clean.

- [#630](https://github.com/pyreon/pyreon/pull/630) [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix: make `pyreon doctor` objective + close the real first-party findings it then surfaced

  `pyreon doctor` reported a meaningless **F (score 55, 987 errors)** because
  its `lint` / `react-patterns` / `pyreon-patterns` gates scanned the WHOLE
  repo: example apps (intentionally framework-idiomatic, incl. react-compat
  demos), `e2e/`/`docs/`/`scripts/`, detector test-fixtures (which
  _deliberately_ contain anti-patterns so the detectors can be tested), and
  the `*-compat` packages (whose public API IS React/Vue/etc. by design).
  ~705/987 errors were examples + fixtures; the rest a never-CI-enforced
  advisory backlog or by-design.

  **Objectivity (the deliverable):** the three gates now audit ONLY
  first-party published source — `packages/<cat>/<pkg>/src/**`, excluding
  tests/fixtures/`.d.ts` — via pure, unit-tested predicates
  (`isFirstPartySourceFile` / `isCompatPackageFile`); `react-patterns`
  additionally skips `*-compat` src (a React-API shim containing `useState`
  is a definitional false positive). Errors **987 → 86**.

  **Detector precision (false positives are the antithesis of objective):**

  - `@pyreon/compiler` `dot-value-signal`: now requires the receiver to be a
    tracked signal binding — no longer flags `input.value` / `cell.value` /
    `o.value` (17 FPs; bisect-verified).
  - `@pyreon/lint` `no-window-in-ssr`: recognizes field-captured typeof
    (`this.isSSR = typeof document === 'undefined'`) and function-head
    early-return guards covering nested closures (bisect-verified).
  - `@pyreon/lint` `no-bare-signal-in-jsx`: now supports `exemptPaths`
    (consistent with the other exemptable rules) — render-function
    primitives read signals in JSX _attribute_ positions which the compiler
    `_rp()`-wraps; the text-position heuristic over-fired there.

  **Genuine first-party SSR bugs fixed** (the rule correctly did NOT silence
  these — cross-function/method guards aren't lexically traceable):

  - `@pyreon/head` `createNewTag` — added `typeof document` guard.
  - `@pyreon/styler` `Sheet.mount()` — in-method `if (this.isSSR) return`.
  - `@pyreon/hotkeys` `detachListener` — `typeof window` guard.
  - `@pyreon/flow` flow-component — guarded `new ResizeObserver` with
    `typeof ResizeObserver === 'function'`.
  - `@pyreon/core` lifecycle — renamed a local `location` shadowing the
    browser global (hygiene; also removed an SSR-analysis false positive).

  **Curated `.pyreonlintrc.json`** exemptions (with rationale) for
  genuinely-non-SSR-runtime surfaces: `@pyreon/compiler` (build-time Node)
  and `*-compat` (DOM-runtime framework adapters, consistent with the
  existing `runtime-dom` exemption) for `no-window-in-ssr`; `*-compat` for
  `dev-guard-warnings` (intentional user-facing "[Pyreon] X not supported"
  guidance that must reach prod).

  **Result: errors 987 → 1.** The single remaining `no-window-in-ssr` in
  `@pyreon/ui-core` (`_isBrowser && matchMedia(...)`) is provably SSR-safe
  (short-circuit; `_isBrowser` is a `typeof`-AND const) — a documented
  known rule-precision limitation, left visible (NOT exempted: silencing it
  would hide future _real_ ui-core SSR bugs — anti-objective).

  Verified: 8 touched packages, 3091 unit tests pass; typecheck clean;
  full-repo `oxlint` 0 errors; e2e 127 specs pass (default 92 +
  ui-regression 26 + app-showcase 9); each detector change bisect-verified.

- Updated dependencies [[`5fb461a`](https://github.com/pyreon/pyreon/commit/5fb461aaf9fcc8d2a624af1442f4db97fd7f33c9), [`5b69841`](https://github.com/pyreon/pyreon/commit/5b69841a6ab30963977e276d120c33d66682da23), [`e274fce`](https://github.com/pyreon/pyreon/commit/e274fceeb37d0893c7425463e443185388fce475), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`6472de0`](https://github.com/pyreon/pyreon/commit/6472de00ffdbcff1fd453c125c404b75fc5cc46d), [`0408e47`](https://github.com/pyreon/pyreon/commit/0408e475e63770996eff17bfb6ac318e89c45df4), [`7e0fe1a`](https://github.com/pyreon/pyreon/commit/7e0fe1a4f7cbb68f7647d85bef843de90d04d506), [`c5b2ea2`](https://github.com/pyreon/pyreon/commit/c5b2ea2fe0df3f52b2af21e0d79b1e391ca9fad5), [`6581f07`](https://github.com/pyreon/pyreon/commit/6581f073293a72360fe9391990d08316e0dc5b4b), [`070a0ec`](https://github.com/pyreon/pyreon/commit/070a0ec687ad598cf15963e5615bb1d8c81933a3)]:
  - @pyreon/compiler@0.19.0

## 0.18.0

## 0.17.0

## 0.16.0

## 0.14.0

## 0.13.0

## 0.12.15

## 0.12.14

### Patch Changes

- [#247](https://github.com/pyreon/pyreon/pull/247) [`d199b67`](https://github.com/pyreon/pyreon/commit/d199b67edb4f2efa87721caa9708915278337513) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Code editor anti-pattern cleanup + lint rule precision

  `@pyreon/code`:

  - `editor.ts` `CustomGutterMarker.toDOM()`: added `typeof document === 'undefined'`
    early-return — the method is only invoked by CodeMirror at render time
    in a mounted browser, but the explicit guard documents the SSR-safety
    contract at the callsite.
  - `minimap.ts` `createMinimapCanvas` / plugin `update()` / `destroy()`: same
    pattern — typeof guards at function entry. The class-method paths only
    fire from the CodeMirror plugin lifecycle (browser-only) but the rule
    can't AST-trace that.
  - `bind-signal.ts` + 4 `editor.ts` computed/effect blocks: added inline
    `// pyreon-lint-disable-next-line pyreon/no-peek-in-tracked` suppressions
    for the canonical loop-prevention and imperative-ref-access uses of
    `.peek()`. These are intentional and correct — `.peek()` is THE official
    way to read a signal without subscribing.

  `@pyreon/lint`:

  - `no-window-in-ssr`: import-name shadowing — `import { history } from
'@codemirror/commands'` makes every later `history` identifier in the
    file refer to the import, not `window.history`. Same for default
    (`import history from …`) and namespace (`import * as history from …`)
    imports.
  - Runner suppression-comment alias: the `// pyreon-lint-disable-next-line
<rule-id>` syntax is now a recognised alias of the existing
    `// pyreon-lint-ignore <rule-id>` syntax. Several rule docstrings already
    documented `disable-next-line` — closing the docs / runtime gap.

  6 new bisect-verified regression tests for the rule + suppression changes.

- [#239](https://github.com/pyreon/pyreon/pull/239) [`ee1bc2b`](https://github.com/pyreon/pyreon/commit/ee1bc2b0dd3ce853eee4a72bcc8629ed0aa1cea5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Elements anti-pattern cleanup + lint rule precision

  `@pyreon/elements`:

  - `utils.ts`: replaced `process.env.NODE_ENV !== 'production'` (dead code in
    real Vite browser bundles — `process` is not polyfilled) with the
    tree-shake-friendly `import.meta.env?.DEV` gate. Typed through a narrowing
    interface so downstream packages don't need `vite/client` in their
    tsconfigs to type-check elements transitively.
  - `helpers/Wrapper/component.tsx`, `List/component.tsx`: replaced destructured
    props (`({ x, ...rest }) => …`) with `splitProps(props, OWN_KEYS)` to
    preserve reactive prop tracking.
  - `Overlay/useOverlay.tsx`: added `typeof window === 'undefined'` early-return
    guards at the entry points of `calcDropdownVertical`/`Horizontal`,
    `calcModalPos`, `getAncestorOffset`, and `setupListeners`. Each function
    is only reachable from a mounted browser context (via event handlers
    registered inside `onMount`), but the rule can't AST-trace that; the
    explicit guard documents the SSR-safety contract at the callsite.
  - `devWarn`: rewritten to use the shared `IS_DEVELOPMENT` flag (itself
    gated on `import.meta.env?.DEV`) so it tree-shakes in production.
  - Added `packages/ui-system/elements/vitest.browser.config.ts` +
    `src/__tests__/elements.browser.test.tsx` — the package's first real
    Playwright Chromium smoke test. Verifies Element/Portal/Text render into
    real DOM, a reactive text child updates on signal change, and
    `typeof process === 'undefined'` / `import.meta.env.DEV === true` in the
    browser bundle (catching the `typeof process` dead-code class of bug).
  - Devdep: `@vitest/browser-playwright`, `@pyreon/test-utils`, `@pyreon/core`,
    `@pyreon/reactivity`, `@pyreon/runtime-dom` added to elements.

  `@pyreon/lint` — `no-window-in-ssr`:

  - Logical-and guards with a typeof-derived const on either side now recognised
    (e.g. `IS_BROWSER && active() ? <Portal target={document.body} /> : null`).
    Short-circuit semantics mean the body only runs when the guard is truthy.

  `@pyreon/lint` — `no-bare-signal-in-jsx`:

  - Added `render` to the skip allowlist. `render()` from `@pyreon/ui-core` is
    a VNode-producing helper (takes ComponentFn/string/VNode, returns
    VNodeChild), not a signal read — its JSX call sites always produce a
    VNode and don't need `() =>` wrapping.

  `@pyreon/lint` — `dev-guard-warnings`:

  - Added conventional dev-flag name set (`__DEV__`, `IS_DEV`, `IS_DEVELOPMENT`,
    `isDev`) so imported dev gates (e.g. `import { IS_DEVELOPMENT } from '../utils'`)
    silence `console.warn` warnings inside their guarded branches. Same convention
    basis as the existing `__DEV__` identifier check — the rule can't follow
    cross-module imports to verify the binding resolves to `import.meta.env.DEV`,
    so the name is the contract.
  - Also added `VariableDeclaration` tracking for locally-bound dev-flag consts
    (`const x = import.meta.env.DEV === true` or similar).

  5 new bisect-verified regression tests for the rule precision improvements.

- [#234](https://github.com/pyreon/pyreon/pull/234) [`a8ab19d`](https://github.com/pyreon/pyreon/commit/a8ab19d2db8b764f3643f2fa50f721727b8ba0d1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Hooks anti-pattern cleanup + lint rule precision improvements

  `@pyreon/hooks`:

  - `useClipboard`: batch `text.set()` + `copied.set()` in the success branch so
    subscribers reading both see one update, not two. Added
    `typeof navigator === 'undefined'` early-return in `copy()` for SSR safety.
  - `useBreakpoint`, `useFocusTrap`, `useWindowResize`: listeners moved INSIDE
    `onMount` (co-located with their `window`/`document` registration) and
    cleanup returned from `onMount` instead of using a separate `onUnmount`
    call. Matches the Pyreon convention that `onMount` accepts a cleanup
    return value.
  - `useInfiniteScroll.setup()` and `useScrollLock.lock()/unlock()`: added
    `typeof document === 'undefined'` early-returns to make the SSR-safety
    contract explicit at the callsite (previously relied on ref-callbacks never
    firing on the server — brittle).

  `@pyreon/lint` — `no-window-in-ssr` rule precision (fewer false positives,
  fewer silent false negatives):

  - Track `typeof X` expressions via `UnaryExpression` enter/exit depth instead
    of the inert `parent.operator === 'typeof'` check (oxc's visitor does NOT
    pass `parent`).
  - Skip member-expression property names (`x.addEventListener`),
    object-property keys (`{ document: 1 }`), and import-specifier names via
    WeakSet pre-marking, for the same reason.
  - Skip TypeScript type-position nodes (`let x: Window`, `type T = Document`,
    etc.) via `TSTypeAnnotation`/`TSTypeReference`/`TSTypeAliasDeclaration`/
    `TSInterfaceDeclaration`/`TSTypeParameter` depth counter — type refs are
    erased at compile time, not runtime accesses.
  - Recognise `const isBrowser = typeof window !== 'undefined'` idiom: `if
(isBrowser) { … }` is now treated the same as `if (typeof window !==
'undefined') { … }`.
  - Recognise early-return-on-typeof guards: `if (typeof X === 'undefined')
return …` makes the rest of the function body implicitly typeof-guarded.
    Supports OR-chained form (`typeof X === 'undefined' || typeof Y ===
'undefined'`) for features needing multiple browser APIs.
  - Treat `onUnmount`, `onCleanup`, `effect`, `renderEffect` as safe contexts
    (same as `onMount`) — these only run after mount in the browser.
  - Ternary `typeof X !== 'undefined' ? safe : fallback` now tracked via
    `ConditionalExpression` enter/exit.

  `@pyreon/lint` — other rules fixed for the same oxc-no-parent root cause:

  - `no-props-destructure`: pre-mark `CallExpression` arguments via WeakSet so
    HOC factory args (`createLink(({ href }) => <a />)`) are correctly skipped
    — previously the `parent?.type === 'CallExpression'` check was inert.
  - `no-unbatched-updates`: added `schema: { exemptPaths: 'string[]' }` option
    so test files can be exempted from the rule (tests often need deliberate
    sequential `.set()` calls to observe intermediate debounce/throttle state).

  `@pyreon/lint` — type hygiene:

  - `VisitorCallback` signature narrowed to `(node: any) => void`. The earlier
    `parent?: any` second parameter was a false promise — oxc's walker never
    passes `parent`, and rules silently depended on an `undefined` value.

- [#244](https://github.com/pyreon/pyreon/pull/244) [`c69e178`](https://github.com/pyreon/pyreon/commit/c69e178c2f0155c073a680f357ff71c8f9eec6a8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Kinetic anti-pattern cleanup + lint rule precision

  `@pyreon/kinetic`:

  - `nextFrame` (utils.ts): added `typeof requestAnimationFrame === 'undefined'`
    early-return. SSR callers receive `0` instead of crashing — the rule
    recognises the guard and the safety contract becomes explicit.
  - `TransitionItem`, `TransitionRenderer`: replaced destructured props
    (`({ show, enter, leave, … }) => …`) with `props.x` access to preserve
    reactive prop tracking. Defaults hoisted out (`const appear = props.appear
?? false`).
  - Added `vitest.browser.config.ts` + `src/__tests__/kinetic.browser.test.tsx` —
    the package's first real Chromium smoke test. 5 tests covering Transition
    mount/child rendering, signal-driven show/hide, `nextFrame` scheduling,
    `mergeClassNames` filtering, and the `typeof process === 'undefined'` /
    `import.meta.env.DEV === true` checks that confirm the package works in
    a real browser bundle.
  - Removed `packages/ui-system/kinetic/` from `PHASE_5_PENDING_PACKAGES` in
    `scripts/check-browser-smoke.ts` (stale now that the smoke test exists).
  - Devdep: `@vitest/browser-playwright`, `@pyreon/test-utils`, `@pyreon/core`,
    `@pyreon/reactivity`, `@pyreon/runtime-dom` added.

  `@pyreon/lint` — `no-bare-signal-in-jsx`:

  - Skip allowlist extended to `h` and `cloneVNode` (VNode-producing helpers
    from `@pyreon/core`). Their JSX call sites always produce a VNode, not
    a signal value. Matches `render` (already in the list) from ui-core.

  `@pyreon/lint` — `no-window-in-ssr`:

  - Safe-context call set extended with `watch` (signal-driven watcher from
    `@pyreon/reactivity`) and `requestAnimationFrame`. Both run their
    callbacks post-mount in a browser, so browser-global reads inside them
    are safe.

  4 new bisect-verified regression tests for the rule precision changes.

- [#232](https://github.com/pyreon/pyreon/pull/232) [`9b0c758`](https://github.com/pyreon/pyreon/commit/9b0c75861b2137cd96d472288e11fa47edab7838) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Per-rule options API — ESLint-style tuple form for rule config

  - Rule entries now accept `Severity` OR `[Severity, RuleOptions]` — e.g.
    `"pyreon/no-window-in-ssr": ["error", { "exemptPaths": ["src/foundation/"] }]`.
    Bare-severity form continues to work.
  - Rules that support path-based exemption read `options.exemptPaths: string[]` —
    currently `no-window-in-ssr`, `no-raw-addeventlistener`, `no-raw-setinterval`,
    `no-process-dev-gate`, `dev-guard-warnings`.
  - `RuleContext` gains `getOptions(): RuleOptions`.
  - `RuleMeta` gains optional `schema: Record<string, 'string' | 'string[]' | 'number' | 'boolean'>`.
    Runner validates user config once per `(rule, options)` pair: wrong-typed
    values disable the rule + emit an error; unknown option keys emit a warning;
    rules without a schema accept any options.
  - Validation messages surface in `LintResult.configDiagnostics` (new field)
    in addition to stderr, so programmatic consumers / LSP / CI see them.
  - `.pyreonlintrc.json` entries can use the tuple form; a shipped JSON Schema
    (`schema/pyreonlintrc.schema.json`) gives IDE autocomplete + validation when
    referenced via `$schema`.
  - CLI: `--rule id=severity` still works; new `--rule-options id='{...}'`
    passes JSON-encoded options to a specific rule from the command line.
  - New exported helpers: `isPathExempt(context)` (reads `options.exemptPaths`)
    and `isTestFile(filePath)` (universal `*.test.*` / `/tests/` matcher).
  - `utils/package-classification.ts` renamed to `utils/file-roles.ts` (the
    monorepo-specific pattern arrays moved to the consuming project's config
    via `exemptPaths`).

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

## 0.12.13

## 0.12.12

## 0.12.11
