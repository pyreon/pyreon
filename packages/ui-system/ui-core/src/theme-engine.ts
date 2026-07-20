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

/**
 * @internal Registers the theme engine. Called by `@pyreon/unistyle` at module
 * load — user code never calls this.
 */
export function setThemeEngine(engine: ThemeEngine): void {
  _engine = engine
}

/**
 * @internal Reads the registered theme engine for `<PyreonUI>`. Throws with
 * guidance if `@pyreon/unistyle` isn't in the module graph (it always is in a
 * real app — every styled `@pyreon` UI package pulls it in).
 */
export function getThemeEngine(): ThemeEngine {
  if (_engine === null) {
    throw new Error(
      '[Pyreon] <PyreonUI> needs the theme engine from @pyreon/unistyle, but it was not registered. ' +
        'Import "@pyreon/unistyle" somewhere in your app (any @pyreon UI component package pulls it in transitively).',
    )
  }
  return _engine
}
