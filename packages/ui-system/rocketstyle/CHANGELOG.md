# @pyreon/rocketstyle

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
  - @pyreon/ui-core@0.17.0
  - @pyreon/reactivity@0.17.0

## 0.16.0

### Minor Changes

- [#564](https://github.com/pyreon/pyreon/pull/564) [`6cda881`](https://github.com/pyreon/pyreon/commit/6cda8819d4c3cb7b1b5a4904aadc3e417524795c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Split `.attrs()` into two explicit overloads (callback form first, object form second) AND widen the DFP (calculated final props) type so JSX call sites with EA (extended-attrs) generics don't require redundant prop annotations.

  **Overload split**: `attrs(callback, config?)` and `attrs(object, config?)` were one polymorphic signature. TS picked the wrong one for `<P>`-typed object literals (the callback overload distributes `Partial<DFP & P>` over the callback's props arg; the object overload binds `P` directly to the literal). Splitting into two declarations lets TS pick the structurally-correct overload at the call site.

  **Asymmetric callback shape** (Pyreon-specific): callback PROPS narrow to `Partial<DFP & P>`, callback RETURN stays loose as `Partial<P> & Record<string, unknown>`. This preserves the convention where `.attrs()` callbacks return runtime-only fields like `_documentProps` / `tag: 'a'` overrides that aren't on the user's `<P>` generic.

  **DFP widening with `OA extends infer O` distribution**: `MergeTypes<[OA, EA, DefaultProps, ExtractDimensionProps<...>]>` now distributes over each branch of `OA` (when `OA` is a union, e.g. from a multi-overload base component). Pairs with PR [#565](https://github.com/pyreon/pyreon/issues/565) (`ExtractProps` overload narrowing) — DFP now correctly fans out across every overload's props instead of collapsing to the last one.

  **`NoInfer<DFP>` on the object form** (TS 5.4+): prevents TS from inferring `P` from `DFP` in the second overload — `P` must come from the user's literal or stays at its `TObj` default. Fixes "no overload matches this call" errors at consumer call sites in `document-primitives`, `ui-components`, `ui-primitives`. Mirrors vitus-labs commit.

### Patch Changes

- [#565](https://github.com/pyreon/pyreon/pull/565) [`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Multi-overload-aware `ExtractProps<T>`. Pattern-matches up to 4 call signatures and returns the UNION of their first-argument types instead of capturing only the LAST overload (TS's overload-resolution-against-conditional-types default). Multi-overload primitives like `Iterator` / `List` / `Element` ship 3 overloads where the LAST one is the loosest (`ChildrenProps`); pre-fix `ExtractProps<Iterator>` returned just `ChildrenProps` and lost `SimpleProps<T>` + `ObjectProps<T>` — wrapping Iterator through `rocketstyle()` / `attrs()` silently downgraded the public prop surface to the loose children-only form.

  Single-overload functions still work — TS fills missing slots by repeating the last overload, so the union of 4 copies of the same shape dedupes back to one.

  Kept in sync across the 4 copies in `@pyreon/core`, `@pyreon/elements`, `@pyreon/attrs`, `@pyreon/rocketstyle`. Pairs with the upcoming Iterator/List `LooseProps` fallback overload (separate PR), which gives the now-wider union a binding home at the JSX site.

  Mirrors vitus-labs PR [#222](https://github.com/pyreon/pyreon/issues/222).

- [#560](https://github.com/pyreon/pyreon/pull/560) [`21ccd15`](https://github.com/pyreon/pyreon/commit/21ccd153f29fff8ed629a2761a0c33cf33ae0ebe) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix `isDark`/`isLight` helper swap in `rocketstyle`'s `getDefaultAttrs`. The attrs callback received `isDark: mode === 'light'` and `isLight: mode === 'dark'` — exact inverse of the documented semantics. Any user code reading `helpers.isDark` / `helpers.isLight` from `.attrs(callback)` got the wrong flag for both light and dark mode. Inversed mode (`inversed: true`) was also affected since it flows through the same helper. Mirrors vitus-labs commit.

- Updated dependencies [[`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8), [`53b230c`](https://github.com/pyreon/pyreon/commit/53b230cc9715129af0088da516f572e6572a2117), [`3b61ea9`](https://github.com/pyreon/pyreon/commit/3b61ea986e45fa5c4560d766532123276033abb8)]:
  - @pyreon/core@0.16.0
  - @pyreon/styler@0.16.0
  - @pyreon/reactivity@0.16.0
  - @pyreon/ui-core@0.16.0

## 0.14.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.14.0
  - @pyreon/reactivity@0.14.0
  - @pyreon/styler@0.14.0
  - @pyreon/ui-core@0.14.0

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
  - @pyreon/ui-core@0.13.0
  - @pyreon/core@0.13.0
  - @pyreon/reactivity@0.13.0

## 0.12.15

### Patch Changes

- [#257](https://github.com/pyreon/pyreon/pull/257) [`f2c2606`](https://github.com/pyreon/pyreon/commit/f2c2606f59584f564b28b2f188d6537766d3060b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Align `useBooleans` type default with runtime default (`false`). Previously the type default was `true` while the runtime default was `false`, so boolean dimension props like `<Heading level3 />` typechecked but were silently dropped at runtime — components rendered with only their base `.theme()` styles, missing all `.sizes()` / `.variants()` / `.states()` overrides. Consumers that relied on boolean shorthand must either pass `useBooleans: true` explicitly or switch to the object form (`size="level3"`, `state="primary"`, `variant="secondary"`).

- Updated dependencies []:
  - @pyreon/core@0.12.15
  - @pyreon/reactivity@0.12.15
  - @pyreon/styler@0.12.15
  - @pyreon/ui-core@0.12.15

## 0.12.14

### Patch Changes

- [#252](https://github.com/pyreon/pyreon/pull/252) [`25949e7`](https://github.com/pyreon/pyreon/commit/25949e79484f169ac905bb9feecf31c702de1db6) Thanks [@vitbokisch](https://github.com/vitbokisch)! - T1.1 Phase 5 Batch 2 — browser smoke tests for rocketstyle + coolgrid + connector-document

  Adds real-Chromium Playwright smoke tests for three more ui-system
  packages. happy-dom can't compute styles from the injected stylesheet
  or resolve `@media` queries, so the rocketstyle → styler → DOM cascade,
  the coolgrid grid math, and the connector-document real-`h()`
  extraction pipeline went untested end-to-end.

  `@pyreon/rocketstyle` (`src/__tests__/rocketstyle.browser.test.tsx`,
  6 tests). Wraps a real `ComponentFn` (not `'div' as any`), matching
  production rocketstyle usage (Element/Text bases).

  - `.theme()` mounts and Chromium computes the authored color/padding
    via styler; emits a `pyr-*` class.
  - `state` prop swaps the resolved `$rocketstyle` theme.
  - `variant` layers on top of state.
  - `modifier` transform derives styles from the accumulated state theme.
  - `m(light, dark)` theme callback resolves per `PyreonUI` mode.
  - Reactive mode swap: `mode` is a signal on `PyreonUI`, rocketstyle's
    `$rocketstyleAccessor` reads `themeAttrs.mode` (ReactiveContext
    getter), styler's `isReactiveRS` effect observes the change and
    swaps classList in place — no remount. This is the only axis that
    survives the rocketstyle HOC spread (`{...filteredProps}` in
    `rocketstyleAttrsHoc` collapses `_rp()` getter props to values, so
    dimension props like `state={stateSig()}` aren't currently reactive
    end-to-end; mode flows via context, not props, so it stays live).

  `@pyreon/coolgrid` (`src/__tests__/coolgrid.browser.test.tsx`, 7 tests).
  Wraps in `PyreonUI` (deprecated `<Provider>` from @pyreon/unistyle
  replaced).

  - Container mounts with `display: flex; flex-direction: column`.
  - Col size=6/12 → ~50% of Row; two size=6 Cols sum to ~100%
    side-by-side.
  - `flex-basis: 25%` for size=3/12.
  - **columns != 12**: `theme.grid.columns = 6`, size=2/6 → 33.3333%
    — proves the math is `size / columns`, not hardcoded.
  - **`gap` subtraction**: Row `gap={24}`, Col size=6 emits
    `calc(50% - 24px)`; Chromium preserves the literal in computed
    `flex-basis`, col width < 50% of Row but > 40% (subtraction not
    failure).
  - **Responsive `size={[12, 6, 4]}`**: at the ~414px vitest viewport
    (below `sm`=576), the xs entry applies → size=12 → 100% of Row.

  `@pyreon/connector-document`
  (`src/__tests__/connector-document.browser.test.tsx`, 5 tests).

  - **Path A strict**: component body throws; if `extractDocumentTree`
    falls through to Path B and invokes the component, the test fails
    with the throw. Passing proves Path A reads `_documentProps` off
    the JSX vnode without invoking the component.
  - Path B: `extractDocumentTree` invokes the component to recover
    `_documentProps` from the post-call vnode (the rocketstyle
    attrs-HOC pattern).
  - Function-valued `_documentProps` resolve to LIVE values at
    extraction time — same vnode, signal mutated between calls, second
    extraction reads the new value.
  - Transparent (non-documentType) wrappers built with real `h()`
    flatten correctly.
  - `resolveStyles` produces a plain style record in the browser bundle
    (color/backgroundColor/fontSize=24/padding=[8,16] all parse; no
    Node-only dep leaks).

  Bisect-verified (load-bearing hot-path revert per suite):

  - **rocketstyle**: (a) emptied dimension theme merge → 3/6 failed
    (state, variant, modifier). (b) Static-returned `mode` in `useTheme`
    → 2/6 failed (reactive mode swap, m-callback dark-mode test).
    Restored, 6/6 pass.
  - **coolgrid**: (a) emptied Col `widthStyles` → 3/7 failed
    (size-ratio tests + flex-basis literal + gap + responsive).
    (b) Ignored `hasGap`, always plain percentage → gap-subtraction
    test failed with `calc(50% - 24px)` assertion. Restored, 7/7 pass.
  - **connector-document**: Path A strict test is self-bisecting —
    the component body throws, so any regression that causes the
    extractor to invoke it fails immediately with a real error.
    Additionally, gating Path B (`else if (false && typeof type ===
'function')`) → Path B + reactive accessor tests fail, 2/5.
    Restored, 5/5 pass.

  Also removes the three packages from `PHASE_5_PENDING_PACKAGES` in
  `scripts/check-browser-smoke.ts`. 7 packages remain pending
  (ui/{theme,components,primitives} + 4 compat layers).

- Updated dependencies [[`10a4e3b`](https://github.com/pyreon/pyreon/commit/10a4e3b53eb38b401f65f8436b94809ec4f1ee13)]:
  - @pyreon/styler@0.12.14
  - @pyreon/core@0.12.14
  - @pyreon/reactivity@0.12.14
  - @pyreon/ui-core@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.13
  - @pyreon/reactivity@0.12.13
  - @pyreon/styler@0.12.13
  - @pyreon/ui-core@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.12
  - @pyreon/reactivity@0.12.12
  - @pyreon/styler@0.12.12
  - @pyreon/ui-core@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.11
  - @pyreon/reactivity@0.12.11
  - @pyreon/styler@0.12.11
  - @pyreon/ui-core@0.12.11

## 0.1.2

### Patch Changes

- Fix generic type defaults in attrs and rocketstyle — use empty objects instead of Record<string, unknown> to preserve component prop types through SpreadTwo merges

- Updated dependencies []:
  - @pyreon/ui-core@0.1.2
  - @pyreon/styler@0.1.2

## 0.1.1

### Patch Changes

- [#25](https://github.com/pyreon/ui-system/pull/25) [`d1d941b`](https://github.com/pyreon/ui-system/commit/d1d941b2e676c4bec7e0d5c67dba47c222cfe756) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Replace workspace:^ peer dependencies with explicit version ranges to prevent unresolved workspace references in published packages

- Updated dependencies [[`d1d941b`](https://github.com/pyreon/ui-system/commit/d1d941b2e676c4bec7e0d5c67dba47c222cfe756)]:
  - @pyreon/ui-core@0.1.1
  - @pyreon/styler@0.1.1

## 0.0.3

### Patch Changes

- Update pyreon framework peer dependencies to >=0.4.0 <1.0.0, fix Element Wrapper children type for multi-child JSX patterns, add publish script improvements (--no-provenance, --otp support).

- Updated dependencies []:
  - @pyreon/ui-core@0.0.3
  - @pyreon/styler@0.0.3

## 0.0.2

### Patch Changes

- [#17](https://github.com/pyreon/ui-system/pull/17) [`d3c1e6e`](https://github.com/pyreon/ui-system/commit/d3c1e6e64e221e01a747e24ad93f7cfc1cf3b4ef) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Initial release of Pyreon UI System packages

- Updated dependencies [[`d3c1e6e`](https://github.com/pyreon/ui-system/commit/d3c1e6e64e221e01a747e24ad93f7cfc1cf3b4ef)]:
  - @pyreon/ui-core@0.0.2
  - @pyreon/styler@0.0.2
