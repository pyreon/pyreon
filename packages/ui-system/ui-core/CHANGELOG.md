# @pyreon/ui-core

## 0.23.0

### Patch Changes

- Updated dependencies [[`6571df8`](https://github.com/pyreon/pyreon/commit/6571df8209c5dc72619194ffe19359765b1d2d7f), [`af4d5d8`](https://github.com/pyreon/pyreon/commit/af4d5d83fc087d738dbe5084950476566d488d77), [`441b5df`](https://github.com/pyreon/pyreon/commit/441b5dfa64ae52002d3e6612ec68566344ae999d)]:
  - @pyreon/core@0.23.0
  - @pyreon/reactivity@0.23.0
  - @pyreon/styler@0.23.0
  - @pyreon/unistyle@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.22.0
  - @pyreon/reactivity@0.22.0
  - @pyreon/styler@0.22.0
  - @pyreon/unistyle@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.21.0
  - @pyreon/reactivity@0.21.0
  - @pyreon/styler@0.21.0
  - @pyreon/unistyle@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [[`3499594`](https://github.com/pyreon/pyreon/commit/3499594585b7fcb650ac0f80be4bc355f741491b), [`65e61eb`](https://github.com/pyreon/pyreon/commit/65e61eba20741a012b753b4c8c69045f408768b7)]:
  - @pyreon/reactivity@0.20.0
  - @pyreon/styler@0.20.0
  - @pyreon/core@0.20.0
  - @pyreon/unistyle@0.20.0

## 0.19.0

### Patch Changes

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

- Updated dependencies [[`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a), [`ecd8e52`](https://github.com/pyreon/pyreon/commit/ecd8e526943a1e6b07957ff96f4410fa482baa0d), [`ac1d375`](https://github.com/pyreon/pyreon/commit/ac1d37542b11cd95451a2f0b0a51cc43603d001a), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`c4b6e9a`](https://github.com/pyreon/pyreon/commit/c4b6e9a5850196171c2197fc918163f736708aa8), [`fb40906`](https://github.com/pyreon/pyreon/commit/fb409066e49e44c42f77084a92a68103a4e6c5ef), [`9f03747`](https://github.com/pyreon/pyreon/commit/9f037478763d9f8cd2365feb63dc87fda2545e5d), [`3374150`](https://github.com/pyreon/pyreon/commit/33741500499dfb487d031bbffe77723d74b8f261), [`fa4e37f`](https://github.com/pyreon/pyreon/commit/fa4e37fa620cf0e3f240053bf789b84bd9668838), [`5431467`](https://github.com/pyreon/pyreon/commit/5431467ac41ccd1374359120b3e71f4af5d6745e)]:
  - @pyreon/reactivity@0.19.0
  - @pyreon/core@0.19.0
  - @pyreon/styler@0.19.0
  - @pyreon/unistyle@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.18.0
  - @pyreon/reactivity@0.18.0
  - @pyreon/styler@0.18.0
  - @pyreon/unistyle@0.18.0

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

- Updated dependencies [[`35af0e2`](https://github.com/pyreon/pyreon/commit/35af0e22b670151052e0b1df5006977fca759128), [`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c)]:
  - @pyreon/core@0.17.0
  - @pyreon/styler@0.17.0
  - @pyreon/unistyle@0.17.0
  - @pyreon/reactivity@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [[`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8), [`53b230c`](https://github.com/pyreon/pyreon/commit/53b230cc9715129af0088da516f572e6572a2117), [`3b61ea9`](https://github.com/pyreon/pyreon/commit/3b61ea986e45fa5c4560d766532123276033abb8)]:
  - @pyreon/core@0.16.0
  - @pyreon/styler@0.16.0
  - @pyreon/reactivity@0.16.0
  - @pyreon/unistyle@0.16.0

## 0.14.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.14.0
  - @pyreon/reactivity@0.14.0
  - @pyreon/styler@0.14.0
  - @pyreon/unistyle@0.14.0

## 0.13.0

### Patch Changes

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
  - @pyreon/styler@0.13.0
  - @pyreon/unistyle@0.13.0
  - @pyreon/core@0.13.0
  - @pyreon/reactivity@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.15
  - @pyreon/reactivity@0.12.15
  - @pyreon/styler@0.12.15
  - @pyreon/unistyle@0.12.15

## 0.12.14

### Patch Changes

- Updated dependencies [[`10a4e3b`](https://github.com/pyreon/pyreon/commit/10a4e3b53eb38b401f65f8436b94809ec4f1ee13)]:
  - @pyreon/styler@0.12.14
  - @pyreon/unistyle@0.12.14
  - @pyreon/core@0.12.14
  - @pyreon/reactivity@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.13
  - @pyreon/reactivity@0.12.13
  - @pyreon/styler@0.12.13
  - @pyreon/unistyle@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.12
  - @pyreon/reactivity@0.12.12
  - @pyreon/styler@0.12.12
  - @pyreon/unistyle@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.11
  - @pyreon/reactivity@0.12.11
  - @pyreon/styler@0.12.11
  - @pyreon/unistyle@0.12.11

## 0.1.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/styler@0.1.2

## 0.1.1

### Patch Changes

- [#25](https://github.com/pyreon/ui-system/pull/25) [`d1d941b`](https://github.com/pyreon/ui-system/commit/d1d941b2e676c4bec7e0d5c67dba47c222cfe756) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Replace workspace:^ peer dependencies with explicit version ranges to prevent unresolved workspace references in published packages

- Updated dependencies []:
  - @pyreon/styler@0.1.1

## 0.0.3

### Patch Changes

- Update pyreon framework peer dependencies to >=0.4.0 <1.0.0, fix Element Wrapper children type for multi-child JSX patterns, add publish script improvements (--no-provenance, --otp support).

- Updated dependencies []:
  - @pyreon/styler@0.0.3

## 0.0.2

### Patch Changes

- [#17](https://github.com/pyreon/ui-system/pull/17) [`d3c1e6e`](https://github.com/pyreon/ui-system/commit/d3c1e6e64e221e01a747e24ad93f7cfc1cf3b4ef) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Initial release of Pyreon UI System packages

- Updated dependencies [[`d3c1e6e`](https://github.com/pyreon/ui-system/commit/d3c1e6e64e221e01a747e24ad93f7cfc1cf3b4ef)]:
  - @pyreon/styler@0.0.2
