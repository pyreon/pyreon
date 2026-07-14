import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/styler',
  title: 'CSS-in-JS',
  tagline:
    'CSS-in-JS — styled() / css / keyframes / createGlobalStyle, reactive theming, FNV-1a-deduped StyleSheet (SSR-safe)',
  description:
    "Pyreon's CSS-in-JS engine. `styled('div')` is a tagged template that returns a `ComponentFn` injecting a generated class; `css` is a tagged template returning a LAZY `CSSResult` resolved on use (not a string); `keyframes` returns the generated animation-name string. Tagged-template interpolations receive the component's `props` (and the theme) so styles can be signal-driven — function interpolations flip the component onto the dynamic resolve path (`isDynamic`). A singleton `StyleSheet` with FNV-1a hashing dedupes and supports SSR; `createSheet()` makes an isolated instance. Theme is delivered through a REACTIVE context — `useTheme()` snapshots at call time, `useThemeAccessor()` returns the raw `() => Theme` accessor for tracking inside effects so whole-theme swaps re-resolve without remounting.",
  category: 'browser',
  features: [
    "styled('div')`...` / styled(Component)`...` / styled.div`...` (Proxy) — component factory with `as` polymorphism + $-transient props",
    'css`...` — lazy CSSResult, resolved on use (NOT a string)',
    'keyframes`...` — returns the generated @keyframes animation-name string',
    'createGlobalStyle`...` — returns a ComponentFn that injects global CSS when mounted',
    'useCSS(template, props?, boost?) — resolve a CSSResult to a class name inside a component',
    'Reactive theming — useTheme() snapshot vs useThemeAccessor() accessor; ThemeProvider merges nested',
    'Singleton StyleSheet (FNV-1a dedup, SSR) + createSheet() for isolated instances',
    'buildProps / filterProps — $-transient + shouldForwardProp DOM prop forwarding (descriptor-preserving)',
  ],
  api: [
    {
      name: 'styled',
      kind: 'function',
      signature:
        'styled: ((tag: Tag, options?: StyledOptions) => TagTemplateFn) & { div: TagTemplateFn; span: TagTemplateFn; /* …all HTML tags via Proxy */ }',
      summary:
        "Component factory. `styled('div')`, `styled(MyComp)`, and `styled.div` (Proxy sugar) are all tagged templates returning a `ComponentFn` that injects a generated class. Tagged-template interpolations are called with the live `props` object (theme included), so a function interpolation reading `p.theme.color` / signal-driven values works and puts the component on the dynamic resolve path. Supports the polymorphic `as` prop and `$`-prefixed TRANSIENT props (consumed by styles, NOT forwarded to the DOM). Per-definition caching keys generated classes so repeat mounts skip re-resolution.",
      example: `import { styled } from "@pyreon/styler"

const Button = styled("button")\`
  background: \${(p) => p.theme.colors.primary};
  padding: \${(p) => (p.$compact ? "4px" : "12px")};
\`
// <Button $compact onClick={...}>Go</Button>  — $compact not forwarded to <button>`,
      mistakes: [
        "Expecting `$`-prefixed props to reach the DOM — they are transient by design (consumed by the template, stripped before forwarding). Use a non-`$` name if the attribute must land on the element",
        'Destructuring `props` in the interpolation (`${({ theme }) => …}`) and being surprised it does not update on a whole-theme swap — read `props.theme` lazily; the theme context is reactive and the styled resolver re-runs on swap',
        'Passing a resolved value where a function interpolation is needed for reactivity — `${signal()}` snapshots once at definition; use `${() => signal()}` (or `${(p) => p.x}`) to stay on the dynamic path',
        'Using `styled.div` and expecting a different identity per call — the Proxy returns the same tag template fn shape; per-definition caches key on the template, not the call site',
      ],
      seeAlso: ['css', 'useCSS', 'useTheme'],
    },
    {
      name: 'css',
      kind: 'function',
      signature:
        'css(strings: TemplateStringsArray, ...values: Interpolation[]): CSSResult',
      summary:
        'Tagged-template that returns a LAZY `CSSResult` — it is NOT a class name or a CSS string until resolved by `styled()`, `useCSS()`, or composition into another template. Compose reusable fragments with it (assign a `css` result to `const base`, then interpolate `base` inside a `styled` template). Resolution is deferred so it can read the props/theme of the consuming component at use time.',
      example: `import { css, useCSS } from "@pyreon/styler"

const card = css\`border: 1px solid #ddd; padding: 16px;\`
function Card(props) {
  const cls = useCSS(card)
  return <div class={cls}>{props.children}</div>
}`,
      mistakes: [
        'Treating the `css` tagged-template return value as a string / class name — it is a lazy `CSSResult`; interpolating it into text (e.g. `class={card}`) renders `[object Object]`. Resolve via `useCSS` or embed in a `styled` template',
        'Reading props/theme at `css` call time — the template is resolved later; put dynamic bits in function interpolations so they read the LIVE props at use',
      ],
      seeAlso: ['styled', 'useCSS', 'keyframes'],
    },
    {
      name: 'keyframes',
      kind: 'function',
      signature:
        'keyframes(strings: TemplateStringsArray, ...values: Interpolation[]): KeyframesResult',
      summary:
        'Tagged-template returning a `KeyframesResult` whose string form is the GENERATED, content-hashed `@keyframes` animation NAME. Reference it inside a `css` / `styled` template as the `animation-name` value; the `@keyframes` rule is injected (deduped via FNV-1a) on first use.',
      example: `import { keyframes, styled } from "@pyreon/styler"

const spin = keyframes\`from { transform: rotate(0) } to { transform: rotate(360deg) }\`
const Spinner = styled("div")\`animation: \${spin} 1s linear infinite;\``,
      mistakes: [
        'Expecting a CSS class — `keyframes` yields an animation-NAME token, used as the `animation` / `animation-name` value, not a class applied to an element',
        'Defining `keyframes` inside the render body per mount — define once at module scope so the hashed rule is injected once and reused',
      ],
      seeAlso: ['css', 'styled'],
    },
    {
      name: 'createGlobalStyle',
      kind: 'function',
      signature:
        'createGlobalStyle(strings: TemplateStringsArray, ...values: Interpolation[]): ComponentFn',
      summary:
        "Returns a `ComponentFn` that injects GLOBAL CSS (resets, `:root` tokens, body styles) when MOUNTED — it is not a side-effecting call. Render the returned component once near the app root. The injected rule PERSISTS for the document's lifetime, deduped by content hash — like emotion's `injectGlobal`, and UNLIKE styled-components' `createGlobalStyle`, it is NOT removed on unmount (a global reset shouldn't vanish when the mounting component re-renders away). Function interpolations make the global block dynamic (re-resolves on prop/theme change).",
      example: `import { createGlobalStyle } from "@pyreon/styler"

const GlobalReset = createGlobalStyle\`
  *, *::before, *::after { box-sizing: border-box }
  body { margin: 0; font-family: \${(p) => p.theme.fonts.body}; }
\`
// render <GlobalReset /> once at the app root`,
      mistakes: [
        'Calling `createGlobalStyle` (the tagged template) and expecting the CSS to inject — nothing happens until the returned component is RENDERED. Mount `<GlobalReset />` once near the root',
        'Expecting the global CSS to be removed when the component unmounts — it persists (deduped by hash), matching emotion `injectGlobal` not styled-components. Toggle globals with a class/attribute on `:root`, not by mounting/unmounting the component',
      ],
      seeAlso: ['styled', 'css'],
    },
    {
      name: 'useCSS',
      kind: 'hook',
      signature:
        'useCSS(template: CSSResult, props?: Record<string, any>, boost?: boolean): string',
      summary:
        'Resolves a `CSSResult` (from the `css` tagged template) to an injected class-name string inside a component. Pass `props` so function interpolations in the template read live values; `boost` opts into a faster cache path for hot, stable templates. The returned class is deduped/hashed by the active `StyleSheet`.',
      example: `import { css, useCSS } from "@pyreon/styler"

const box = css\`color: \${(p) => p.danger ? "red" : "inherit"};\`
function Box(props) {
  return <div class={useCSS(box, props)}>{props.children}</div>
}`,
      mistakes: [
        'Forgetting to pass `props` when the template has function interpolations — they then resolve against an empty object and the dynamic values are lost',
        'Calling `useCSS` outside a component setup — it depends on the active sheet/theme context like any hook',
      ],
      seeAlso: ['css', 'styled'],
    },
    {
      name: 'useTheme',
      kind: 'hook',
      signature: 'useTheme<T extends object = Theme>(): T',
      summary:
        'Returns the current theme as a SNAPSHOT at call time. `ThemeContext` is a REACTIVE context — `useTheme()` reads it once, so the returned object is static unless the read happens inside a reactive scope. For values that must track whole-theme swaps inside an `effect` / `computed`, use `useThemeAccessor()` instead.',
      example: `import { useTheme } from "@pyreon/styler"

function Badge() {
  const t = useTheme()
  return <span style={{ color: t.colors.primary }}>{/* … */}</span>
}`,
      mistakes: [
        'Destructuring `const { colors } = useTheme()` and expecting it to update on a user-preference theme swap — the snapshot is captured once. Use `useThemeAccessor()` and read inside the reactive scope, or rely on `styled` templates (their resolver tracks the theme)',
        'Calling `useTheme()` at module scope — it must run during component setup where the context is available',
      ],
      seeAlso: ['useThemeAccessor', 'ThemeProvider', 'styled'],
    },
    {
      name: 'useThemeAccessor',
      kind: 'hook',
      signature: 'useThemeAccessor<T extends object = Theme>(): () => T',
      summary:
        'Returns the raw `() => T` theme accessor (not a snapshot). Call it inside an `effect` / `computed` / JSX thunk so the read TRACKS the reactive theme context — whole-theme swaps (user-preference themes) then re-run the consumer without a remount. This is the escape hatch `styled()` itself uses internally.',
      example: `import { useThemeAccessor } from "@pyreon/styler"
import { effect } from "@pyreon/reactivity"

const theme = useThemeAccessor()
effect(() => applyChartPalette(theme().colors)) // re-runs on theme swap`,
      mistakes: [
        'Calling the accessor once at setup and caching the result — that defeats the point; call it INSIDE the reactive scope every time so the dependency is tracked',
        'Reaching for this when a `styled` template would do — the template resolver already tracks the theme; use the accessor only for imperative/non-CSS theme reads',
      ],
      seeAlso: ['useTheme', 'ThemeProvider'],
    },
    {
      name: 'ThemeProvider',
      kind: 'component',
      signature:
        'ThemeProvider(props: { theme: Theme | ((parent: Theme) => Theme); children?: VNodeChild }): VNodeChild',
      summary:
        'Provides a theme to the reactive `ThemeContext`. Nested providers compose — a function `theme` receives the parent theme so subtrees can extend rather than replace. Because the context is reactive, swapping the `theme` prop re-resolves every `styled` / `useCSS` consumer below without remounting the tree. Marked `nativeCompat` so it works inside `@pyreon/{react,preact,vue,solid}-compat` apps.',
      example: `import { ThemeProvider } from "@pyreon/styler"

<ThemeProvider theme={{ colors: { primary: "#06f" } }}>
  <App />
</ThemeProvider>`,
      mistakes: [
        'Replacing the whole theme in a nested provider when you meant to extend — pass `theme={(parent) => ({ ...parent, colors: { ...parent.colors, accent: "#0a0" } })}`',
        'Expecting most apps to mount this directly — `<PyreonUI>` wraps it; use `ThemeProvider` standalone only outside the `@pyreon/ui-core` provider',
      ],
      seeAlso: ['useTheme', 'useThemeAccessor', 'ThemeContext'],
    },
    {
      name: 'ThemeContext',
      kind: 'constant',
      signature: 'ThemeContext: ReactiveContext<Theme>',
      summary:
        'The reactive context backing the theme. Created via `createReactiveContext<Theme>` — `useContext(ThemeContext)` returns a `() => Theme` accessor (which is what `useTheme()` / `useThemeAccessor()` wrap). Exposed for advanced consumers building their own theme-aware primitives; prefer the hooks for app code.',
      example: `import { ThemeContext } from "@pyreon/styler"
import { useContext } from "@pyreon/core"

const themeAccessor = useContext(ThemeContext) // () => Theme`,
      mistakes: [
        'Treating `useContext(ThemeContext)` as the theme object — it is the ACCESSOR `() => Theme` (reactive context). Call it to read',
      ],
      seeAlso: ['useTheme', 'useThemeAccessor', 'ThemeProvider'],
    },
    {
      name: 'createSheet',
      kind: 'function',
      signature: 'createSheet(options?: StyleSheetOptions): StyleSheet',
      summary:
        'Creates an ISOLATED `StyleSheet` instance (its own FNV-1a dedup cache + rule registry) instead of the shared singleton `sheet`. Use for shadow-DOM roots, multi-window/iframe rendering, per-request SSR isolation, or test isolation where one request/realm must not share the global dedup cache. Options: `maxCacheSize`, `layer` (wrap scoped rules in an `@layer`), and `nonce` (CSP — stamps the SSR `<style>` from `getStyleTag()` and the client `<style>` element with a `nonce` so a strict `style-src \'nonce-…\'` policy admits the critical CSS). Most apps never need this — the singleton is correct for a single document.',
      example: `import { createSheet } from "@pyreon/styler"

const shadowSheet = createSheet({ /* StyleSheetOptions */ })`,
      mistakes: [
        'Creating a fresh sheet per render — defeats dedup; create once per realm/root and reuse',
        'Mixing the singleton and an isolated sheet for the same DOM — classes from one will not be deduped against the other; pick one per document root',
      ],
      seeAlso: ['StyleSheet', 'sheet'],
    },
    {
      name: 'StyleSheet',
      kind: 'class',
      signature: 'class StyleSheet { constructor(options?: StyleSheetOptions) }',
      summary:
        'The CSS injection engine: FNV-1a content hashing, a dedup cache (identical CSS → one rule), and SSR support (collect rules to a string on the server, hydrate on the client). `sheet` is the process singleton; `createSheet()` wraps `new StyleSheet()`. Direct instantiation is for custom integrations (server frameworks collecting critical CSS, test harnesses).',
      example: `import { StyleSheet } from "@pyreon/styler"

const s = new StyleSheet({ /* options */ })`,
      mistakes: [
        'Instantiating `new StyleSheet()` in app code — use the exported `sheet` singleton (or `createSheet()` for explicit isolation); a stray instance will not be where `styled()` injects',
      ],
      seeAlso: ['createSheet', 'sheet'],
    },
    {
      name: 'sheet',
      kind: 'constant',
      signature: 'sheet: StyleSheet',
      summary:
        'The process-wide singleton `StyleSheet` that `styled()` / `css` / `keyframes` / `createGlobalStyle` inject into by default. Read it for SSR critical-CSS extraction or debugging the rule registry; do not mutate it directly.',
      example: `import { sheet } from "@pyreon/styler"
// SSR: render the app, then read the collected rules off \`sheet\` for the <head>`,
      seeAlso: ['StyleSheet', 'createSheet'],
    },
    {
      name: 'resolve',
      kind: 'function',
      signature:
        'resolve(strings: TemplateStringsArray, values: Interpolation[], props: Record<string, any>): string',
      summary:
        'Low-level: resolve a tagged-template (strings + interpolations) against a `props` object into a final CSS string (function interpolations invoked with `props`). The engine `styled()` / `useCSS` build on. Direct use is for custom CSS-in-JS layered on top of styler; app code should prefer `styled` / `css`.',
      example: `import { resolve } from "@pyreon/styler"

const cssText = resolve(strings, values, { theme, $compact: true })`,
      seeAlso: ['normalizeCSS', 'resolveValue', 'styled'],
    },
    {
      name: 'normalizeCSS',
      kind: 'function',
      signature: 'normalizeCSS(css: string): string',
      summary:
        'Normalizes a raw CSS string (whitespace/format canonicalization) so identical-intent CSS hashes to the same FNV-1a key and dedupes. Memoized via an internal cache — call `clearNormCache()` to drop it (tests / long-lived processes).',
      example: `import { normalizeCSS } from "@pyreon/styler"

normalizeCSS("color:  red ;") // canonical form, dedup-stable`,
      seeAlso: ['clearNormCache', 'resolve'],
    },
    {
      name: 'resolveValue',
      kind: 'function',
      signature:
        'resolveValue(value: Interpolation, props: Record<string, any>): string',
      summary:
        'Resolves a SINGLE interpolation against `props`: invokes function interpolations with `props`, flattens nested `CSSResult` / `KeyframesResult`, and stringifies the result. The per-interpolation primitive `resolve()` loops over.',
      example: `import { resolveValue } from "@pyreon/styler"

resolveValue((p) => p.theme.colors.primary, { theme })`,
      seeAlso: ['resolve', 'isDynamic'],
    },
    {
      name: 'clearNormCache',
      kind: 'function',
      signature: 'clearNormCache(): void',
      summary:
        'Clears the `normalizeCSS` memo cache. Needed in test suites that assert on injection counts / sheet contents across cases, and in long-lived processes that churn unique CSS and want to bound the cache. No effect on already-injected rules.',
      example: `import { clearNormCache } from "@pyreon/styler"

afterEach(() => clearNormCache())`,
      seeAlso: ['normalizeCSS'],
    },
    {
      name: 'buildProps',
      kind: 'function',
      signature:
        'buildProps(rawProps: Record<string, any>, generatedCls: string, isDOM: boolean, customFilter?: (prop: string) => boolean): Record<string, any>',
      summary:
        "Builds the final prop object forwarded to the rendered element: merges the generated class, drops `$`-transient props, and (for DOM targets) filters non-DOM attributes — `customFilter` overrides per-component. **Copies DESCRIPTORS, not values**, so compiler-emitted reactive (`_rp` getter) props survive forwarding instead of collapsing to a static snapshot.",
      example: `import { buildProps } from "@pyreon/styler"

const forwarded = buildProps(rawProps, "sc-abc123", true)`,
      mistakes: [
        'Re-implementing prop forwarding with `result[key] = source[key]` — that fires getters and freezes reactive props to a one-time value. styler uses descriptor copy specifically to preserve the `_rp` getter contract; any custom forwarder must do the same',
        'Passing `isDOM: true` for a component target — DOM-attr filtering will strip props the wrapped component legitimately needs',
      ],
      seeAlso: ['filterProps', 'styled'],
    },
    {
      name: 'filterProps',
      kind: 'function',
      signature:
        'filterProps(props: Record<string, unknown>): Record<string, unknown>',
      summary:
        'Returns a copy of `props` with `$`-transient and known non-DOM props removed — the DOM-safety filter `buildProps` applies for element targets. Exposed for consumers doing their own forwarding who still want the styler allowlist semantics. Descriptor-preserving, same reactive-prop rationale as `buildProps`.',
      example: `import { filterProps } from "@pyreon/styler"

const domSafe = filterProps(props)`,
      seeAlso: ['buildProps'],
    },
    {
      name: 'isDynamic',
      kind: 'function',
      signature: 'isDynamic(v: Interpolation): boolean',
      summary:
        'True when an interpolation is a function (signal accessor / props reader) — i.e. the styled component must take the DYNAMIC resolve path (re-resolve per prop/theme change) rather than the static cached path. Used internally to decide the resolver branch; exported for tooling that mirrors that decision.',
      example: `import { isDynamic } from "@pyreon/styler"

isDynamic((p) => p.color) // true → dynamic path
isDynamic("12px")          // false → static, cached`,
      seeAlso: ['resolve', 'styled'],
    },
    {
      name: 'hash / hashUpdate / hashFinalize / HASH_INIT',
      kind: 'function',
      signature:
        'hash(str: string) => string — hashUpdate(state: number, str: string) => number — hashFinalize(state: number) => string — HASH_INIT: number',
      summary:
        'The FNV-1a non-cryptographic hash styler uses for compact, deduped class names + rule keys. `hash(str)` is the one-shot form → a base-36 string. The streaming trio composes it: `hashUpdate(HASH_INIT, "ab")` folds bytes into a running 32-bit numeric state, `hashFinalize(state)` renders `(state >>> 0).toString(36)`, and `hashUpdate(hashUpdate(HASH_INIT, "ab"), "cd") === hash("abcd")`. Exported for tooling/consumers that need the SAME class-name hash styler emits (e.g. precomputing a class name before injection). Low-level — most apps never call it.',
      example: `import { hash, hashUpdate, hashFinalize, HASH_INIT } from "@pyreon/styler"
hash("color:red")  // e.g. "1a2b3c"
hashFinalize(hashUpdate(hashUpdate(HASH_INIT, "a"), "b")) === hash("ab")`,
      mistakes: [
        'Using it for anything security-sensitive — FNV-1a is NON-cryptographic (fast, collision-cheap for CSS keys, NOT collision-resistant against adversarial input).',
        'Feeding the base-36 STRING from `hashFinalize` back into `hashUpdate` — the streaming state is the 32-bit NUMBER; keep folding numbers with `hashUpdate` and call `hashFinalize` ONCE at the end.',
      ],
      seeAlso: ['createSheet', 'styled'],
    },
    {
      name: 'setStyleExtraction',
      kind: 'function',
      signature:
        'setStyleExtraction(enabled: boolean, rewrite?: (cssText: string, varsOut: Record<string, string>) => string) => void',
      summary:
        'Internal dependency-injection seam for Custom-Property Style Extraction (CPSE). `@pyreon/ui-core`\'s `init({ styleExtraction: true })` calls this to enable CPSE and inject the `cpseRewrite` function — which lives in `@pyreon/unistyle` (styler cannot import unistyle: dep direction), so it is threaded in at init time. When on, the static + SSR resolve path rewrites resolved CSS to hoist per-instance values into custom properties. Apps do NOT call this directly — enable CPSE via the `@pyreon/ui-core` init flag; it is exported only so ui-core can wire it.',
      example: `// Apps enable CPSE through ui-core, not this call:
import { init } from "@pyreon/ui-core"
init({ styleExtraction: true }) // ui-core calls setStyleExtraction under the hood`,
      mistakes: [
        'Calling `setStyleExtraction(true)` directly to turn on CPSE — without the `rewrite` from `@pyreon/unistyle` (which `@pyreon/ui-core` supplies) it enables the branch with no rewriter. Use `init({ styleExtraction: true })` from `@pyreon/ui-core`.',
      ],
      seeAlso: ['styled', 'createSheet'],
    },
  ],
  gotchas: [
    {
      label: 'css / keyframes return lazy values, not strings',
      note: 'The `css` tagged template yields a `CSSResult` (resolved on use); `keyframes` stringifies to an animation NAME; `createGlobalStyle` returns a `ComponentFn` that must be MOUNTED. None of them inject CSS at call time — only on resolution/mount.',
    },
    {
      label: 'Theme context is reactive',
      note: '`useTheme()` is a snapshot; `useThemeAccessor()` is the tracking accessor. `styled` / `useCSS` templates already track the theme through their resolver, so whole-theme swaps re-resolve CSS + swap class names WITHOUT remounting the VNode. Destructuring `useTheme()` and reading outside a reactive scope freezes the value.',
    },
    {
      label: 'Prop forwarding copies descriptors',
      note: '`buildProps` / `filterProps` copy property DESCRIPTORS (not values) so compiler-emitted `_rp` getter props keep their reactive subscription end-to-end. Any custom prop-forwarding wrapper layered on styler MUST do the same — plain `result[k] = src[k]` silently collapses signal-driven props to a one-time snapshot.',
    },
    {
      label: 'Singleton sheet by default',
      note: 'All injection goes through the `sheet` singleton (FNV-1a dedup, SSR). `createSheet()` / `new StyleSheet()` are only for isolated realms (shadow DOM, iframes, test isolation) — mixing sheets for one document breaks dedup.',
    },
    {
      label: 'CSP nonce for strict style-src',
      note: "Under a strict `style-src 'nonce-…'` policy (no `'unsafe-inline'`), the SSR-inlined critical `<style>` needs a nonce or the browser blocks it on first paint (client CSSOM `insertRule` is CSP-exempt regardless). Pass the per-request nonce to `sheet.getStyleTag(nonce)`, or set `createSheet({ nonce })` as a default — both stamp the SSR `<style>` and the client `<style>` element.",
    },
  ],
})
