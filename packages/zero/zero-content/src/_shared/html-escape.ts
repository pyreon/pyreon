// ─── HTML / attribute escape — shared helpers ──────────────────────────────
//
// Multiple consumers historically inlined near-identical 3-5 char
// entity replacements:
//
//   - `pipeline/emit-jsx.ts:escapeHtml` (3-char: & < >)
//   - `pipeline/remark-plugins/callout.ts:escapeAttr` (4-char: & " < >)
//
// Single source-of-truth here. `escapeHtmlText` for text content (no
// quote handling needed — quotes are safe in CDATA), `escapeHtmlAttr`
// for HTML-attribute values (quote escape required).
//
// Performance note: the chained `.replace(/&/g, ...)` shape is
// idiomatic + fast for short strings (the dominant case in markdown
// output — heading text, attribute values). A single regex with a
// lookup table is marginally faster for very long strings but the
// readability cost isn't worth it at our scale.

/**
 * Escape `&`, `<`, `>` for use as HTML text content. Suitable for
 * markdown body text and code-block content. Does NOT escape quotes
 * — use {@link escapeHtmlAttr} when the output sits inside `attr="..."`.
 *
 * @internal exported for testing
 */
export function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Escape `&`, `"`, `<`, `>` for use inside a double-quoted HTML
 * attribute value. Adds quote escaping over {@link escapeHtmlText}.
 *
 * @internal exported for testing
 */
export function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
