import type { VNodeChild } from "@pyreon/core"
import { createContext, provide, useContext } from "@pyreon/core"
import { signal } from "@pyreon/reactivity"
import { ThemeContext } from "@pyreon/styler"
import type { PyreonTheme } from "@pyreon/unistyle"
import { enrichTheme } from "@pyreon/unistyle"
import { context as coreContext } from "./context"

// ─── Types ──────────────────────────────────────────────────────────────────

export type ThemeMode = "light" | "dark"
export type ThemeModeInput = ThemeMode | "system"

export interface PyreonUIProps {
  /** Theme object with breakpoints, rootSize, and custom keys. */
  theme: PyreonTheme
  /**
   * Color mode: "light", "dark", or "system" (follows OS preference).
   * @default "light"
   */
  mode?: ThemeModeInput | undefined
  /** Flip mode for a nested section (e.g. dark sidebar in light app). */
  inversed?: boolean | undefined
  children?: VNodeChild
}

// ─── System mode detection ──────────────────────────────────────────────────

const _isBrowser = typeof window !== "undefined" && typeof matchMedia === "function"

/** Reactive signal tracking the OS dark mode preference. Lazy-initialized on first use. */
let _systemMode: ReturnType<typeof signal<ThemeMode>> | undefined

function getSystemMode(): ReturnType<typeof signal<ThemeMode>> {
  if (_systemMode) return _systemMode

  const prefersDark = _isBrowser && matchMedia("(prefers-color-scheme: dark)").matches
  _systemMode = signal<ThemeMode>(prefersDark ? "dark" : "light")

  if (_isBrowser) {
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
      _systemMode!.set(e.matches ? "dark" : "light")
    })
  }

  return _systemMode
}

// ─── Mode context ───────────────────────────────────────────────────────────

const ModeContext = createContext<ThemeMode>("light")

const INVERSED: Record<ThemeMode, ThemeMode> = { light: "dark", dark: "light" }

/**
 * Read the resolved color mode ("light" | "dark") from the nearest PyreonUI.
 * Reactive — updates when the mode prop changes or when OS preference changes
 * (if mode="system").
 *
 * @example
 * const mode = useMode() // "light" | "dark"
 */
export function useMode(): ThemeMode {
  return useContext(ModeContext)
}

// ─── Auto-init ──────────────────────────────────────────────────────────────

let _autoInitDone = false

/**
 * Ensure the CSS engine is initialized. If init() was called manually,
 * this is a no-op. Otherwise, imports @pyreon/styler defaults.
 * Called once on first PyreonUI mount.
 */
function autoInit(): void {
  if (_autoInitDone) return
  _autoInitDone = true

  // config already has styler defaults from the import in config.ts,
  // so no lazy import needed — the CSS engine is ready.
  // If the user called init() with a custom engine, those values are
  // already set and we respect them.
}

// ─── PyreonUI ───────────────────────────────────────────────────────────────

/**
 * Unified provider for the Pyreon UI system.
 *
 * Replaces the need for separate UnistyleProvider, RocketstyleProvider,
 * and ThemeProvider — one component, zero init.
 *
 * @example
 * ```tsx
 * <PyreonUI theme={{ rootSize: 16, breakpoints: { xs: 0, sm: 576, md: 768 } }} mode="system">
 *   <App />
 * </PyreonUI>
 * ```
 */
export function PyreonUI({ theme, mode = "light", inversed, children }: PyreonUIProps): VNodeChild {
  autoInit()

  // Resolve mode: "system" → track OS preference, "light"/"dark" → use directly
  let resolvedMode: ThemeMode
  if (mode === "system") {
    resolvedMode = getSystemMode()()
  } else {
    resolvedMode = mode
  }

  // Apply inversion for nested dark/light sections
  if (inversed) {
    resolvedMode = INVERSED[resolvedMode]
  }

  // Enrich theme with responsive utilities (__PYREON__)
  const enrichedTheme = enrichTheme(theme)

  // Provide to all three context layers:

  // 1. Styler ThemeContext — for styled() components and useTheme()
  provide(ThemeContext, enrichedTheme)

  // 2. Core context — for elements, attrs, coolgrid, rocketstyle
  //    Includes mode + isDark/isLight for rocketstyle dimension resolution
  provide(coreContext, {
    theme: enrichedTheme,
    mode: resolvedMode,
    isDark: resolvedMode === "dark",
    isLight: resolvedMode === "light",
  })

  // 3. Mode context — for useMode() hook
  provide(ModeContext, resolvedMode)

  return children ?? null
}
