import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/ui-core',
  title: 'UI Provider + Config',
  tagline:
    'Unified `PyreonUI` provider (theme + mode + config), `useMode()` hook, init() escape hatch',
  description:
    'Foundation layer for the Pyreon UI system. `PyreonUI` is the single provider replacing the previous theme / mode / config split — it accepts a theme, a `mode` of `"light" | "dark" | "system"`, and an optional `inversed` flip, then auto-detects OS preference via `prefers-color-scheme` when `mode="system"`. `useMode()` returns the resolved mode as a reactive signal. The package also exposes the `init()` escape hatch (called internally by `PyreonUI` but available for SSR / test setups), the static `HTML_TAGS` / `HTML_TEXT_TAGS` lists used by the bases, and zero-dep utilities (`get`, `set`, `merge`, `pick`, `omit`, `throttle`, `isEmpty`, `isEqual`).',
  category: 'browser',
  multiplatform: {
    tier: 'shared',
    rationale:
      '`<PyreonUI>` lowers transparently on native (theme is compile-time; dark mode is the system read)',
  },
  features: [
    'PyreonUI({ theme, mode, inversed }) — single provider replaces 3 separate providers',
    'mode="system" auto-detects OS preference via matchMedia and updates reactively',
    'useMode() returns Signal<"light" | "dark"> resolved against system preference + inversed',
    'init() callable directly for custom environments (tests, SSR without PyreonUI)',
    'init({ cssVariables: true }) — opt-in CSS-variables theming: theme becomes custom properties, dark/light is one attribute write (no re-render)',
    'cssVariablesPrePaintScript() — blocking <head> script that sets the mode attribute on documentElement before first paint (FOUC fix)',
    'enrichTheme() (re-exported from @pyreon/unistyle) merges user theme with defaults',
    'Zero-dep utilities: get, set, merge, pick, omit, throttle, isEmpty, isEqual',
    'HTML_TAGS / HTML_TEXT_TAGS constants drive Element / Text base tag dispatching',
  ],
  longExample: `import { PyreonUI, useMode } from '@pyreon/ui-core'
import { enrichTheme } from '@pyreon/unistyle'

// Single provider — wraps theme, mode, and config in one tree
const theme = enrichTheme({
  colors: { primary: '#3b82f6', secondary: '#6366f1' },
  fonts: { body: 'Inter, sans-serif' },
})

const App = () => (
  <PyreonUI theme={theme} mode="system">
    <MyApp />
  </PyreonUI>
)

// useMode() reads the resolved mode reactively
function ThemeBadge() {
  const mode = useMode()
  return <div class={mode() === 'dark' ? 'badge-dark' : 'badge-light'}>{mode()}</div>
}

// inversed flips the resolved mode (light → dark and vice versa)
const InvertedSection = () => (
  <PyreonUI inversed>
    <Sidebar />
  </PyreonUI>
)`,
  api: [
    {
      name: 'PyreonUI',
      kind: 'component',
      signature:
        "(props: { theme?: Theme; mode?: 'light' | 'dark' | 'system'; inversed?: boolean; children: VNodeChild }) => VNodeChild",
      summary:
        "Unified provider replacing the previous theme / mode / config split (3 nested providers became 1). Accepts an enriched `theme` object (merge with defaults via `enrichTheme()`), a `mode` of `'light' | 'dark' | 'system'`, and an optional `inversed` flip. When `mode='system'`, the provider subscribes to `matchMedia('(prefers-color-scheme: dark)')` and re-resolves the mode reactively. Calls `init()` internally so consumers don\\\'t need to wire it up themselves. Whole-theme swaps (user-preference themes) propagate through the styler resolver and re-resolve CSS without remounting the VNode. Under `init({ cssVariables: true })` the provider additionally autogenerates CSS custom properties from the theme (unistyle\\'s `themeToCssVars`), injects the `:root` block once, provides a var-leaf theme tree, and renders a layout-neutral `display: contents` wrapper carrying the mode attribute — a dark/light flip becomes ONE attribute write (zero re-resolution, zero className churn), nested `inversed` providers scope via the CSS cascade, and SSR ships the right mode server-rendered.",
      example: `import { PyreonUI } from "@pyreon/ui-core"
import { enrichTheme } from "@pyreon/unistyle"

const theme = enrichTheme({ colors: { primary: "#3b82f6" } })

<PyreonUI theme={theme} mode="system">
  <App />
</PyreonUI>

// mode="system" auto-detects OS dark mode via prefers-color-scheme
// inversed flips the resolved mode (light↔dark)`,
      mistakes: [
        'Using `ThemeProvider` + `ModeProvider` + `ConfigProvider` separately — `PyreonUI` is the single replacement covering all three',
        'Flipping `init({ cssVariables })` after the first render — the switch is a boot-time contract; theme-resolution caches across the ui-system assume it does not change mid-session',
        'Expecting `mode(a, b)` pairs with NUMBER values to unit-convert under `cssVariables` — pairs are emitted verbatim into CSS custom properties; pass unit-complete strings',
        'Forgetting `enrichTheme()` — raw theme objects miss default breakpoints / spacing / unit utilities',
        'Destructuring `props` inside the provider — components run once; destructuring captures values at setup. Read `props.mode` lazily inside reactive scopes',
        'Re-augmenting the `ThemeDefault` / `StylesDefault` interfaces in your app — `@pyreon/ui-theme` already augments them; double-augmentation throws TS2320',
      ],
      seeAlso: ['useMode', 'enrichTheme', 'init'],
    },
    {
      name: 'useMode',
      kind: 'hook',
      signature: "useMode(): Signal<'light' | 'dark'>",
      summary:
        "Returns the currently resolved mode as a reactive signal — `'light'` or `'dark'`. When the nearest `PyreonUI` ancestor uses `mode='system'`, the signal reflects the OS preference and updates when the user changes their system setting. When `inversed` is true on any ancestor, the mode is flipped before resolution. Component-scoped subscription — readers re-run only when the resolved mode actually changes.",
      example: `import { useMode } from "@pyreon/ui-core"

const mode = useMode()
// mode() returns "light" or "dark" (resolved, reactive)
// Reflects OS preference when PyreonUI mode="system"`,
      mistakes: [
        'Reading `useMode()` without calling it — the value is a `Signal`; use `mode()` to read',
        'Using `useMode()` outside any `PyreonUI` ancestor — falls back to a default but loses the reactive system / inversed handling',
      ],
      seeAlso: ['PyreonUI'],
    },
    {
      name: 'useThemeValue',
      kind: 'hook',
      signature: 'useThemeValue<T = unknown>(path: string) => T | undefined',
      summary:
        'Deep-reads a dot-path from the styler theme (e.g. `"colors.primary"`), returning the value or `undefined`. A convenience over `useTheme()` + manual traversal. Lives in `@pyreon/ui-core` so the ui-system owns its theme-reader hooks without depending on the `@pyreon/hooks` fundamentals package.',
      example: `const primary = useThemeValue<string>('colors.primary')`,
      mistakes: [
        'Returns a PLAIN value captured once — NOT an accessor and NOT reactive; it will not update on a theme swap. For a value that tracks the theme, read `useThemeAccessor()` from `@pyreon/styler` inside a reactive scope.',
      ],
      seeAlso: ['useRootSize', 'useSpacing'],
    },
    {
      name: 'useRootSize',
      kind: 'hook',
      signature: 'useRootSize() => { rootSize: number; pxToRem: (px: number) => string; remToPx: (rem: number) => number }',
      summary:
        'Reads the styler theme root font size (default `16`) and returns it plus `pxToRem` / `remToPx` converters. Requires a theme context (falls back to 16 otherwise). Lives in `@pyreon/ui-core` — a ui-system theme-reader hook.',
      example: `const { pxToRem } = useRootSize()
<div style={{ padding: pxToRem(24) }}>…</div>`,
      mistakes: [
        '`rootSize` is a plain number captured ONCE at call time — NOT reactive. The converters close over that snapshot, so a later whole-theme swap will not update an already-returned result (re-mount the consumer to pick up a new root size).',
      ],
      seeAlso: ['useSpacing', 'useThemeValue'],
    },
    {
      name: 'useSpacing',
      kind: 'hook',
      signature: 'useSpacing(base?: number) => (multiplier: number) => string',
      summary:
        'Returns a `spacing(multiplier)` function producing a px string. The unit is `base ?? rootSize/2` (default 8px), read from the theme via `useRootSize`. Lives in `@pyreon/ui-core` — a ui-system theme-reader hook.',
      example: `const spacing = useSpacing()
<div style={{ gap: spacing(2) }}>…</div>  // "16px"`,
      mistakes: [
        'The unit is computed once from a non-reactive `rootSize` snapshot — the returned `spacing` function is static; a theme change will not affect an already-obtained function.',
      ],
      seeAlso: ['useRootSize', 'useThemeValue'],
    },
    {
      name: 'cssVariablesPrePaintScript',
      kind: 'function',
      signature:
        'cssVariablesPrePaintScript(options?: { attribute?: string; storageKey?: string; fallback?: "light" | "dark" }): string',
      summary:
        'Build the blocking pre-paint script that sets the CSS-variables mode attribute on `document.documentElement` BEFORE first paint — the standard dark-mode FOUC fix for `init({ cssVariables: true })`. Inject the returned string as a synchronous `<script>` in `<head>`: it reads a persisted toggle from localStorage (default key `zero-theme`), else the OS `prefers-color-scheme`, else `fallback`, and writes the attribute at `:root` — exactly where the var rules cascade from and where the ROOT `PyreonUI` writes after hydration, so the two agree and there is no flash for `mode="system"` or a persisted toggle. Self-contained + try/catch-wrapped. (zero apps can use the existing `themeScript` export, which writes the same attribute.)',
      example: `import { cssVariablesPrePaintScript } from '@pyreon/ui-core'

// In your document <head>, before the app bundle:
// <script>{cssVariablesPrePaintScript()}</script>`,
      mistakes: [
        'Placing it at end-of-body instead of <head> — it must run before first paint; an in-body script can flash on a streamed/large document',
        'Using it without the ROOT PyreonUI under cssVariables — the script fixes the PRE-hydration paint; the root provider keeps documentElement in sync AFTER hydration. Both are needed',
        'Expecting it to cover a hardcoded `mode="dark"` SSR app with no stored preference — the mode lives only in the app JSX; stamp `<html data-theme="dark">` server-side for that case',
      ],
      seeAlso: ['PyreonUI'],
    },
    {
      name: 'init',
      kind: 'function',
      signature:
        'init(props: { css?, styled?, keyframes?, component?, textComponent?, createMediaQueries?, cssVariables?: boolean | CssVariablesConfig, styleExtraction?: boolean }): void',
      summary:
        'The escape hatch `<PyreonUI>` calls internally to configure the ui-system-wide `Configuration` singleton (`config.css`/`config.styled`/`config.keyframes`, the default host `component`/`textComponent` used by Element/Text when no `tag` is given, and the `cssVariables` / `styleExtraction` opt-ins). Call it yourself only when `<PyreonUI>` is not mounted — a test harness, an SSR entry that pre-warms config before the first render, or a bare `@pyreon/rocketstyle`-only setup. Every field is optional and merges onto the existing singleton; omitted fields keep their current value.',
      example: `import { init } from '@pyreon/ui-core'

// Test setup with no <PyreonUI> in the tree:
init({ cssVariables: true, styleExtraction: true })`,
      mistakes: [
        'Calling `init()` AFTER the first render to flip `cssVariables`/`styleExtraction` — both are boot-time contracts; theme-resolution caches across the ui-system assume they never change mid-session',
        'Calling it redundantly alongside `<PyreonUI>` — the provider already calls `init()` with its own props on every mount; a second manual call can race the provider\'s own config depending on mount order',
      ],
      seeAlso: ['PyreonUI', 'config'],
    },
    {
      name: 'get / set / merge / pick / omit / isEmpty / isEqual',
      kind: 'function',
      signature:
        'get(obj, path, default?) · set(obj, path, value) · merge(target, ...sources) · pick(obj, keys?) · omit(obj, keys?) · isEmpty(value) · isEqual(a, b)',
      summary:
        'Zero-dependency object utilities the ui-system builds its HOC/prop pipelines on — `@pyreon/lodash` without the dependency. `get`/`set` take a dot-or-bracket PATH string or a pre-split array (`"a.b[0].c"` or `["a","b",0,"c"]`) and both refuse `__proto__`/`prototype`/`constructor` segments (prototype-pollution guard). `pick`/`omit` copy own-property DESCRIPTORS, not values, so getter-shaped reactive props (`makeReactiveProps`\' `_rp()` wrappers) survive the copy with their subscription intact — critical for any HOC that filters props before forwarding them. `merge` deep-merges plain objects (arrays and non-plain objects are replaced, not merged) and mutates+returns `target`. `isEqual` is a structural deep-equal (arrays + plain objects); `isEmpty` is true for `null`/`undefined`/non-objects/empty arrays/objects with no own keys.',
      example: `import { get, set, merge, pick, omit, isEqual } from '@pyreon/ui-core'

get({ a: { b: [1, 2] } }, 'a.b[1]')        // 2
get({}, 'missing.path', 'fallback')        // 'fallback'
set({}, 'a.b', 1)                          // { a: { b: 1 } }
merge({ a: 1 }, { b: 2 }, { a: 3 })        // { a: 3, b: 2 }
pick({ a: 1, b: 2, c: 3 }, ['a', 'c'])     // { a: 1, c: 3 }
omit({ a: 1, b: 2 }, ['a'])                // { b: 2 }
isEqual({ x: [1] }, { x: [1] })            // true`,
      mistakes: [
        'Reaching for a value-copying `{ ...obj }` / manual filter loop instead of `pick`/`omit` when the object may carry compiler-emitted reactive getter props — a plain spread reads the getter once and freezes the value; `pick`/`omit` preserve the getter',
        '`merge` mutates its FIRST argument — pass `merge({}, base, overrides)` when you need an immutable result',
        '`set` with a numeric-looking next key (`"a.0.b"`) creates an ARRAY at that segment, not an object — matches lodash `set` but can surprise a hand-rolled path builder',
        'isEqual/isEmpty are NOT reactive — they compare snapshots at call time; wrap the comparison in a `computed()`/`effect()` if you need it to re-run on signal change',
      ],
      seeAlso: ['useStableValue'],
    },
    {
      name: 'throttle',
      kind: 'function',
      signature:
        'throttle(fn, wait?: number = 0, options?: { leading?: boolean; trailing?: boolean }): typeof fn & { cancel: () => void }',
      summary:
        'Rate-limits `fn` to at most once per `wait` ms. `leading` (default `true`) fires on the first call in a window; `trailing` (default `true`) schedules one final call with the most recent args if calls kept arriving during the window. The returned function carries a `.cancel()` that clears any pending trailing timer and drops buffered args (useful on component unmount).',
      example: `import { throttle } from '@pyreon/ui-core'

const onScroll = throttle(() => updatePosition(), 100)
window.addEventListener('scroll', onScroll)
onMount(() => () => onScroll.cancel())`,
      mistakes: [
        'Not calling `.cancel()` on unmount — a pending trailing call fires after the consumer is gone, writing to a signal nobody reads',
        'Expecting `{ leading: false, trailing: false }` to still invoke `fn` — with BOTH off the call is dropped entirely; at least one must stay true',
      ],
      seeAlso: [],
    },
    {
      name: 'compose',
      kind: 'function',
      signature: 'compose<T extends ((arg: any) => any)[]>(...fns: T) => (value) => result',
      summary:
        'Right-to-left function composition — `compose(f, g, h)(x)` is `f(g(h(x)))`. Used internally to chain unary transforms (HOC wrappers, value pipelines); exported as a general-purpose utility.',
      example: `import { compose } from '@pyreon/ui-core'

const shout = compose(
  (s: string) => s + '!',
  (s: string) => s.toUpperCase(),
)
shout('hi') // 'HI!'`,
      mistakes: [
        'Expecting left-to-right (pipe) order — `compose` runs the LAST argument first; use it as `compose(outer, ..., inner)`',
      ],
      seeAlso: [],
    },
    {
      name: 'resolveSlot',
      kind: 'function',
      signature: 'resolveSlot(value: unknown): VNodeChildAtom | VNodeChildAtom[]',
      summary:
        'Resolves a slot prop (`beforeContent`, `afterContent`, `content` — the pattern `@pyreon/elements`\' Element/Text/List use for their inject-a-node props) INSIDE a reactive accessor, so it must be called as `content={() => resolveSlot(value)}`. It discriminates a component-reference shorthand (`beforeContent={Header}` — mount via `h(Header, null)` so the component\'s own setup frame runs) from an inline reactive accessor (`content={() => <Icon name={signal()} />}` — call bare so its signal reads track in the enclosing effect). Both are functions at the `typeof` level; the discriminator is `isPyreonComponent()` under the hood.',
      example: `import { resolveSlot } from '@pyreon/ui-core'

// Inside a component that accepts a slot prop:
<div>{() => resolveSlot(props.beforeContent)}</div>`,
      mistakes: [
        'Calling it OUTSIDE a reactive accessor — a slot value that reads a signal (`() => <Icon name={sig()} />`) needs the enclosing `() => resolveSlot(...)` to be the tracking scope, or the read never subscribes',
        'Reaching for it directly instead of building on `@pyreon/elements`\' Element/Text, which already wire this pattern for `beforeContent`/`afterContent`/`content` — most consumers never need to call it themselves',
      ],
      seeAlso: ['isPyreonComponent', 'render'],
    },
    {
      name: 'isPyreonComponent',
      kind: 'function',
      signature: 'isPyreonComponent(value: unknown): boolean',
      summary:
        'Detects whether a function value is a Pyreon COMPONENT (framework-marked via `IS_ROCKETSTYLE`/`PYREON__COMPONENT`, or user-authored by convention — an explicit `displayName`, or a `.name` starting with an uppercase letter) as opposed to a bare reactive-accessor function (`() => <X/>`). Both shapes are functions at the `typeof` level, so a slot-resolver (`resolveSlot`) needs this to decide whether to mount via `h(Component, null)` (establishing the component\'s own setup frame — required for any HOC that reads `props`) or call the function bare (so its signal reads track in the enclosing effect).',
      example: `import { isPyreonComponent } from '@pyreon/ui-core'

isPyreonComponent(MyButton)              // true — PascalCase name
isPyreonComponent(() => <div/>)          // false — anonymous accessor
isPyreonComponent(rocketstyle(Element))  // true — IS_ROCKETSTYLE marker`,
      mistakes: [
        'Relying on it for a lowercase-named or camelCase helper function that returns JSX — the naming-convention tier only recognizes PascalCase or an explicit `displayName`; give the helper a `displayName` if it must be detected as a component',
      ],
      seeAlso: ['resolveSlot'],
    },
    {
      name: 'render',
      kind: 'function',
      signature: 'render(content?: ComponentFn | string | VNodeChild | VNodeChild[] | ((props) => VNodeChild), attachProps?): VNodeChild',
      summary:
        'A flexible one-shot renderer used internally by the ui-system\'s content/slot props: primitives (string/number/boolean) and arrays pass through unchanged, a component function is mounted via `h(content, attachProps)`, a render-prop function is called with `attachProps`, and an already-built VNode passes through. `key` is stripped out of `attachProps` before mounting (it\'s a VNode reconciliation concept, not a component prop, and passing it through triggers a JSX runtime warning).',
      example: `import render from '@pyreon/ui-core'
// (default export — most consumers reach it through resolveSlot instead)`,
      mistakes: [
        'Calling it directly for a content prop that should be LIVE (reactive) — `render()` is a one-shot resolve; wrap the call in `() => render(...)` inside a reactive accessor, or prefer `resolveSlot()` which is built for exactly this',
      ],
      seeAlso: ['resolveSlot'],
    },
    {
      name: 'useStableValue',
      kind: 'hook',
      signature: 'useStableValue<T>(value: T): T',
      summary:
        'Returns a referentially-stable version of `value` — the returned reference only changes when the new value is no longer deeply equal (`isEqual`) to the last one it returned. Backed by a signal held internally; useful for passing a freshly-constructed object/array literal (which would otherwise be a NEW reference every call) into something that memoizes on identity, without needing the caller to hoist the literal to module scope.',
      example: `import { useStableValue } from '@pyreon/ui-core'

// options is a fresh object literal every call — useStableValue keeps
// its IDENTITY stable across calls that produce a deep-equal result
const options = useStableValue({ page: page(), size: 20 })`,
      mistakes: [
        'Expecting it to be reactive — it returns a plain (non-accessor) value snapshotted at call time via `.peek()`; call `useStableValue` again on the next reactive re-run to get the latest stabilized value, don\'t cache the return across renders',
        'Using it on huge or deeply-nested objects in a hot path — `isEqual` walks the whole structure on every call to decide whether to update',
      ],
      seeAlso: ['get / set / merge / pick / omit / isEmpty / isEqual'],
    },
    {
      name: 'HTML_TAGS / HTML_TEXT_TAGS',
      kind: 'constant',
      signature: 'HTML_TAGS: readonly string[] · HTML_TEXT_TAGS: readonly string[]',
      summary:
        'The two tag allowlists `@pyreon/elements`\' Element/Text bases dispatch on: `HTML_TAGS` is every recognized host tag (used to validate/narrow a `tag` prop), `HTML_TEXT_TAGS` is the subset of TEXT-flavored tags (`span`, `p`, `label`, `h1`-`h6`, …) Text defaults `component` to when no explicit tag is given.',
      example: `import { HTML_TAGS, HTML_TEXT_TAGS } from '@pyreon/ui-core'

HTML_TAGS.includes('button')      // true
HTML_TEXT_TAGS.includes('div')    // false — div is structural, not text`,
      mistakes: [],
      seeAlso: [],
    },
    {
      name: 'getThemeEngine / setThemeEngine',
      kind: 'function',
      signature: 'getThemeEngine(): ThemeEngine · setThemeEngine(engine: ThemeEngine): void',
      summary:
        '@internal — the registration seam that breaks the `ui-core ↔ unistyle` dependency cycle. `@pyreon/unistyle` calls `setThemeEngine({ enrichTheme, themeToCssVars, cpseRewrite, responsiveStyles })` at module load (a side effect its `package.json` marks `sideEffects` for, so tree-shaking can\'t drop the registration); `<PyreonUI>` reads it lazily via `getThemeEngine()` at each use-site, never eagerly at setup. When unistyle is NOT in the module graph (a bare `@pyreon/rocketstyle`-only app), `getThemeEngine()` returns a minimal FALLBACK — identity `enrichTheme`, no CSS vars, no CPSE — and dev-warns ONCE, so `<PyreonUI>` degrades instead of crashing.',
      example: `// User code never calls this — it's how @pyreon/unistyle wires itself into
// <PyreonUI> without ui-core depending on unistyle. Documented here because
// "theme isn't enriched" / "no CSS variables" debugging starts here: import
// "@pyreon/unistyle" somewhere in your app to register the real engine.`,
      mistakes: [
        'Seeing an un-enriched theme (missing default breakpoints/spacing, no CSS variables) and not realizing `@pyreon/unistyle` was never imported — every styled `@pyreon` UI package except bare `@pyreon/rocketstyle` pulls it in transitively, but a minimal custom setup can miss it',
        'Calling `setThemeEngine()` from app code — it is for a THEME ENGINE PACKAGE to register itself (the unistyle precedent); overwriting it from an app silently replaces every consumer\'s theme resolution',
      ],
      seeAlso: ['PyreonUI'],
    },
    {
      name: 'resolveCssVariables',
      kind: 'function',
      signature: 'resolveCssVariables(): { enabled: boolean; prefix: string; attribute: string }',
      summary:
        'The single defaulted view of `config.cssVariables` — every CSS-variables-mode consumer (`<PyreonUI>`, rocketstyle\'s `mode(a, b)` pair factory) reads through this instead of re-deriving defaults from the raw `boolean | CssVariablesConfig` config value. Identity-memoized: re-resolves only when `config.cssVariables` is reassigned by `init()`, not on every call.',
      example: `import { resolveCssVariables } from '@pyreon/ui-core'

const { enabled, prefix, attribute } = resolveCssVariables()
// enabled: false by default; prefix: 'px'; attribute: 'data-theme'`,
      mistakes: [
        'Reading `config.cssVariables` directly instead of `resolveCssVariables()` — the raw config value can be a bare `true`/`false` OR a `CssVariablesConfig` object; the raw form has no defaulted `prefix`/`attribute`',
      ],
      seeAlso: ['init'],
    },
    {
      name: 'hoistNonReactStatics',
      kind: 'function',
      signature: 'hoistNonReactStatics<T, S>(target: T, source: S, excludeList?: Record<string, true>): T',
      summary:
        'Copies non-framework static properties (walking the prototype chain) from `source` onto `target` — the Pyreon equivalent of the `hoist-non-react-statics` package, simplified since Pyreon components are plain functions without React-specific statics (`contextType`, `propTypes`, …). Used by HOC factories (`@pyreon/attrs`, `@pyreon/rocketstyle`) so a wrapped component keeps the original\'s statics (`.meta`, custom attached properties) visible on the wrapper.',
      example: `import { hoistNonReactStatics } from '@pyreon/ui-core'

const Original = Object.assign(
  (props: { label: string }) => props.label,
  { meta: { category: 'action' } },
)
function Wrapped(props: { label: string }) {
  return Original(props)
}
// At runtime Wrapped now also carries Original's non-framework statics
// (here, .meta) — the return value is typed T, so read the copied static
// off the SOURCE's own shape (Object.assign, as above) when you need it typed.
hoistNonReactStatics(Wrapped, Original)`,
      mistakes: [
        'Reaching for it directly when writing an app-level HOC — `@pyreon/attrs`\' `.compose()` already hoists statics for you; this is the low-level primitive it\'s built on',
      ],
      seeAlso: ['compose'],
    },
  ],
  gotchas: [
    {
      label: 'Provider replacement',
      note:
        'The legacy split (separate theme / mode / config providers) is removed. `PyreonUI` is the only correct mount; calling `init()` directly is the escape hatch for SSR or test environments where the provider tree is unavailable.',
    },
    {
      label: 'System-mode subscription',
      note:
        '`mode="system"` lazily creates a `matchMedia(\'(prefers-color-scheme: dark)\')` subscription on first read; the listener stays alive for the document lifetime, so a single subscription handles every `useMode()` consumer.',
    },
    {
      label: 'Deprecated internal Provider / context',
      note:
        'The package also exports a low-level `Provider` (default export) + `context` from `context.tsx` — an internal, `@deprecated`-tagged reactive-context provider `<PyreonUI>` no longer uses directly. It dev-warns on every mount. There is no reason to import it: use `<PyreonUI theme={theme}>` for the provider and `useMode()` / `useThemeValue()` for reads.',
    },
  ],
})
