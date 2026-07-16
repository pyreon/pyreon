import type { VNodeChild } from '@pyreon/core'
import {
  createContext,
  createReactiveContext,
  h,
  nativeCompat,
  provide,
  useContext,
} from '@pyreon/core'
import { computed, effect, isClient, signal } from '@pyreon/reactivity'
import { setStyleExtraction, sheet, ThemeContext } from '@pyreon/styler'
import type { PyreonTheme } from '@pyreon/unistyle'
import { cpseRewrite, enrichTheme, themeToCssVars } from '@pyreon/unistyle'
import { resolveCssVariables, resolveStyleExtraction } from './config'
import { context as coreContext } from './context'

// Structural flag distinguishing the ROOT PyreonUI from a NESTED one (a
// plain context, not reactive — nesting is fixed at mount). In cssVariables
// mode the root writes the mode attribute to `document.documentElement`
// (so it sits at `:root`, where the pre-paint FOUC script also writes and
// where the var rules cascade from), while nested / `inversed` providers
// render a `display: contents` wrapper that scopes an override to their
// subtree. Putting the root on a wrapper instead would let the wrapper —
// a closer ancestor than `<html>` — defeat a pre-paint script that can
// only reach `document.documentElement` before the in-body wrapper parses.
const PyreonUINestedContext = createContext(false)

// ─── Types ──────────────────────────────────────────────────────────────────

export type ThemeMode = 'light' | 'dark'
export type ThemeModeInput = ThemeMode | 'system'

export interface PyreonUIProps {
  /**
   * Theme object with breakpoints, rootSize, and custom keys.
   *
   * Optional — when omitted, the theme is INHERITED from the nearest
   * ancestor PyreonUI. This makes nested `<PyreonUI inversed>` work
   * without re-passing the theme:
   *
   * ```tsx
   * <PyreonUI theme={appTheme}>
   *   <Header />
   *   <PyreonUI inversed>  // inherits appTheme, just flips mode
   *     <DarkSidebar />
   *   </PyreonUI>
   * </PyreonUI>
   * ```
   *
   * At the OUTERMOST PyreonUI with no ancestor, the provided ThemeContext
   * value falls back to the default `{}` (styled components see fields as
   * undefined; no crash). Pass a real theme at the outermost PyreonUI to
   * avoid that.
   */
  theme?: PyreonTheme | undefined
  /**
   * Color mode: "light", "dark", or "system" (follows OS preference).
   * Can be a signal or getter for reactive mode switching.
   *
   * When omitted, mode is INHERITED from the nearest ancestor PyreonUI
   * (or `'light'` at the root).
   */
  mode?: ThemeModeInput | (() => ThemeModeInput) | undefined
  /**
   * Flip mode for a nested section (e.g. dark sidebar in light app).
   * Scoped — only affects DESCENDANTS of this PyreonUI; ancestors and
   * siblings see the original mode unchanged.
   */
  inversed?: boolean | undefined
  children?: VNodeChild
}

// ─── System mode detection ──────────────────────────────────────────────────

// `isClient` is the canonical DOM-present guard; `matchMedia` is an extra
// FEATURE check (system color-scheme needs it), kept rather than folded in.
const _isBrowser = isClient && typeof matchMedia === 'function'

/** Reactive signal tracking the OS dark mode preference. Lazy-initialized on first use. */
let _systemMode: ReturnType<typeof signal<ThemeMode>> | undefined

function getSystemMode(): ReturnType<typeof signal<ThemeMode>> {
  if (_systemMode) return _systemMode

  // Ternary (not `&&`) so the typeof-derived `_isBrowser` guard is
  // statically verifiable as protecting the `matchMedia` access — same
  // runtime value (`false` on the server), SSR-safe + analyzer-clear.
  /* v8 ignore next 3 — `_isBrowser` is always true in tests (happy-dom + matchMedia); SSR branch covered by typeof guard */
  const prefersDark = _isBrowser
    ? matchMedia('(prefers-color-scheme: dark)').matches
    : false
  _systemMode = signal<ThemeMode>(prefersDark ? 'dark' : 'light')

  /* v8 ignore next 5 — same SSR/typeof gate as above */
  if (_isBrowser) {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      _systemMode?.set(e.matches ? 'dark' : 'light')
    })
  }

  return _systemMode
}

// ─── Mode context ───────────────────────────────────────────────────────────

/** Reactive context — useContext(ModeContext) returns () => ThemeMode. */
const ModeContext = createReactiveContext<ThemeMode>('light')

const INVERSED: Record<ThemeMode, ThemeMode> = { light: 'dark', dark: 'light' }

/**
 * Read the resolved color mode ("light" | "dark") from the nearest PyreonUI.
 * Reactive — updates when the mode prop changes or when OS preference changes
 * (if mode="system").
 *
 * @example
 * const mode = useMode() // "light" | "dark"
 */
export function useMode(): ThemeMode {
  return useContext(ModeContext)()
}

// ─── Auto-init ──────────────────────────────────────────────────────────────

let _autoInitDone = false

function autoInit(): void {
  if (_autoInitDone) return
  _autoInitDone = true
}

// ─── PyreonUI ───────────────────────────────────────────────────────────────

/**
 * Unified provider for the Pyreon UI system.
 *
 * Replaces the need for separate UnistyleProvider, RocketstyleProvider,
 * and ThemeProvider — one component, zero init.
 *
 * Mode can be a static string OR a signal/getter for reactive switching:
 * ```tsx
 * // Static
 * <PyreonUI theme={theme} mode="dark">
 *
 * // Reactive signal
 * const mode = signal<ThemeModeInput>("light")
 * <PyreonUI theme={theme} mode={mode}>
 *
 * // System (follows OS preference)
 * <PyreonUI theme={theme} mode="system">
 * ```
 */
function PyreonUI(props: PyreonUIProps): VNodeChild {
  autoInit()

  // IMPORTANT: do NOT destructure props. Components run once in Pyreon, and
  // destructuring captures values at setup time — losing reactivity. Reading
  // `props.mode` / `props.inversed` lazily inside `resolveMode()` lets the
  // computed re-evaluate when the underlying reactive props change (parent
  // re-renders with a different value, or signal-driven mode toggling).
  //
  // Previously this destructured `{ theme, mode = 'light', inversed, children }`
  // which made `inversed` permanently static — toggling inversed in a parent
  // had no effect because the local boolean was captured once. See
  // `.claude/rules/anti-patterns.md` "Destructuring props" entry.

  // Create a reactive mode getter that resolves "system" and applies inversion.
  // This getter is provided via context — consumers read it lazily in their
  // own reactive scopes, so mode changes propagate automatically.
  //
  // When `inversed` is set without an explicit `mode`, inherit the parent's
  // mode and flip it. This makes nested `<PyreonUI inversed>` work reactively:
  // outer light → inner dark, outer dark → inner light.
  //
  // useContext(ModeContext) returns the reactive accessor from the nearest
  // parent PyreonUI. At root level (no parent), the ReactiveContext default
  // returns 'light'. This read is TRACKED inside the computed below, so when
  // the parent's mode changes, this child's computed re-evaluates.
  const parentModeAccessor = useContext(ModeContext)
  // Same shape for theme — useContext(ThemeContext) is a reactive accessor.
  // When `props.theme` is omitted, we provide the parent's theme through
  // verbatim (already enriched at the level it was provided). Re-enriching
  // would be idempotent but wasteful, AND would replace the parent's exact
  // `__PYREON__` reference, which downstream identity-keyed caches (styler's
  // class cache, rocketstyle's per-definition WeakMaps) rely on for hits.
  // Pass-through preserves identity.
  const parentThemeAccessor = useContext(ThemeContext)
  const resolveMode = (): ThemeMode => {
    const mode = props.mode
    let resolved: ThemeMode
    if (mode === undefined || mode === null) {
      // No explicit mode — inherit from parent context
      resolved = parentModeAccessor()
    } else {
      const raw = typeof mode === 'function' ? mode() : mode
      resolved = raw === 'system' ? getSystemMode()() : raw
    }
    return props.inversed ? INVERSED[resolved] : resolved
  }

  // Wrap in computed for memoization
  const modeComputed = computed(resolveMode)

  // Enrich theme — wrapped in computed so user-preference theme swaps
  // propagate. The enrichment itself is cheap (builds a __PYREON__ block).
  //
  // When `props.theme` is omitted, return the parent's theme verbatim
  // (already enriched). Without this, `enrichTheme(undefined)` would
  // destructure undefined and throw — but the throw happens LAZILY (the
  // computed is only read when a child consumes ThemeContext), so the
  // failure mode is the cryptic dev-mode warning
  // `[pyreon] Unhandled effect error: TypeError: Cannot destructure property
  // 'breakpoints' of 'theme' as it is undefined`
  // followed by every styled descendant rendering with an empty theme.
  // That's what made the user's nested `<PyreonUI inversed>` "look like
  // inversed wasn't working" — the whole subtree was broken.
  // Resolved once at setup — the cssVariables switch is a boot-time contract
  // (set via init() before the first render); theme-resolution caches across
  // the ui-system assume it does not flip mid-session.
  const cssVars = resolveCssVariables()

  // Wire CPSE into styler's default pipeline when opted in
  // (`init({ styleExtraction: true })`). styler can't import unistyle (dep
  // direction), so the root provider injects `cpseRewrite` here. Boot-time
  // contract; flag-off (default) leaves the classic path byte-identical.
  if (resolveStyleExtraction()) setStyleExtraction(true, cpseRewrite)

  const enrichedTheme = computed(() => {
    const t = props.theme
    if (t === undefined || t === null) return parentThemeAccessor()
    const enriched = enrichTheme(t)
    if (!cssVars.enabled) return enriched
    // CSS-variables mode: every eligible theme leaf becomes a 'var(--px-…)'
    // string and the :root block is injected ONCE per theme identity
    // (injectRules is idempotent by key and SSR-aware — on the server the
    // block lands in the ssrBuffer that getStyleTag()/the stream flush emit).
    // Downstream consumers (styler templates, rocketstyle callbacks, the
    // unistyle value pipeline) read the var references verbatim, so a mode
    // flip never re-resolves any of them.
    const { vars, css: varsCss } = themeToCssVars(enriched, { prefix: cssVars.prefix })
    if (varsCss) sheet.injectRules([varsCss], varsCss)
    // Same tree shape; leaves are var() reference strings — every theme
    // value position accepts strings, so the widened leaf type is safe.
    return vars as unknown as ReturnType<typeof enrichTheme>
  })

  // Provide to all three context layers:

  // 1. Styler ThemeContext — reactive accessor. DynamicStyled reads this
  //    inside its computed() to re-resolve CSS on theme swap.
  provide(ThemeContext, () => enrichedTheme())

  // 2. Core context — provide a reactive getter function.
  //    coreContext is a ReactiveContext, so provide(() => value).
  //    Rocketstyle reads mode/isDark/isLight by calling the getter.
  //
  //    LAZY getters (not eager fields) are load-bearing: reading `.theme`
  //    must NOT transitively subscribe to `modeComputed`. With eager fields
  //    (`{ theme: enrichedTheme(), mode: modeComputed() }`) the object
  //    construction reads modeComputed(), so ANY consumer touching `.theme`
  //    re-runs on every mode flip — even under cssVariables, where component
  //    resolution is supposed to be mode-free (the flip is an attribute write,
  //    the cascade does the rest). Getters defer each read: a component that
  //    reads only `.theme` subscribes only to `enrichedTheme` (stable on flip
  //    → no re-run); classic-mode resolution that reads `.mode` still
  //    subscribes to `modeComputed` (re-runs on flip → correct).
  provide(coreContext, () => ({
    get theme() {
      return enrichedTheme()
    },
    get mode() {
      return modeComputed()
    },
    get isDark() {
      return modeComputed() === 'dark'
    },
    get isLight() {
      return modeComputed() === 'light'
    },
  }))

  // 3. Mode context — getter function for useMode()
  provide(ModeContext, () => modeComputed())

  if (!cssVars.enabled) return props.children ?? null

  // Is this the ROOT PyreonUI (no PyreonUI ancestor) or a NESTED one?
  const isNested = useContext(PyreonUINestedContext)
  // Descendants are nested under us regardless.
  provide(PyreonUINestedContext, true)

  if (!isNested) {
    // ROOT, cssVariables mode: drive the mode attribute on
    // `document.documentElement` so it lives at `:root` — where the var
    // rules cascade from AND where a pre-paint FOUC script writes before
    // first paint. The effect keeps it in sync with reactive mode changes
    // (toggles, system-pref flips) after hydration; the flip is one
    // attribute write, zero re-resolution, zero className churn. SSR can't
    // touch `document` — there, first-paint correctness comes from the
    // pre-paint script (system/persisted) or an explicit `<html>` stamp;
    // see `cssVariablesPrePaintScript`. No wrapper at the root: a wrapper
    // would be a closer ancestor than `<html>` and defeat that script.
    if (isClient) {
      // Intentional reactive DOM sync: this MUST re-run whenever modeComputed
      // changes (toggle / system-pref flip), so onMount (runs once) cannot do
      // it — same shape as the framework's own renderEffect/_bind DOM writes.
      // It's a one-line attribute write, not the fetch/timer imperative-work
      // the rule guards against.
      // pyreon-lint-disable-next-line pyreon/no-imperative-effect-on-create
      effect(() => {
        document.documentElement.setAttribute(cssVars.attribute, modeComputed())
      })
    }
    return props.children ?? null
  }

  // NESTED / `inversed` cssVariables provider: render a layout-neutral
  // wrapper carrying the mode attribute. The cascade does the rest —
  // `[data-theme="dark"]` re-resolves every mode-pair var for THIS subtree
  // only, so a scoped dark/light section is one attribute write with zero
  // re-resolution and zero className churn. Server-rendered too.
  return h(
    'div',
    {
      style: 'display: contents',
      [cssVars.attribute]: () => modeComputed(),
    },
    props.children ?? null,
  )
}

// Mark as native — compat-mode jsx() runtimes skip wrapCompatComponent so
// PyreonUI's three provide() calls + useContext(ModeContext) read run inside
// Pyreon's setup frame. Critical for compat-mode apps that wrap their tree
// with <PyreonUI> at the top level — without the marker, theme/mode never
// propagate to descendants.
// ASSIGNMENT + /* @__PURE__ */ form (not a bare statement): inside a built
// lib's shared chunk a bare `nativeCompat(X)` call is an unremovable side
// effect that RETAINS the component body in every consumer bundle that
// never imports it (see runtime-dom's native-compat-treeshake lock). The
// PURE call is droppable exactly when the export is unused; when used it
// returns the SAME fn with the marker applied.
const _PyreonUI = /* @__PURE__ */ nativeCompat(PyreonUI)
export { _PyreonUI as PyreonUI }