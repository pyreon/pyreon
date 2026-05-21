# @pyreon/reactivity

## 0.24.5

## 0.24.4

## 0.24.3

## 0.24.2

## 0.24.1

## 0.24.0

### Minor Changes

- [#785](https://github.com/pyreon/pyreon/pull/785) [`b8fb31c`](https://github.com/pyreon/pyreon/commit/b8fb31cf1a59578fc33f27d539695d2bc164b2f1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - LPIH: build-time `__sourceLocation` injection now covers `computed()` and `effect()` calls (R8 — extension of R4). Previously only `signal()` got the build-time literal; `computed()` and `effect()` still paid the runtime `new Error().stack` capture cost (~2.2 µs per creation when devtools is active).

  Three forms covered by the extended `injectSignalNames`:

  - `const x = signal(...)` → `signal(..., { name: "x", __sourceLocation: {...} })`
  - `const d = computed(() => ...)` → `computed(..., { name: "d", __sourceLocation: {...} })`
  - `effect(() => ...)` (unbound) → `effect(..., { __sourceLocation: {...} })` (no `name` — anonymous effects have no binding to derive from)

  Unbound `signal()` / `computed()` are left untouched (rare anonymous patterns). The unbound-effect pass uses negative lookbehind `(?<![\w$.])` to skip member-access (`obj.effect()`) and identifier-suffix (`sideEffect()`) false-positives.

  `@pyreon/reactivity` exposes the matching surface on the runtime side:

  - `ComputedOptions<T>` gains an `@internal __sourceLocation` field; `computed()` threads it through to both internal paths (`computedLazy` / `computedWithEquals`), preferring it over `_captureCallerLocation(2)` in `_rdRegister`
  - new `EffectOptions` interface with the same `@internal __sourceLocation` field; `effect(fn, options?)` accepts the second arg

  Bisect-verified: narrowing the bound regex to `signal`-only AND disabling the unbound-effect pass fails 6 of the 11 new R8 tests with the expected error shapes (e.g. `expected to have a length of 4 but got 1` on the multi-primitive injection count); restored → 26/26 (15 R4 + 11 R8) pass. No `TEMP BISECT` remnants in source.

  Full suites green: `@pyreon/reactivity` 377/377, `@pyreon/vite-plugin` 130/130.

  Closes R8 from the LPIH foundation PR ([#769](https://github.com/pyreon/pyreon/issues/769)) followups queue.

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

- [#780](https://github.com/pyreon/pyreon/pull/780) [`d4ec777`](https://github.com/pyreon/pyreon/commit/d4ec777643446ed2c51dedb1e74fbd8dce70bdfd) Thanks [@vitbokisch](https://github.com/vitbokisch)! - LPIH: sustained-rate hint via EWMA. Inlay-hint labels now show both cumulative fire count AND current fires/second when active — making hot-path debugging visible at a glance.

  ```tsx
  const count = signal(0); // 🔥 signal fired 240× (12/s) — active
  const stable = signal(0); // 🔥 signal fired 240×          — idle
  ```

  **Why**: cumulative count alone can't distinguish "this is firing right now" from "this fired a lot a few minutes ago." For hot-path debugging (the LPIH [#1](https://github.com/pyreon/pyreon/issues/1) use case), the user needs to see _current_ rate. Adding a decayed-EWMA rate alongside the cumulative count gives both signals without bloating the label.

  **Math**: per-node EWMA with 1-second time constant (`LPIH_RATE_TAU_MS = 1000`). On each fire:

  ```
  dt = ts - lastFire
  decay = exp(-dt / 1000)
  rate1s = rate1s * decay + 1
  ```

  At steady state of λ fires/sec, `rate1s → λ` (when λ·TAU ≫ 1 — true for any rate worth noticing). On read, decay-to-now applied: a node that stopped firing 1.5s ago shows ≈22% of its peak rate; 3s ago shows ≈5%; 5s ago shows ≈0.7% (below the visibility threshold).

  **`@pyreon/reactivity`**:

  - `FireSummary.rate1s: number` — new field, decayed to "now" at every `getFireSummaries()` call.
  - `NodeRec.rate1s` — internal per-node EWMA state, updated on every fire.
  - `LPIH_RATE_TAU_MS` — exported constant (1000 ms = 1 second time constant).
  - Bridge `writeLpihCache` now includes `rate1s` in each fire entry's JSON.

  **`@pyreon/compiler`**:

  - `LPIHFireDatum.rate1s?: number` — optional field; older runtimes that don't emit it produce labels without the rate suffix (backward-compatible).
  - `_LPIH_RATE_VISIBLE_THRESHOLD = 0.5` — rates below this are suppressed (don't show "0.1/s" or "0/s" noise from decayed-dormant nodes).
  - Default label formatter: `signal fired 240× (12/s)` when active, `signal fired 240×` when below threshold or no rate field.
  - Custom `formatDetail` callbacks receive the full `LPIHFireDatum` including `rate1s` for fully custom labels.
  - Multiple fires at the same line have their rates summed (consistent with the existing count-summing behavior).

  **`@pyreon/lint`**:

  - `LPIHCacheEntry.rate1s?: number` — round-trips through the cache; no LSP-side logic change beyond the type extension. The compiler's default formatter picks up the new field automatically.

  **Tests** (+12 new across all 3 packages, 2383 total, all green):

  - @pyreon/reactivity: 367 (+5 — rate1s captured, rises with bursts, decays after TAU, sums at same location, constant value lock)
  - @pyreon/compiler: 1316 (+7 — threshold-suppress, 1-decimal vs integer rounding, creation-site formatter, line-sum, custom formatter receives rate, missing-field passthrough)
  - @pyreon/lint: 700 (no new tests — rate1s is data-only round-trip through the cache; existing integration tests cover the path)

  **Memory + performance**: one extra `number` field per node (+8 bytes). One `Math.exp` per fire (~50 ns). One `Math.exp` per location per `getFireSummaries()` call. Bundle-budget impact: 0 (writeLpihCache code path was already in the subpath, this just adds one field to the JSON payload).

  **Bisect-verified**: stashing the EWMA update in `_rdRecordFire` fails the new "rate1s rises with rapid fires" + "rate1s for many rapid fires reflects fire density" tests.

  **Docs**: example block in `docs/docs/lpih.md` updated to show `(12/s)` rate suffix; new paragraph explaining the cumulative-count + current-rate split.

- [#781](https://github.com/pyreon/pyreon/pull/781) [`2abb672`](https://github.com/pyreon/pyreon/commit/2abb672d8a8bf7f4940af422bf8bf802aa129cdd) Thanks [@vitbokisch](https://github.com/vitbokisch)! - LPIH: build-time source-location injection via `@pyreon/vite-plugin`. Eliminates the runtime `new Error().stack` capture cost (~2.2 µs per signal creation) by embedding the source location as a compile-time literal.

  **Before** (foundation PR):

  ```ts
  // User source:
  const count = signal(0);

  // Runtime, when devtools active:
  // 1. new Error() + parse stack → ~2.2µs cost per creation
  // 2. Use parsed location for LPIH source-location capture
  ```

  **After** (this PR):

  ```ts
  // User source (unchanged):
  const count = signal(0);

  // Vite-transformed source (dev mode):
  const count = signal(0, {
    name: "count",
    __sourceLocation: { file: "app.tsx", line: 5, col: 14 },
  });

  // Runtime, when devtools active:
  // 1. Read options.__sourceLocation → ~0ns cost
  // 2. Use injected location directly — stack capture skipped
  ```

  **`@pyreon/reactivity`**:

  - `SignalOptions.__sourceLocation?: { file, line, col }` — new optional field (marked `@internal`, not part of the public API surface). When present, the runtime uses it directly and skips `_captureCallerLocation()` entirely.
  - 2 new tests proving the injected option is preferred over stack capture + the fallback still works when the option is absent.

  **`@pyreon/vite-plugin`**:

  - Extended `injectSignalNames` to ALSO inject `__sourceLocation` alongside the existing `name` field. Same regex, same transform pass — additive change.
  - New helpers `_computeLineStarts(code)` + `_offsetToLineCol(offset, starts)` — O(N) precompute + O(log N) per-signal binary search. Avoids O(N²) when many signals share a file.
  - The injected `file` is Vite's resolved module ID (absolute path) — the same path the runtime would have parsed from `new Error().stack`, so byte-identical behavior except for cost.
  - 15 new tests covering line/col math + injection at function-scope call sites + the 5 skip-cases (existing options, non-signal calls, multiline args, no-injection-for-doSomething, etc.).

  **Known limitation**: module-scope signals (`export const x = signal(0)`) get rewritten to `__hmr_signal()` first by the existing HMR injection pass. The location injection runs after and naturally skips them (regex matches `signal(` not `__hmr_signal(`). Module-scope signals still pay the runtime stack-capture cost. Function-scope signals (the dominant pattern in real Pyreon apps — signals declared inside components) get the full benefit. Module-scope follow-up tracked.

  **Tests** (+17 new across 2 packages, 481 total green):

  - `@pyreon/reactivity`: 362 (+2 — injected-location-preferred + stack-fallback-when-absent)
  - `@pyreon/vite-plugin`: 119 (+15 — line-starts utility, offset-to-line-col, 6 injection scenarios, existing-options skip, non-signal skip, multiline args)

  **Performance**:

  - Runtime cost (devtools active, function-scope signal): **0 ns** stack capture (was ~2.2 µs)
  - Build-time cost: ~10 µs per signal call site (one regex match + one binary search + ~80 bytes of literal output) — invisible on real-world builds
  - Bundle-budget impact: 0 (transform happens in dev-mode-only Vite plugin code path; no production bundle growth)

  **Bisect-verified**: removing the `__sourceLocation` literal from the injection emission makes the line/col-correctness tests fail with "expected to include `__sourceLocation`"; the runtime-side `signal() prefers __sourceLocation over stack capture` test verifies the runtime fast-path is actually wired (file path comes from the injected option, not the test file).

  This closes R4 from the [LPIH recommendations](https://github.com/pyreon/pyreon/blob/main/.claude/experiments/RECOMMENDATIONS.md). The 2.2 µs/creation overhead in the foundation PR's measurement is now eliminated for the majority of real-world signals.

### Patch Changes

- [#789](https://github.com/pyreon/pyreon/pull/789) [`67e1f37`](https://github.com/pyreon/pyreon/commit/67e1f371a20219481ee9564d2d7421ec2a0b5ddf) Thanks [@vitbokisch](https://github.com/vitbokisch)! - LPIH followups round audit — three real bugs found + fixed in lockstep:

  **1. Activation race in R1 auto-bridge (high impact)** — the injected `<script type="module">` used `import('@pyreon/reactivity').then(activate)`. Since `<script type="module">` tags execute in document order with `defer` semantics, dynamic-import-then resolves AFTER the module body completes — and the script body completed IMMEDIATELY since the `.then()` only registered a callback. Result: the app's entry script ran NEXT (document order), created its module-scope signals via `signal(0)` / `computed(...)`, those calls hit `_rdRegister` with `_active = false` (line 311 of `reactive-devtools.ts`), returned undefined → signals INVISIBLE to LPIH. The most common signal shape (top-of-file `const count = signal(0)`) was never tracked.

  Fix: top-level `await` on the dynamic import + `.catch(() => null)` for silent fallback when `@pyreon/reactivity` isn't in the dep graph. Top-level await delays module completion, so the LPIH script body doesn't finish until activation does — the next `<script type="module">` (the app entry) waits, signals get registered correctly.

  **2. Tmp file leak on `fs.writeFile` failure (low-medium impact)** — both `writeLpihCacheFile` (vite-plugin) AND `_writeToPath` (foundation `@pyreon/reactivity/lpih.ts`) had:

  ```ts
  await fs.writeFile(tmp, ...)   // outside try — partial tmp leaks if this throws
  try { await fs.rename(tmp, path) } catch { try { unlink(tmp) } catch {} }
  ```

  If `fs.writeFile` itself threw (disk full, EIO, EACCES, transient FS), the partial tmp file leaked on disk with a unique PID+seq name — accumulating forever. Fix: single try/catch covering both writeFile + rename; cleanup runs on either path's failure (ENOENT on the writeFile-failed path is swallowed, original error surfaces).

  Bisect-verifying THIS specific bug portably is hard (requires reliable disk-full or EIO reproduction), so the fix is structural — locked in by reading the diff. The companion `'cleans up tmp file when rename fails (rename onto a directory)'` test locks the pre-existing rename-failure path.

  **3. String-region false-positives in `injectSignalNames` (medium impact)** — the regexes `(?:const|let)\s+(\w+)\s*=\s*(signal|computed|effect)\(` (R4+R8 bound) and `(?<![\w$.])effect\(` (R8 unbound) matched anywhere in source text, including INSIDE string literals / template literals / comments. User code like:

  ```ts
  const docs = `effect(() => x)`;
  throw new Error("effect() must be called inside a component");
  // TODO: replace effect(() => log()) with watch()
  ```

  got `, { __sourceLocation: ... }` injected INTO the string/comment, corrupting runtime values and producing syntactically-broken docstrings.

  Fix: new `_maskStringsAndComments(code)` pre-pass produces a same-length copy of `code` with strings/comments blanked to spaces (newlines preserved so line numbers don't shift). Regexes run against the masked version; args extraction reads from the original. Template-literal `${...}` interpolations are PRESERVED as code (their bodies can contain real `signal()` calls worth catching). Bisect-verified: disabling the masking pre-pass fails 5 of the new false-positive guard tests.

  Test counts:

  - vite-plugin: 154 → 173 (+19): 11 `_maskStringsAndComments` unit tests, 6 false-positive guards, 1 top-level-await structural test, 1 rename-failure tmp cleanup test
  - reactivity: 377/377 unchanged (foundation tmp-leak fix doesn't add tests; bisect-verified structurally by reading the diff)

## 0.23.0

## 0.22.0

## 0.21.0

## 0.20.0

### Minor Changes

- [#703](https://github.com/pyreon/pyreon/pull/703) [`3499594`](https://github.com/pyreon/pyreon/commit/3499594585b7fcb650ac0f80be4bc355f741491b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Reactive devtools bridge — an opt-in, leak-free introspection layer over
  the live signal / computed / effect graph.

  `@pyreon/reactivity` gains `activateReactiveDevtools()` /
  `deactivateReactiveDevtools()` / `isReactiveDevtoolsActive()` /
  `getReactiveGraph()` / `getReactiveFires()` (+ `ReactiveNode` /
  `ReactiveEdge` / `ReactiveGraph` / `ReactiveFire` types). It tracks the
  live reactive graph (nodes + dependency edges, derived fresh from the
  real subscriber Sets) and a bounded fire timeline.

  `@pyreon/runtime-dom` exposes it on `window.__PYREON_DEVTOOLS__.reactive`
  (`activate` / `deactivate` / `getGraph` / `getFires`), powering the
  `@pyreon/devtools` Signals / Graph / Effects / Console surfaces.

  Zero cost until a devtools client attaches: every instrumentation entry
  point early-returns on `!active`, sits inside the existing
  `process.env.NODE_ENV !== 'production'` gate (fully tree-shaken in
  production — verified by a minified-bundle regression test), and never
  retains a signal/computed/effect (WeakRef + FinalizationRegistry; the
  fire buffer holds only ids + timestamps). No behavior change when
  inactive (the default).

## 0.19.0

### Minor Changes

- [#598](https://github.com/pyreon/pyreon/pull/598) [`9f03747`](https://github.com/pyreon/pyreon/commit/9f037478763d9f8cd2365feb63dc87fda2545e5d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Error reports now carry the reactive run-up to the crash.

  For a signal framework, the first question a crash raises isn't _what threw_ — the stack answers that — it's _what reactive state led there_. Pyreon's `ErrorContext` previously carried component / phase / props / error but nothing about the signal activity that produced the bad state.

  **New: `ErrorContext.reactiveTrace`** — the last ~50 signal writes (chronological, oldest → newest) leading up to the error. The causal _sequence_, not a point-in-time snapshot (a snapshot of every value can't explain _how_ the app reached the bad state; the order of writes can). Populated automatically — every registered error handler (Sentry/Datadog/console) gets it for free:

  ```ts
  registerErrorHandler((ctx) => {
    Sentry.captureException(ctx.error, {
      extra: { component: ctx.component, reactiveTrace: ctx.reactiveTrace },
      // e.g. [{ name: 'status', prev: '"idle"', next: '"submitting"' },
      //       { name: 'user',   prev: 'null',    next: 'User {id, …}' }]
    });
  });
  ```

  **New: `getReactiveTrace()` / `clearReactiveTrace()`** (`@pyreon/reactivity`) — read / reset the buffer directly (devtools, test isolation), plus the `ReactiveTraceEntry` type.

  Design properties:

  - **Zero production cost.** The recorder feeding the buffer sits behind the bundler-agnostic production dead-code gate in `signal.ts` `_set` and tree-shakes out of prod bundles. `reactiveTrace` is simply `undefined` in production. Verified: bundle budgets unchanged (all 54 within budget), perf-harness tree-shake regression passes.
  - **Bounded + leak-safe.** Fixed-size (~50-entry) ring buffer, oldest-evicted, never grows. Stores **truncated string previews** of values — never raw references — so it can't pin large arrays / detached DOM / closures, and is always safe to serialize into a report. Hostile values (throwing getters, cycles, huge strings, BigInt) are handled without throwing.
  - **Distinct from `onSignalUpdate`.** That is opt-in and captures stacks (expensive, for time-travel debugging). This is always-on in dev, deliberately cheap (no stack), and exists specifically to enrich error reports.
  - **Best-effort.** Trace capture in `reportError` is wrapped so a buggy/empty trace can never block the real error from reaching handlers. Caller-supplied `reactiveTrace` is never overwritten.

  Bisect-verified at both layers: (1) removed the `_recordSignalWrite` call → reactivity ring-buffer tests fail; (2) removed the `reportError` enrichment → `telemetry.test.ts > attaches recent signal writes` fails at `expect(captured?.reactiveTrace).toBeDefined()`; restored → all pass. Suites: `@pyreon/reactivity` 290, `@pyreon/core` 497.

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

- [#626](https://github.com/pyreon/pyreon/pull/626) [`ecd8e52`](https://github.com/pyreon/pyreon/commit/ecd8e526943a1e6b07957ff96f4410fa482baa0d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix: `computed.direct()` no longer leaks (and no longer degrades `recompute`) under register/dispose churn.

  `computed`'s `directFns` was a flat array whose disposer only nulled the slot (`arr[idx] = null`) and never compacted. A long-lived computed (a derived theme/locale/auth value, or one read inside churning `<For>` rows) whose direct updaters register and dispose repeatedly therefore accumulated one **permanent dead slot per ever-registered binding** — app-lifetime memory growth — AND made `recompute` iterate **O(total-ever-registered)** instead of O(live), on the compiler-emitted `_bindText`/`_bindDirect` notify path.

  This is the **exact bug class already fixed for `signal._d`** (`signal.ts` `_directFn`, shipped + e2e-verified in [#612](https://github.com/pyreon/pyreon/issues/612)). `computed` was simply left on the broken array pattern. Fix: `directFns` is now a `Set` (same as `signal._d` / `host._s`) — O(1) add/delete, O(live) iteration, bounded growth.

  `computed` now also exposes the live set as an `@internal` `_d` accessor (mirroring `signal._d`) purely so the regression is deterministically assertable.

  **Verification.** New regression test: 10 000 `computed.direct()` register+dispose cycles on a long-lived computed → asserts the live set stays `size 0` (bounded), one live binding → `size 1` and still fires, disposed → `size 0` and not invoked. Bisect-verified: reverting to the array form fails the test (`_d` is an array → `.size` undefined); restored → 295/295 reactivity tests pass. `bun run coverage` exit 0 (`@pyreon/reactivity` 94.64 %); lint + typecheck clean. e2e coverage is inherited from the structurally-identical `signal._d` Set conversion already validated end-to-end in [#612](https://github.com/pyreon/pyreon/issues/612) (same compiler-binding notify path).

- [#589](https://github.com/pyreon/pyreon/pull/589) [`c4b6e9a`](https://github.com/pyreon/pyreon/commit/c4b6e9a5850196171c2197fc918163f736708aa8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Release pipeline: `scripts/publish.ts` now creates the local `<name>@<version>` git tag before emitting each `New tag:` line.

  Without this, `changesets/action` would parse the `New tag:` lines (populating `outputs.published`) but then fail when its tag-push step tried `git push origin <name>@<version>` — the local tag didn't exist (`src refspec X does not match any`). The step exited non-zero, the gated umbrella GitHub Release step skipped, and `release-native.yml` never triggered → 7 platform compiler binaries never published.

  The 0.18.0 release hit exactly this path: all 55 npm packages published successfully, but the post-publish step failed → no v0.18.0 tag, no GitHub Release, no native binaries until manual recovery.

  Mirrors what `changeset publish` (the CLI command) does natively — emit `New tag:` AND create the local annotated tag. Idempotent: skips creation if the tag already exists locally (retried runs work).

  Also fixes the `actions/download-artifact` SHA pin in `release-native.yml` — the prior pin `cc20338…` was a transcription error; real v5.0.0 SHA is `634f93cb…`. Every Publish job in the v0.18.0 run 25873293958 failed at "Set up job" with `Unable to resolve action … unable to find version <SHA>` because of this. No prior release exercised the code path (previous workflow_dispatch runs used `publish: 'false'` which skips the publish matrix). Both bugs together blocked native binaries from publishing alongside the npm release.

- [#592](https://github.com/pyreon/pyreon/pull/592) [`fb40906`](https://github.com/pyreon/pyreon/commit/fb409066e49e44c42f77084a92a68103a4e6c5ef) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Release pipeline: `release-native.yml` Publish step now uses npm OIDC trusted publishing instead of `NODE_AUTH_TOKEN`.

  The prior shape (`NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`) resolved to empty string because the repo doesn't store an `NPM_TOKEN` secret — Pyreon's main release flow works without one because `changesets/action` does the OIDC exchange internally, but `release-native.yml`'s raw `npm publish` doesn't. setup-node then wrote `_authToken=` (empty) into `.npmrc`, and npm tried to use the empty token, failing with `ENEEDAUTH` instead of falling back to OIDC.

  Removing the env line lets npm 11+ (shipped with Node 24) perform the OIDC token exchange natively, with `id-token: write` already granted at the workflow level. No long-lived secret stored anywhere; per-publish tokens are scoped to workflow + package + commit SHA, and published tarballs gain provenance attestations.

  **One-time manual bootstrap required** (see `CONTRIBUTING.md` → "Native binary publishing"): the 7 `@pyreon/compiler-<triple>` packages have never been published, and npm trusted publishing is configured on a package's own settings page — it **cannot** be set up for a package that doesn't exist yet (npm has no account/org-level pre-registration flow). The OIDC path here works for every release _after_ a one-time manual first publish brings the 7 packages into existence; trusted publishing is then configured per-package and all subsequent releases are automated. `scripts/bootstrap-native-publish.ts` stages the CI-built binaries and prints the manual publish commands.

- [#631](https://github.com/pyreon/pyreon/pull/631) [`3374150`](https://github.com/pyreon/pyreon/commit/33741500499dfb487d031bbffe77723d74b8f261) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Coverage-harden `@pyreon/reactivity` — close the RED coverage gate on the foundation package.

  **Finding (measured, not speculative).** `@pyreon/reactivity` — the package every other Pyreon package transitively depends on (signal / computed / effect / batch) — had drifted **below its own enforced coverage threshold**: branches at **87.38%**, under the 90% global threshold that `@vitus-labs/tools-vitest`'s `createVitestConfig()` sets. The package's own `bun run test` was exiting **non-zero** (`ERROR: Coverage for branches (87.38%) does not meet global threshold (90%)`). The previously-documented invariant "All packages maintain >95% on all 4 metrics" was doubly inaccurate: the enforced gate is 90% (not 95%), and reactivity wasn't even at 90%. Untested branches in the reactivity core are the single highest-leverage release-stability risk in the monorepo.

  **No bug found.** Every uncovered region was a genuine untested edge case in _correct_ code — error-handler branches (throwing computed / throwing inner-effect disposal), the batching-vs-inline dual notify paths, the `setSnapshotCapture` DI-hook restore branch, multi-dependency `renderEffect` cleanup, `Cell` single→Set listener promotion, `createSelector` bucket-notify branches, and `reactive-trace`'s `preview()` value-shape matrix (arrays / named instances / >4-key objects / unstringifiable revoked-Proxy / long-string truncation). This is coverage hardening + a doc-accuracy correction, NOT a fix PR — so the bisect-verify mandate (revert fix → assert failure) does not apply; there is no fix to revert. Each of the 16 added tests asserts real observable behaviour (notify ordering, recovered-after-throw values, restore-call sequencing), not coverage-gaming shape.

  **Result.** `packages/core/reactivity/src/tests/coverage-hardening.test.ts` (+16 tests). Reactivity coverage moved **statements 94.64 → 96.47 · branches 87.38 → 90.76 · functions 95.48 → 97.74 · lines 95.94 → 97.62**; all 4 metrics now ≥90%, `bun run test` **exits 0** (gate GREEN). 311/311 reactivity tests pass.

  **Doc-hygiene (same PR, per continuous-learning).** `.claude/rules/testing.md`'s "All packages maintain >95% on all 4 metrics" line was false on both counts; corrected to state the _real enforced contract_ (90% global threshold = the blocking gate; >95% is the aspiration, not a guaranteed invariant) with the reactivity drift as the worked example.

  **Known remaining (deliberate, tracked follow-ups — not silently dropped):**

  - `tracking.ts` 72-73 (the `cleanupEffect` WeakMap `effectDeps` branch) appears genuinely **unreachable** in the current codebase — both `effect` and `computed` always set a deps-collector around `withTracking`, so `trackSubscriber` never takes the WeakMap path. That is a _suspected-dead-code_ finding that needs its own rigorous reachability proof + removal PR ("understand before changing" / "one concern per PR") — not something to rip out of framework infrastructure inside a coverage PR.
  - `batch.ts` 104-116 (the `MAX_PASSES` infinite-re-enqueue dev guard) is exercised by a test that passes in isolation but is global-batch-state-fragile across the full suite; a deterministic, non-flaky cover for it is a separate hardening task (a flaky test is worse than an uncovered defensive `__DEV__` branch).
  - Other packages were not surveyed for coverage drift in this PR — scope was deliberately bounded to the one package whose gate was RED. A monorepo-wide coverage-drift sweep is a worthwhile separate effort.

## 0.18.0

## 0.17.0

## 0.16.0

## 0.14.0

## 0.13.0

## 0.12.15

## 0.12.14

## 0.12.13

## 0.12.12

## 0.12.11

## 0.7.2

## 0.7.1

## 0.7.0

### Minor Changes

- feat(reactivity): add `onCleanup()` for registering cleanup functions inside effects

## 0.6.0

## 0.5.7

### Patch Changes

- fix: update build tooling to produce correct .d.ts type declarations instead of JS implementation code

## 0.5.6

## 0.5.4

## 0.5.3

## 0.5.2

## 0.5.1

## 0.5.0

## 0.4.0

## 0.3.1

### Patch Changes

- Router performance: flattened route matching with first-segment dispatch index (39% faster at 200 routes). Core type fixes: export `ReadonlySignal<T>` from reactivity, widen `h()` component overloads to support optional children and generic components, add minimal `process` type declaration so consumers don't need `@types/node`.

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

## 0.2.1

### Patch Changes

- Release 0.2.1
  - feat(vite-plugin): add `compat` option for zero-change framework migration
  - fix: resolve `workspace:^` dependencies correctly during publish
  - fix(vite-plugin): use `oxc` instead of deprecated `esbuild` option
  - fix(vite-plugin): bump vite peer dependency to `>=8.0.0`

## 0.2.0

### Minor Changes

- Release 0.2.0
  - fix(vite-plugin): use `oxc` instead of deprecated `esbuild` option for Vite 8
  - fix(vite-plugin): bump vite peer dependency to `>=8.0.0`

## 0.1.2

### Patch Changes

- Improve compat package types (eliminate unnecessary casts), add lint/typecheck CI for all workspaces, split example apps into individual component files.

## 0.1.1

### Patch Changes

- Fix workspace dependency resolution in published packages and add automated release pipeline with changesets + OIDC trusted publishing.
