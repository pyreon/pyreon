import type { VNodeChild } from '@pyreon/core'
import { createReactiveContext, provide, useContext } from '@pyreon/core'
import { computed, signal } from '@pyreon/reactivity'
import { ThemeContext } from '@pyreon/styler'
import type { PyreonTheme } from '@pyreon/unistyle'
import { enrichTheme } from '@pyreon/unistyle'
import { context as coreContext } from './context'

// ─── Types ──────────────────────────────────────────────────────────────────

export type ThemeMode = 'light' | 'dark'
export type ThemeModeInput = ThemeMode | 'system'

export interface PyreonUIProps {
  /** Theme object with breakpoints, rootSize, and custom keys. */
  theme: PyreonTheme
  /**
   * Color mode: "light", "dark", or "system" (follows OS preference).
   * Can be a signal or getter for reactive mode switching.
   * @default "light"
   */
  mode?: ThemeModeInput | (() => ThemeModeInput) | undefined
  /** Flip mode for a nested section (e.g. dark sidebar in light app). */
  inversed?: boolean | undefined
  children?: VNodeChild
}

// ─── System mode detection ──────────────────────────────────────────────────

const _isBrowser = typeof window !== 'undefined' && typeof matchMedia === 'function'

/** Reactive signal tracking the OS dark mode preference. Lazy-initialized on first use. */
let _systemMode: ReturnType<typeof signal<ThemeMode>> | undefined

function getSystemMode(): ReturnType<typeof signal<ThemeMode>> {
  if (_systemMode) return _systemMode

  const prefersDark = _isBrowser && matchMedia('(prefers-color-scheme: dark)').matches
  _systemMode = signal<ThemeMode>(prefersDark ? 'dark' : 'light')

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
  const resolveMode = (): ThemeMode => {
    const mode = props.mode ?? 'light'
    const raw = typeof mode === 'function' ? mode() : mode
    const resolved = raw === 'system' ? getSystemMode()() : raw
    return props.inversed ? INVERSED[resolved] : resolved
  }

  // Wrap in computed for memoization
  const modeComputed = computed(resolveMode)

  // Enrich theme with responsive utilities (__PYREON__).
  //
  // Wrapped in `computed` so that when `props.theme` changes (parent re-renders
  // with a new theme object — e.g. user-preference theme swap), the enriched
  // theme updates and all downstream consumers of ThemeContext / coreContext
  // re-resolve. Components run once, so reading `props.theme` here inside a
  // computed is the reactive hook: if the parent passes a signal-derived
  // theme or re-renders with a different theme value, the computed re-runs.
  //
  // `enrichTheme` builds a fresh `__PYREON__` block each call (media-query
  // helpers, sortedBreakpoints). That's fine — WeakMap caches in rocketstyle
  // and makeItResponsive key on the resulting object identity, which is
  // stable across renders where props.theme hasn't changed.
  const enrichedTheme = computed(() => enrichTheme(props.theme))

  // Provide to all three context layers:

  // 1. Styler ThemeContext — reactive accessor. Styled components read this
  //    inside their resolver effect to re-resolve CSS on theme swap.
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

  return props.children ?? null
}
