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

export function isPathExempt(ctx: RuleContext): boolean {
  const options = ctx.getOptions()
  const raw = options.exemptPaths
  if (!Array.isArray(raw) || raw.length === 0) return false
  const filePath = ctx.getFilePath()
  for (const entry of raw) {
    if (typeof entry === 'string' && entry.length > 0 && filePath.includes(entry)) {
      return true
    }
  }
  return false
}
