# @pyreon/vite-plugin

## 0.24.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.24.1

## 0.24.0

### Minor Changes

- [#786](https://github.com/pyreon/pyreon/pull/786) [`ab4d980`](https://github.com/pyreon/pyreon/commit/ab4d9806a677b2ccd28f417280e52d72be9b1bd9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - LPIH auto-bridge — zero-config Live Program Inlay Hints in dev (R1).

  Closes the last queued recommendation from the LPIH foundation PR ([#769](https://github.com/pyreon/pyreon/issues/769)). With this PR, **Vite users get LPIH for free**: the plugin auto-injects a browser-side bridge that activates devtools + polls `getFireSummaries()` every 250ms, and registers a `POST /__pyreon_lpih__` dev-server middleware that atomically writes the cache file the LSP auto-discovers (R2, [#777](https://github.com/pyreon/pyreon/issues/777)).

  End-to-end setup is now:

  ```ts
  // vite.config.ts
  import pyreon from "@pyreon/vite-plugin";
  export default { plugins: [pyreon()] }; // that's it
  ```

  ```bash
  # In your editor: run the LSP, see ghost text.
  pyreon-lint --lsp
  ```

  No `activateReactiveDevtools()` call, no `startLpihPolling()` call, no `PYREON_LPIH_CACHE` env var, no `.pyreon-lpih.json` config — the plugin wires all three layers automatically.

  **New options surface:**

  - `pyreon({ lpih: false })` — opt out (e.g. wiring `startLpihPolling()` manually from a non-browser runtime)
  - `pyreon({ lpih: { intervalMs: 500 } })` — slower poll for low-CPU environments
  - `pyreon({ lpih: { cachePath: '/abs/path.json' } })` — override the default `<projectRoot>/.pyreon-lpih.json`

  **Architecture decision** (the "scope" question from the deferred report): the auto-bridge lives in `@pyreon/vite-plugin` because (a) the plugin is already the dev-injection point for HMR / signal names / source locations (R4), (b) it's the canonical dev-server for Pyreon apps, (c) it doesn't tie LPIH itself to Vite — non-Vite consumers retain the manual `@pyreon/reactivity/lpih` API. The plugin is a thin wrapper around the same primitives, not a re-implementation.

  **Build-only**: production builds skip injection entirely (`transformIndexHtml` returns undefined in `command: 'build'`).

  **Wire format**: browser POSTs `{ fires: [{ file, line, count, kind, lastFire, rate1s }] }` — byte-identical to the on-disk format `@pyreon/reactivity/lpih`'s `writeLpihCache` produces. The server-side `writeLpihCacheFile` re-validates shape (rejects bodies missing the `fires` array) before atomic-renaming to disk; a buggy or malicious client can't corrupt the file the LSP reads.

  **Exposed surface** (`@internal`, for tests):

  - `resolveLpihCachePath(projectRoot)` — returns `<projectRoot>/.pyreon-lpih.json`
  - `writeLpihCacheFile(path, body)` — atomic-rename writer with shape validation
  - `buildLpihClientScript(intervalMs)` — generates the `<script type="module">` body

  **Bisect-verified-with-restore**: disabling both the `configureServer` LPIH gate AND the `transformIndexHtml` gate fails 7 of the 23 new R1 tests (registration + injection + interval + custom-path); restored → 23/23 (and 142/142 full vite-plugin suite). No `TEMP BISECT` remnants.

  Test coverage (23 new specs in `lpih-auto-bridge.test.ts`):

  - `resolveLpihCachePath` (2) — projectRoot → cache path resolution
  - `writeLpihCacheFile` (5) — successful write, overwrite (atomic rename), malformed JSON rejection, shape-missing-fires rejection, no tmp leftovers
  - `buildLpihClientScript` (6) — `<script type="module">` shape, interval embedding, imports, POST shape, beforeunload cleanup, payload shape
  - `transformIndexHtml` (5) — injects in dev/`lpih:true`, NOT in `lpih:false`, NOT in build, respects custom interval, default 250ms
  - `configureServer` (5) — middleware registered when `lpih:true`, NOT when `lpih:false`, rejects non-POST (405), writes valid POST to cache file, honours custom cache path

  Companion test-isolation change: existing `dev-server.test.ts` fixture now passes `lpih: false` by default in `bootstrap()` because those tests cover SSR / watcher / debounce — LPIH adding a middleware would change their `middlewares.use` call count + first-element shape. LPIH-specific coverage lives in the new test file.

  Docs updated at `docs/docs/lpih.md` — the Quick Start section is rewritten as "Vite users get it for free", with the manual `startLpihPolling()` recipe demoted to a "Manual setup (non-Vite consumers)" subsection.

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

- Updated dependencies [[`275eb20`](https://github.com/pyreon/pyreon/commit/275eb2038f32374e90c9fe0c3d55f35895f43450), [`47073eb`](https://github.com/pyreon/pyreon/commit/47073ebdd7552c63985f461a663ba98d93538606), [`572212f`](https://github.com/pyreon/pyreon/commit/572212f631907a18b98118f48dea3621dd5a95b1), [`f22902a`](https://github.com/pyreon/pyreon/commit/f22902a9a9c5f5b8a5192da086a6b4299291dd57), [`891ca43`](https://github.com/pyreon/pyreon/commit/891ca4300727119dafd66ceaacd7cb39e68f3b4e), [`d4ec777`](https://github.com/pyreon/pyreon/commit/d4ec777643446ed2c51dedb1e74fbd8dce70bdfd), [`572212f`](https://github.com/pyreon/pyreon/commit/572212f631907a18b98118f48dea3621dd5a95b1)]:
  - @pyreon/compiler@0.24.0

## 0.23.0

### Patch Changes

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

- [#741](https://github.com/pyreon/pyreon/pull/741) [`f40c1eb`](https://github.com/pyreon/pyreon/commit/f40c1eb35055e86fbac273352904bc2b04542f1f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(vite-plugin): evict per-instance caches on file delete in long-running `vite dev` sessions ([#733](https://github.com/pyreon/pyreon/issues/733) followup)

  Closes the last MEDIUM pattern from [#733](https://github.com/pyreon/pyreon/issues/733)'s audit byproducts.

  ### The leak

  Four per-instance caches accumulated entries for the lifetime of a
  `vite dev` session, with no eviction path for deleted/renamed files:

  - `signalExportRegistry: Map<moduleId, Set<signalName>>` — populated
    by `prescanSignalExports` + `scanSignalExports` on every transform.
  - `resolveCache: Map<\`${importer}::${source}\`, resolvedId>`—
populated by`resolveImportedSignals`.
  - `islandRegistry: Map<filePath, IslandDecl[]>` — populated by
    `prescanIslandDeclarations` + `scanIslandDeclarations`.
  - `pyreonWorkspaceDirCache: Map<dir, boolean>` — populated by
    `isPyreonWorkspaceFile`.

  When the developer deleted / renamed / moved a source file during a
  long-running session, the corresponding entries stayed in memory
  until process exit. Bounded by total source-tree size in practice
  (realistic dev session: tens of MB at most), but a real Class C
  leak — every file you touch and later delete leaks one entry per
  applicable cache.

  ### Fix

  Subscribe to Vite's `watchChange(id, change)` hook (native API for
  filesystem events). On `'delete'` events, evict:

  1. `signalExportRegistry.delete(normalizedId)`
  2. `islandRegistry.delete(id)` (and `.delete(normalizedId)` if they
     differ) — covers both shapes the registry might be populated with.
  3. `resolveCache` — sweep entries where the deleted file is EITHER
     the importer (key prefix `${normalized}::`) OR the resolved value.
     Both directions matter: a deleted file's resolved imports go
     stale, AND other files importing the deleted file need to
     re-resolve (so they see `null` next time, not the now-invalid
     path).
  4. `pyreonWorkspaceDirCache` — intentionally NOT touched. Keyed by
     DIRECTORY, not file; a single file deletion doesn't invalidate
     the directory's workspace status (other files may live there).
     Bounded by source-tree directory count anyway — small + finite.

  `'create' | 'update'` events are no-ops at the hook level — the
  existing transform-time `scanSignalExports` / `scanIslandDeclarations`
  calls re-populate the registry on every transform, overwriting any
  stale entry. So watchChange only needs to handle `'delete'`.

  ### Regression tests + bisect

  `packages/tools/vite-plugin/src/tests/cache-eviction-on-delete.test.ts`
  (5 specs):

  1. **signalExportRegistry entry evicted on delete** — populates
     the registry via transform, fires delete, asserts entry gone.
  2. **resolveCache entries pointing at deleted file evicted** —
     populates both importer-side and value-side entries, asserts
     no entry references the deleted path post-delete.
  3. **islandRegistry entry evicted on delete** — defensive shape
     (passes if scanner populated registry OR if delete is a safe
     no-op).
  4. **watchChange ignores create/update events** — populates entry,
     fires create + update + delete in sequence, asserts entry only
     evicts on delete.
  5. **Deleting an untracked file is a safe no-op** — defensive.

  **Bisect-verified**: replaced the whole `watchChange` body with a
  no-op → 3/5 specs fail (signalExportRegistry survives, islandRegistry
  survives, "only delete evicts" assertion fires). Restored → 5/5
  pass.

  ### Validation

  - `@pyreon/vite-plugin` 104/104 tests pass (+5 new regression specs)
  - Lint + typecheck clean
  - No public-API surface change — `watchChange` is a Vite plugin hook,
    not user-facing
  - New `Symbol.for('pyreon/vite-plugin:caches')` debug accessor is
    `@internal` (test-only)

  ### Closes the [#733](https://github.com/pyreon/pyreon/issues/733) / [#734](https://github.com/pyreon/pyreon/issues/734) sweep

  This finishes the audit-byproducts trail from [#733](https://github.com/pyreon/pyreon/issues/733). All 4 MEDIUM
  patterns from that PR (vue-compat-A from [#733](https://github.com/pyreon/pyreon/issues/733) itself, then [#735](https://github.com/pyreon/pyreon/issues/735)'s
  ssg/csp, [#737](https://github.com/pyreon/pyreon/issues/737)'s solid-compat, [#739](https://github.com/pyreon/pyreon/issues/739)'s svelte-compat, this one) are
  now closed. The 6 LOW patterns from [#733](https://github.com/pyreon/pyreon/issues/733) remain documented but
  deliberately deferred — none have real-impact magnitude to
  justify the implementation cost.

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

### Minor Changes

- [#659](https://github.com/pyreon/pyreon/pull/659) [`65e61eb`](https://github.com/pyreon/pyreon/commit/65e61eba20741a012b753b4c8c69045f408768b7) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat: P0 compile-time rocketstyle wrapper-collapse (opt-in `pyreon({ collapse: true })`)

  The vertical slice of the P0 RFC. A literal-prop rocketstyle call site
  (`<Button state="primary" size="medium">Save</Button>` — every dimension
  prop a string literal, no spread, static-text children) collapses from a
  5-layer wrapper mount (rocketstyle → attrs HOC → Element → Wrapper →
  styled) into ONE `_rsCollapse` cloneNode. E2 measured **44× wall-clock**,
  `mountChild` 9→1, `styler.resolve` 22→0. **OFF by default** — zero
  behaviour change unless `pyreon({ collapse: true })` is set.

  Parity is guaranteed BY CONSTRUCTION, not by reimplementing the
  rocketstyle chain in the compiler (RFC decision 2): the Vite plugin
  spins ONE programmatic Vite-SSR server bound to the consumer's own
  `vite.config`, renders the REAL component twice (light + dark), and
  captures the resolved class + styler rule text — the same
  `renderToString` + `@pyreon/styler` code path the app uses. Styler's
  FNV-1a class hash is identical SSR vs DOM (its hydration contract), so
  the build-resolved class is byte-for-byte the client-mounted class.

  New public surface (all additive):

  - `@pyreon/styler` — `StyleSheet.getStyleRules()` (raw SSR rule
    snapshot) + `StyleSheet.injectRules(rules, key)` (idempotent
    pre-resolved rule injection, no re-hash).
  - `@pyreon/runtime-dom` — `_rsCollapse(html, lightClass, darkClass,
isDark, bind?)` (one html-keyed `_tpl` cloneNode; class reactively
    bound to the live mode accessor — RFC decision 1 dual-emit, mode swap
    re-runs ONLY the className on the SAME node, no remount; decision 4
    hoisted-factory). `runtime-dom` stays layer-pure (never imports
    styler/ui-core — the styler injection is the emitted code's job).
  - `@pyreon/compiler` — `scanCollapsibleSites()` +
    `rocketstyleCollapseKey()` exports + `TransformOptions.collapseRocketstyle`.
    Detection + emission live ONLY in the JS path; `transformJSX`
    short-circuits to `transformJSX_JS` when the option is set (the Rust
    binary doesn't implement it). A SINGLE shared `detectCollapsibleShape`
    bail catalogue is used by both the plugin scan and the compiler emit
    so resolution keys can't drift.
  - `@pyreon/vite-plugin` — `pyreon({ collapse: true | PyreonCollapseOptions })`
    - `createCollapseResolver` (Vite-SSR resolver, memoised, disposed in
      `closeBundle`). Only the CLIENT graph collapses — the SSR graph keeps
      the real mount.

  Tested across 5 layers: styler `injectRules` (3 real-Chromium specs);
  `_rsCollapse` (4 real-Chromium specs — light class, mode-flip-no-remount,
  children dispose, shared parsed template); resolver vs the REAL
  `@pyreon/ui-components` Button via Vite SSR (8 specs incl. determinism +
  graceful bail on a non-existent export); compiler detection / emission /
  full bail catalogue / once-per-module dedupe (13 specs); end-to-end
  pipeline — real Button → resolver → scanner → compiler emits
  `__rsCollapse` carrying the real SSR-resolved classes + class-stripped
  template + rule bundle byte-for-byte. **Phase-4 RFC acceptance, real
  Chromium, shipped `_rsCollapse` × the REAL `@pyreon/ui-components` Button**
  (`examples/experiments/e2-static-rocketstyle/e2.browser.test.ts`, 2 specs):
  (1) the collapsed `<button>` is `isEqualNode`-structurally-identical to
  the real rocketstyle-mounted one with a char-for-char-equal `className`
  and identical computed style; (2) the perf signature is exactly
  `runtime.tpl ≥ 1` + `runtime.mountChild == 1` per Button (the real mount
  is 8–9 mountChild) with **~27× wall-clock** (collapsed 0.20 ms vs
  baseline 5.40 ms, in-suite benchmark). Additive guarantee: all 1079
  `@pyreon/compiler` tests pass unchanged with collapse off.

  Bisect-verified: disabling the compiler's `tryRocketstyleCollapse(node)`
  detection call fails the 4 collapse-emission specs (`expected … to
contain '__rsCollapse('`) while the 9 bail-catalogue / key-stability
  specs still pass; restored → 13/13.

  **Deliberately deferred (follow-up PRs, tracked in
  `.claude/plans/open-work-2026-q3.md` §P0):** an `examples/ui-showcase`
  build-with-collapse **verify-modes cell** (a build-artifact gate —
  ui-showcase's Buttons all carry `onClick` → correctly bail, so it needs
  a dedicated literal-prop demo route first; note the real-Chromium
  DOM-parity + perf-counter acceptance is NOT deferred — it ships here as
  the Phase-4 e2 specs above), and dev-mode collapse (build-shaped today —
  dev keeps the normal mount, graceful). The
  slice is fundamentally complete end-to-end (detect → resolve → emit →
  parity-proven); these extend coverage, they are not gaps in the
  mechanism. The RFC doc was removed once shipped — its decisions are now
  the code, documented in `CLAUDE.md` → "Compile-time rocketstyle collapse".

### Patch Changes

- [#674](https://github.com/pyreon/pyreon/pull/674) [`2f38584`](https://github.com/pyreon/pyreon/commit/2f3858453c00e901b134dd4c15dad1eb3f793189) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `pyreon({ collapse: true })` is now correctly **build-only**. Pre-fix the rocketstyle-collapse `transform`-hook block was gated only `!isSsr`, so it also ran under `vite dev`: a leaked per-process nested Vite SSR server (its `closeBundle` teardown is a build-only Rollup hook) plus a class frozen against the user's theme-source HMR edits — strictly worse than the HMR-reactive normal mount.

  The block is now gated `if (collapseEnabled && isBuild && !isSsr)`. `vite dev` keeps the normal rocketstyle mount and the resolver is never constructed; the plugin surfaces the build-only contract once per dev process via `this.info` so an opted-in consumer isn't left wondering why nothing collapsed. Production `vite build` is unchanged. No public API change — `collapse` already behaved this way in build; this makes the dev no-op explicit, leak-free, and tested (stub-resolver bisect-verified `rocketstyle-collapse-dev.test.ts`).

- [#704](https://github.com/pyreon/pyreon/pull/704) [`e348599`](https://github.com/pyreon/pyreon/commit/e3485990cb52c414efb4217d40d3ed24e9c461b7) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(svelte-compat): new compat layer — Svelte importable runtime API on Pyreon

  `@pyreon/svelte-compat` is the fifth compat layer (alongside
  react / preact / vue / solid). It shims the Svelte APIs code actually
  `import`s, backed by Pyreon's signal-based reactive engine:

  - **`svelte/store`** — `writable`, `readable`, `derived` (single +
    array, sync + async/cleanup forms), `get`, `readonly`. Store contract
    (`subscribe(run, invalidate?) → unsubscribe`, lazy
    `start(set, update?) → stop` notifier with `0→1` / `1→0` semantics)
    matches Svelte exactly.
  - **`svelte`** — `onMount` (returned cleanup runs on destroy, per
    Svelte's contract), `onDestroy`, `beforeUpdate`, `afterUpdate`,
    `tick`, `setContext`, `getContext`, `hasContext`, `getAllContexts`,
    `createEventDispatcher`, `mount`, `unmount`, `flushSync`.
  - Re-exports `For` / `Show` / `Switch` / `Match` / `Suspense` /
    `ErrorBoundary` for control-flow parity.

  Scope boundary (same as solid-compat draws around Solid's compiler):
  no `.svelte` SFC compiler, no Svelte 5 rune _syntax_
  (`$state` / `$derived` / `$effect` / `$store` sugar) — compiler
  constructs, not runtime imports. A component that subscribes to a store
  in its body is the faithful equivalent of `$store` auto-subscription:
  it re-renders on store change and auto-cleans on unmount.

  `@pyreon/vite-plugin` (patch): `pyreon({ compat: 'svelte' })` now
  aliases `svelte` / `svelte/store` → `@pyreon/svelte-compat` and routes
  JSX through the compat runtime.

  Covered by unit tests (51, coverage 97.7% stmts / 87.8% branch),
  real-Chromium browser smoke (4), and the compat-layers e2e gate
  (`examples/svelte-compat`, port 5182).

- Updated dependencies [[`c3df9db`](https://github.com/pyreon/pyreon/commit/c3df9dbbcf9e939c92e1c4843b59686cdd25589e), [`9a54705`](https://github.com/pyreon/pyreon/commit/9a54705c645ff2c3bee54fa8c6d411d1530b3187), [`bbccaaf`](https://github.com/pyreon/pyreon/commit/bbccaaf3ec2f5dc3eed3e7195a09023fc59575d1), [`24a063c`](https://github.com/pyreon/pyreon/commit/24a063ccfa2ef267927dfd68886be24c397ccd72), [`a086769`](https://github.com/pyreon/pyreon/commit/a0867699bdeca87f34e60fef7aa867a75a24d815), [`65e61eb`](https://github.com/pyreon/pyreon/commit/65e61eba20741a012b753b4c8c69045f408768b7)]:
  - @pyreon/compiler@0.20.0

## 0.19.0

### Patch Changes

- [#596](https://github.com/pyreon/pyreon/pull/596) [`e8e95bc`](https://github.com/pyreon/pyreon/commit/e8e95bc2d6785d397f4b8f85039ce76c2a7f6cea) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Component-level HMR for zero/router apps — editing a route/page component now updates the DOM in place without a manual refresh, preserving module-scope signal state.

  Previously `@pyreon/vite-plugin`'s `injectHmr` emitted a bare `import.meta.hot.accept()` (no callback): Vite re-evaluated the edited module but nothing re-rendered the mounted tree, and the self-accept suppressed Vite's full-reload fallback — so every component/JSX edit produced a silently-stale UI until a manual browser refresh.

  Now the accept callback hands the fresh module to `globalThis.__pyreon_hmr_swap__` (registered by `@pyreon/router` in a dev browser, zero import coupling). The coordinator finds every active matched lazy route whose `_hmrId` matches (emitted by `@pyreon/zero`'s fs-router as `lazy(() => import(…), { hmrId })`), swaps the component, and bumps the loading signal so `RouterView` re-renders only that subtree in place — no page reload, so module-scope signals keep their values via the existing `__pyreon_hmr_registry__`. Edits outside the active route tree (nested components, unrelated routes, signal-only modules) or apps without the coordinator fall back to `import.meta.hot.invalidate()` → an automatic full reload (still no manual refresh). Production is unaffected (dev+browser gated).

- Updated dependencies [[`5fb461a`](https://github.com/pyreon/pyreon/commit/5fb461aaf9fcc8d2a624af1442f4db97fd7f33c9), [`5b69841`](https://github.com/pyreon/pyreon/commit/5b69841a6ab30963977e276d120c33d66682da23), [`e274fce`](https://github.com/pyreon/pyreon/commit/e274fceeb37d0893c7425463e443185388fce475), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`6472de0`](https://github.com/pyreon/pyreon/commit/6472de00ffdbcff1fd453c125c404b75fc5cc46d), [`0408e47`](https://github.com/pyreon/pyreon/commit/0408e475e63770996eff17bfb6ac318e89c45df4), [`7e0fe1a`](https://github.com/pyreon/pyreon/commit/7e0fe1a4f7cbb68f7647d85bef843de90d04d506), [`c5b2ea2`](https://github.com/pyreon/pyreon/commit/c5b2ea2fe0df3f52b2af21e0d79b1e391ca9fad5), [`6581f07`](https://github.com/pyreon/pyreon/commit/6581f073293a72360fe9391990d08316e0dc5b4b), [`070a0ec`](https://github.com/pyreon/pyreon/commit/070a0ec687ad598cf15963e5615bb1d8c81933a3)]:
  - @pyreon/compiler@0.19.0

## 0.18.0

### Minor Changes

- [#587](https://github.com/pyreon/pyreon/pull/587) [`f35e69b`](https://github.com/pyreon/pyreon/commit/f35e69b2ab53474ecf0ffb792866bc27215b68c3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<Defer>` now supports inline children — the compiler extracts the subtree into a proper chunk automatically.

  **Before (v1, PR [#585](https://github.com/pyreon/pyreon/issues/585))** — explicit `chunk` prop required:

  ```tsx
  <Defer chunk={() => import("./ConfirmModal")} when={open}>
    {(Modal) => <Modal onClose={() => setOpen(false)} />}
  </Defer>
  ```

  **After (this PR)** — inline children, compiler does the chunking:

  ```tsx
  import { Modal } from "./ConfirmModal";

  <Defer when={open}>
    <Modal />
  </Defer>;
  ```

  The compiler (`@pyreon/compiler`'s new `transformDeferInline`) detects `<Defer>` JSX with no `chunk` prop and a single bare component child, looks up that component's import, rewrites the JSX to use an explicit `chunk={() => import('./path')}` prop, and removes the static import so Rolldown actually emits a separate chunk.

  ## v1 scope (this PR)

  - Single Defer JSX element per file (multiple Defers in one file each get their own transform pass — works fine)
  - Child must be a single self-closing component element with **no props** (`<Modal />` ✓; `<Modal title="hi" />` falls back to the explicit form)
  - Named or default imports only — renamed imports (`{ Modal as M }`) and namespace imports (`* as M`) bail with a warning, user falls back to explicit form
  - The imported binding must NOT be used outside the Defer subtree (Rolldown would static-bundle the module and the dynamic import becomes a no-op; the compiler warns and bails when this is detected)
  - JS-fallback compiler path only — Rust compiler parity is a follow-up

  When the transform bails on any of the above, the user sees a soft warning at compile time. The `<Defer>` element is left unchanged; runtime then errors at chunk-load time because `chunk` is missing, prompting the user to use the explicit form.

  ## What's NOT in this PR

  - Closure capture (passing `count` signals or local state to the inline child) — requires prop-extraction analysis
  - Rust compiler implementation — JS fallback only
  - HMR for the synthetic chunk module — relies on Rolldown's standard dynamic-import HMR
  - TypeScript type-narrowing for the inline form — `<Defer>`'s props still type-check the explicit form; inline form passes through without type-narrowing the chunk relationship

  ## How it composes

  The transform runs in `@pyreon/vite-plugin`'s `transform()` hook BEFORE `transformJSX()`. By the time the JSX→runtime transform sees the source, the inline form has already been rewritten into the explicit chunk-prop form. No special-casing in the runtime, no new VNode shape, no new bundler hook — just AST rewriting before the existing pipeline.

  Verified via 13 unit tests (`@pyreon/compiler/src/tests/defer-inline.test.ts`) covering:

  - Basic rewrites: named/default imports, on="visible" / when={signal} triggers, props preservation
  - Bail-outs: chunk already provided, binding used elsewhere, child not imported, child has props, multiple children, syntax errors
  - Multi-Defer files: two independent Defers in one file get rewritten independently

  1004 `@pyreon/compiler` tests pass (13 new + 991 existing — no regressions).

  Depends on PR [#585](https://github.com/pyreon/pyreon/issues/585) (the runtime `<Defer>` primitive). Won't be useful until that merges.

### Patch Changes

- Updated dependencies [[`f35e69b`](https://github.com/pyreon/pyreon/commit/f35e69b2ab53474ecf0ffb792866bc27215b68c3)]:
  - @pyreon/compiler@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [[`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c)]:
  - @pyreon/compiler@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.16.0

## 0.14.0

### Minor Changes

- [#296](https://github.com/pyreon/pyreon/pull/296) [`83aa9ab`](https://github.com/pyreon/pyreon/commit/83aa9abbc52d423dfc9d45a3b0a4e048b161186d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Auto-call signals and computeds in JSX — plain JS syntax for reactivity. `const count = signal(0); <div>{count}</div>` compiles to `<div>{() => count()}</div>`. Scope-aware (shadowed variables not auto-called), cross-module (Vite plugin pre-scans exports), import-type-safe, computed-aware. 527 tests.

### Patch Changes

- Updated dependencies [[`aa8e61b`](https://github.com/pyreon/pyreon/commit/aa8e61b873b7d42c60a613f57841a75293080c8a), [`602446b`](https://github.com/pyreon/pyreon/commit/602446bb49e6ea95fe9d2dbc7774bbf9a66da80d), [`4638c27`](https://github.com/pyreon/pyreon/commit/4638c2761ec34b1102a36c4675cfcfa805c2168c), [`83aa9ab`](https://github.com/pyreon/pyreon/commit/83aa9abbc52d423dfc9d45a3b0a4e048b161186d)]:
  - @pyreon/compiler@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.12.15

## 0.12.14

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.12.11

## 0.7.2

### Patch Changes

- feat(vite-plugin): auto-inject signal debug names in dev mode

- Updated dependencies []:
  - @pyreon/compiler@0.7.2

## 0.7.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.7.1

## 0.7.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.6.0

## 0.5.7

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.5.7

## 0.5.6

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.5.6

## 0.5.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.5.4

## 0.5.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.5.3

## 0.5.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.5.2

## 0.5.1

### Patch Changes

- Unify project scanner into @pyreon/compiler, fix JSX type declarations for published packages, update dependencies, and resolve build compatibility with rolldown 1.15.0.

- Updated dependencies []:
  - @pyreon/compiler@0.5.1

## 0.5.0

### Minor Changes

- ### New packages

  - `@pyreon/cli` — project doctor command that detects React patterns (className, htmlFor, React imports) and auto-fixes them for Pyreon
  - `@pyreon/mcp` — Model Context Protocol server providing AI tools with project context, API reference, and documentation

  ### Features

  - **JSX type narrowing** — added `JSX.Element`, `JSX.ElementType`, and `JSX.ElementChildrenAttribute` for full TypeScript JSX compatibility
  - **Callback refs** — `ref` prop now accepts `(el: Element) => void` in addition to `{ current }` objects
  - **React pattern interceptor** (`@pyreon/compiler`) — AST-based detection and migration of React patterns to Pyreon equivalents
  - **Vite plugin context generation** — automatically generates `pyreon-context.json` and `llms.txt` during dev/build
  - **MCP server tools** — `get-context`, `lookup-api`, `diagnose-error`, `suggest-migration` for AI-assisted development

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.3.1

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
  - @pyreon/compiler@0.3.0

## 0.2.1

### Patch Changes

- Release 0.2.1

  - feat(vite-plugin): add `compat` option for zero-change framework migration
  - fix: resolve `workspace:^` dependencies correctly during publish
  - fix(vite-plugin): use `oxc` instead of deprecated `esbuild` option
  - fix(vite-plugin): bump vite peer dependency to `>=8.0.0`

- Updated dependencies []:
  - @pyreon/compiler@0.2.1

## 0.2.0

### Minor Changes

- Release 0.2.0
  - fix(vite-plugin): use `oxc` instead of deprecated `esbuild` option for Vite 8
  - fix(vite-plugin): bump vite peer dependency to `>=8.0.0`

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.2.0

## 0.1.2

### Patch Changes

- Improve compat package types (eliminate unnecessary casts), add lint/typecheck CI for all workspaces, split example apps into individual component files.

- Updated dependencies []:
  - @pyreon/compiler@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.1.1
