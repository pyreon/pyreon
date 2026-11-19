/**
 * Replace a set of rules a caller OWNS in a live `CSSStyleSheet` with new rule
 * text, keeping their cascade position: the new rules go where the first old
 * one sat (or at the end the first time). Returns the inserted rule objects,
 * which stay valid across other rules' `deleteRule()` reindexing, for the next
 * replacement. A rule something else already removed is skipped; a rule the
 * browser rejects is skipped with a dev warning.
 */
export function replaceLiveRules(
  sheet: CSSStyleSheet,
  previous: readonly CSSRule[],
  rules: readonly string[],
): CSSRule[] {
  let at = sheet.cssRules.length
  for (const rule of previous) {
    const idx = Array.prototype.indexOf.call(sheet.cssRules, rule) as number
    if (idx >= 0) {
      sheet.deleteRule(idx)
      at = Math.min(at, idx)
    }
  }
  const inserted: CSSRule[] = []
  for (const rule of rules) {
    try {
      sheet.insertRule(rule, at)
      inserted.push(sheet.cssRules[at] as CSSRule)
      at++
    } catch (_e) {
      if (process.env.NODE_ENV !== 'production') {
        // oxlint-disable-next-line no-console
        console.warn('[styler] failed to insert rule:', rule, _e)
      }
    }
  }

  return inserted
}
