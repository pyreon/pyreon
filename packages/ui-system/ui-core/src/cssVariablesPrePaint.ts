import { resolveCssVariables } from './config'

export interface CssVariablesPrePaintOptions {
  /**
   * Mode attribute to set on `document.documentElement`. Defaults to the
   * resolved `init({ cssVariables })` attribute (`'data-theme'`).
   */
  attribute?: string
  /**
   * localStorage key a persisted user toggle is stored under. Defaults to
   * `'zero-theme'` (the `@pyreon/zero` convention). Values `'light'` /
   * `'dark'` win; anything else falls back to the system preference.
   */
  storageKey?: string
  /**
   * Mode to use when there is no stored preference AND the system query is
   * unavailable. Defaults to `'light'`.
   */
  fallback?: 'light' | 'dark'
}

/**
 * Build the blocking pre-paint script that sets the CSS-variables mode
 * attribute on `document.documentElement` BEFORE first paint — the standard
 * dark-mode FOUC fix.
 *
 * Inject the returned string as a synchronous `<script>` in `<head>` (it
 * must run before the body paints). It reads a persisted toggle from
 * localStorage, else the OS `prefers-color-scheme`, else `fallback`, and
 * writes the attribute at `:root` — exactly where the var rules cascade
 * from and where the ROOT `PyreonUI` writes after hydration, so the two
 * agree and there is no flash for `mode="system"` or a persisted toggle.
 *
 * (Explicit hardcoded `mode="dark"` with SSR and NO stored preference is the
 * one case this can't cover — the mode lives only in the app's JSX, unknown
 * to a pre-paint script; stamp `<html data-theme="dark">` server-side for
 * that, or store the preference.)
 *
 * Self-contained, dependency-free, try/catch-wrapped (a storage/matchMedia
 * throw must never block paint). Safe to inline verbatim.
 *
 * @example
 * // zero injects this automatically when init({ cssVariables: true }).
 * const script = cssVariablesPrePaintScript()
 * // <script>{script}</script> in <head>
 */
export function cssVariablesPrePaintScript(options: CssVariablesPrePaintOptions = {}): string {
  const attribute = options.attribute ?? resolveCssVariables().attribute
  const storageKey = options.storageKey ?? 'zero-theme'
  const fallback = options.fallback ?? 'light'
  // JSON.stringify keeps the embedded strings safe inside the inline script.
  const attr = JSON.stringify(attribute)
  const key = JSON.stringify(storageKey)
  const fb = JSON.stringify(fallback)
  return (
    `(function(){try{` +
    `var s=localStorage.getItem(${key});` +
    `var m=s==="light"||s==="dark"?s:` +
    `(window.matchMedia&&window.matchMedia("(prefers-color-scheme:dark)").matches?"dark":${fb});` +
    `document.documentElement.setAttribute(${attr},m)` +
    `}catch(e){}})()`
  )
}
