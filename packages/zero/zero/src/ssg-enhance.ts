/**
 * Phase 6 — per-page SSG output enhancements. Pure functions (unit-tested
 * directly) applied by the SSG plugin at page-composition time:
 *
 *  - `injectSpeculationRules` — Chrome's Speculation Rules API: a
 *    `<script type="speculationrules">` document-rules block that
 *    prefetches (or fully prerenders) same-origin links at moderate
 *    eagerness. Near-instant MPA navigations; unsupported browsers ignore
 *    the block (progressive enhancement). Complements the router's
 *    `prefetch="intent"` (which warms the SPA path).
 *  - `injectViewTransitions` — cross-document View Transitions opt-in
 *    (`@view-transition { navigation: auto }`): MPA navigations between
 *    prerendered pages animate with zero JS.
 *  - `extractStylerStyleTag` — pulls the styler's inline `<style
 *    data-pyreon-styler>` tag out of a rendered head so `cssMode: 'asset'`
 *    can write the rule set ONCE as a content-hashed file and link it from
 *    every page instead of re-shipping the full sheet inline per page.
 */

export type SpeculationMode = 'prefetch' | 'prerender'

/**
 * Inject a document-rules speculation block before `</head>`. `where:
 * href_matches "/*"` covers same-origin links; `eagerness: "moderate"`
 * fires on pointerdown/hover — the conservative default Chrome recommends
 * for blanket rules (`conservative` waits for pointerdown only;
 * `eager` prefetches everything in view, which can be wasteful).
 */
export function injectSpeculationRules(html: string, mode: SpeculationMode): string {
  if (!html.includes('</head>')) return html
  const rules = JSON.stringify({
    [mode]: [{ where: { href_matches: '/*' }, eagerness: 'moderate' }],
  })
  return html.replace(
    '</head>',
    `<script type="speculationrules">${rules}</script></head>`,
  )
}

/** Inject the cross-document View Transitions opt-in before `</head>`. */
export function injectViewTransitions(html: string): string {
  if (!html.includes('</head>')) return html
  return html.replace(
    '</head>',
    '<style>@view-transition{navigation:auto}</style></head>',
  )
}

/**
 * Extract the styler's `<style data-pyreon-styler ...>css</style>` tag from
 * a rendered head string. Returns the bare CSS text + the head WITHOUT the
 * tag, or `null` when no styler tag is present (no styler in the project,
 * or an empty sheet — `renderPage` already skips empty tags).
 *
 * Linear `indexOf` scanning, NOT a regex — the CSS body is arbitrary user
 * content (the polynomial-ReDoS class CodeQL flags on `<style>[\s\S]*?<`
 * shapes; same rationale as `splitSubsetBlocks` in font.ts).
 */
export function extractStylerStyleTag(
  head: string,
): { css: string; head: string } | null {
  const openIdx = head.indexOf('<style data-pyreon-styler')
  if (openIdx === -1) return null
  const openEnd = head.indexOf('>', openIdx)
  if (openEnd === -1) return null
  const closeIdx = head.indexOf('</style>', openEnd)
  if (closeIdx === -1) return null
  const css = head.slice(openEnd + 1, closeIdx)
  const rest =
    head.slice(0, openIdx) + head.slice(closeIdx + '</style>'.length)
  // The styler tag is emitted as `${tag}\n${headTags}` by renderPage —
  // trim a leading newline left behind so heads stay byte-tidy.
  return { css, head: rest.startsWith('\n') ? rest.slice(1) : rest }
}

/**
 * FNV-1a over the CSS text → 8-hex content hash for the shared asset
 * filename (`pyreon-ssg.<hash>.css`). Same hash family the styler itself
 * uses for class names; collisions are content-addressing-grade unlikely
 * at one-file-per-build scale, and a collision is harmless anyway (same
 * build, same content).
 */
export function hashCss(css: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < css.length; i++) {
    hash ^= css.charCodeAt(i)
    hash = (hash * 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}
