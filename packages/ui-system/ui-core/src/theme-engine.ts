import type { setStyleExtraction } from '@pyreon/styler'

/**
 * The theme-normalization engine (`enrichTheme` / `themeToCssVars` /
 * `cpseRewrite`) lives in `@pyreon/unistyle` — it's built on unistyle's own
 * responsive machinery. `<PyreonUI>` (here in the base `@pyreon/ui-core`)
 * needs it, but ui-core is the FOUNDATION of the ui-system layer and must NOT
 * depend on unistyle: unistyle depends on ui-core (`config`/`context`/…), so a
 * `ui-core → unistyle` edge is a cycle.
 *
 * The break follows the repo's established anti-cycle convention — a
 * registration seam (cf. `@pyreon/router`'s `_setDefaultChromeLayout`,
 * `@pyreon/styler`'s `setStyleExtraction`, `@pyreon/core`'s
 * `setSnapshotCapture`): `@pyreon/unistyle` REGISTERS its engine here at
 * module load, and `<PyreonUI>` reads it via `getThemeEngine()`. ui-core keeps
 * ZERO dependency on unistyle; the graph is acyclic (unistyle → ui-core only).
 */

/**
 * Theme object with breakpoints, rootSize, and custom keys. The canonical
 * definition lives here (the ui-system base) so `@pyreon/unistyle` and
 * `@pyreon/ui-core` agree on it without a dependency cycle; `@pyreon/unistyle`
 * re-exports it for back-compat.
 */
export type PyreonTheme = {
  rootSize?: number
  breakpoints?: Record<string, number>
  __PYREON__?: {
    sortedBreakpoints: string[] | undefined
    // oxlint-disable-next-line typescript/no-explicit-any
    media: Record<string, (...args: any[]) => any> | undefined
  }
} & Record<string, unknown>

/** The theme engine `@pyreon/unistyle` registers, consumed by `<PyreonUI>`. */
export interface ThemeEngine {
  enrichTheme: (theme: PyreonTheme) => PyreonTheme
  themeToCssVars: (
    theme: PyreonTheme,
    opts?: { prefix?: string | undefined },
  ) => { vars: Record<string, unknown>; css: string }
  // Same shape `@pyreon/styler`'s `setStyleExtraction` expects for its rewrite
  // fn — `<PyreonUI>` passes it straight through, so reuse styler's type and
  // ui-core never needs unistyle's `cpse` types.
  cpseRewrite: Parameters<typeof setStyleExtraction>[1]
}

let _engine: ThemeEngine | null = null
let _warnedFallback = false

// Minimal, no-op engine used when `@pyreon/unistyle` is NOT in the module graph.
// It keeps `<PyreonUI>` FUNCTIONAL (theme passes through un-enriched, no CSS
// variables, no CPSE) instead of throwing — a real app that renders PyreonUI
// through only `@pyreon/rocketstyle` (which doesn't pull unistyle) must not
// crash. When unistyle loads it registers the real engine, which wins.
const FALLBACK_ENGINE: ThemeEngine = {
  enrichTheme: (theme) => theme,
  themeToCssVars: () => ({ vars: {}, css: '' }),
  cpseRewrite: ((fragment: string) => fragment) as ThemeEngine['cpseRewrite'],
}

/**
 * @internal Registers the theme engine. Called by `@pyreon/unistyle` at module
 * load — user code never calls this.
 */
export function setThemeEngine(engine: ThemeEngine): void {
  _engine = engine
}

/**
 * @internal Reads the theme engine for `<PyreonUI>`. Returns the engine
 * `@pyreon/unistyle` registered at module load; if unistyle isn't in the graph,
 * returns a minimal FALLBACK (identity enrich, no CSS vars, no CPSE) + warns
 * ONCE in dev — so PyreonUI degrades gracefully rather than crashing. Import
 * `@pyreon/unistyle` for full theming (default breakpoints/spacing, CSS
 * variables, CPSE); every styled `@pyreon` UI package except bare rocketstyle
 * pulls it in transitively.
 */
export function getThemeEngine(): ThemeEngine {
  if (_engine === null) {
    if (process.env.NODE_ENV !== 'production' && !_warnedFallback) {
      _warnedFallback = true
      console.warn(
        '[Pyreon] <PyreonUI> is using a minimal fallback theme engine because ' +
          '@pyreon/unistyle is not loaded — theme enrichment (default ' +
          'breakpoints/spacing), CSS variables, and CPSE are disabled. Import ' +
          '"@pyreon/unistyle" for full theming.',
      )
    }
    return FALLBACK_ENGINE
  }
  return _engine
}
