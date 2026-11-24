/**
 * The string/comment/url-aware scanners the stylesheet uses to split CSS, and
 * `splitAtRules`, which turns one component's CSS into its top-level rules.
 * Pure functions: no sheet state.
 */

/**
 * Skip a quoted string starting at `i` (the opening quote). Returns the
 * index just past the closing quote. Backslash escapes are honored; an
 * unterminated string runs to end-of-input.
 */
export function skipQuoted(css: string, i: number): number {
  const quote = css.charCodeAt(i)
  const len = css.length
  let j = i + 1
  while (j < len) {
    const c = css.charCodeAt(j)
    if (c === 92 /* \ */) {
      j += 2
      continue
    }
    if (c === quote) return j + 1
    j++
  }

  return len
}

/**
 * True when `css` has a `url(` token starting at `i` (case-insensitive)
 * that is NOT the tail of a longer ident (`image-url(`, `burl(` are plain
 * functions, not url tokens — only url tokens may contain unquoted braces).
 */
export function isUrlOpen(css: string, i: number): boolean {
  if ((css.charCodeAt(i) | 32) !== 117 /* u */) return false
  if ((css.charCodeAt(i + 1) | 32) !== 114 /* r */) return false
  if ((css.charCodeAt(i + 2) | 32) !== 108 /* l */) return false
  if (css.charCodeAt(i + 3) !== 40 /* ( */) return false
  if (i > 0) {
    const p = css.charCodeAt(i - 1)
    const isIdent =
      (p >= 48 && p <= 57) /* 0-9 */ ||
      (p >= 65 && p <= 90) /* A-Z */ ||
      (p >= 97 && p <= 122) /* a-z */ ||
      p === 45 /* - */ ||
      p === 95 /* _ */
    if (isIdent) return false
  }

  return true
}

/**
 * A NAMED `@layer <name> {` block opener, matched at the scan position. A
 * `@layer` block written inside a component's CSS is hoisted to that top-level
 * layer (see `splitAtRules`); anonymous blocks and ordering statements are not.
 */
const NESTED_LAYER_OPEN_RE = /@layer\s+([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)\s*\{/y

/** A rule hoisted out of a component's CSS into its own `@layer`. */
export interface LayeredRule {
  name: string
  rule: string
}

/** The rules one component's CSS splits into (see `splitAtRules`). */
export interface SplitRules {
  base: string
  atRules: string[]
  layered: LayeredRule[]
}

const TRACKED_AT_RULE_RE = /^@(?:media|supports|container)\b/

/**
 * If a splittable block starts at `i` (`@media` / `@supports` / `@container`,
 * or a NAMED `@layer`), return its kind: `''` for a conditional group rule, the
 * layer name for a `@layer` block. `null` for anything else (`@keyframes`,
 * `@font-face`, an anonymous `@layer`, a `@layer a, b;` statement).
 */
function trackedAt(cssText: string, i: number): string | null {
  const remaining = cssText.slice(i, i + 20)
  if (TRACKED_AT_RULE_RE.test(remaining)) return ''
  if (!remaining.startsWith('@layer')) return null
  NESTED_LAYER_OPEN_RE.lastIndex = i
  const m = NESTED_LAYER_OPEN_RE.exec(cssText)

  return m ? (m[1] as string) : null
}

/**
 * Record one extracted block: `prefix { inner }` where `layer` is `''` for a
 * conditional group rule, or the name of a `@layer` block to hoist.
 */
function emitBlock(prefix: string, inner: string, layer: string, selector: string, out: SplitRules): void {
  if (layer !== '') {
    hoistLayer(layer, inner, selector, out.layered)
    return
  }
  if (!inner.includes('@layer')) {
    out.atRules.push(`${prefix}{${selector}{${inner}}}`)
    return
  }
  // `@media X { …; @layer y { … } }` — the layer block keeps the media
  // condition: `@layer y{@media X{.c{…}}}`.
  const nested = splitAtRules(inner, selector)
  if (nested.base) out.atRules.push(`${prefix}{${selector}{${nested.base}}}`)
  for (const r of nested.atRules) out.atRules.push(`${prefix}{${r}}`)
  for (const l of nested.layered) out.layered.push({ name: l.name, rule: `${prefix}{${l.rule}}` })
}

/**
 * Hoist the body of a `@layer <name> { … }` block written in a component's
 * CSS: split it like the component's own CSS (its `@media` blocks become their
 * own rules) and record every resulting rule under `name`. A layer block
 * nested inside it becomes the sublayer `name.inner`, as in CSS.
 */
function hoistLayer(name: string, body: string, selector: string, out: LayeredRule[]): void {
  const inner = splitAtRules(body, selector)
  if (inner.base) out.push({ name, rule: `${selector}{${inner.base}}` })
  for (const r of inner.atRules) out.push({ name, rule: r })
  for (const l of inner.layered) out.push({ name: `${name}.${l.name}`, rule: l.rule })
}

/** Index just past the comment, string or unquoted `url(…)` token at `i`, or `-1` if none starts there. */
function skipOpaque(cssText: string, i: number): number {
  const ch = cssText.charCodeAt(i)
  if (ch === 47 /* / */ && cssText.charCodeAt(i + 1) === 42 /* * */) {
    const close = cssText.indexOf('*/', i + 2)
    return close === -1 ? cssText.length : close + 2
  }
  if (ch === 34 /* " */ || ch === 39 /* ' */) return skipQuoted(cssText, i)
  if ((ch === 117 || ch === 85) /* u/U */ && isUrlOpen(cssText, i)) {
    let j = i + 4
    while (j < cssText.length && cssText.charCodeAt(j) <= 32 /* ws */) j++
    const q = cssText.charCodeAt(j)
    // Quoted url — the generic string handler covers the body.
    if (q === 34 /* " */ || q === 39 /* ' */) return i + 4
    // Unquoted url TOKEN — may legally contain `{`/`}`; skip to `)`.
    const close = cssText.indexOf(')', j)

    return close === -1 ? cssText.length : close + 1
  }

  return -1
}

/**
 * Extract nested at-rules (@media, @supports, @container) from CSS text and
 * wrap their content in the given selector as separate top-level rules.
 *
 * A NAMED `@layer <name> { … }` block in the component's CSS (at the top
 * level, or directly inside one of those at-rules) is returned separately in
 * `layered`: its rules belong to the TOP-LEVEL layer `<name>`, not to a
 * sublayer of the component's own `layer` option. That is how
 * `@pyreon/elements` puts a per-instance `css` prop into `@layer instance`
 * while the rest of the same class stays in `@layer elements` — one class
 * name, two layers. The caller wraps each entry as `@layer <name>{rule}`.
 *
 * Same string/comment/url-aware scan as `splitTopLevelRules`. Braces inside
 * quoted strings, block comments, or unquoted url(…) tokens must not move the
 * depth counter — a `content:"}"` BEFORE the @media block poisoned depth
 * negative so the at-rule was never extracted (it stayed NESTED inside the
 * class rule and the browser dropped it), and a `}` inside a string WITHIN the
 * @media body terminated the block early (garbage at-rule + mangled trailing
 * base). The comment skip also stops a commented-out `@media {…}` from being
 * extracted as a LIVE rule. `charCodeAt(i)` returns a primitive int;
 * `cssText[i]` allocates a fresh 1-char string in V8 per iteration (ported from
 * vitus-labs `c483cabc`).
 */
export function splitAtRules(cssText: string, selector: string): SplitRules {
  // Fast path: no at-rules to split
  if (cssText.indexOf('@') === -1) return { base: cssText, atRules: [], layered: [] }

  const out: SplitRules = { base: '', atRules: [], layered: [] }
  const baseParts: string[] = []
  const len = cssText.length
  let depth = 0
  let atStart = -1
  let atOpen = -1
  // The tracked block's kind: '' for @media/@supports/@container, else the @layer name.
  let atKind = ''
  let lastBase = 0

  let i = 0
  while (i < len) {
    const skipped = skipOpaque(cssText, i)
    if (skipped !== -1) {
      i = skipped
      continue
    }
    const ch = cssText.charCodeAt(i)

    if (ch === 123 /* { */) {
      depth++
      // Record the tracked at-rule's REAL block opener via the state machine
      // (the old `indexOf('{', atStart)` could land on a `{` inside a prelude string).
      if (depth === 1 && atStart >= 0 && atOpen < 0) atOpen = i
    } else if (ch === 125 /* } */ && depth > 0) {
      depth--
      if (depth === 0 && atStart >= 0) {
        // End of a tracked at-rule block — extract and wrap with selector
        const inner = cssText.slice(atOpen + 1, i).trim()
        if (inner) emitBlock(cssText.slice(atStart, atOpen).trim(), inner, atKind, selector, out)
        atStart = -1
        atOpen = -1
        lastBase = i + 1
      }
      // A stray depth-0 `}` stays in the base text (the browser drops that bad
      // declaration); it never drives depth negative, which blocked ALL
      // subsequent at-rule detection.
    } else if (depth === 0 && ch === 64 /* @ */ && atStart < 0) {
      const kind = trackedAt(cssText, i)
      if (kind !== null) {
        // Save any base CSS that precedes this at-rule
        const baseBefore = cssText.slice(lastBase, i).trim()
        if (baseBefore) baseParts.push(baseBefore)
        atStart = i
        atKind = kind
      }
    }
    i++
  }

  return finishSplit(cssText, out, baseParts, atStart < 0 ? lastBase : -1)
}

/** Add the base CSS after the last at-rule (from `tailFrom`; `-1` when a block was left open) and settle `base`. */
function finishSplit(cssText: string, out: SplitRules, baseParts: string[], tailFrom: number): SplitRules {
  if (tailFrom >= 0 && tailFrom < cssText.length) {
    const remaining = cssText.slice(tailFrom).trim()
    if (remaining) baseParts.push(remaining)
  }
  // If no at-rules were found, return original unchanged
  if (out.atRules.length === 0 && out.layered.length === 0) return { base: cssText, atRules: [], layered: [] }
  out.base = baseParts.join(' ')

  return out
}
