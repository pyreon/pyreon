/**
 * Helper for rules that support path-based exemption via options.
 *
 * Rules that need to be "turn-off-able for specific directories" (e.g.
 * a package that IS the foundation the rule recommends against using
 * directly) don't hardcode the paths anymore — they read an
 * `exemptPaths: string[]` option from the user's config:
 *
 *   ```json
 *   // .pyreonlintrc.json
 *   {
 *     "rules": {
 *       "pyreon/no-window-in-ssr": [
 *         "error",
 *         { "exemptPaths": ["packages/core/runtime-dom/"] }
 *       ]
 *     }
 *   }
 *   ```
 *
 * Each entry is substring-matched against the file path (same convention
 * the old hardcoded patterns used). Empty / missing → no exemptions,
 * which is the correct default for a rule shipping to user apps.
 */

import type { RuleContext } from '../types'

/**
 * The matcher itself, over already-resolved options.
 *
 * Separate from {@link isPathExempt} because the runner applies exemption for
 * EVERY rule, centrally, at a point where no `RuleContext` exists yet — and a
 * second copy of this loop there would be a drift risk between "what the
 * runner skips" and "what a rule thinks is exempt". One implementation, two
 * entry points.
 */
export function matchesExemptPath(raw: unknown, filePath: string): boolean {
  if (!Array.isArray(raw) || raw.length === 0) return false
  for (const entry of raw) {
    if (typeof entry === 'string' && entry.length > 0 && filePath.includes(entry)) {
      return true
    }
  }
  return false
}

export function isPathExempt(ctx: RuleContext): boolean {
  return matchesExemptPath(ctx.getOptions().exemptPaths, ctx.getFilePath())
}
