import type { VNodeChild } from '@pyreon/core'
import { createReactiveContext, h, nativeCompat, provide, useContext } from '@pyreon/core'
import { computed, isClient, signal } from '@pyreon/reactivity'
import { sheet, ThemeContext } from '@pyreon/styler'
import type { PyreonTheme } from '@pyreon/unistyle'
import { enrichTheme, themeToCssVars } from '@pyreon/unistyle'
import { resolveCssVariables } from './config'
import { context as coreContext } from './context'

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
export function PyreonUI(props: PyreonUIProps): VNodeChild {
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
  provide(coreContext, () => ({
    theme: enrichedTheme(),
    mode: modeComputed(),
    isDark: modeComputed() === 'dark',
    isLight: modeComputed() === 'light',
  }))

  // 3. Mode context — getter function for useMode()
  provide(ModeContext, () => modeComputed())

  if (!cssVars.enabled) return props.children ?? null

  // CSS-variables mode: render a layout-neutral wrapper carrying the mode
  // attribute. The cascade does the rest — `[data-theme="dark"]` re-resolves
  // every mode-pair var for THIS subtree, so dark/light (incl. nested
  // `inversed` providers) is one attribute write with zero re-resolution and
  // zero className churn. Server-rendered too, so SSR/SSG ship the right
  // mode with no client fixup.
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
nativeCompat(PyreonUI)
