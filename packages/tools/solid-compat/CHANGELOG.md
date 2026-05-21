# @pyreon/solid-compat

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

- [#778](https://github.com/pyreon/pyreon/pull/778) [`275eb20`](https://github.com/pyreon/pyreon/commit/275eb2038f32374e90c9fe0c3d55f35895f43450) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(compiler, solid-compat): close two real CodeQL alerts (polynomial-redos + prototype-pollution)

  Closes the two CODE-level CodeQL alerts on the repo. The other four
  open alerts (`Fuzzing`, `CII-Best-Practices`, `Maintained`,
  `Code-Review`) are OpenSSF Scorecard metadata — repo-practice
  recommendations, not code-fixable.

  ## Alert [#65](https://github.com/pyreon/pyreon/issues/65) — `js/polynomial-redos` (severity: high)

  **`packages/core/compiler/src/pyreon-intercept.ts:996`** — the
  `hasPyreonPatterns` fast-path regex for the `onClick={undefined}`
  detector had an unbounded `\w*` quantifier:

  ```ts
  /on[A-Z]\w*\s*=\s*\{\s*undefined\s*\}/.test(code);
  ```

  Polynomial-time on inputs like `onAAAA…` (long runs of `[A-Z]`):
  per starting position the greedy `\w*` consumes O(N) chars before
  the trailing `=` fails to match, giving O(N²) overall on N starting
  positions.

  **Fix**: cap the `\w*` to `\w{0,60}`. Real `on*` handler identifiers
  are at most ~25 chars (`onPointerLeaveCapture`); 60 leaves headroom.
  The cap keeps the regex linear regardless of input shape.

  This file already uses bounded quantifiers (`{1,500}` / `{0,500}`)
  on its OTHER regex sites with the same rationale documented inline
  (lines 997-1008) — this fix brings the `on*` pattern in line with
  the established convention.

  ## Alert [#22](https://github.com/pyreon/pyreon/issues/22) — `js/prototype-polluting-assignment` (severity: medium)

  **`packages/tools/solid-compat/src/index.ts:1040`** — `applyAtPath`
  already guards against `__proto__` / `constructor` / `prototype`
  keyed writes via a `DANGEROUS_KEYS.has(key)` Set lookup at line 1036,
  BUT CodeQL's `js/prototype-polluting-assignment` taint-tracking
  does NOT propagate dataflow through `Set.has` calls. The analyzer
  needs explicit `===` checks against the literal key names to
  recognise the guard.

  **Fix**: inline the comparisons:

  ```ts
  if (
    typeof key === "string" &&
    (key === "__proto__" || key === "constructor" || key === "prototype")
  ) {
    return;
  }
  ```

  Same set of dangerous keys; just a form CodeQL's taint-tracking can
  follow. Behaviorally identical — both guards refuse the same three
  keys before the bracket-notation assignment on line 1042.

  ## Validation

  - `bun run --filter='@pyreon/compiler' typecheck` — clean
  - `bun run --filter='@pyreon/solid-compat' typecheck` — clean
  - `bun run --filter='@pyreon/compiler' test pyreon-intercept` — 70/70 pass
  - `bun run --filter='@pyreon/solid-compat' test` — 218/218 pass
  - `bun run gen-docs --check` — clean
  - `bun run check-doc-claims` — clean
  - `bun run check-manifest-depth` — clean

  CodeQL re-scan on merge will close both alerts automatically.

  ## NOT in this PR

  The other four open alerts (`Fuzzing` / `CII-Best-Practices` /
  `Maintained` / `Code-Review`, all "no file associated") are OpenSSF
  Scorecard metadata about repo practices — not code-fixable. They'd
  need separate workflow / CI / policy changes if pursued.

- [#788](https://github.com/pyreon/pyreon/pull/788) [`84cd28f`](https://github.com/pyreon/pyreon/commit/84cd28feba1899d70696e9a292bb078601558e8f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(runtime-dom, solid-compat): three findings from post-merge deep audit — double-call regression, prototype-pollution alert still open, defensive `Object.keys` for handler iteration

  After the dynamic-collapse PR sequence merged ([#765](https://github.com/pyreon/pyreon/issues/765) / [#766](https://github.com/pyreon/pyreon/issues/766) / [#767](https://github.com/pyreon/pyreon/issues/767) / [#771](https://github.com/pyreon/pyreon/issues/771) / [#773](https://github.com/pyreon/pyreon/issues/773) / [#775](https://github.com/pyreon/pyreon/issues/775) / [#778](https://github.com/pyreon/pyreon/issues/778)), a careful re-read surfaced three real issues. All three are narrow, low-risk fixes shipping together as a deep-review follow-up.

  ## Finding 1 (correctness) — `_rsCollapseDyn` / `_rsCollapseDynH` called `valueIndex()` TWICE per re-run

  The runtime helpers routed the class binding through `_bindDirect`'s plain-callable fallback. That fallback calls the source function once and passes the result to the inner callback — but the inner callback IGNORED the passed value and called `valueIndex()` AGAIN to compute the index.

  **Symptom**: side-effecting cond expressions fired twice per re-run. A user's
  `<Button state={(modifyState(), cond) ? 'a' : 'b'}>` would invoke
  `modifyState()` twice on every value/mode change.

  **Fix**: replace the `_bindDirect` indirection with a direct `renderEffect` call. The callback now reads both accessors inside one renderEffect — same subscription contract (a change to either re-runs only this className assignment), but `valueIndex()` runs exactly once per re-run, matching the original source's implicit call-count semantics.

  **Bisect-verified** by `valueIndex() is called EXACTLY ONCE per re-run` in `rs-collapse-dyn.browser.test.ts`: pre-fix the spec fails with `expected 2 to be 1` (double call); restored → 16/16 pass.

  ## Finding 2 (security) — CodeQL alert [#22](https://github.com/pyreon/pyreon/issues/22) stayed open after [#778](https://github.com/pyreon/pyreon/issues/778)

  PR [#778](https://github.com/pyreon/pyreon/issues/778) added explicit `key === '__proto__' || ...` checks expecting them to satisfy CodeQL's `js/prototype-polluting-assignment` taint-tracking. CodeQL re-scanned and the alert moved from line 1040 → 1051 (my added code shifted positions) but stayed **OPEN** — the analyzer still flagged the `obj[key] = value` write itself, regardless of the guard.

  **Fix**: use `Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true })` for the assignment. That bypasses the prototype chain entirely — even if a setter has been installed on `Object.prototype` for `key`, the write installs an OWN data property on `target` without invoking it. Combined with the simplified inline guard (drop the redundant `typeof key === 'string' &&` outer check — literal-string `===` against a `string | number` key is already type-safe), the write is double-safe.

  Semantics are identical to `obj[key] = value` for a plain data property; the only difference is that setter chains on the prototype are NOT triggered. All 218 `@pyreon/solid-compat` tests pass unchanged.

  ## Finding 3 (defense-in-depth) — `for...in` on handlers leaks inherited enumerable properties

  `_rsCollapseH` (PR [#681](https://github.com/pyreon/pyreon/issues/681)) and `_rsCollapseDynH` ([#773](https://github.com/pyreon/pyreon/issues/773)) both iterate the handlers object via `for (const key in handlers)`. `for...in` includes inherited enumerable properties, so a polluted `Object.prototype` could inject fake handlers.

  **Fix**: use `Object.keys(handlers)` which returns OWN enumerable keys only. Zero-cost — same iteration shape, narrower membership.

  The compiler emits clean object literals (`{ onClick: ..., onPointerEnter: ... }`) with no prototype-pollution surface in practice. This is pure defense-in-depth — the practical risk requires an attacker to first pollute `Object.prototype` globally, which is a much broader compromise than a leaked handler.

  ## Bisect verification

  | Fix                                                                                                        | Bisect                                                           | Outcome                                                             |
  | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------- |
  | [#1](https://github.com/pyreon/pyreon/issues/1) (double-call)                                              | Revert `renderEffect` → `_bindDirect(...) + valueIndex() inside` | New spec fails `expected 2 to be 1`; restored → 16/16               |
  | [#2](https://github.com/pyreon/pyreon/issues/2) (CodeQL [#22](https://github.com/pyreon/pyreon/issues/22)) | CodeQL re-scan on merge will close (no local CodeQL runner)      | Documented + reasoned via `Object.defineProperty`                   |
  | [#3](https://github.com/pyreon/pyreon/issues/3) (`for...in`)                                               | Behavioral equivalent for clean object literals; defense-only    | All 47 runtime-dom browser specs + 218 solid-compat specs unchanged |

  ## Validation

  - `bun run --filter='@pyreon/runtime-dom' typecheck` — clean
  - `bun run --filter='@pyreon/solid-compat' typecheck` — clean
  - `bun run --filter='@pyreon/runtime-dom' lint` — zero errors
  - `bun run --filter='@pyreon/runtime-dom' test` — 681 + 1 skipped pass
  - `bun run --filter='@pyreon/runtime-dom' test:browser` — **47/47** (15 dynamic-collapse + 1 new regression spec)
  - `bun run --filter='@pyreon/solid-compat' test` — 218/218 pass
  - `bun run gen-docs --check` — clean
  - `bun run check-doc-claims` — clean
  - `bun run check-manifest-depth` — clean
  - `bun run check-bundle-budgets` — clean (runtime-dom + solid-compat unchanged)

  ## Surfaces updated

  - `packages/core/runtime-dom/src/template.ts` — `_rsCollapseDyn` + `_rsCollapseDynH` use `renderEffect` directly (no `_bindDirect` indirection); `_rsCollapseH` + `_rsCollapseDynH` use `Object.keys` (not `for...in`)
  - `packages/core/runtime-dom/src/tests/rs-collapse-dyn.browser.test.ts` — new regression spec locking the 1:1 `valueIndex()`-call contract
  - `packages/tools/solid-compat/src/index.ts` — `applyAtPath` uses `Object.defineProperty` for the bracket write + simplified guard
  - `.changeset/post-merge-deep-review-fixes.md` — this changeset

  ## What's NOT in this PR

  A wider audit of the recent merges turned up other surfaces I considered but did NOT include:

  - **Other unbounded regex quantifiers in `pyreon-intercept.ts`** (e.g. `\\bFor\\b[^=]*\\beach`) — measured polynomially worst-case (O(N²) on N "For" runs) but CodeQL didn't flag them, the input is dev source (not adversary-controlled), and fixing every theoretical site without a CodeQL signal would be excessive. Left alone.
  - **Degenerate `state={cond ? 'a' : 'a'}` ternaries** — emit 4 identical classes. Sub-optimal but correct. The compiler could detect and bail / use `_rsCollapse` instead; not worth the additional detector complexity for a vanishingly rare input.
  - **`await` / `yield` inside cond expressions** — the compiler would emit `() => (await cond) ? 0 : 1` in a non-async arrow → syntax error. Extreme edge case (who awaits in a JSX attribute?), no real-corpus instance. Worth catching in the detector eventually but not urgent.

  All three are documented here for the next reviewer.

- Updated dependencies [[`dfaefb8`](https://github.com/pyreon/pyreon/commit/dfaefb8e9e06eaff9039c001ad7731476b6b5732), [`c41aa1a`](https://github.com/pyreon/pyreon/commit/c41aa1ae90efe00d82c97f623a02ed17acb2427c), [`bc65b82`](https://github.com/pyreon/pyreon/commit/bc65b825505016e4433b50cd1276c9982ef10b8a), [`67e1f37`](https://github.com/pyreon/pyreon/commit/67e1f371a20219481ee9564d2d7421ec2a0b5ddf), [`b8fb31c`](https://github.com/pyreon/pyreon/commit/b8fb31cf1a59578fc33f27d539695d2bc164b2f1), [`f400e85`](https://github.com/pyreon/pyreon/commit/f400e85282a370276d5ae0266ba501c41dce4f3e), [`891ca43`](https://github.com/pyreon/pyreon/commit/891ca4300727119dafd66ceaacd7cb39e68f3b4e), [`d4ec777`](https://github.com/pyreon/pyreon/commit/d4ec777643446ed2c51dedb1e74fbd8dce70bdfd), [`2abb672`](https://github.com/pyreon/pyreon/commit/2abb672d8a8bf7f4940af422bf8bf802aa129cdd), [`84cd28f`](https://github.com/pyreon/pyreon/commit/84cd28feba1899d70696e9a292bb078601558e8f), [`49cc686`](https://github.com/pyreon/pyreon/commit/49cc6869c42e3d3a7ef9e6568f7aade0be23edc0), [`73a6949`](https://github.com/pyreon/pyreon/commit/73a694940a0121508dee84b8a88812753e26fb10)]:
  - @pyreon/core@0.24.0
  - @pyreon/runtime-dom@0.24.0
  - @pyreon/reactivity@0.24.0

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

- [#737](https://github.com/pyreon/pyreon/pull/737) [`d6e6ec0`](https://github.com/pyreon/pyreon/commit/d6e6ec07ee97098b9265da882a46ebed953a3a49) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(solid-compat): createResource stale-resolution race + createStore per-path signal map unbounded growth ([#733](https://github.com/pyreon/pyreon/issues/733) follow-up)

  Closes 2 of the 4 MEDIUM patterns disclosed in [#733](https://github.com/pyreon/pyreon/issues/733)'s audit byproducts.

  ### 1. `createResource` — Class F stale-resolution race ([#730](https://github.com/pyreon/pyreon/issues/730) charts/storage shape)

  `fetchPromise` was overwritten on refetch with no signal to the OLD
  promise's handlers. When the OLD promise (e.g. SLOW response) settled
  AFTER a FAST refetch had already resolved, its `setData(oldVal)` /
  `setError(oldErr)` clobbered the newer value. Same exact shape as
  [#730](https://github.com/pyreon/pyreon/issues/730)'s charts/storage inflight-promise bug.

  Fix: version-tracking. Each `doFetch()` bumps a counter; the
  resolve/reject handlers compare their captured version against the
  current one. Stale resolutions are silently discarded.

  `AbortSignal` is the upstream solution for `fetch()` callers, but
  we don't own the fetcher — version-tracking is the correct generic
  fix that doesn't require user cooperation.

  ### 2. `createStore` — Class C unbounded per-path signal map

  `signals.Map<path, signal>` grew by one entry per UNIQUE read-path
  string for the store's lifetime. Stores with dynamic key spaces
  (dictionaries, pagination, log streams) leaked one signal per key
  ever accessed: e.g. `store.items[0]` through `store.items[100000]`
  produced 100k signal entries.

  The fix is correctness-preserving: a subscriber-aware sweep runs
  after `updateRaw()` once the cache crosses a threshold (256). The
  sweep walks all entries and evicts any whose `_s` (subscriber set)
  AND `_d` (direct-updater set) are both empty — i.e. truly unused
  because the effect / DOM binding that read this path has since
  disposed. The next read for an evicted path lazily re-creates a
  fresh signal with the current value; correctness preserved.

  A simple LRU cap would NOT work here — evicting a signal that an
  active effect still tracks would silently break reactivity (the
  effect wouldn't re-run on subsequent updates because the new
  signal it'd lazily get on the next read has different identity).

  The fix uses Pyreon's internal `_s` / `_d` subscriber-set fields —
  same fields `trackSubscriber` populates and effect disposal removes
  from. A non-empty either means at least one live effect / DOM
  binding still depends on this signal.

  Threshold is gated so the O(N) sweep fires at most once per
  write-after-threshold, NOT on every write — small stores with
  static key sets pay zero overhead.

  ### Regression tests + bisect

  `packages/tools/solid-compat/src/tests/leak-repro.test.ts` (4 specs):

  1. **createResource SLOW + FAST refetch — FAST wins, SLOW ignored**.
     Manual promise resolvers control ordering. Bisect-verified:
     removed `if (myVersion !== fetchVersion) return` from both
     then/catch handlers → spec fails with `expected 'SLOW' to be
'FAST'`. Restored → passes.
  2. **createResource latest value survives a stale rejection**. SLOW
     rejects AFTER a FAST resolves. Bisect-verified: spec fails with
     `expected Error: BOOM to be undefined`. Restored → passes.
  3. **createStore signal map shrinks after subscriber-less reads**.
     500 ad-hoc reads → cache pre-sweep ~500 entries → write triggers
     sweep → cache <100 entries. Bisect-verified: disabled the
     `sweepUnusedSignals()` call in `updateRaw` → spec fails with
     `expected 501 to be less than 100`. Restored → passes.
  4. **createStore actively-subscribed signals survive the sweep**.
     Effect tracks `k0`; 300 ad-hoc reads + write fires sweep; the
     effect re-runs with the new value (proving k0's signal wasn't
     evicted because it had a subscriber).

  ### Validation

  - `@pyreon/solid-compat` 218/218 tests pass (+4 new regression specs)
  - Lint + typecheck clean
  - New `_STORE_SIGNAL_CACHE` symbol export is `@internal` (Symbol.for
    registry — test-only)

  ### Remaining LOW from [#733](https://github.com/pyreon/pyreon/issues/733)

  - `@pyreon/svelte-compat` ChildInstance preservation discards
    `unmountCallbacks` — separate PR (different package).
  - `@pyreon/vite-plugin` per-instance caches eviction on file delete
    — separate PR (different package).

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

### Minor Changes

- [#619](https://github.com/pyreon/pyreon/pull/619) [`399ac5c`](https://github.com/pyreon/pyreon/commit/399ac5c11f9a787ed6af1a94df3720cd241c06fa) Thanks [@vitbokisch](https://github.com/vitbokisch)! - compat: close genuine missing-by-omission public APIs (near-full parity)

  Audited the four compat layers (unit 770 → 804, browser smoke 4/4, e2e
  compat-layers 12/12 all green). Added the commonly-used public APIs that
  were missing by omission (not the intentional documented limitations like
  React class setState or Vue Options API):

  - **react-compat**: `useOptimistic` (React 19) — passthrough reduced
    through pending optimistic actions; overlay clears when `passthrough`
    changes (the non-concurrent-mode equivalent of React discarding
    optimistic state when the action settles).
  - **vue-compat**: `Transition`, `TransitionGroup` (← @pyreon/runtime-dom),
    `Suspense` (← @pyreon/core), `getCurrentInstance`, `useSlots`,
    `useAttrs`; `KeepAlive` upgraded from a no-op stub to wrap the real
    @pyreon/runtime-dom `KeepAlive`.
  - **solid-compat**: `Dynamic`, `Portal` (← @pyreon/core), `render` /
    `hydrate` (← @pyreon/runtime-dom mount/hydrateRoot), `MountableElement`.

  All additions map onto existing Pyreon primitives (no new deps), ship
  with JSDoc `@example` + tests, and honestly document their compat
  limitations in the JSDoc and docs pages. Backward-compatible.

- [#625](https://github.com/pyreon/pyreon/pull/625) [`de05746`](https://github.com/pyreon/pyreon/commit/de05746863646359c223d8f8e604077da79e159b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - compat: close the cleanly-fixable fidelity gaps ([#619](https://github.com/pyreon/pyreon/issues/619) follow-up)

  The partial-fidelity shims from [#619](https://github.com/pyreon/pyreon/issues/619) that COULD be faithfully implemented
  are now real (the rest stay honestly documented as architectural limits):

  - **solid-compat `Portal`**: `useShadow` → dedicated `<div>` host + open
    shadow root; `isSVG` → SVG-namespaced `<g>` host; children render into
    the host; host removed on unmount via `onCleanup` (no detached-host
    leak). No `@pyreon/core` change.
  - **vue-compat `useAttrs()` / `getCurrentInstance().attrs`**: now compute
    the Vue declared-vs-fallthrough split when `defineComponent({ props })`
    is used; full props object only when no props were declared.
  - **vue-compat `getCurrentInstance().emit`**: now provided — invokes the
    matching `on{Event}` prop handler.

  Backward-compatible. Verified: unit 804 → 811, solid browser 2 → 4,
  e2e compat-layers 12/12, typecheck clean.

### Patch Changes

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

### Patch Changes

- Updated dependencies [[`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8)]:
  - @pyreon/core@0.16.0
  - @pyreon/reactivity@0.16.0
  - @pyreon/runtime-dom@0.16.0

## 0.14.0

### Minor Changes

- [#290](https://github.com/pyreon/pyreon/pull/290) [`1eac951`](https://github.com/pyreon/pyreon/commit/1eac951e4057c91a1cb37e514b3164a163c27b05) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Production-ready SolidJS API surface with 155 tests and 97%+ coverage. Adds createResource, createStore/produce, createSignal equals option, startTransition/useTransition, observable/from, mapArray/indexArray. Fixes getter/setter identity stability. Adds type exports (Accessor, Setter, Signal, Component, etc.).

### Patch Changes

- Updated dependencies [[`c97783a`](https://github.com/pyreon/pyreon/commit/c97783a85b6f7ffc5d25ad16fd280c92808b5ea6), [`12dbf14`](https://github.com/pyreon/pyreon/commit/12dbf14c92ea3e107c89039a269181a500cb60d4)]:
  - @pyreon/runtime-dom@0.14.0
  - @pyreon/core@0.14.0
  - @pyreon/reactivity@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [[`a05c4ba`](https://github.com/pyreon/pyreon/commit/a05c4bab713f5168acd56eb233520102735bd80a)]:
  - @pyreon/core@0.13.0
  - @pyreon/reactivity@0.13.0
  - @pyreon/runtime-dom@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies [[`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa), [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa), [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa)]:
  - @pyreon/runtime-dom@0.12.15
  - @pyreon/core@0.12.15
  - @pyreon/reactivity@0.12.15

## 0.12.14

### Patch Changes

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

- Unify project scanner into @pyreon/compiler, fix JSX type declarations for published packages, update dependencies, and resolve build compatibility with rolldown 1.15.0.

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

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.4.0
  - @pyreon/core@0.4.0
  - @pyreon/runtime-dom@0.4.0

## 0.3.1

### Patch Changes

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
