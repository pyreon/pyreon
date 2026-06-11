import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/ui-core',
  title: 'UI Provider + Config',
  tagline:
    'Unified `PyreonUI` provider (theme + mode + config), `useMode()` hook, init() escape hatch',
  description:
    'Foundation layer for the Pyreon UI system. `PyreonUI` is the single provider replacing the previous theme / mode / config split — it accepts a theme, a `mode` of `"light" | "dark" | "system"`, and an optional `inversed` flip, then auto-detects OS preference via `prefers-color-scheme` when `mode="system"`. `useMode()` returns the resolved mode as a reactive signal. The package also exposes the `init()` escape hatch (called internally by `PyreonUI` but available for SSR / test setups), the static `HTML_TAGS` / `HTML_TEXT_TAGS` lists used by the bases, and zero-dep utilities (`get`, `set`, `merge`, `pick`, `omit`, `throttle`, `isEmpty`, `isEqual`).',
  category: 'browser',
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
  ],
})
