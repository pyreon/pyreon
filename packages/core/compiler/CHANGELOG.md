# @pyreon/compiler

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

- [#732](https://github.com/pyreon/pyreon/pull/732) [`eea2972`](https://github.com/pyreon/pyreon/commit/eea29723e36088ec32d3e817e0f5f61606c9b949) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(compiler): skip the `() => x` accessor wrap for stable-reference JSX children of component parents

  The Pyreon compiler's prop-inlining pass rewrites `<Comp>{children}</Comp>`
  (where `children` is a local `const` derived from a getter — typically
  `const children = childHolder.children` after `splitProps`) as
  `Comp({ ..., children: () => h.children })`. Receiving components see
  `props.children` as a FUNCTION instead of the expected `VNode | VNode[]`.
  DOM-consuming code routes through `mountChild` which handles function
  children correctly via `mountReactive`, so the wrap is invisible there.
  Libraries that iterate children at the VNode level or `cloneVNode` them
  directly were silently broken — the function spread produced
  `{type: undefined}` and the DOM rendered literal `<undefined>` tags. PR
  [#731](https://github.com/pyreon/pyreon/issues/731) shipped the library-side workaround for `@pyreon/kinetic`; this is
  the upstream compiler fix that catches the broader class.

  ## The carve-out

  For JSX children of COMPONENT parents (uppercase tag), skip the wrap when:

  1. The expression is a **stable reference** — bare `Identifier`, simple
     non-computed `MemberExpression` chain (`obj.x.y`), or any of the above
     wrapped in TS type-only layers (`as T` / `satisfies T` / `!` / parens).
  2. The expression does **not** reference a tracked signal variable.

  Both conditions matter:

  - **(1)** restricts the carve-out to shapes whose value at JSX-emit time
    is identical to what an effect re-evaluation would produce — a bare
    property read resolves the underlying getter (if any) the same way once
    or N times. CallExpressions, BinaryExpressions, ConditionalExpressions,
    etc. keep the wrap because their re-evaluation semantics matter.
  - **(2)** preserves `<Comp>{count}</Comp>` (bare signal identifier) as the
    user's deliberate "make this reactive at the call site" shape. The
    compiler auto-calls (`count` → `count()`) AND wraps (`() => count()`)
    so the receiving component re-evaluates inside its
    `mountReactive`/`mountChild` scope.

  The slice is taken of the UNWRAPPED expression — TS type-only layers
  strip because esbuild's next stage removes them anyway, and this keeps
  cross-backend equivalence with the Rust path (whose `accesses_props`
  doesn't recurse into `TSAsExpression`).

  ## Cross-backend parity

  Both `transformJSX_JS` (TypeScript fallback) and the Rust `napi-rs`
  native binary implement the carve-out byte-identically. The cross-backend
  equivalence suite (`native-equivalence.test.ts`) gains 8 specs covering
  every shape (stable-ref / call / binary / DOM parent / signal / TS cast
  / non-null / fragment-transparency / static-array form). All pass on both
  backends.

  ## Relationship to PR [#731](https://github.com/pyreon/pyreon/issues/731) — complementary, not replacement

  This compiler fix and PR [#731](https://github.com/pyreon/pyreon/issues/731)'s library-side `resolveChildren` are
  COMPLEMENTARY layers:

  - **The compiler fix** addresses the OUTER pass-through pattern — any
    library or user code that forwards children to a child component via
    `<Comp>{children}</Comp>` where `children` is a local binding. No more
    silent function-wrap surprises for the most common shape.
  - **PR [#731](https://github.com/pyreon/pyreon/issues/731)'s library fix** addresses the INNER pattern — kinetic's
    StaggerRenderer / GroupRenderer emit JSX like
    `<TransitionItem>{cloneVNode(child, {style})}</TransitionItem>`. The
    inner expression is a CallExpression (`cloneVNode(...)`), NOT a stable
    reference, so the compiler carve-out (correctly) does not apply. The
    library-side unwrap is still needed for that case.

  Verified end-to-end against the bokisch.com Intro reproducer:

  - Compiler fix alone (kinetic at vanilla 0.22.0): bug still fires
    (`h1Count: 0`, 3 `<undefined>` tags from TransitionItem's
    `cloneVNode(function, {ref})`).
  - PR [#731](https://github.com/pyreon/pyreon/issues/731) alone (no compiler fix): bug fixed (PR [#731](https://github.com/pyreon/pyreon/issues/731) verified end-to-end).
  - Both layered: bug fixed AND the emitted bundle is cleaner
    (`children: h.children` bare instead of `children: () => h.children`).

  ## Bisect-verified at three layers

  - **JS backend**: `packages/core/compiler/src/tests/component-child-no-wrap.test.ts`
    (10 specs). Reverting the `isComponentTag(...) && isStableReference(expr)`
    carve-out fails 5 CONTRACT specs; 5 CONTROL specs stay green.
  - **Rust backend**: same carve-out mirrored in `native/src/lib.rs`
    (`is_stable_reference` + `unwrap_type_layers` + parent-component flag
    threading). Reverting fails the 8 new specs in `native-equivalence.test.ts`;
    244 pre-existing specs stay green.
  - **Real-app**: bokisch.com Intro with PR [#731](https://github.com/pyreon/pyreon/issues/731)'s library fix + this
    compiler fix → `h1Count: 1`, "Hello" rendered, zero `<undefined>` tags,
    emitted bundle shows `children: h.children` (no wrap).

  ## Surfaces updated

  - `packages/core/compiler/src/jsx.ts` — `handleJsxExpression(node, parentJsx?)`
    - `isComponentTag` + `isStableReference` + `unwrapTypeLayers`
  - `packages/core/compiler/native/src/lib.rs` — same logic, byte-identical
    emit; `parent_is_component_jsx_element` Ctx flag threaded through
    `handle_jsx_element` and reset across `JSXFragment` boundaries (matches
    JS-backend semantics)
  - `packages/core/compiler/src/tests/component-child-no-wrap.test.ts` —
    10 regression specs (5 CONTRACT + 5 CONTROL) with full bisect rationale
  - `packages/core/compiler/src/tests/native-equivalence.test.ts` —
    8 new cross-backend specs

## 0.22.0

## 0.21.0

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

- [#687](https://github.com/pyreon/pyreon/pull/687) [`c3df9db`](https://github.com/pyreon/pyreon/commit/c3df9dbbcf9e939c92e1c4843b59686cdd25589e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Native (Rust) backend brought to 1:1 with the JS backend for the two
  prop-derived/element-child fixes [#686](https://github.com/pyreon/pyreon/issues/686) landed on the JS side only. Without
  this, the production-preferred native backend silently diverged.

  - R7 — prop-derived inlining inside callback-nested JSX. `collect_prop_derived_idents`
    (native/src/lib.rs) had empty `Arrow|FunctionExpression => {}` arms and no
    JSX arm, so it never descended into a `.map(i => <li class={cls}/>)`
    callback body: `const cls = props.t; items.map(i => <li class={cls}/>)` kept
    `class={cls}` (const frozen at first render → reactivity SILENTLY LOST in
    real builds) while the JS backend inlined `class={(props.t)}`. Fixed: the
    arrow/function arms recurse into the body (concise + block) and JSX, with a
    `pd_minus` scope filter that removes names a scope binds (params / nested
    const-let / catch / loop) — byte-equivalent to the JS pass's scope-aware
    enter/leave set, so recursing does NOT reintroduce the shadowing-param
    clobber.

  - R9 — element-valued binding as a bare JSX child. The JS backend (via [#686](https://github.com/pyreon/pyreon/issues/686))
    mounts `const h=<h1/>; <div>{h}</div>` through `_mountSlot`; the native
    backend still text-coerced it to `createTextNode(h)` ("[object Object]").
    Fixed: the native backend tracks element-valued `const`/`let` bindings and
    routes a bare `{h}` child through `_mountSlot`, mirroring the JS path.

  No public API change; new cross-backend parity test only. native-equivalence
  suite 244/244 (unchanged), full compiler suite green, all three mechanisms
  bisect-verified (revert -> fail with the right error -> restore -> pass).

  Known orthogonal limitation (pre-existing, NOT introduced here, NOT a
  correctness bug): `{localArrowConst()}` whose body shadows via catch /
  nested-const emits different but both semantically-correct representations
  (JS inlines the arrow body; Rust binds the function reference). Outside the
  native-equivalence contract and out of scope; disclosed for honesty.

- [#686](https://github.com/pyreon/pyreon/pull/686) [`9a54705`](https://github.com/pyreon/pyreon/commit/9a54705c645ff2c3bee54fa8c6d411d1530b3187) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Compiler hardening sweep (10 systematic rounds — edge cases, miscompiles,
  memory, cross-backend). Two real correctness bugs fixed; two more proven,
  root-caused, and locked with self-discriminating tests (fixes scoped as
  follow-ups); the rest disproved and locked with contract/characterization
  tests so the verified behavior cannot silently regress.

  Fixed (behavior changes):

  - Scope-blind prop-derived inlining (silent miscompile + un-parseable emit).
    The reactive-props inlining pass substituted any identifier whose NAME
    matched a prop-derived const, with zero lexical-scope analysis. Idiomatic
    code reusing a short name (a / x / i / item) as a later callback parameter
    or nested local was MIS-COMPILED: a prop-derived const named the same as a
    ".map" arrow parameter produced an arrow whose parameter was rewritten to a
    member expression (un-parseable JS); a shadowing catch parameter likewise
    produced un-parseable output; a nested "const a = 7; return a" silently
    became "return props.x". The substitution is now lexically scope-aware
    (scopeBoundPropDerived plus a shadowed set threaded through the walk),
    mirroring the discipline the signal-auto-call pass already had. Genuine
    (non-shadowed) and transitive inlining is unchanged. Bisect-verified.

  - Raw C0 control bytes in source string/regex literals. The FNV-1a
    rocketstyleCollapseKey builder embedded literal NUL and SOH bytes as field
    separators (and a CLI ANSI module embedded a raw ESC), which classified the
    compiler's primary source as binary (grep/rg silently skip it) and made a
    cache-key separator silently mutable by formatters/editors. All replaced
    with byte-identical Unicode escape sequences; the emitted FNV key is
    provably unchanged. A repo-wide self-discriminating gate prevents
    reintroduction.

  Proven + locked (fixes scoped as tracked follow-ups, guarded by an it.fails
  spec that flips green-to-red the moment the fix lands):

  - JS-vs-Rust backend divergence: the native backend does not inline
    prop-derived consts used inside callback-nested JSX (the
    "const cls = props.t; items.map(i => <li class={cls}/>)" shape), so that
    ubiquitous pattern silently loses reactivity under the production
    (native-preferred) path. Root cause: collect_prop_derived_idents in
    native/src/lib.rs has no recursion arm for arrow/function/JSX nodes.

  - Element-valued const used as a bare JSX child is text-coerced
    (createTextNode(x), which renders [object Object]) instead of mounted, even
    though the compiler already lowered the const to a \_tpl(...) call and thus
    knows it is an element.

  No public API change. The new test suites add coverage only.

- [#689](https://github.com/pyreon/pyreon/pull/689) [`bbccaaf`](https://github.com/pyreon/pyreon/commit/bbccaaf3ec2f5dc3eed3e7195a09023fc59575d1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Compiler hardening rounds 11–20 — two more real reactivity bugs fixed
  (bisect-verified), plus regression locks for two proven gaps.

  - R11 — signal auto-call was scope-blind. `autoCallSignals` inserted `()`
    after every active-signal-named identifier with a hand-rolled skip-list
    that did NOT cover callback parameter binding positions, and it walked the
    wrapped expression scope-blind. A destructured/plain callback param
    reusing a signal's name was wrongly auto-called:
    `const x = signal(0); [{x:1}].map(({x}) => <li>{x}</li>)` emitted
    `<li>{x()}</li>` — `x` is the map item (1) → `1()` runtime TypeError (the
    signal twin of the R2 prop-derived scope bug). Fixed: `findSignalIdents` is
    now block-accurate scope-aware (`scopeBoundSignals` + a `shadowed` set with
    enter/leave, mirroring R2's `findIdents`); legitimate non-shadowed signal
    reads still auto-call. The JS backend now converges onto the
    already-correct native backend (no new divergence).

  - R13 — native-backend R7 residual. The resolution gate `accesses_props`
    (native/src/lib.rs) plus `collect_pd_in_stmt`'s statement coverage skipped
    prop-derived refs nested inside a callback whose body is a
    while/switch/try/labeled statement, so the production-preferred native
    backend silently under-inlined (`class={c}`) where JS inlined
    `class={(props.x)}` — reactivity lost. Fixed by completing the native
    statement-walker coverage with the same `pd_minus` scope-filter discipline
    (no shadowing-clobber regression); validated against all 180
    native-equivalence tests + full suite, binary rebuilt, bisect-verified.

  - R12 — `transformJSX` emitted NO source map and its substitutions shift
    line counts (template emission expands one-line JSX into a multi-line
    `_tpl(...)` factory), and `@pyreon/vite-plugin` returned `{ code, map: null }`
    — so every runtime stack frame / debugger breakpoint in every Pyreon
    component mislocated app-wide. Fixed: `transformJSX_JS` now applies its
    existing disjoint `{start,end,text}` replacement set through MagicString
    (`update`/`appendLeft`) and the generated preamble via `prepend`;
    `toString()` is byte-identical to the prior concatenation (proven — the
    full ~1240-test suite + 180 native-equivalence tests assert exact emitted
    strings and stay green), while `generateMap()` yields a correct V3 map
    (`prepend` shifts every mapping by the preamble's line count, accounting
    for the line-shift). `@pyreon/vite-plugin` now returns that map. New
    `magic-string` direct dependency on `@pyreon/compiler` (already a
    transitive dep of the toolchain — +1 lockfile line, no new package in any
    install). Build-mode maps are exact; dev-mode HMR / signal-name injections
    add a small un-remapped offset (still vastly better than no map); the
    native backend still emits no map (its own scoped follow-up). Bisect-
    verified: neutralize the map production → the sourcemap specs fail while
    byte-identity stays green; restore → pass.

  Still locked (proven, not yet fixed — scoped follow-up, no behavior change
  here): R15 — a prop-derived-referencing element-valued const
  (`const el=<i class={cls}/>`) diverges between backends (JS inlines+
  duplicates the JSX reactively, native mounts the frozen const); carries a
  self-discriminating `it.fails` lock that flips the moment the semantics are
  unified.

  No public API change. New tests only for the locks; the two fixes change
  emitted code for the buggy shapes (correctness) and are byte-equivalent
  across backends for everything else (R20 adds a JS↔Rust equivalence sweep
  gate over the rounds-11–19 corpus).

- [#679](https://github.com/pyreon/pyreon/pull/679) [`24a063c`](https://github.com/pyreon/pyreon/commit/24a063ccfa2ef267927dfd68886be24c397ccd72) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `detectPartialCollapsibleShape` + `CollapsibleHandler` — PR 1 of the
  partial-collapse build (open-work [#1](https://github.com/pyreon/pyreon/issues/1)). Purely additive: a new exported
  detector for the `on*`-handler-only collapsible subset (literal dimension
  props + peeled event handlers). No production path calls it yet (the
  `tryRocketstyleCollapse` fallback + plugin scan land in a follow-up PR),
  so existing compiler behaviour is byte-unchanged.

- [#683](https://github.com/pyreon/pyreon/pull/683) [`a086769`](https://github.com/pyreon/pyreon/commit/a0867699bdeca87f34e60fef7aa867a75a24d815) Thanks [@vitbokisch](https://github.com/vitbokisch)! - PR 3 of the partial-collapse build (open-work [#1](https://github.com/pyreon/pyreon/issues/1)): `tryRocketstyleCollapse`
  falls back to `tryPartialCollapse` (PR 1's `detectPartialCollapsibleShape`)
  when the full `detectCollapsibleShape` bails, emitting `__rsCollapseH(...)`
  - a residual-handlers object (consumed by PR 2's `_rsCollapseH`) for the
    `on*`-handler-only subset. Purely additive — the full-collapse and
    non-collapse code paths are byte-identical (the only delta is the
    `if (!shape)` fallback line + a conditional `_rsCollapseH` import that is
    byte-identical when no partial site fired). Off by default; emits only
    when `collapseRocketstyle` is configured AND the plugin has resolved the
    partial site (the resolver/plugin-scan half is the follow-up PR).

## 0.19.0

### Minor Changes

- [#593](https://github.com/pyreon/pyreon/pull/593) [`5b69841`](https://github.com/pyreon/pyreon/commit/5b69841a6ab30963977e276d120c33d66682da23) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<Defer>` inline form (v2) — closes 3 of the 4 scope gaps from PR [#587](https://github.com/pyreon/pyreon/issues/587):

  **Props on inline child** (gap 1)

  ```tsx
  // Before — bailed with no warning; runtime errored.
  <Defer when={open}>
    <Modal title="Confirm" size="md" />
  </Defer>

  // Now — compiler rewrites:
  <Defer when={open} chunk={() => import('./Modal').then((__m) => ({ default: __m.Modal }))}>
    {(__C) => <__C title="Confirm" size="md" />}
  </Defer>
  ```

  Props pass through verbatim into the render-prop body. The compiler only replaces the JSXIdentifier name (in opening AND closing tags) with `__C`; everything else (attrs, spread props, event handlers, nested children) survives unchanged.

  **Closure capture** (gap 2)

  ```tsx
  const open = signal(false)
  const count = signal(0)

  <Defer when={open}>
    <Modal count={count} onClose={() => open.set(false)} />
  </Defer>
  ```

  Works automatically once gap 1 is fixed — the render-prop arrow function lexically captures the surrounding scope, so `count` / `open` references resolve correctly at chunk-load time. No new code path; this falls out of preserving the child JSX verbatim.

  **Renamed imports** (gap 3)

  ```tsx
  // Before — bailed with `import-not-found` warning.
  import { Modal as M } from './Modal'
  <Defer when={open}><M /></Defer>

  // Now — compiler rewrites, extracting the ORIGINAL exported name from the chunk:
  <Defer when={open} chunk={() => import('./Modal').then((__m) => ({ default: __m.Modal }))}>
    {(__C) => <__C />}
  </Defer>
  ```

  `__m.Modal` — not `__m.M`. The chunk resolves the module's actual export, while the render-prop body uses `__C` (the render-prop binding).

  **Multi-specifier import handling** (drive-by bug fix)

  ```tsx
  import { Modal, OtherStuff } from "./shared";
  // ... uses OtherStuff elsewhere ...
  <Defer when={open}>
    <Modal />
  </Defer>;
  ```

  v1 would have removed the entire `import { Modal, OtherStuff }` declaration, breaking `OtherStuff`'s usage. v2 removes ONLY the `Modal` specifier — the import becomes `import { OtherStuff } from './shared'`. Sibling bindings stay intact. Handles both first-specifier and later-specifier cases.

  **Still NOT in this** (gap 4 — namespace imports)

  ```tsx
  import * as M from "./Modal";
  <Defer>
    <M.Modal />
  </Defer>; // — still bails
  ```

  Namespace imports with `JSXMemberExpression` children require a different rewrite path (the `_C` binding can't replace `M.Modal` since it's a member access, not an identifier). Not addressed in this PR — explicit form is the workaround.

  ## Verification

  - 16 unit tests in `defer-inline.test.ts` (3 new props tests + 2 renamed-imports tests + 2 multi-specifier tests in addition to the existing 9)
  - End-to-end via verify-modes — `examples/playground/src/pages/About.tsx` now uses inline `<Defer><DeferredFixture label="..." /></Defer>`, exercising prop-preservation through a real Vite build. The fingerprint `DEFER_INLINE_FIXTURE_PROP_LABEL_ABC987` must land in the route chunk (the render-prop body lives in the caller), NOT in the fixture chunk.
  - Bisect-verified: reverting `buildRenderPropBody` to a constant `{(__C) => <__C />}` (drops prop preservation) → cell fails with `fingerprint "DEFER_INLINE_FIXTURE_PROP_LABEL_ABC987" found in 0 chunks`. Restored → passes.

  1007 `@pyreon/compiler` tests pass.

- [#594](https://github.com/pyreon/pyreon/pull/594) [`e274fce`](https://github.com/pyreon/pyreon/commit/e274fceeb37d0893c7425463e443185388fce475) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<Defer>` inline form (v3) — closes the last open scope gap: namespace imports.

  ```tsx
  // Before — bailed with `import-not-found`; user had to use the explicit form.
  import * as M from './Modal'
  <Defer when={open}><M.Modal /></Defer>

  // Now — compiler rewrites:
  <Defer when={open} chunk={() => import('./Modal').then((__m) => ({ default: __m.Modal }))}>
    {(__C) => <__C />}
  </Defer>
  ```

  The compiler recognises `<M.Modal />` as a depth-1 `JSXMemberExpression`, looks up `M` as an `ImportNamespaceSpecifier`, and rewrites:

  1. The chunk extracts `__m.Modal` (the JSX property — `Modal`) from the namespace's source module
  2. The full `M.Modal` JSX name is replaced with `__C` in both opening and closing tags
  3. The static `import * as M from './Modal'` is removed (when M isn't used elsewhere)

  Closes gap 4 from the v2 follow-up roadmap — every common import shape now works inline:

  - `import X from './X'` ✓ (v1)
  - `import { X } from './X'` ✓ (v1)
  - `import { X as Y } from './X'` ✓ (v2)
  - `import * as M from './X'; <M.X />` ✓ (v3, this PR)

  Plus: multi-specifier imports drop only the deferred binding (v2 drive-by fix).

  **Sub-gaps explicitly NOT closed by this PR:**

  - **Deeper member expressions** (`<M.Sub.Modal />`) — `analyzeChildElement` returns null for non-depth-1 member expressions. The Defer is left alone; runtime errors with "missing chunk" if mounted. Workaround: explicit form.
  - **Member access on a default-import** (`import M from './X'; <M.Modal />`) — semantically different (member access on a component, not a namespace bag). Compiler emits `defer-inline/unsupported-import-shape` warning so the author understands why the inline form is being skipped.
  - **Namespace bindings referenced elsewhere in the file** (`import * as M; const x = M.Settings; <Defer><M.Modal /></Defer>`) — bails with `defer-inline/import-used-elsewhere` (Rolldown would static-bundle the module on shared usage, making the dynamic import a no-op). Common shape; users hitting this need either the explicit form or to refactor the namespace import.

  ## Verification

  - **23 unit tests** in `defer-inline.test.ts` (7 new for v3 — basic rewrite + props on member-expression child + non-self-closing + 4 bail-out cases)
  - **Real-app verify-modes**: `examples/playground/src/pages/About.tsx` now uses BOTH the v2 prop-preservation shape (`<DeferredFixture label="..." />`) AND the v3 namespace shape (`<NS.NamespaceFixture />`). New fingerprint `DEFER_NAMESPACE_FIXTURE_MARKER_QRS456` asserts the namespace fixture lands in its own chunk.
  - **Bisect-verified**: disabling the `ImportNamespaceSpecifier` branch in `findImportFor` → fingerprint lands in `about-*.js` (the route chunk) instead of `NamespaceFixture-*.js`. Restored → passes. Grep for `TEMP BISECT` → clean.

  1014 `@pyreon/compiler` tests pass.

- [#611](https://github.com/pyreon/pyreon/pull/611) [`070a0ec`](https://github.com/pyreon/pyreon/commit/070a0ec687ad598cf15963e5615bb1d8c81933a3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - **Reactivity Lens (experimental)** — surface the compiler's already-computed reactivity analysis back to the author at the source.

  Pyreon's [#1](https://github.com/pyreon/pyreon/issues/1) silent footgun: whether code is reactive is invisible at the moment you write it. The compiler ALREADY decides this per-expression for codegen and discards the analysis. The Lens pipes it back.

  - `@pyreon/compiler`: additive opt-in `TransformOptions.reactivityLens` → `TransformResult.reactivityLens: ReactivitySpan[]` (emitted code byte-identical with it on/off; all existing compiler tests pass unchanged). New exports `analyzeReactivity()` / `formatReactivityLens()` + `ReactivityKind` / `ReactivitySpan` / `ReactivityFinding` types. `analyzeReactivity` merges the structural compiler facts with the existing `detectPyreonPatterns` footgun detectors under one taxonomy.
  - `@pyreon/lint`: the existing `--lsp` server gains an `inlayHintProvider` + `textDocument/inlayHint` handler rendering `live` / `static` / `live·prop` / `hoisted` ghost-text at each reactive/baked-once expression; footguns publish as `pyreon-lens` warning diagnostics. Adds a `@pyreon/compiler` dependency.

  JS-backend only (native Rust sidecar parity is a follow-up). The positive "this is live" claim is a faithful record of the codegen branch, not a heuristic — drift-gated + bisect-verified.

### Patch Changes

- [#622](https://github.com/pyreon/pyreon/pull/622) [`5fb461a`](https://github.com/pyreon/pyreon/commit/5fb461aaf9fcc8d2a624af1442f4db97fd7f33c9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Migrate `@pyreon/compiler` onto the manifest-driven docs pipeline.

  `@pyreon/compiler` was the last core-layer package with NO `src/manifest.ts` — its `llms.txt` / `llms-full.txt` / MCP `api-reference.ts` surfaces did not exist at all (it was simply absent from every generated doc, and `get_api(compiler, …)` 404'd for the entire public surface including the Reactivity-Lens). This is the cause-level fix behind the "Lens docs enrichment" follow-up: the Lens couldn't be documented because the package it lives in wasn't on the pipeline.

  **Added** `packages/core/compiler/src/manifest.ts` via `defineManifest()` — 18 `api[]` entries (the full public surface from `src/index.ts`): `transformJSX`, `transformJSX_JS`, `analyzeReactivity`, `formatReactivityLens`, `detectReactPatterns`, `migrateReactCode`, `hasReactPatterns`, `diagnoseError`, `detectPyreonPatterns`, `hasPyreonPatterns`, `auditTestEnvironment`, `formatTestAudit`, `auditIslands`, `formatIslandAudit`, `auditSsg`, `formatSsgAudit`, `transformDeferInline`, `generateContext`. Every entry carries an accurate `signature` + dense `summary`; the real foot-guns get `mistakes[]` (the dual-backend invisibility trap, the SSR-needs-`h()`-not-`_tpl()` trap, `knownSignals` cross-module seeding, the Lens asymmetric-precision contract, the enforced `fixable: false` invariant); `analyzeReactivity` / `formatReactivityLens` are flagged `stability: 'experimental'`; 3 package-level `gotchas` (dual backend, Lens is editor-only, detectors are not codemods).

  **Wiring:** added `@pyreon/manifest` as a `workspace:*` devDependency on `@pyreon/compiler` (matches the `@pyreon/lint` convention — `manifest.ts` is gen-docs-only, never imported by `src/index.ts`, so it's tree-shaken from the published `lib/`). Added the `// <gen-docs:api-reference:start/end @pyreon/compiler>` marker pair to `packages/tools/mcp/src/api-reference.ts` (core-layer slot, between `@pyreon/core` and `@pyreon/router`). `bun run gen-docs` regenerated the `llms.txt` bullet, the `llms-full.txt` `## @pyreon/compiler` section, and the 18-entry MCP api-reference region; updated the hand-prose `## Core Framework` count 6 → 7.

  **No runtime or API change** — purely additive doc-pipeline metadata. `gen-docs --check` in sync; lint 0 errors; typecheck clean (compiler + mcp); compiler 1053 tests, mcp 497, manifest 135 all green; `check-manifest-depth` passes (compiler enters at port-grade density and is intentionally NOT added to `LOCKED` — it's the visible migration backlog, not yet at flagship density). New `manifest-snapshot.test.ts` (5 specs) locks the rendered bullet/section/api-reference shape + the experimental-flag and foot-gun-catalog assertions locally in addition to the CI `Docs Sync` gate.

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

- [#644](https://github.com/pyreon/pyreon/pull/644) [`6472de0`](https://github.com/pyreon/pyreon/commit/6472de00ffdbcff1fd453c125c404b75fc5cc46d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Release pipeline: `scripts/publish.ts` now resolves `workspace:` ranges in `optionalDependencies` (previously only `dependencies` / `peerDependencies` / `devDependencies` were resolved).

  `@pyreon/compiler` is the only package using `optionalDependencies` — its 7 per-platform native-binary packages (`@pyreon/compiler-<triple>`). Because that 4th field was never passed through `resolveWorkspaceDeps()`, `@pyreon/compiler@0.18.0` shipped to npm with `optionalDependencies: { "@pyreon/compiler-darwin-arm64": "workspace:^", … }` — the literal pnpm/bun workspace protocol. Effect: `npm i @pyreon/compiler@0.18.0` **hard-fails for every consumer** with `EUNSUPPORTEDPROTOCOL: Unsupported URL Type "workspace:"` — npm rejects the manifest while parsing, before it can skip an _optional_ dependency. The 0.18.0 compiler is therefore uninstallable standalone (and the 7 native binaries it points at can never resolve).

  Fix is the missing 4th field plus a defense-in-depth guard: after building the resolved manifest, `publish.ts` scans every dependency field and **hard-fails before write/publish** if any `workspace:` range remains — so a future package.json field added without updating the resolve list can't silently ship another broken release (exactly how `optionalDependencies` slipped through). A broken publish is immutable and unrecoverable, so the gate must be pre-publish.

  Bisect-proven against the real `packages/core/compiler/package.json`: before → 7× `workspace:^`; after → 7× `^0.18.0`; guard passes on resolved input and exits 1 on any residual `workspace:`. npm 0.18.0 is immutable and stays broken (deprecate it); this makes the next release's `@pyreon/compiler` installable.

- [#645](https://github.com/pyreon/pyreon/pull/645) [`0408e47`](https://github.com/pyreon/pyreon/commit/0408e475e63770996eff17bfb6ac318e89c45df4) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Release pipeline: fix `release-native.yml` OIDC trusted publishing — remove the `.npmrc` that defeated it.

  The Publish job correctly had no `NODE_AUTH_TOKEN`, but `actions/setup-node` was still invoked with `registry-url: 'https://registry.npmjs.org'`. setup-node writes a project `.npmrc` containing `//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}` **whenever `registry-url` is set** — with no token in the env that line resolves to an empty `_authToken=`. npm then sees explicit (empty) registry auth and **skips the OIDC trusted-publishing exchange entirely**, so `npm publish` returns `404` on the PUT even when the package's trusted publisher is configured correctly. Provenance still signed (it uses the GitHub OIDC id-token directly, independent of npm registry auth), which masked the root cause and made the v0.18.0 native-publish failures look like an npmjs.com config problem.

  Fix:

  - Remove `registry-url:` from the `setup-node` step (no `.npmrc` auth line is written → npm performs the token-free OIDC exchange).
  - Add an "Ensure npm supports OIDC trusted publishing" step (`npm install -g npm@latest`) — npm's native token-free trusted publishing landed in 11.5.1; Node 24's bundled npm can be older (24.x shipped 11.3.x).
  - Belt-and-suspenders `rm -f` of any stray `.npmrc` (repo checkout / cached home) immediately before `npm publish`.
  - Tightened the in-workflow comment to the exact trusted-publisher identity (`pyreon/pyreon` / `release-native.yml` / no environment) and the precise meaning of a 404.

  YAML validated (parses; `setup-node.with` is now `{ node-version: 24 }` only; publish steps in correct order). This unblocks token-free native-binary publishing for the next release tag — no manual bootstrap needed once it lands (assuming the per-package trusted-publisher records match the identity above).

- [#633](https://github.com/pyreon/pyreon/pull/633) [`7e0fe1a`](https://github.com/pyreon/pyreon/commit/7e0fe1a4f7cbb68f7647d85bef843de90d04d506) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(compiler): `query-options-as-function` detector — makes the @pyreon/query best-practice proactive in MCP `validate`

  `[#632](https://github.com/pyreon/pyreon/issues/632)` shipped `pyreon/query-options-as-function` as an opt-in `@pyreon/lint`
  rule — **reactive**: an AI agent only sees it after running
  `pyreon doctor` / `pyreon-lint`. This adds the same check as a
  `detectPyreonPatterns` code in `@pyreon/compiler`, so the MCP `validate`
  tool flags it **proactively** — an agent calling `validate({ code })`
  while writing sees the fix (`useQuery(() => (...))`) before the code is
  ever committed. Closes the genuine functional gap (proactive AI-fix),
  not just more coverage.

  - New `PyreonDiagnosticCode: 'query-options-as-function'`. Fires on an
    object-literal first arg to `useQuery` / `useInfiniteQuery` /
    `useQueries` / `useSuspenseQuery`. `useMutation` excluded by design
    (imperative — plain object is correct); identifier/call args stay
    silent (statically unprovable). `fixable: false` (the documented
    invariant — no `migrate_pyreon` tool yet).
  - Wired into the AST dispatch + the `hasPyreonPatterns` regex pre-filter.
  - Shares one `[detector: query-options-as-function]` tag in
    `.claude/rules/anti-patterns.md` with the lint rule (the
    `detector-tag-consistency` drift guard enforces the loop; [#632](https://github.com/pyreon/pyreon/issues/632)'s
    entry used the wrong tag form — corrected here).

  Bisect-verified (neuter → 2 FIRES specs fail, restore → 73/73 pass).
  `@pyreon/compiler` suite + the MCP `validate` zero-false-positive guard
  green. Docs: CLAUDE.md detector list 14 → 15.

- [#618](https://github.com/pyreon/pyreon/pull/618) [`c5b2ea2`](https://github.com/pyreon/pyreon/commit/c5b2ea2fe0df3f52b2af21e0d79b1e391ca9fad5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add the `props-destructured-body` static detector to `detectPyreonPatterns`
  — the body-scope companion to `props-destructured`. It flags
  `const { x } = props` written synchronously in a component body, the
  reactivity footgun the parameter-destructure detector explicitly did
  NOT cover (previously a documented "lightweight AST can't do this"
  cliff; the TS-compiler-API detector resolves it with scope tracking).

  Precision (zero-false-positive priority): only PascalCase JSX-rendering
  components; only `= props` where `props` is the bare first-parameter
  identifier (unwrapped through `as` / `satisfies` / `!` / parens); the
  walk does NOT descend into nested functions (a destructure inside a
  handler / `effect` / returned accessor re-reads `props` per invocation
  and is reactivity-correct). Surfaces through the MCP `validate` tool and
  `pyreon doctor` alongside the other Pyreon detectors.

- [#616](https://github.com/pyreon/pyreon/pull/616) [`6581f07`](https://github.com/pyreon/pyreon/commit/6581f073293a72360fe9391990d08316e0dc5b4b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Reactivity Lens — Phase 3: Rust-backend sidecar parity. The native
  napi-rs binary now emits the `reactivityLens` span sidecar from the
  same 6 codegen-decision sites as the JS path, gated by the same opt-in
  `TransformOptions.reactivityLens` flag. Purely additive — emitted code
  is byte-identical with the option on or off, on both backends — so the
  ~80% of users on the native path get the editor lens too. JS↔Rust
  span-set parity + the additive guarantee are gated by the new
  `compareLens` cross-backend equivalence block (bisect-verified).

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

## 0.17.0

### Patch Changes

- [#584](https://github.com/pyreon/pyreon/pull/584) [`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Preserve reactive props through component-JSX spread + framework prop pipelines.

  **Bug class.** Pyreon's reactive-prop contract is that `<Comp prop={signal()}>` compiles to `h(Comp, { prop: _rp(() => signal()) })` and `mount.ts:makeReactiveProps` converts `_rp`-branded thunks into property GETTERS on the props object. Any prop-pipeline step that VALUE-COPIES `props[key]` (plain assignment, spread, or `Object.assign`) fires the getter at HOC setup time — outside any tracking scope — and stores the resolved value as a static data property. Every downstream JSX accessor reading `props.x` then sees the captured-once value, never re-subscribing to the underlying signal.

  **Two layers of fix:**

  1. **Compiler-level (closes the bug class for all consumers, including user code).** Both the JS compiler (`src/jsx.ts`) and the Rust native binary (`native/src/lib.rs`) now wrap component-JSX spread arguments with the new `_wrapSpread(...)` helper from `@pyreon/core`. `<Comp {...source}>` compiles to `jsx(Comp, { ..._wrapSpread(source) })` — `_wrapSpread` replaces getter descriptors with `_rp`-branded thunks, so the JS-level spread carries function values (no getters fire), and `makeReactiveProps` converts them back to getters on the consumer side. Fast path: when `source` has no getter descriptors, `_wrapSpread` returns the source unchanged — zero overhead for the 99% of spread sources that don't carry reactive props. Lowercase-tag (DOM) spreads route through the template path's `_applyProps` (already reactive) and skip the wrap.

  2. **Framework-level (closes every observed leak site in shipped packages):**
     - `@pyreon/rocketstyle` — `removeUndefinedProps` + `mergeDescriptors` (new helper in `utils/attrs.ts`) replace 3 spread sites in `rocketstyleAttrsHoc.ts` and `rocketstyle.ts`'s `mergeProps`. `finalProps.ref` / `$rocketstyle` / `$rocketstate` writes use `Object.defineProperty` (handles getter-only descriptors).
     - `@pyreon/styler` — `buildProps` in `forward.ts` copies descriptors via `copyDescriptor` instead of value-reads.
     - `@pyreon/ui-core` — `omit` / `pick` in `utils.ts` copy descriptors.
     - `@pyreon/elements` — Wrapper's `buildStyledProps` builds props via descriptor-preserving copy and forwards `ref` / `as` / extras via `Object.defineProperty`.
     - `@pyreon/core` — `jsx-runtime.ts`'s `jsx()` has a slow path that preserves descriptors when `props` arrives with getters (for direct `h()` callers).
     - `@pyreon/runtime-dom` — `applyProps` in `props.ts` detects getter descriptors and wraps the write in `renderEffect`.

  **Bisect-verified at TWO layers:**

  - **Unit / browser**: `packages/ui-system/rocketstyle/src/__tests__/reactive-props-preservation.test.ts` (9 specs) + the new `rocketstyle.browser.test.tsx` spec covering the full pipeline. Reverting any of the 4 leak-site fixes individually fails the relevant spec with `expected 'count: 1' to be 'count: 0'`.
  - **Real-Chromium e2e**: `e2e/ui-showcase-regression.spec.ts:793 — signal-driven prop on Button updates the DOM on flip` exercises a rocketstyle Button with a `title={\`count: \${count()}\`}` prop fed by a signal. Reverting the compiler-level fix (`packages/core/compiler/src/jsx.ts`+`native/src/lib.rs`+ rebuilding the Rust binary) → spec fails with`unexpected value "count: 0"` after click — proving the spread reactivity contract holds end-to-end through the entire prop pipeline (rocketstyle attrs HOC → styler buildProps → Element Wrapper → runtime-dom applyProps).

  **No public API breakage.** `_wrapSpread` is an internal compiler-emitted helper; users never call it directly. Framework-internal helpers (`mergeDescriptors` in rocketstyle, `copyDescriptor` in styler, etc.) are not exported. The only public surface change is that getter-shaped reactive props now survive every framework boundary — i.e. the reactive-prop contract finally works as documented.

## 0.16.0

## 0.14.0

### Minor Changes

- [#274](https://github.com/pyreon/pyreon/pull/274) [`aa8e61b`](https://github.com/pyreon/pyreon/commit/aa8e61b873b7d42c60a613f57841a75293080c8a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Rewrite the reactive JSX transform in Rust (napi-rs) for 3.7-8.9x faster compilation. The native binary auto-loads when available, falling back to the JS implementation transparently. All 527 tests pass across both backends.

- [#311](https://github.com/pyreon/pyreon/pull/311) [`602446b`](https://github.com/pyreon/pyreon/commit/602446bb49e6ea95fe9d2dbc7774bbf9a66da80d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Test-environment audit (T2.5.7) — scans every `*.test.ts(x)` under `packages/` for mock-vnode patterns (the PR [#197](https://github.com/pyreon/pyreon/issues/197) bug class: tests that construct `{ type, props, children }` literals or a custom `vnode()` helper instead of going through the real `h()` from `@pyreon/core`). Classifies each file as HIGH / MEDIUM / LOW based on the balance of mock literals, helper definitions, helper call-sites, real `h()` calls, and the `@pyreon/core` import.

  Scanner lives in `@pyreon/compiler` (`auditTestEnvironment`, `formatTestAudit`) so both `@pyreon/mcp` and `@pyreon/cli` can use it without pulling in each other.

  - **MCP**: new `audit_test_environment` tool. Options `minRisk` (default `medium`) and `limit` (default 20). Scans 400+ test files in ~50ms.
  - **CLI**: `pyreon doctor --audit-tests` appends the audit output. `--audit-min-risk high|medium|low` to filter. Honors `--json` for machine-readable output.

- [#307](https://github.com/pyreon/pyreon/pull/307) [`4638c27`](https://github.com/pyreon/pyreon/commit/4638c2761ec34b1102a36c4675cfcfa805c2168c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Pyreon-specific anti-pattern detector for the MCP `validate` tool (T2.5.2). `@pyreon/compiler` exports a new `detectPyreonPatterns(code, filename)` AST walker catching 9 "using Pyreon wrong" mistakes — `for-missing-by` / `for-with-key` on `<For>`, `props-destructured` at component signatures, `process-dev-gate` (dead code in Vite browser bundles), `empty-theme` no-op chains, `raw-add-event-listener` / `raw-remove-event-listener`, `date-math-random-id` ID schemes, and `on-click-undefined`. `@pyreon/mcp`'s `validate` tool now merges these diagnostics with the existing React detector output, sorted by source line. Every detected pattern is grounded in `.claude/rules/anti-patterns.md` — each bullet there carries a `[detector: <code>]` tag so contributors see what runs statically vs what remains doc-only.

- [#296](https://github.com/pyreon/pyreon/pull/296) [`83aa9ab`](https://github.com/pyreon/pyreon/commit/83aa9abbc52d423dfc9d45a3b0a4e048b161186d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Auto-call signals and computeds in JSX — plain JS syntax for reactivity. `const count = signal(0); <div>{count}</div>` compiles to `<div>{() => count()}</div>`. Scope-aware (shadowed variables not auto-called), cross-module (Vite plugin pre-scans exports), import-type-safe, computed-aware. 527 tests.

## 0.13.0

## 0.12.15

## 0.12.14

## 0.12.13

## 0.12.12

## 0.12.11

## 0.7.2

## 0.7.1

## 0.7.0

## 0.6.0

## 0.5.7

## 0.5.6

## 0.5.4

## 0.5.3

## 0.5.2

## 0.5.1

### Patch Changes

- Unify project scanner into @pyreon/compiler, fix JSX type declarations for published packages, update dependencies, and resolve build compatibility with rolldown 1.15.0.

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

## 0.4.0

## 0.3.1

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
