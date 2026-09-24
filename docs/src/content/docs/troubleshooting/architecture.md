---
title: "Architecture Mistakes"
description: "Common architecture mistakes in Pyreon and how to fix them."
---

# Architecture Mistakes

> **Generated** from `.agents/rules/anti-patterns.md` (the same source as MCP `get_anti_patterns`). Each entry is a real mistake + its fix; where a detector code is listed, the linter / `pyreon doctor` / MCP `validate` catches it automatically.

### Styling an Element's layout with theme flex overrides instead of Element props

Theme `display:'flex'`/`flexDirection`/`alignItems` on a rocketstyle(Element) component fights the flex CSS Element's wrapper already emits and cannot reach the button/fieldset/legend inner fix layer, so UIs stack into columns. An attrs `css` string is worse: a per-instance `css` prop replaces it wholesale. The contract (also in `.agents/rules/code-style.md` and the elements manifest):
  - Simple elements (no slots) read `contentDirection` (`'inline'`/`'rows'`) and `contentAlignX`/`contentAlignY`. The bare `direction`/`alignX`/`alignY` trio is the slot axis of compound elements.
  - Alignment is axis-fixed: X is always horizontal, Y always vertical, `block` = stretch.
  - `gap` is a prop, wired on the simple path and the inner fix layer.
  - Use `block: true` for full-width elements and app roots; Element defaults to shrink-wrapping `inline-flex`.
  - Theme layout is correct only for `flexWrap` (no prop), CSS grid components, and `display:'block'` for text ellipsis.

  Locked by `elements/src/__tests__/element-gap.test.tsx`.

---

### A coordinate transform centralized in only one direction

`@pyreon/charts` `rtl` mirrors chart→pixels and pointer→chart, but DOM overlays also need chart→screen. Without a named function for it, overlays wrote chart-space x straight into `style.left` (the tooltip appeared mirrored), and the SVG export (captured before the mirror) disagreed with the PNG export. Make every direction of a coordinate transform a named function in one module, and grep `style.left`/`style.transform` for outbound sites. A box mirrors by its far edge (`width - x - boxWidth`), so the point and rect forms differ (`screenX`/`screenRectX`, exported from `@pyreon/charts/plot`). happy-dom has no layout, so assert placement in real Chromium. Reference: `packages/fundamentals/charts/src/engine/rtl.ts`; tests `engine/prerelease-fixes.test.tsx` + `engine/rtl.browser.test.tsx`.

---

### Breaking a package cycle with a registration seam

Ui-core owns the `PyreonTheme` type and a slot (`theme-engine.ts`: `setThemeEngine`/`getThemeEngine`); `@pyreon/unistyle` registers its engine at module load. Same shape as `setStyleExtraction`/`setSnapshotCapture`/`_setDefaultChromeLayout`. Rules for any such seam:
  - Put the type and slot in the package that must not depend upward; register from the package that already depends downward.
  - Read the seam lazily at use sites, never at setup. The root `<PyreonUI>` sets up before children that import unistyle have loaded. A vitest `setupFiles: import '@pyreon/unistyle'` hides ordering bugs; only a real boot catches them.
  - Declare the registering entry in `sideEffects` (`["./src/index.ts","./lib/index.js"]`), or tree-shaking drops the registration.
  - The reader degrades instead of throwing when nothing registered: `getThemeEngine()` returns `FALLBACK_ENGINE` (identity enrich, no CSS vars/CPSE) and dev-warns once. A rocketstyle-only app never loads unistyle. Tests asserting real unistyle theming must `import '@pyreon/unistyle'` explicitly.

  Reference: `packages/ui-system/ui-core/src/theme-engine.ts`, `ui-core/src/tests/theme-engine.test.ts`.

---

### Handling browser Back/Forward with a bare state sync instead of the navigation pipeline

A popstate/hashchange handler that only sets `currentPath` skips loaders (loader data for the left route is pruned, so `useLoaderData()` returns `undefined`), guards, blockers, middleware, `afterEach` (route announcements), scroll and `meta.title`. `@pyreon/router` runs browser traversals through `navigate()` with replace-commit semantics:
  - A traversal cancelled by a guard or blocker restores URL and position via `history.go(-delta)` using the per-entry `history.state.__pyreonIdx` stamp (`replaceState` for unstamped entries). A superseded traversal restores nothing.
  - Only the owning router (`_navOwner`, the newest live instance) writes the URL back.
  - Browser traversals run the ScrollManager only when `scrollBehavior` is configured; otherwise native scroll restoration applies.
  - A browser-initiated commit never writes the URL; the browser owns it.
  - The echo guard compares against `_pendingBrowserTarget ?? currentPath.peek()`, not the last committed path, so a second Back arriving mid-flight is not dropped as an echo.
  - `push()`/`replace()` resolve with `NavigationResult` (`'committed' | 'cancelled' | 'superseded'`).

  Any handler mirroring external state (history, storage events, reconnects) into app state must run the app's full transition pipeline. Tests: `packages/core/router/src/tests/popstate-pipeline.test.ts` (incl. "rapid double-Back").

---

### A wrapper that spreads consumer props, then sets its own handler

`h('a', { ...rest, onClick: handleClick })` silently overwrites the consumer's `onClick`. Fixing one prop (`class`) and leaving the others is not a fix; the class is every prop the wrapper also sets. Destructure the consumer's handler and compose, user first; the internal handler bails on `e.defaultPrevented`, so a consumer `preventDefault()` suppresses navigation. A test that mocks the wrapper encodes what the author believes it does and can hide this. Reference: `packages/core/router/src/components.tsx` (`composedClick`/`composedMouseEnter`/`composedFocus`) + `tests/link-dx.test.ts`.

---

### A gate that exists but is never invoked

A `test:e2e:*` script and config protect nothing until the CI matrix runs them (`scripts/e2e-affected.ts`); unrun specs rot. Check the registry, not `package.json`. Write specs against structure (read the first sidebar group's label) rather than copy. Scope a browser suite's triggers to the code that builds the site, not every markdown page.

---

### Using `innerRef` where `ref` belongs

`@pyreon/elements` Element treats `innerRef` as first-class (`own.ref ?? own.innerRef`), because a plain `ref` could land on a wrapper layer. `@pyreon/styler`'s `styled()` renders one DOM node, forwards `ref` to it, and aliases `innerRef` → `ref` (`styler/src/styled.tsx`). Prefer `ref` on `styled()` components. A null scroll-container ref makes a `@pyreon/virtual` list render zero rows while `totalSize()` still looks right; `e2e/app-showcase-virtual.spec.ts` asserts rows actually mount.

---

### Delegated handlers inside `<Portal>` content never firing

Common bubbling events use one listener per mount container (`setupDelegation`), with per-element `__ev_<event>` expandos, and portal content lives outside that container. The runtime's Portal mount branch now calls `setupDelegation(target)` (`packages/core/runtime-dom/src/mount.ts`). Delegating an ancestor of the app root is safe: the per-dispatch `DELEGATED_ELEMENTS` set prevents double-firing. Mount-only tests cannot see this class; click in a real browser. Tests: `runtime-dom/src/tests/portal-delegation.browser.test.tsx`, `toast/src/tests/toaster.browser.test.tsx`.

---

### Positioning an overlay only from window resize/scroll listeners

Then nothing positions it when it opens, and portaled content renders wherever body flow drops it. `useOverlay` repositions on open (`repositionOnOpen`: subscribes to `active` + `isContentLoaded` inside `setupListeners()`, measures one rAF later with a re-check) and exposes `setContentPosition` for content that resizes while open. The hook auto-attaches its listeners in `onMount` (idempotent: a second `setupListeners()` returns the cached cleanup) and dev-warns if `showContent()` runs with listeners never attached. Assert coordinates in real Chromium through a real `<Portal>`; inline content lands near the trigger by flow and false-passes. Reference: `packages/ui-system/elements/src/Overlay/useOverlay.tsx`; test `Overlay-position-on-open.browser.test.tsx`.

---

### A mount accessor reading display-only signals as values

`{() => active() ? <Portal>{render(children, { alignY: alignY() })}</Portal> : null}` subscribes to `alignY`, so a viewport-edge flip remounts the whole content (double `onMount`, lost input state). A mount/conditional accessor reads only the signals that decide structure; pass display values as `_rp()`-branded accessors so they update in place. Related: listeners attached once at setup miss content that mounts lazily; rebind them when `isContentLoaded` flips. Reference: `packages/ui-system/elements/src/Overlay/{component.tsx,useOverlay.tsx}`; tests `Overlay-content-reactive-align`, `Overlay-hover-content` (browser).

---

### Passing `layout` to `createApp` / `startClient` with fs-router

Fs-router already emits `_layout.tsx` as a parent route, so an explicit `layout` mounts it twice (and SSR/CSR disagree). `createApp` ignores a `layout` that is also a top-level route component and dev-warns (`hasLayoutInRoutes` in `packages/zero/zero/src/app.ts`). Do not pass `layout` with fs-router.

---

### Skipping `makeReactiveProps` outside the CSR mount path

The compiler emits `<Comp prop={sig()}>` as `h(Comp, { prop: _rp(() => sig()) })`; without `makeReactiveProps` a component reads the raw `_rp` function (e.g. `href="() => props.path"`). SSR (`mergeChildrenIntoProps`) and `hydrate.ts` call it before `runWithHooks`, like `mount.ts`. When a component merges a user `class` with its own, combine them with `cx([userClass, internalClass])` in one accessor rather than overriding.

---

### Reading sibling computeds that share an upstream in one accessor

When upstream notifies, the accessor can run before B recomputes and see `(A_new, B_old)`. Collapse A and B into one computed returning the pair, with `equals` comparing both fields. Reference: `RouterView`'s `depthEntry: { rec, comp, errored }` in `packages/core/router/src/components.tsx`.

---

### Effects that read context across re-runs capture and restore the owner

Client context is owner-based. `provide()` writes onto the component's `EffectScope` (`scope._contexts`), `useContext()` walks `scope._parent`, and context dies with the scope; there is no client context stack. `_bind` / `renderEffect` / `effect` capture the active owner at setup via the `setSnapshotCapture` hook (`getContextOwner` / `runWithContextOwner`, registered by `@pyreon/core`) and restore it on every re-run after the first. Deferred boundaries (`<Show>`/`<For>`) capture and restore the owner the same way. SSR keeps a request-scoped stack (`pushContext`/`popContext`); the `*-compat` layers keep their own. Reference: `packages/core/core/src/context.ts`, `packages/core/reactivity/src/effect.ts`, `packages/core/reactivity/src/scope.ts`.

---

### Circular prop-derived const chains

`const a = b + props.x; const b = a + 1` makes the compiler emit a `circular-prop-derived` warning and leave the cyclic identifier as a static reference, so that part is not reactive. Make every const read `props.*` or a non-cyclic predecessor.

---

### Prop-derived `const` holding a stateful call re-invoked at each use site

Reactive-props inlining substitutes a prop-derived `const`'s initializer at every JSX use site. For `const m = createModel(props.catalog)`, `<A model={m}/><B model={m}/>` would create two disconnected instances: writes land in one, reads subscribe to the other, with no error. The compiler does not inline an initializer that is itself a stateful call: `useX`/`createX` names (identifier or member callee, via `isFactoryConventionName`) plus `STATEFUL_CALLS` (`signal`, `computed`, `effect`, `batch`, `defineStore`, …) in `packages/core/compiler/src/jsx.ts`.
  - Unrecognised callees (`cx(props.a)`, `formatDate(props.d)`) are still inlined, which keeps them reactive.
  - The guard checks only a top-level call. A call nested in another expression (`props.instance ?? useContext(FlowContext)`) is still inlined. If a handler at component-body scope reads such a binding, it re-runs `useContext` outside setup and gets `null`. Declare it `let` (the inliner skips `let`/`var`), as `packages/fundamentals/flow/src/components/minimap.tsx` does. Handlers created inside a render thunk are safe because render effects restore the context owner.
  - Detection: transform the file and compare per-callee call counts between source and emit; a count that grew is an inlined initializer.

  Tests: `compiler/src/tests/prop-derived-factory-call.test.ts`, `runtime-dom/src/tests/prop-derived-factory-instance.test.tsx` (compiled through the real transform), `flow/src/tests/pointer-paint.browser.test.tsx`.

---

### Iterating or cloning `props.children` without unwrapping a compiler accessor

Prop inlining can rewrite `<Comp>{children}</Comp>` (a `const` derived from a getter, e.g. after `splitProps`) as `children: () => x.children`. `mountChild` handles a function child, but a library that iterates children (`(Array.isArray(c) ? c : [c]).filter(…)` → `[]`) or calls `cloneVNode(props.children, …)` (→ `<undefined>` tags) breaks. Resolve at body entry with `resolveChildren` (`packages/ui-system/kinetic/src/utils.ts`) or `typeof c === 'function' ? c() : c`; this is safe when children are snapshotted at render. Enforced by `pyreon/no-iterate-children-without-resolve` (error; in `recommended`/`strict`/`app`/`lib`):
  - Detects `cloneVNode(EXPR, …)`, `(Array.isArray(EXPR) ? EXPR : [EXPR]).METHOD(…)` (inline or variable-bound) and `EXPR.props` where `EXPR` ends in `.children`.
  - Mitigations count per source path in the same or an ancestor function scope: a `resolveChildren(…)` call, a `typeof X === 'function' ? X() : X` ternary, or a `typeof X === 'function'` guard. An outer `resolveChildren(props.children)` does not cover an inner component's `innerProps.children`.
  - Out of scope: spreading into `h()` rest args, and `if (Array.isArray(x))`-guarded iteration. The react-compat `Children.*` and preact-compat `toChildArray` helpers unwrap function children themselves.

  Reference: `packages/tools/lint/src/rules/reactivity/no-iterate-children-without-resolve.ts`.

---

### Circular imports

Keep dependency order (reactivity → core → runtime-dom → router → server).

---

### Build before dev

Unnecessary; workspace resolution via the `"bun"` condition reads `src/`.

---

### `[key: string]: unknown` catch-all

Use `data-*`/`aria-*` template-literal index signatures.

---

### Detaching methods

`_bindText(obj.method, node)` loses `this`; the compiler only emits it for simple identifiers.

---

### Duplicate module augmentation

When a library (e.g. `@pyreon/ui-theme`) already augments an interface (`StylesDefault extends ITheme`), do not re-augment it in the app with a different type (TS2320). Remove the app-level `pyreon.d.ts` augmentation.

---

### Using non-existent dimension props in demos

Check the component definition before passing `state`, `size` or `variant`; a dimension the component does not define (e.g. Loader has no `.variants()`) is a type error (`never[]`).

---

### Assuming `<Portal>` renders directly into `document.body`

`@pyreon/elements` Portal creates a per-instance wrapper (default `<div>`, `tag` prop) inside `DOMLocation` (default `document.body`) and renders children inside it, so sibling portals stay isolated. DOM assertions must go one level deeper. Reference: `packages/ui-system/elements/src/Portal/component.tsx`.

---

### Measuring `<Element equalBeforeAfter>` slots only once

Element equalizes before/after slot widths on mount and keeps them equal via `ResizeObserver` (late fonts, lazy text, resize), falling back to a one-shot measure when `ResizeObserver` is absent. Reference: `packages/ui-system/elements/src/Element/component.tsx`.

---

### Re-emitting unchanged declarations in `@media` breakpoints

Mobile-first `min-width` queries inherit smaller breakpoints, so `makeItResponsive` runs `optimizeBreakpointDeltas()` and emits only deltas. Output that fails to stringify (foreign engine result) falls back to the unoptimized path. Reference: `packages/ui-system/unistyle/src/responsive/optimizeBreakpointDeltas.ts`.

---

### No render-output cache for stable theme objects in `makeItResponsive`

With the same internal and outer theme, return the previous render. The `themeCache` entry holds `rendered: WeakMap<theme, unknown[]>` keyed by the outer theme; CSS results are immutable. Reference: `makeItResponsive.ts:ThemeCacheEntry`.

---

### Conditionally emitting CSS in responsive style callbacks

`${t.block && 'align-self: stretch;'}` emits nothing for `block: false` at a larger breakpoint, and the delta optimizer cannot synthesize a reset, so the xs value cascades. Always emit both branches: `align-self: ${t.block ? 'stretch' : 'auto'};`. The optimizer drops unchanged values, so this is free. Applies to any responsive boolean/enum (`block`, `equalCols`, `alignY === 'block'`). Reference: `packages/ui-system/elements/src/helpers/Wrapper/styled.ts:styles`; test `elements/src/__tests__/wrapper-block-cascade.test.ts`.

---

### Reusing a rocketstyle chain after `.config({ component: NewBase })`

`cloneAndEnhance` resets the `attrs`/`priorityAttrs`/`filterAttrs`/`compose` chains when the component changes, since they target the old component's props; `theme`/`styles`/dimension chains are kept. Re-chain attrs explicitly: `Button.config({ component: 'a' }).attrs(sharedAttrs)`. Reference: `packages/ui-system/rocketstyle/src/rocketstyle.ts:cloneAndEnhance`.

---

### A fast-path index that misses keys its handler reads

Unistyle's `keyToIndices` resolves property descriptors by key. `kind: 'special'` descriptors carry only `d.id`, and some read extra theme keys (`animation` reads `t.keyframe` and `t.animation`). An unindexed key works alone (the fallback full scan runs) but is silently dropped when paired with any indexed key, because the fallback is skipped. The builder indexes `d.id` plus the optional `keys?: readonly (keyof InnerTheme)[]` on special descriptors (animation declares `keys: ['keyframe']`; `_seen` dedups). Index every key a handler consults, and test each trigger key paired with a sibling. Reference: `packages/ui-system/unistyle/src/styles/styles/{index.ts,propertyMap.ts}`; test `unistyle/src/__tests__/special-keys.test.ts`.

---

### Naive CSS rule splitting and `@layer` flattening

A hand-rolled splitter must model strings, comments and `url(…)` before counting braces. `@pyreon/styler`'s `sheet.ts` (`splitTopLevelRules`/`unwrapLayers`/`splitAtRules`) handles:
  - `@layer` nested in `@media`/`@supports`/`@container` (flattened inside the wrapper);
  - `@layer a, b;`, `@import …;` and `@namespace …;` statements (their own slices; an ordering statement is dropped with a dev warning when flattening);
  - `}` inside strings, comments and unquoted `url(…)` (a state machine via `skipQuoted`/`isUrlOpen`);
  - anonymous `@layer { … }` blocks, and unbalanced input (dev warning naming the dropped tail).

  Flattening changes cascade semantics in engines without `@layer`; it is a fallback, not an emulation. Test a stress matrix across the container grammar, not only reported shapes: `__tests__/global-layer-happydom.test.ts`, `sheet-split-atrules.test.ts`, `styler.browser.test.tsx`.

---

### Assigning the CSS `transition` shorthand clobbers `transition-delay`

`el.style.transition = '…'` resets every omitted longhand, including the stagger delay, in real browsers. happy-dom does not model this, so test in real Chromium. `@pyreon/kinetic` assigns through `setTransition`, which re-applies the delay from a stable `--kinetic-delay` custom property (a plain inline delay is also wiped by kinetic's `transition = ''` reset). Never assign a shorthand (`transition`, `animation`, `background`, `font`, `border`) when a longhand must survive. Kinetic's `nextFrame` batches same-burst callbacks into one double-rAF, keyed to the scheduling `requestAnimationFrame`; a callback registered after the batch's outer frame fired opens a new batch, so its "from" state still paints; cancel removes the callback from its batch, which works in every phase and needs no browser API. Reference: `packages/ui-system/kinetic/src/utils.ts`; test `__tests__/stagger-delay-preserved.browser.test.tsx`.

---

### Building cache keys from raw props before normalization

Rocketstyle keyed its memo on `propsRec[dimName]` before boolean shorthand was resolved, so under `useBooleans: true` `<Btn primary/>` and `<Btn secondary/>` both keyed `undefined` and shared styles. Key on the normalized output (`_resolveRsEntry`, including an `Array.isArray` branch for multi-value dimensions). Tests: `rocketstyle/src/__tests__/cache-key-boolean-collision.test.ts` + `rocketstyle.browser.test.tsx`.

---

### Treating a compiler-emitted accessor prop as a raw value

An inline reactive dimension prop (`state={sig() ? 'a' : 'b'}`) arrives as a bare accessor, not `_rp`-branded. `calculateStylingAttrs` resolves `typeof x === 'function' ? x() : x` inside its reactive computed, so the dimension tracks the signal. Any helper that reads a specific prop must accept the accessor form. Related: `.states()`/`.variants()`/`.sizes()` take the callback form `.states((t) => ({ active: { … } }))` (an object of functions yields empty themes), and dimension values should use structured unistyle keys (`backgroundColor`), not an `extendCss` blob, which replaces the base's on merge. Reference: `packages/ui-system/rocketstyle/src/utils/attrs.ts`; tests `__tests__/attrs.test.ts`, `e2e/atlas-workshop.spec.ts`.

---

### Mixed data shapes on `Iterator` / `List`

`@pyreon/elements` ships four overloads: `SimpleProps<T>` (primitive arrays, `valueName` allowed), `ObjectProps<T>` (object arrays, no `valueName`/`children`), `ChildrenProps`, and a `LooseProps` fallback for forwarding patterns (`<Iterator {...wrapperProps} />`), which rocketstyle's wide `ExtractProps` union otherwise breaks (TS2769). List reuses them and blocks Element's `label`/`content`. Reference: `packages/ui-system/elements/src/helpers/Iterator/types.ts`; test `__tests__/Iterator.types.test.ts`.

---

### `ExtractProps<T>` keeping only the last overload

`T extends ComponentFn<infer P> ? P : T` matches only the last call signature. Match up to four signatures and union them (a single-overload function dedupes to one shape). Keep the four copies in sync: `@pyreon/core/src/types.ts`, `@pyreon/elements/src/types.ts`, `@pyreon/attrs/src/types/utils.ts`, `@pyreon/rocketstyle/src/types/utils.ts`. Test: `packages/core/core/src/tests/extract-props-overloads.types.test.ts`.

---

### `as unknown as VNodeChild` on JSX returns

Unnecessary, since `JSX.Element` is assignable to `VNodeChild`; remove it. The exception is a nullable union in `h()` rest position (`child: VNodeChild | null`, TS2769 without the cast; `RouterView` is the instance). The detector has no type checker, so that site carries a reasoning comment plus `// pyreon-lint-ignore pyreon-patterns/as-unknown-as-vnodechild`, which `detectPyreonPatterns`/`detectReactPatterns` honour. Suppress by code, never bare.

**Detected by:** `as-unknown-as-vnodechild` — surfaced by `@pyreon/lint` / `pyreon doctor` / MCP `validate`.

---

### Duplicating controlled/uncontrolled state

Use `useControllableState` from `@pyreon/hooks` instead of hand-written `isControlled + signal + getter`.

---

### Static return null for conditional rendering

`if (!isActive()) return null` runs once, because components run once. Return a reactive accessor: `return (() => { if (!isActive()) return null; return <div>...</div> })`.

**Detected by:** `static-return-null-conditional` — surfaced by `@pyreon/lint` / `pyreon doctor` / MCP `validate`.

---

### Static early-return with a signal condition

`if (loading()) return <Skeleton/>` in a component body pins the component to that branch forever; neither the compiler nor TS2774 flags it. Use `<Show when={() => loading()} fallback={<Skeleton/>}>` or `return (() => loading() ? <Skeleton/> : <Content/>)`. The detector fires only when the condition calls a tracked `signal`/`computed` binding or a `useX` hook-result const; helper, prop and env conditions are legitimate setup guards. The `return null` shape belongs to `static-return-null-conditional`, so the two never double-fire.

**Detected by:** `static-early-return-conditional` — surfaced by `@pyreon/lint` / `pyreon doctor` / MCP `validate`.

---

### Empty `.theme({})`

Never chain `.theme({})` as a no-op; omit `.theme()` when there is no base theme.

**Detected by:** `empty-theme` — surfaced by `@pyreon/lint` / `pyreon doctor` / MCP `validate`.

---

### Escaping for the wrong context

`<style>` and `<script>` are raw-text elements, so character references (`&quot;`) are never decoded inside them. `</` → `<\/` alone does not stop the tokenizer entering script-data-double-escaped state on `<!--` + `<script`, after which the page's own `</script>` no longer closes the element. The WebView host builders in `packages/fundamentals/{code,rich-text,flow,charts}/src/webview.ts` use:
  - `cssValueSafe`: drop `<>"'` (no valid colour or gradient contains them);
  - `scriptSafe`: break `<!--` and `</` with identity escapes (`\/`, `\-`), leaving the JS unchanged;
  - `attrSafe`: escape `&` first, then `"` and `<`.

  An inline script is defence-in-depth for a developer-supplied bundle, never a sanitizer. Tests: each package's `tests/webview-escape.test.ts`.

---

### Unguarded `decodeURIComponent` on request text

It throws `URIError` on `%`, `%zz` or a truncated escape. `@pyreon/router`'s matcher runs on path segments and query keys/values before auth (via `router.preload` in the SSR handler), so `GET /?q=%` returned 500 even for static routes. The matcher cannot answer 400, so `safeDecodeURIComponent` keeps an undecodable segment literal; `@pyreon/zero`'s island-fragment middleware answers 400. Params may contain a literal `%`, so decode once at the edge. Every decode reachable from request text needs an explicit raw-or-400 decision; grep for sibling decodes. Reference: `packages/core/router/src/match.ts`; test `tests/malformed-url-decode.test.ts`.

---

### A computed field nobody reads (fail-open in authorization)

`permissionsProviderSeed` returned `deniedUnderWildcard`, but no caller read it. The native permissions container is grant-only, so `{ 'billing.**': true, 'billing.refunds.**': false }` granted `billing.refunds.export` on device and denied it on web. Grep every returned field for a reader. When a capability cannot cross platforms, warn and state the direction of the divergence, and only where it changes the answer (a wildcard is present). Reference: `packages/native/compiler/src/{permissions-provider.ts,emit-swift.ts,emit-kotlin.ts}`; test `tests/native-permissions-wildcard-deny.test.ts`.

---

### User-controlled data in HTML comment content

Comments end on `-->`, `--!>`, or in some parsers any `--`. URL-encode interpolated values and replace `-` with `%2D` so no terminator can form. Reference: `packages/core/runtime-server/src/index.ts:safeKeyForMarker`. Applies to every SSR marker carried to hydration.

---

### An allowlist sanitizer that enumerates only HTML tags

Non-allowlisted elements become text nodes, so `<svg>` content vanished silently. `@pyreon/runtime-dom`'s fallback sanitizer adds a curated `SAFE_SVG_TAGS` profile (shapes, gradients, clip, mask, text, filter primitives; lowercase, compared via `tagName.toLowerCase()`) and excludes `<script>`, `<foreignObject>`, `<style>`, and SMIL `<animate>`/`<set>`/`animate*`. The URL guard also checks `attr.localName === 'href'` so `xlink:href="javascript:…"` is caught. Any allowlist over multiple namespaces must enumerate each one it permits. Assert real `SVGElement` nodes in Chromium (`instanceof SVGPathElement`, `namespaceURI`), not string contents. Reference: `packages/core/runtime-dom/src/sanitizer.ts`; tests `tests/props.test.ts`, `tests/innerhtml-svg.browser.test.tsx`.

---

### Augmenting a module-scope interface through the JSX namespace

`SvgAttributes` is a module-scope export in `@pyreon/core`. Augment it with `declare module '@pyreon/core' { interface SvgAttributes { … } }`. The form `declare global { namespace JSX { interface SvgAttributes { … } } }` declares a separate interface that does not merge and produces thousands of errors. Verify the augmentation form before accepting a report that something "cannot be augmented". Reference: `packages/core/core/src/jsx-runtime.ts:SvgAttributes` JSDoc; test `tests/svg-attributes.types.test.ts`.

---

### `Object.defineProperty` without `configurable: true` on props

A later `mergeProps`/`splitProps` override throws `Cannot redefine property`. `mergeProps` forces `configurable: true` on copied descriptors, but set it when authoring getters (`_rp` wrappers, rocketstyle attrs, getter bridges).

---

### Bundler-coupled dev gates

Libraries are compiled by any bundler (Vite, Webpack, Rolldown, esbuild, Rollup, Parcel, Bun). Two broken gates:
  1. `typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'` is dead in Vite browser bundles, which do not polyfill `process`.
  2. `import.meta.env.DEV` is Vite/Rolldown-only and undefined elsewhere.

  Use bare `process.env.NODE_ENV !== 'production'`; every bundler replaces it. Reference: `packages/fundamentals/flow/src/layout.ts:warnIgnoredOptions`. Enforced by `pyreon/no-process-dev-gate` (auto-fix); `pyreon/dev-guard-warnings` accepts `if (process.env.NODE_ENV === 'production') return` as an early-return guard. Server-only packages (`zero`, `runtime-server`, `server`, `vite-plugin`) are exempt.

**Detected by:** `process-dev-gate` — surfaced by `@pyreon/lint` / `pyreon doctor` / MCP `validate`.

---

### Bare top-level component-brand assignments

[guard: `no-bare-component-brand.test.ts`]: `Component.displayName = name` (or `.pkgName`, `.PYREON__COMPONENT`, `.isText`) at module top level must run whenever any binding of the module is used, so components in the package pin each other into every bundle. Brand on the export: `export default /* @__PURE__ */ Object.assign(Component, { displayName: name, … })` (nest `nativeCompat(...)` if needed). The aggregate is locked in `scripts/import-budgets.json` (`@pyreon/elements::portal`, `::element`).

---

### Local `__DEV__` const alias prevents tree-shaking

`const __DEV__ = process.env.NODE_ENV !== 'production'` then `if (__DEV__)` keeps dev strings in production under Bun.build and several esbuild configs, which do not fold through the alias. Write the bare check inline at every site in a published library. `pyreon/dev-guard-warnings` accepts `__DEV__`/`isDev`/`IS_DEV` only for cross-module imports.

---

### Early prod-return in a public dev-only reader keeps its machinery

Tree-shaking runs before the minifier removes unreachable code, so module-level machinery referenced in the dead tail survives. Wrap the body instead: `if (process.env.NODE_ENV !== 'production') { … } return empty` folds to `if (false)` and is dropped at parse time with its references. The early return is fine when the tail references only locals or already-retained exports. Module-level `new FinalizationRegistry(cb)`-style consts also need `/* @__PURE__ */`. Reference: `packages/core/reactivity/src/reactive-devtools.ts:getReactiveGraph`; test `reactive-devtools-treeshake.test.ts`.

---

### A call in a class field initializer defeats `/* @__PURE__ */` on a module-level singleton

`export const sheet = /* @__PURE__ */ new StyleSheet(...)` shakes away only while the class's field initializers are provably pure. Object literals and `new Map()`/`new Set()` qualify; an arbitrary call (`= freshSSRState()`) does not, and every minimal import retains the whole class. `@pyreon/styler` inlines the object in the field and calls `freshSSRState()` only from methods (`packages/ui-system/styler/src/sheet.ts`). Measure bundle size with the bun version pinned in `.bun-version`; a newer global bun may shake better and hide the regression. A large local-vs-CI gap is a tool difference, not gzip variance. Install the pinned bun side by side (`BUN_INSTALL=<scratch> curl -fsSL https://bun.sh/install | bash -s bun-v<pinned>`). Find out why a minimal import grew before relocking a budget.

---

### Measuring bundle size without the production define

A size script must match what consumers ship. `scripts/check-bundle-budgets.ts` passes `define: { 'process.env.NODE_ENV': '"production"' }` to `Bun.build`; without it, dev-warning strings inflate every measurement.

---

### Relying on `parent` in oxc visitor callbacks

`VisitorCallback = (node: any) => void`; oxc does not pass `parent`, so `parent?.type === '…'` is always `undefined` and the check is silently inert. Track parent context with enter/exit depth counters, or pre-mark children in a `WeakSet` when visiting the parent.

---

### Hooks defining event-listener callbacks outside `onMount`

A handler declared at hook body scope that touches `document`/`window` cannot be proven browser-only by the SSR lint rule. Define it inside `onMount` and return the cleanup from `onMount` instead of registering a separate `onUnmount`.

---

### Browser-only helpers called from event handlers without an SSR guard

`no-window-in-ssr` cannot trace indirect calls, so it flags each `window`/`document` access in a module-level helper. Inline the helper into `onMount`, or start it with `if (typeof window === 'undefined') return <fallback>`, which the rule treats as guarding the whole body. Reference: `packages/ui-system/elements/src/Overlay/useOverlay.tsx`.

---

### Tree-shake regression tests for dev gates

When migrating a dev gate, bundle with esbuild (`define: { 'process.env.NODE_ENV': '"production"' }`, `minify`, `treeShaking`) and assert the dev strings are absent, then with `"development"` and assert they are present. Reference: `packages/fundamentals/flow/src/tests/integration.test.ts` ("warnIgnoredOptions — gate pattern regression").

---

### Framework APIs that accept only the accessor form of a prop

The compiler auto-calls bare signals (`when={sig}` → `when={sig()}`), so an API typed `() => X` receives a value. Accept `X | (() => X)` and normalize with `typeof === 'function'` (`packages/core/core/src/show.ts:callWhen`). Reactive cases still need the accessor form. Apply to every control-flow component and signal-shaped prop.

---

### Wrappers leaking `{undefined}` child slots into void elements

`{own.children}` with `undefined` still produces `children: [undefined]`, which trips runtime-dom's void-element warning. Branch on `getShouldBeEmpty(own.tag)` and render `<Styled />` with no slot. Reference: `packages/ui-system/elements/src/helpers/Wrapper/component.tsx`.

---

### Listing a prop in a wrapper's `OWN_KEYS` without forwarding it

Every prop `splitProps` moves into `own` must be consumed (structural: `tag`, layout) or re-attached (content/passthrough: `dangerouslySetInnerHTML`, `style`, `children`, `ref`). Wrapper dropped `dangerouslySetInnerHTML`, rendering an empty `<div>`; it now renders `<Styled … dangerouslySetInnerHTML={own.dangerouslySetInnerHTML} />` without children. Reference: `packages/ui-system/elements/src/helpers/Wrapper/component.tsx`.

---

### Mutable `let handler = null` assigned inside `if (_isBrowser)`

The lint rule cannot trace it, forcing `if (_isBrowser && handler)` everywhere. Write `const handler = _isBrowser && condition ? () => … : null`; `no-window-in-ssr` treats it as typeof-derived, so `if (handler)` suffices. Reference: `packages/core/router/src/router.ts` (`_popstateHandler`/`_hashchangeHandler`).

---

### `const handleClick = () => router.push(…); handleClick()` in render body

Calling a navigating function synchronously in the component body loops just like a direct `router.push()`; the lint rule catches both. Storing it for later (JSX handler, `setTimeout`, `onMount`) is fine.

---

### Using `document`/`window` globals inside a CodeMirror plugin

Use the host view's document and window: `view.dom.ownerDocument.createElement(...)`, `view.dom.ownerDocument.defaultView?.cancelAnimationFrame(...)`. It is SSR-safe and correct in iframes and shadow roots. Reference: `packages/fundamentals/code/src/editor.ts` (`CustomGutterMarker.toDOM`), `minimap.ts`.

---

### `node:*` imports reachable from a client-safe entry

(gate: `check-client-bundle-node-imports`): any `node:*` import in the graph of a client-safe main entry (e.g. `@pyreon/zero`) breaks the browser bundle and hydration. Type-only imports are safe; dead-code elimination does not help, because static imports are evaluated for side effects. Fixes:
  1. Split the Node code into a server-only module that registers through a setter on the client-safe module (`packages/zero/zero/src/i18n-routing-als.ts` + `_setLocaleStoreReader` in `i18n-routing.ts`).
  2. Export server helpers from a `/server` subpath.
  3. A lazy `await import('./node-module')` still emits a client chunk (a build warning plus a dead chunk) if the import site is reachable from the client entry. Move the import site itself into a server-only module (`i18n-routing-plugin.ts`, exported from `@pyreon/zero/server`).

  The gate follows only static imports, so the dynamic shape is locked by a scoped reachability test: `packages/zero/zero/src/tests/i18n-routing-client-safe.test.ts`. A `vite build` inside vitest does not reproduce the consumer build's chunking.

---

### Intentional `.peek()` inside `effect`/`computed`

`.peek()` is correct for loop prevention (`if (next === editor.value.peek()) return`), imperative refs, and one-off reads. `pyreon/no-peek-in-tracked` flags every site; annotate intentional ones with `// pyreon-lint-disable-next-line pyreon/no-peek-in-tracked` (or `// pyreon-lint-ignore …`). Reference: `packages/fundamentals/code/src/bind-signal.ts`.

---

### `isBrowser()` / `isClient()` / `isServer()` / `isSSR()` as cross-module SSR guards

`no-window-in-ssr` treats calls to these names as typeof guards because it cannot follow imports. Keep their bodies honest (a real environment check); other names (`isReady()`) are not recognised. Local typeof-bound consts and local functions returning a typeof check are recognised under any name.

---

### Duplicating root layouts under `prefix-except-default` i18n

`expandRoutesForLocales` must not duplicate the root `_layout.tsx` (`route.isLayout && route.dirPath === ''`), since hierarchical matching already wraps `/de/about` in it; a duplicate mounts the layout twice. Group layouts (`(app)/_layout.tsx`, also urlPath `/`) and non-root layouts (`/dashboard/_layout`) are duplicated, and under `prefix` every locale gets its own root layout. Only rendered-DOM checks catch the double mount. Reference: `packages/zero/zero/src/i18n-routing.ts`.

---

### Keying the route tree on the URL path instead of the directory path

`(group)` segments are URL-invisible but must stay in the tree key. `parseFilePath` keeps group segments in `dirPath` (only `urlPath` strips them); otherwise `(app)/_layout.tsx` and the root `_layout.tsx` share a node and one silently replaces the other (same for `_error`/`_loading`/`_404` and sibling groups). `placeRoute` warns `[Pyreon] fs-router: two <slot> files resolved to the same route-tree node`, since a filesystem cannot produce that legitimately. Reference: `packages/zero/zero/src/fs-router.ts`; test `tests/fs-router-group-layouts.test.ts` (asserts resolved `route.matched` chains).

---

### A VNode walker dispatching only on `typeof type`

A Fragment's `type` is a symbol, so a string/function-only dispatch drops the whole subtree silently; a component returning a bare array is dropped the same way. Treat `Symbol.for('Pyreon.Fragment')` as a transparent container (the global-registry symbol is safe across duplicate `@pyreon/core` instances) and flatten array returns. Test with real `h()` and real primitives, not hand-rolled fixtures. Reference: `packages/ui-system/connector-document/src/extractDocumentTree.ts` (`FRAGMENT_TYPE`); tests `src/__tests__/{extractDocumentTree,real-primitive-extraction}.test.ts`.

---

### An open-redirect guard that blocks only `//host`

The URL parser treats `\` as `/` in the authority position, so `\\evil.com`, `/\evil.com` and `\/evil.com` also resolve off-site. `classifyRedirectTarget` (whose verdict `@pyreon/server` emits as `Location:`) blocks any leading run of two characters from `[/\]` (anchored, fixed-length); a single leading `\` stays internal because it resolves same-origin. `sanitizePath` delegates to it. `classifyHref` returns `external` for the same shapes, because a ctrl-click or new-tab open bypasses the click handler. Use `new URL(accepted, base).origin` as the test oracle, not another regex. Test: `packages/core/router/src/tests/redirect-authority-delimiters.test.ts`.

---

### Writing URLs from `location.search` beside a hash-mode router

In `@pyreon/router`'s default `mode: 'hash'`, the route and its query live in the fragment and `location.pathname` already contains `base`. `useUrlState` asks the registered router for mode and base (`routeOwnsHash`/`splitHashRoute`/`stripRouterBase` in `packages/fundamentals/url-state/src/url.ts`), preserves the fragment, and owns `location.search` only when no router is registered. `Router` exposes `mode` publicly. A hand-written router shim only confirms your own model; wire the real router. Tests: `router-url-ownership.test.ts`, `real-router-hash-mode.test.ts`.

---

### An unsafe dev-only default documented only in a comment

`createSyncServer({ port })` without `authorize` accepts every connection. It warns once per instance, in production too, because this is a live misconfiguration an operator must see. When a strict test assertion (`expect(warnSpy).not.toHaveBeenCalled()`) breaks on an unrelated warning, give the test a production config rather than weakening the assertion. Reference: `packages/fundamentals/sync/src/server.ts`; test `server-open-relay-warning.test.ts`.

---
