---
name: pyreon-ui-system
description: Technical detail for the ui-system and ui layers — styler (CSS-in-JS, reactive theme, SSR fast path), unistyle (responsive breakpoints, CSS variables, property mappings), rocketstyle (multi-dimensional styling, per-definition caches), attrs, kinetic (transitions, stagger), elements (Element/Text/List/Overlay/Portal), coolgrid, plus the ui-components and ui-primitives libraries and their a11y contracts. Load before touching packages/ui-system/** or packages/ui/**.
---

# Pyreon UI System

> Extracted verbatim from CLAUDE.md. This is the authoritative copy — edit it here.

### UI System — Key Technical Details

- **@pyreon/styler**:
  - `styled('div')` → `ComponentFn`; `css` → lazy `CSSResult`; `keyframes` → animation name; `createGlobalStyle`/`createSheet()`.
  - `ThemeContext` is REACTIVE (`createReactiveContext<Theme>`) — `useTheme()` snapshots, `useThemeAccessor()` returns the `() => Theme` for tracking in effects. Whole-theme swaps re-resolve CSS + swap classnames without remounting.
  - Singleton `StyleSheet` (FNV-1a hashing, dedup, SSR).
  - **`innerRef` is a `ref` alias** on `styled()` (a styled component renders one DOM node so `ref` already targets it); without it `<Styled innerRef={fn}>` silently dropped the ref.
  - **SSR fast path** in `DynamicStyled` (`IS_SERVER` const): skips the per-component reactive `computed`+`ref`+`renderEffect` allocation server-side (~5× faster `renderToString`, byte-identical className → no hydration mismatch).
- **@pyreon/unistyle**:
  - single value, mobile-first array `[xs,sm,md,lg]`, or breakpoint object. 170+ CSS property mappings. A `null`/`undefined` slot in a mobile-first array is a SKIP → it inherits the PREVIOUS breakpoint (`['red', null, 'blue']` = xs red, sm red, md blue), matching a breakpoint object with a missing key AND styled-system/theme-ui — NOT filled from the last element (`normalizeTheme:handleArrayCb`; the prior `?? lastValue` turned the color blue one breakpoint too early + dropped interior gaps when the last element was null). Arrays and objects of the same shape now normalize identically; `0`/`false` are real values, not gaps.
  - Responsive `@media (min-width)` emits only deltas (mobile-first cascade — `optimizeBreakpointDeltas`; the diff runs against the RUNNING cascade so a value that reverts to an earlier one IS re-emitted — never a dropped reset).
  - **`themeToCssVars(theme, opts?)`** autogenerates `--px-*` custom properties from a plain theme JSON — returns `{ vars, css, registry }`; units baked at emission via `value()`+rootSize (`spacing.small: 8` → `--px-spacing-small: 0.5rem`); plain `var()`/`calc()` strings flow through the whole value pipeline untouched (the tested passthrough contract). Pure + WeakMap-cached by theme identity. See "CSS-variables theming" below.
- **@pyreon/rocketstyle**:
  - `rocketstyle(component)` multi-dimensional engine (dimensions: `state`/`size`/`variant`/`theme` + custom; dark/light via `useDarkMode`).
  - **Per-definition caching** (created once per `rocketComponent()`, shared via WeakMap): `_dimensionsCache`, `_reservedKeysCache`, `_omitSetCache`, `LocalThemeManager`, and `_rsMemo` — a `WeakMap<theme, Map<keyString, {rocketstyle, rocketstate}>>` keyed by `mode|dimensionPropTuple|pseudoState` that returns SAME object identities on hit so the styler `classCache` skips resolution (LRU 128/theme; real apps need ONE shared `<PyreonUI>` for the memo to span instances).
  - `getTheme` in-place merge + frozen `EMPTY_PSEUDO`. Dev guard tree-shaken in prod.
- **@pyreon/attrs**: `attrs(component)` chainable — `.attrs({props})` (default props), `.config({dimensions})`, `.statics({method})`, `.compose(enhancer)`.
- **@pyreon/kinetic**:
  - `kinetic(component)` → `.preset()`, `.enter()/.enterTo()`, `.leave()/.leaveTo()`, `.collapse()`, `.stagger()`, `.group()`. 4 modes.
  - **SSR contract**: `<Transition show={() => false}>` always emits children with hidden-state classes inlined (`leaveTo` else `enterFrom`) — critical for SSG scroll-reveal (IO can't fire server-side). Animation is visual, content is structural; matches Framer Motion / react-transition-group norm.
  - Trade-off: initially-hidden `unmount:true` no longer triggers true DOM removal after a later leave.
  - **`setTransition` preserves `transition-delay` when kinetic assigns the `transition` shorthand** — the shorthand resets omitted longhands (`transition-delay`→`0s`) in Chromium/Firefox; a bare `el.style.transition = enterTransition` erased stagger delays, so STYLE/preset staggers (`.preset(slideUp).stagger()`) animated all children AT ONCE. Delay sourced from a stable `--kinetic-delay` custom prop (survives the shorthand AND the `transition=''` reset at 'entered' → multi-cycle safe). happy-dom does NOT model the shorthand→longhand reset → only real Chromium catches it (`stagger-delay-preserved.browser.test.tsx`). **`nextFrame` BATCHES all same-burst callbacks into ONE shared double-rAF** (2 rAF registrations for a 1000-child stagger, not 2000 — the measured dominant per-child overhead vs Motion One at N=1000; a callback registered after the batch's outer frame opens a NEW batch so its "from" state still paints; identity-keyed to the scheduling `requestAnimationFrame`, so swapped stubs/polyfills can't strand callbacks on a dead batch). Its cancel REMOVES the callback from the batch — works in every phase (a rapid enter→leave inside one frame can never commit the stale enter-to state) without touching batch siblings; SSR-safe no-op when rAF is undefined.
  - **Animation JS-overhead bench** (`bun run bench`, real Chromium via Playwright vs Motion One + a bare-CSS floor; 2026-07 re-measure AFTER the shared-`nextFrame` batching): kinetic WINS enter-500 (~1.8–2× faster than Motion One) and stagger-300 (~1.3×), wins-or-ties enter-2000, and statistically TIES stagger-1000 (🤝 CI-overlap across repeat runs — was a stable 1.27× LOSS pre-batching, −24% wall; Motion One's WAAPI path shows higher variance); both ~6–8× the bare-CSS floor (the cost of a real animation abstraction). kinetic is CSS-transition-based so it CANNOT do springs / interruptible value animation / layout / gestures (Motion One / Framer own those). Honest CSS-offload framing in `bench/README.md`.
- **@pyreon/elements**:
  - `Element` (block w/ responsive style props), `Text`, `List`, `Overlay` (positioned + backdrop), `Portal` (per-instance wrapper element inside `DOMLocation`, default `document.body` — read rendered DOM one level deeper).
  - **Element layout is PROPS, not theme CSS** (see code-style.md "Layout in `.attrs()`" for the full contract): simple elements read `contentDirection`/`contentAlignX`/`contentAlignY` (bare `direction`/`alignX`/`alignY` = slot axis of compound elements); alignment is AXIS-FIXED (X horizontal always, `block`=stretch); `gap` renders CSS gap on the simple path + the button flex-fix layer (0.51+); `block: true` for full-width/app roots (default is shrink-wrapping `inline-flex`). Theme-level flex overrides fight the wrapper's emitted CSS and never reach the needsFix inner layer. Theme layout stays correct ONLY for: `flexWrap`, CSS grid, and `display:'block'` for text ellipsis.
  - **Overlay focus restore** (a11y): `useOverlay` returns focus to the trigger on close only when focus is still inside the closing overlay. Use `useOverlay` for tooltips/popovers/dropdowns; never reimplement positioning. `useOverlay` returns `{ triggerRef, contentRef, active, align, alignX, alignY, showContent, hideContent, setContentPosition, setupListeners, blocked, ... }` — NOT `isOpen`/`open`/`close`/`toggle`/`triggerProps` (those never existed; a doc-drift fixed alongside the two Overlay bugs below).
  - **Overlay content stability + hover-reachability (durable contracts, fixed 2026-07)**: (1) the content receives `align`/`alignX`/`alignY` as LIVE `_rp()` reactive props (not value reads inside the mount accessor) — a viewport-edge FLIP re-styles the content in place, NO remount (pre-fix the content subtree remounted on flip, double-firing `onMount` + dropping an input's state in a popover). (2) A hover overlay's CONTENT-hover listeners re-bind as `isContentLoaded` flips (the content mounts AFTER `setupListeners`) — so moving the pointer trigger→content keeps it open (pre-fix `attachHoverListeners()` ran once at mount with `contentEl` still null → content unreachable). Both are real-Chromium-locked (`Overlay-content-reactive-align` / `Overlay-hover-content` browser specs, bisect-verified).
  - **Overlay trigger/content render props receive a typed `ref`** (`{ ref, active, showContent, hideContent }` for trigger; `+ align/alignX/alignY` for content) — attach it or the hook can't measure/position/click-outside/focus. `OverlayProvider` coordination props (`blocked`/`setBlocked`/`setUnblocked`) are OPTIONAL — a root `<OverlayProvider>` uses no-op defaults; the default overlay context is a working no-op (not the former `{}` cast).
  - Element simple-path fast path (no before/after content + non-needsFix tag → single styled invocation, 31–45% faster; a spot-check measured a non-compound Element mounting ~3.4× faster than a 3-slot compound one); `$element` bundle interning (`internElementBundle()`, same primitive tuple → same identity → `elClassCache` hit).
- **@pyreon/ui-core PyreonUI**: single provider (theme/mode/config). Props `theme`, `mode` (`"light"|"dark"|"system"` — system auto-detects `prefers-color-scheme`), `inversed`. `useMode()` → mode signal; `enrichTheme(theme)` merges defaults. `init()` preserved for custom envs.

**CSS-variables theming — `init({ cssVariables: true | { prefix, attribute } })`** (opt-in, ui-system-wide; flag off = byte-identical classic):

- PyreonUI tokenizes the enriched theme via `themeToCssVars`, injects the `:root` block once (SSR-aware), provides a var-leaf tree.
- Dark/light flip becomes ONE `documentElement[data-theme]` attribute write with ZERO re-resolution / className churn (rocketstyle `_resolveRsEntry` neither reads nor keys on the mode signal under the flag — styler `classCache` skips resolution on flip).
- Component-level `mode(a, b)` becomes a hashed deduped var-pair factory (`--px-m-<fnv1a>`); theme authoring is UNCHANGED.
- **Root-vs-nested split** (FOUC fix): the ROOT provider writes the mode attribute to `document.documentElement` via a client effect + returns children unwrapped; only NESTED/`inversed` providers render a `display:contents` wrapper scoping an override.
- `cssVariablesPrePaintScript({ attribute?, storageKey?, fallback? })` (from `@pyreon/ui-core`) builds the blocking `<head>` script (zero's `themeScript` composes automatically).
- Document export resolves `mode(a,b)` vars via `resolveModeVar` + `extractDocNode({ theme?, mode? })`.
- Measured: ~1.9× faster steady-state toggle at 300 real components (vars does ZERO per-component JS; the EAGER-vs-LAZY `coreContext` getter fix was load-bearing — an eager `{ theme, mode }` object subscribed every theme reader to mode). Retained heap neutral; bundle ~2.2 KB gz.
- The one bug class is JS arithmetic on a `var()` value (`gap/2` → NaN) — found only in coolgrid (`isCssVarValue` → native `calc()`); the styler dev validator (`sheet.insert` NaN/malformed-var scan) is the runtime safety net.
- Reference: `unistyle/cssVariables.ts`, `ui-core/{config,PyreonUI}.tsx`, `rocketstyle/utils/theme.ts`, `styler/sheet.ts`.

### UI Component Library (packages/ui/)

| Package | Description |
| --- | --- |
| `@pyreon/ui-theme` | Default theme + rocketstyle ThemeDefault/StylesDefault augmentation |
| `@pyreon/ui-components` | 67 rocketstyle components across 10 categories |
| `@pyreon/ui-primitives` | Headless behavior primitives (ComboboxBase, CalendarBase, etc.) — full WAI-ARIA keyboard nav (Combobox/Tree Home/End + typeahead; Tree `*` expand-siblings), string aria-state |

**@pyreon/ui-components architecture**: three bases — `el` (Element/layout), `txt` (Text/typography), `list` (List/flowing). Factory re-exports `el`/`txt`/`list`/`rs` from `bases/`. **Layout in `.attrs()`** (`tag`, `direction`, `alignX`, `alignY`, `gap`, `block` → Element's inner layout); **CSS + pseudo-states in `.theme()`** (`hover`/`focus`/`active`/`disabled` objects → `:hover`/`:focus-visible`/`:active`/`:disabled`). `:hover` is unconditional (only `cursor:pointer` gates on `onClick`/`href`). CSS naming is unistyle convention (`borderWidthTop`, not `borderTopWidth`). **`useBooleans: false` is the rocketstyle default** — dimension props take strings (`state="primary"`), not booleans; opt in via `rocketstyle({ useBooleans: true })`. Theme augmentation lives in `@pyreon/ui-theme` (`ThemeDefault extends Theme`, `StylesDefault extends ITheme`) — apps must NOT re-augment. **A11y**: interactive components DELEGATE role/state ARIA to their `*Base` primitive (`@pyreon/ui-primitives`) — ui-components emit essentially NO own ARIA; presentational components that own no primitive carry correct a11y defaults via `.attrs()` (`Loader` → `role="status"` + `aria-label="Loading"`, `Pagination` → `aria-label="Pagination"` on its `<nav>`, `Tooltip` → `role="tooltip"`, `CloseButton` → `aria-label="Close"`; `Alert` → SEVERITY-DRIVEN live region via an `.attrs((props) => …)` callback reading the `state` dimension — `error`/`warning` → `role="alert"`+`aria-live="assertive"`, else `role="status"`+`aria-live="polite"` — matching `@pyreon/toast`'s type-aware Toaster role, plus an EXPLICIT `aria-live` because an Alert container commonly mutates in place, unlike toast's insert-only rows; `Notification` → fixed `role="status"`+`aria-live="polite"` (ambient card, never interrupts by default); `Breadcrumb` → `<nav aria-label="Breadcrumb">` landmark via `tag: 'nav'` on its List-base root (a styled flex `<div>`, not `<ol>/<li>`) — mark the current `<BreadcrumbItem>` with `aria-current="page"` (literal string, forwards through `applyProps`); all overridable, all flow through the `applyProps` path so they are correct). The #2214-deferred Alert/Notification live-region roles + Breadcrumb nav landmark are now CLOSED. Known cross-cutting gap (NOT in ui-components — a compiler follow-up): the primitives' DIRECT-JSX `aria-invalid`/`aria-disabled`/`data-*` with an `undefined` branch render the literal `="undefined"` in real (vite-plugin-compiled) apps via the un-guarded template `attrSetter` — see anti-patterns "Boolean ARIA-STATE … Compiled-template-path caveat".

### UI System (Component Library)

| Package | Description |
| --- | --- |
| `@pyreon/ui-core` | Config engine, init(), utilities, HTML tags, theme-reader hooks (useThemeValue, useRootSize, useSpacing) |
| `@pyreon/styler` | CSS-in-JS: styled(), css, keyframes, theming |
| `@pyreon/unistyle` | Responsive breakpoints, CSS property mappings, unit utilities |
| `@pyreon/elements` | 5 foundational primitives (Element, Text, List, Overlay, Portal) |
| `@pyreon/attrs` | Chainable HOC factory (.attrs(), .config(), .statics()) |
| `@pyreon/rocketstyle` | Multi-state styling (states, sizes, variants, themes, dark mode) |
| `@pyreon/coolgrid` | 12-column responsive grid (Container, Row, Col) |
| `@pyreon/kinetic` | CSS-transition animations (Transition, Stagger, Collapse) |
| `@pyreon/kinetic-presets` | 120+ animation presets |
| `@pyreon/connector-document` | Bridge between ui-system components and @pyreon/document |
| `@pyreon/document-primitives` | Rocketstyle-based document components — render in browser AND export |
