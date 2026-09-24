# Pyreon UI System

## Packages

| Package | Description |
| --- | --- |
| `@pyreon/ui-core` | Config engine, `init()`, `<PyreonUI>`, utilities, HTML tags, theme-reader hooks (`useThemeValue`, `useRootSize`, `useSpacing`) |
| `@pyreon/styler` | CSS-in-JS: `styled()`, `css`, `keyframes`, theming |
| `@pyreon/unistyle` | Responsive breakpoints, CSS property mappings, units, theme engine |
| `@pyreon/elements` | `Element`, `Text`, `List`, `Overlay`, `Portal` |
| `@pyreon/attrs` | Chainable HOC factory (`.attrs()`, `.config()`, `.statics()`, `.compose()`) |
| `@pyreon/rocketstyle` | Multi-dimensional styling (states, sizes, variants, themes, dark mode) |
| `@pyreon/coolgrid` | 12-column responsive grid (`Container`, `Row`, `Col`) |
| `@pyreon/kinetic` | CSS-transition animations (`Transition`, `Stagger`, `Collapse`) |
| `@pyreon/kinetic-presets` | 120+ animation presets |
| `@pyreon/connector-document` | Bridge between ui-system components and `@pyreon/document` |
| `@pyreon/document-primitives` | Rocketstyle document components that render in the browser and export |

Component libraries in `packages/ui/` (private):

| Package | Description |
| --- | --- |
| `@pyreon/ui-theme` | Default theme plus rocketstyle `ThemeDefault` / `StylesDefault` augmentation |
| `@pyreon/ui-components` | Rocketstyle components, grouped by category |
| `@pyreon/ui-primitives` | Headless behaviour primitives (`ComboboxBase`, `CalendarBase`, …) with WAI-ARIA keyboard navigation and string aria-state |

## @pyreon/styler

- `styled('div')` → `ComponentFn`; `css` → lazy `CSSResult`; `keyframes` → animation name; `createGlobalStyle` / `createSheet()`.
- `ThemeContext` is reactive (`createReactiveContext<Theme>`). `useTheme()` returns a snapshot; `useThemeAccessor()` returns `() => Theme` for use in effects. A whole-theme swap re-resolves CSS and swaps class names without remounting.
- One singleton `StyleSheet` (FNV-1a hashing, dedup, SSR).
- `innerRef` is an alias of `ref` on `styled()` components.
- On the server `DynamicStyled` (`IS_SERVER`) skips its reactive `computed`/`renderEffect` setup and emits the same class name.
- The dev validator in `sheet.ts` flags `NaN` and malformed `var()` values in inserted CSS.

## @pyreon/unistyle

- A style value is a single value, a mobile-first array `[xs, sm, md, lg]`, or a breakpoint object. 170+ CSS property mappings.
- A `null`/`undefined` array slot is skipped and inherits the previous breakpoint: `['red', null, 'blue']` = xs red, sm red, md blue. Arrays and breakpoint objects normalize identically; `0` and `false` are values, not gaps (`normalizeTheme.ts`).
- `@media (min-width)` blocks emit only deltas (`optimizeBreakpointDeltas`). The diff runs against the running cascade, so a value that reverts to an earlier one is re-emitted.
- `themeToCssVars(theme, opts?)` (`cssVariables.ts`) turns a plain theme into `--px-*` custom properties and returns `{ vars, css, registry }`. Units are applied at emission (`spacing.small: 8` → `--px-spacing-small: 0.5rem`). Plain `var()`/`calc()` strings pass through unchanged. Pure, cached per theme object.
- Registers its theme engine (`enrichTheme`, `themeToCssVars`, `cpseRewrite`) into `ui-core` at load.

## @pyreon/rocketstyle

- `rocketstyle(component)`: dimensions `state` / `size` / `variant` / `theme` plus custom ones; light/dark via the `mode` from `<PyreonUI>`.
- `useBooleans: false` is the default: dimension props take strings (`state="primary"`). Opt in with `rocketstyle({ useBooleans: true })`.
- Per-definition caches, created once per component and shared via `WeakMap`: `_dimensionsCache`, `_reservedKeysCache`, `_omitSetCache`, `LocalThemeManager`, and `_rsMemo`. `_rsMemo` is a `WeakMap<theme, SizedMap>` keyed by mode, resolved dimension values and pseudo-state, capped at 128 entries per theme. It returns the same object identities on a hit so the styler class cache skips resolution. Apps need one shared `<PyreonUI>` for the memo to span instances.
- `resolveModeVar(value, mode)` resolves a `mode(a, b)` variable pair to its raw value for non-CSS targets.

## @pyreon/kinetic

- `kinetic(component)` → `.preset()`, `.enter()`/`.enterTo()`, `.leave()`/`.leaveTo()`, `.collapse()`, `.stagger()`, `.group()`.
- **SSR:** `<Transition show={() => false}>` still renders its children, with the hidden-state classes inlined (`leaveTo`, else `enterFrom`). Content is structural, animation is visual; this keeps SSG scroll-reveal content in the HTML. Trade-off: an initially hidden transition with `unmount: true` is not removed from the DOM after a later leave.
- **`setTransition`** (`utils.ts`) re-applies `transition-delay` after assigning the `transition` shorthand, which otherwise resets the delay to `0s` and makes staggers animate all at once. The delay comes from a `--kinetic-delay` custom property, which survives the shorthand and the reset at `entered`. happy-dom does not model the reset; the lock is `stagger-delay-preserved.browser.test.tsx`.
- **`nextFrame`** batches callbacks from the same burst into one shared double-rAF. A callback registered after the batch's outer frame opens a new batch. The batch is keyed to the `requestAnimationFrame` that scheduled it, so a swapped stub or polyfill cannot strand callbacks. Cancel removes one callback from its batch in any phase, without touching siblings. No-op when `requestAnimationFrame` is undefined.
- Kinetic is CSS-transition based: no springs, interruptible value animation, layout or gesture animation. Benchmark: `bun run bench` in the package (see `bench/README.md`).

## @pyreon/elements

- `Element`, `Text`, `List`, `Overlay`, `Portal`. `Portal` renders into a per-instance wrapper element inside `DOMLocation` (default `document.body`), so rendered DOM is one level deeper.
- **Layout is props, not theme CSS** (full contract in `.agents/rules/code-style.md`, "Layout in `.attrs()`"):
  - Simple elements read `contentDirection`, `contentAlignX`, `contentAlignY`. Bare `direction` / `alignX` / `alignY` are the slot axis of compound elements.
  - Alignment is axis-fixed: X is always horizontal; `block` means stretch.
  - `gap` renders CSS gap on the simple path and on the button/fieldset/legend flex-fix layer.
  - `block: true` for full-width elements and app roots; the default is shrink-wrapping `inline-flex`.
  - Theme-level flex overrides fight the wrapper's emitted CSS and never reach the flex-fix inner layer. Theme layout is correct only for `flexWrap`, CSS grid, and `display: 'block'` for text ellipsis.
- Simple-path fast path: without before/after content and on a non-fix tag, `Element` makes one styled invocation. `internElementBundle()` returns the same `$element` object for the same primitive tuple, so the class cache hits.

### Overlay

- Use `useOverlay` for tooltips, popovers and dropdowns; never reimplement positioning. It returns `{ triggerRef, contentRef, active, align, alignX, alignY, showContent, hideContent, setContentPosition, setupListeners, blocked, setBlocked, setUnblocked, Provider }`. There is no `isOpen`, `open`, `close`, `toggle` or `triggerProps`.
- Trigger and content render props receive a `ref` (`{ ref, active, showContent, hideContent }`, plus `align` / `alignX` / `alignY` for content). Attach it, or the hook cannot measure, position, detect outside clicks or manage focus.
- On close, focus returns to the trigger only when focus was inside the closing overlay (or was lost).
- Content receives `align` / `alignX` / `alignY` as live reactive props, so a viewport-edge flip restyles it in place without a remount (`Overlay-content-reactive-align.browser.test.tsx`).
- Content hover listeners re-bind whenever `isContentLoaded` changes, so moving the pointer from trigger to content keeps a hover overlay open (`Overlay-hover-content.browser.test.tsx`).
- `OverlayProvider` coordination props (`blocked` / `setBlocked` / `setUnblocked`) are optional; the default context is a working no-op.

## @pyreon/ui-core — `<PyreonUI>`

Single provider for theme, mode and config. Props: `theme`, `mode` (`"light" | "dark" | "system"`; `system` follows `prefers-color-scheme`), `inversed`. `useMode()` returns the resolved mode. `init()` configures custom environments. Theme enrichment comes from the engine unistyle registers.

### CSS-variables theming — `init({ cssVariables: true | { prefix, attribute } })`

Opt-in. With the flag off, output is identical to classic mode.

- `<PyreonUI>` tokenizes the enriched theme with `themeToCssVars`, injects the `:root` block once (SSR-aware), and provides a tree of `var()` leaves.
- A light/dark flip is one `documentElement[data-theme]` write, with no re-resolution or class-name churn: under the flag rocketstyle's `_resolveRsEntry` does not read or key on the mode signal.
- Component-level `mode(a, b)` becomes a hashed, deduplicated var pair (`--px-m-<fnv1a>`). Theme authoring is unchanged.
- The root provider writes the mode attribute to `document.documentElement` and renders children unwrapped. Only nested or `inversed` providers render a `display: contents` wrapper for their override.
- `cssVariablesPrePaintScript({ attribute?, storageKey?, fallback? })` (from `@pyreon/ui-core`) builds the blocking `<head>` script that prevents a flash; zero's `themeScript` composes it.
- Document export resolves `mode(a, b)` vars via `resolveModeVar` and `extractDocNode({ theme?, mode? })` (`@pyreon/document-primitives`).
- `coreContext` exposes theme and mode through lazy getters; an eager object subscribes every theme reader to mode.
- Never do JS arithmetic on a `var()` value (`gap / 2` → `NaN`). Coolgrid detects vars with `isCssVarValue` and uses `calc()`.
- Code: `unistyle/src/cssVariables.ts`, `ui-core/src/{config.ts,PyreonUI.tsx}`, `rocketstyle/src/utils/theme.ts`, `styler/src/sheet.ts`.

## @pyreon/ui-components

- Three bases: `el` (Element, layout), `txt` (Text, typography), `list` (List, flowing content). `factory.ts` re-exports `el` / `txt` / `list` / `rs`.
- Layout in `.attrs()` (`tag`, `direction`, `alignX`, `alignY`, `gap`, `block`); CSS and pseudo-states in `.theme()` (`hover` / `focus` / `active` / `disabled` → `:hover` / `:focus-visible` / `:active` / `:disabled`).
- `:hover` styles are unconditional; only `cursor: pointer` depends on `onClick` / `href`.
- CSS property names follow unistyle (`borderWidthTop`, not `borderTopWidth`).
- Theme augmentation lives in `@pyreon/ui-theme` (`ThemeDefault extends Theme`, `StylesDefault extends ITheme`). Apps must not re-augment.

### Accessibility

Interactive components delegate role and state ARIA to their `*Base` primitive in `@pyreon/ui-primitives`. Presentational components set overridable defaults in `.attrs()`:

| Component | Default |
| --- | --- |
| `Loader` | `role="status"`, `aria-label="Loading"` |
| `Pagination` | `aria-label="Pagination"` on its `<nav>` |
| `Tooltip` | `role="tooltip"` |
| `CloseButton` | `aria-label="Close"` |
| `Alert` | from the `state` dimension via `.attrs((props) => …)`: `error`/`warning` → `role="alert"` + `aria-live="assertive"`, else `role="status"` + `aria-live="polite"` (explicit `aria-live` because an alert usually mutates in place) |
| `Notification` | `role="status"`, `aria-live="polite"` (never interrupts by default) |
| `Breadcrumb` | `<nav aria-label="Breadcrumb">` via `tag: 'nav'` on its List root; mark the current `<BreadcrumbItem>` with `aria-current="page"` |
