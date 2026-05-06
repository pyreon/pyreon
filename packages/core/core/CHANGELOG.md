# @pyreon/core

## 1.0.0

### Minor Changes

- [#336](https://github.com/pyreon/pyreon/pull/336) [`b8819ac`](https://github.com/pyreon/pyreon/commit/b8819ace413b377739e9208d19a72afbc0eea0c4) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `Show` and `Match` now accept either an accessor or a value for the `when` prop. Previously, `<Show when={signal}>` (bare signal reference) compiled to `<Show when={signal()}>` via the compiler's signal auto-call, which passed a boolean — and `Show` then crashed with `TypeError: props.when is not a function`. The fix adds defensive normalization (`typeof === 'function'` check), so both shapes work. Reactive cases still need the accessor form (`when={() => signal()}`) for true re-evaluation on signal change; the value form covers static booleans and the auto-call edge case. The `ShowProps['when']` type widens from `() => unknown` to `unknown | (() => unknown)`.

### Patch Changes

- [#428](https://github.com/pyreon/pyreon/pull/428) [`c3b924a`](https://github.com/pyreon/pyreon/commit/c3b924ab03dbf3187acc2ec3d85521f1a4e57a56) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `useForm.register(field, { type: 'checkbox' })` and `useField.register({ type: 'checkbox' })` now return `FieldRegisterCheckboxProps` (a new exported type) instead of `FieldRegisterProps<T>`. The checkbox shape OMITS `value` and includes `checked` as a required field — `<input type="checkbox" {...register(field, { type: 'checkbox' })}>` now type-checks cleanly without a cast.

  Pre-fix, register's return type included `value: Signal<boolean>` for checkbox fields. JSX's `<input value={...}>` only accepts `string | number | (() => string | number)`, so the spread caused a TS2322 error and consumers had to wrap with `as unknown as InputAttributes`. Runtime behavior is unchanged — checkboxes have always read `checked` for their form value, and HTML's `<input type="checkbox" value=...>` carries arbitrary metadata, not the form-level boolean.

  The `register` field in `FormState['register']` and `UseFieldResult['register']` is now a typed overload — pass `{ type: 'checkbox' }` for checkbox shape, omit or pass `{ type?: 'number' }` for the standard `FieldRegisterProps<T>` shape.

  Companion fix in `@pyreon/core`'s `InputAttributes` and `TextareaAttributes`: widened `readOnly` from `boolean | undefined` to `boolean | (() => boolean) | undefined`, mirroring `disabled`. Both props are reactive in the runtime; the asymmetric type was a bug — `register()` always emitted `readOnly: Accessor<boolean>` (a callable), which couldn't satisfy the narrower type. No runtime change.

- Updated dependencies []:
  - @pyreon/reactivity@1.0.0

## 0.14.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.14.0

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

- Updated dependencies []:
  - @pyreon/reactivity@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.12.15

## 0.12.14

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.12.14

## 0.12.13

### Patch Changes

- ## Bug Fixes

  ### Responsive CSS pipeline — restore `css` template results in `processDescriptor` ([#208](https://github.com/pyreon/pyreon/issues/208))

  Follow-up to the 0.12.12 regression fix. `processDescriptor.ts` had the same plain-string bug as `styles/index.ts` — special descriptors (`fullScreen`, `backgroundImage`, `hideEmpty`, `clearFix`) were returning plain strings instead of `css` tagged-template results. This broke the CSS interpolation chain at a deeper level than the 0.12.12 fix addressed, causing media queries to not generate correctly for responsive props like `maxWidth: { xs: 640, md: 840 }`.

  Restored the `css` template wrapping throughout the responsive pipeline, matching the reference implementation.

  ### `onClick=undefined` warning silenced ([#208](https://github.com/pyreon/pyreon/issues/208))

  The conditional handler pattern is idiomatic and was flooding the dev console with false-positive warnings:

  ```tsx
  <button onClick={condition ? handler : undefined}>  // now quiet
  ```

  The runtime correctly bails on nullish values. The warning now only fires for actually-wrong types (strings, numbers, objects) that indicate real bugs.

  ### `dangerouslySetInnerHTML` warning removed ([#208](https://github.com/pyreon/pyreon/issues/208))

  Was firing on every prop application, flooding the console on every re-render. The name `dangerouslySetInnerHTML` IS the warning — matches React's behavior (no log).

- Updated dependencies []:
  - @pyreon/reactivity@0.12.13

## 0.12.12

### Patch Changes

- ## Bug Fixes

  ### CSS layer cascade fixed — rocketstyle themes now correctly override element base styles ([#206](https://github.com/pyreon/pyreon/issues/206))

  The 0.12.11 release had a CSS cascade regression where element base styles (padding, display, flex-direction) overrode rocketstyle theme styles (colors, borders, shadows). Three root causes:

  1. **`styles/index.ts` returned a plain string** instead of a `css` tagged-template result, breaking the CSS interpolation chain for responsive styles, pseudo-selectors, and @layer wrapping.

  2. **CSS layer architecture was backwards** — Elements were unlayered (highest priority per CSS cascade spec) while rocketstyle used `@layer pyreon` (lower priority). Fixed with explicit two-layer ordering: `@layer elements, rocketstyle;`. Elements use `{ layer: 'elements' }`, rocketstyle uses `{ layer: 'rocketstyle' }`.

  3. **`optimizeTheme` per-property diffing** restored — only emits changed properties per breakpoint for minimal CSS output. If `padding: 8` is the same at `xs` and `md`, only `fontSize` is emitted in the `md` media query.

  ### Dev warning false positives fixed ([#206](https://github.com/pyreon/pyreon/issues/206))

  Two dev warnings that were dead code before 0.12.11 (due to the `typeof process` dev gate bug) fired incorrectly on valid Pyreon patterns:

  - **"Component returned invalid value"** — didn't account for arrays (valid `VNodeChild[]` from Fragment) or NativeItems (from `_tpl()`). Fixed.
  - **"Reactive accessor returned function"** — fired on ALL function returns from reactive accessors, but `() => VNodeChild` IS a valid return (conditional rendering pattern). Removed — function returns are handled correctly by `mountChild`.

  ### SSR layer ordering ([#206](https://github.com/pyreon/pyreon/issues/206))

  SSR output now includes `@layer elements, rocketstyle;` declaration when layered rules are present, ensuring correct cascade in server-rendered HTML.

- Updated dependencies []:
  - @pyreon/reactivity@0.12.12

## 0.12.11

### Patch Changes

- ## Bug Fixes

  ### Dev-mode warnings now fire in real browser dev builds ([#200](https://github.com/pyreon/pyreon/issues/200), [#202](https://github.com/pyreon/pyreon/issues/202))

  12 files across `@pyreon/core`, `@pyreon/runtime-dom`, and `@pyreon/router` used `typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'` as a dev-mode gate. This pattern is **dead code in real Vite browser bundles** because Vite does not polyfill `process`. Every wrapped `console.warn` — including Portal target validation, void element children checks, component output validation, Transition child warnings, and more — silently never fired for real users in dev mode.

  **Fixed**: all 12 files now use `import.meta.env.DEV` (the Vite/Rolldown standard), which is literal-replaced at build time. Prod bundles tree-shake the warning code to zero bytes. Dev bundles preserve it.

  **Enforced**: new `pyreon/no-process-dev-gate` lint rule (error severity, auto-fixable) prevents future regressions. Server-only packages (`@pyreon/zero`, `@pyreon/server`, `@pyreon/runtime-server`) are exempt because they always run in Node where `process` is defined.

  ### Compiler no longer crashes on circular prop-derived const chains ([#204](https://github.com/pyreon/pyreon/issues/204))

  ```tsx
  function Comp(props) {
    const a = b + props.x; // reads props.x AND references b
    const b = a + 1; // references a → circular
    return <div>{a}</div>; // ← previously: Maximum call stack size exceeded
  }
  ```

  `resolveExprTransitive` used a single `excludeVar` parameter that couldn't detect multi-step cycles (a → b → a). Replaced with a `visited: Set<string>` that tracks the full resolution chain. Cyclic identifiers are left as-is (use their captured const value). The compiler now emits a `circular-prop-derived` warning with the cycle chain and a fix suggestion.

  ### Flow `LayoutOptions` algorithm applicability documented + dev warning ([#198](https://github.com/pyreon/pyreon/issues/198), [#199](https://github.com/pyreon/pyreon/issues/199), [#200](https://github.com/pyreon/pyreon/issues/200))

  `direction`, `layerSpacing`, and `edgeRouting` are silently ignored by ELK's `force`/`stress`/`radial`/`box`/`rectpacking` algorithms. `flow.layout()` now emits a `console.warn` in dev mode when these options are set on an algorithm that ignores them. Applicability table verified empirically by running each algorithm with different values.

  ### Document-primitives: `DocDocument` accepts reactive metadata + `extractDocNode` one-step API ([#197](https://github.com/pyreon/pyreon/issues/197))

  - `DocDocument` props `title`, `author`, `subject` now accept `string | (() => string)`. Accessor functions are resolved at extraction time — each export reads live values from the store.
  - `extractDocNode(templateFn)` — one-step convenience that replaces the two-step `createDocumentExport(fn).getDocNode()` pattern.
  - **Framework fix**: `extractDocumentTree` from `@pyreon/connector-document` now correctly reads `_documentProps` from real rocketstyle primitives (previously only worked with mock vnodes in tests — a silent metadata drop that had been present since the package was created).

  ## Infrastructure

  ### Worktree builds work out of the box ([#203](https://github.com/pyreon/pyreon/issues/203))

  `bun install` now runs a `postinstall` bootstrap script that builds all packages if any `lib/` directory is missing. This fixes `Failed to resolve entry for package "@pyreon/vite-plugin"` errors in fresh git worktrees and clones. Subsequent installs are instant (~22ms no-op check).

  ### New lint rule: `pyreon/no-process-dev-gate` ([#202](https://github.com/pyreon/pyreon/issues/202))

  Rule 58 in `@pyreon/lint`. Architecture category, error severity, auto-fixable. Flags `typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'` patterns in browser-running packages. Server-only packages and test files are exempt.

- Updated dependencies []:
  - @pyreon/reactivity@0.12.11

## 0.7.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.2

## 0.7.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.1

## 0.7.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.0

## 0.6.0

### Minor Changes

- feat(core): add `provide()` helper, widen `ComponentFn` return to `VNodeChild`, add `ExtractProps` and `HigherOrderComponent` utility types

  Migrate router, head, preact-compat to use `provide()` instead of manual `pushContext`/`popContext`

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.6.0

## 0.5.7

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.5.7

## 0.5.6

### Patch Changes

- feat(dx): comprehensive `__DEV__` warnings across core and runtime-dom

  feat(style): auto-append `px` to numeric style values (e.g. `{ height: 100 }` → `"100px"`), with shared `CSS_UNITLESS` set for hydration consistency

- Updated dependencies []:
  - @pyreon/reactivity@0.5.6

## 0.5.4

### Patch Changes

- fix: ref callback type accepts `Element | null` parameter

- Updated dependencies []:
  - @pyreon/reactivity@0.5.4

## 0.5.3

### Patch Changes

- fix: remove .d.ts post-build workaround — upstream tools-rolldown 1.15.3 fixes DTS code-split collision

- Updated dependencies []:
  - @pyreon/reactivity@0.5.3

## 0.5.2

### Patch Changes

- Add children prop to PyreonHTMLAttributes so standard JSX patterns like {condition && <div/>} type-check correctly.

- Updated dependencies []:
  - @pyreon/reactivity@0.5.2

## 0.5.1

### Patch Changes

- Unify project scanner into @pyreon/compiler, fix JSX type declarations for published packages, update dependencies, and resolve build compatibility with rolldown 1.15.0.

- Updated dependencies []:
  - @pyreon/reactivity@0.5.1

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
  - @pyreon/reactivity@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.4.0

## 0.3.1

### Patch Changes

- Router performance: flattened route matching with first-segment dispatch index (39% faster at 200 routes). Core type fixes: export `ReadonlySignal<T>` from reactivity, widen `h()` component overloads to support optional children and generic components, add minimal `process` type declaration so consumers don't need `@types/node`.

- Updated dependencies []:
  - @pyreon/reactivity@0.3.1

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

## 0.2.1

### Patch Changes

- Release 0.2.1

  - feat(vite-plugin): add `compat` option for zero-change framework migration
  - fix: resolve `workspace:^` dependencies correctly during publish
  - fix(vite-plugin): use `oxc` instead of deprecated `esbuild` option
  - fix(vite-plugin): bump vite peer dependency to `>=8.0.0`

- Updated dependencies []:
  - @pyreon/reactivity@0.2.1

## 0.2.0

### Minor Changes

- Release 0.2.0
  - fix(vite-plugin): use `oxc` instead of deprecated `esbuild` option for Vite 8
  - fix(vite-plugin): bump vite peer dependency to `>=8.0.0`

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.2.0

## 0.1.2

### Patch Changes

- Improve compat package types (eliminate unnecessary casts), add lint/typecheck CI for all workspaces, split example apps into individual component files.

- Updated dependencies []:
  - @pyreon/reactivity@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.1.1
