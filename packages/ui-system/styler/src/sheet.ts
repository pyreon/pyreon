/**
 * StyleSheet manager. Handles CSS rule injection, hash-based deduplication,
 * SSR buffering, client-side hydration, bounded cache, and @layer support.
 *
 * Media queries (@media), @supports, and @container blocks nested inside
 * component CSS are automatically extracted into separate top-level rules.
 */
import { hash } from './hash'
import { clearNormCache } from './resolve'

/**
 * A single `@layer <name>? { <inner> }` BLOCK spanning the whole (trimmed)
 * rule. The name is optional — anonymous `@layer { … }` blocks are valid CSS
 * (each use creates a distinct unnamed layer).
 */
const LAYER_BLOCK_RE = /^@layer(?:\s+[A-Za-z0-9_.-]+)?\s*\{([\s\S]*)\}$/
/** The `@layer a, b;` layer-ORDERING statement form (no block). */
const LAYER_STATEMENT_RE = /^@layer\s[^{}]*;$/
/** Conditional group rules whose body can legally nest `@layer` blocks. */
const GROUP_RULE_RE = /^@(?:media|supports|container)[\s(]/

/**
 * Flatten every `@layer <name>?{ … }` block to its inner rules, recursively.
 * Used by `insertGlobal` when @layer is unsupported (happy-dom / older
 * engines) so pre-wrapped global CSS (e.g. a user-authored
 * `createGlobalStyle` reset written into `@layer rocketstyle{…}`) still
 * lands in the DOM via source order instead of being dropped with a
 * per-rule DOMException. Handles multiple SIBLING blocks (split at the top
 * level first), NESTED blocks (recurse into each block's inner content),
 * anonymous blocks, and `@layer` blocks nested INSIDE conditional group
 * rules (@media/@supports/@container) — the group wrapper is preserved:
 * `@media X{@layer y{RULES}}` → `@media X{RULES}`. A layer-ORDERING
 * statement (`@layer a, b;`) is meaningless once the blocks are flattened
 * (there are no layers left to order), so it is dropped WITH a dev warning
 * naming the cascade-order loss — never silently.
 * A `split` fn is injected so this reuses the sheet's own rule splitter.
 * Bounded by real CSS nesting depth (≤ a handful in practice).
 * Exported for white-box tests only — NOT part of the public API (not
 * re-exported from index.ts).
 */
export function unwrapLayers(cssText: string, split: (s: string) => string[]): string[] {
  const out: string[] = []
  for (const rule of split(cssText)) {
    const block = LAYER_BLOCK_RE.exec(rule)
    if (block) {
      out.push(...unwrapLayers(block[1]!, split))
      continue
    }
    if (LAYER_STATEMENT_RE.test(rule)) {
      if (process.env.NODE_ENV !== 'production') {
        // oxlint-disable-next-line no-console
        console.warn(
          `[styler] @layer is unsupported in this environment — dropped the layer-ordering statement "${rule}" while flattening. The cascade priority it declared is lost; flattened rules fall back to plain source order.`,
        )
      }
      continue
    }
    if (rule.includes('@layer') && GROUP_RULE_RE.test(rule)) {
      // `@layer` nested INSIDE a conditional group rule — unwrap the layer
      // blocks while keeping the group wrapper. Without this descent, the
      // group rule inserts "successfully" with an EMPTY body (the engine
      // drops the unknown @layer child) and its rules vanish silently.
      const open = rule.indexOf('{')
      const inner = unwrapLayers(rule.slice(open + 1, rule.length - 1), split)
      out.push(`${rule.slice(0, open).trim()}{${inner.join('')}}`)
      continue
    }
    out.push(rule)
  }
  return out
}

/**
 * Skip a quoted string starting at `i` (the opening quote). Returns the
 * index just past the closing quote. Backslash escapes are honored; an
 * unterminated string runs to end-of-input.
 */
function skipQuoted(css: string, i: number): number {
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
function isUrlOpen(css: string, i: number): boolean {
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
 * Split CSS text into individual top-level rules.
 * `CSSStyleSheet.insertRule()` only accepts one rule at a time.
 *
 * String/comment/url-aware: braces inside `"…"`/`'…'` strings (incl.
 * backslash escapes), inside block comments, and inside unquoted
 * `url(…)` tokens do NOT count toward nesting depth — a naive counter
 * split `.a{background:url("a}b.png")}` mid-string and silently lost both
 * halves. Also emits semicolon-terminated at-STATEMENTS (`@layer a, b;`,
 * `@import …;`, `@namespace …;`, `@charset …;`) as their own slices — a
 * brace-only splitter swallowed them everywhere, silently corrupting the
 * user's cascade order even on modern @layer-supporting browsers.
 * Unbalanced/unparseable trailing input (a missing close brace) is named
 * in a dev warning instead of vanishing.
 * Exported for white-box tests only — NOT part of the public API.
 */
export function splitTopLevelRules(cssText: string): string[] {
  const rules: string[] = []
  const len = cssText.length
  let depth = 0
  let start = 0
  let i = 0

  // `charCodeAt(i)` returns a primitive int; `cssText[i]` allocates a
  // fresh 1-char string per iteration. Ported from vitus-labs `c483cabc`.
  while (i < len) {
    const ch = cssText.charCodeAt(i)
    if (ch === 47 /* / */ && cssText.charCodeAt(i + 1) === 42 /* * */) {
      const close = cssText.indexOf('*/', i + 2)
      i = close === -1 ? len : close + 2
      continue
    }
    if (ch === 34 /* " */ || ch === 39 /* ' */) {
      i = skipQuoted(cssText, i)
      continue
    }
    if ((ch === 117 || ch === 85) /* u/U */ && isUrlOpen(cssText, i)) {
      let j = i + 4
      while (j < len && cssText.charCodeAt(j) <= 32 /* ws */) j++
      const q = cssText.charCodeAt(j)
      if (q === 34 /* " */ || q === 39 /* ' */) {
        // Quoted url — the generic string handler above covers the body.
        i += 4
      } else {
        // Unquoted url TOKEN — may legally contain `{`/`}`; skip to `)`.
        const close = cssText.indexOf(')', j)
        i = close === -1 ? len : close + 1
      }
      continue
    }
    if (ch === 123 /* { */) {
      depth++
    } else if (ch === 125 /* } */) {
      if (depth > 0) {
        depth--
        if (depth === 0) {
          const rule = cssText.slice(start, i + 1).trim()
          // The slice ends at this depth-0 `}` (index i), so it always
          // contains at least one `}` and the trim can never be empty —
          // the false arm is unreachable. Kept as a defensive guard.
          /* v8 ignore next */
          if (rule) rules.push(rule)
          start = i + 1
        }
      } else {
        // Stray close brace at the top level — CSS error recovery drops
        // it (a naive counter went to depth -1 and silently dropped
        // EVERYTHING after it).
        start = i + 1
      }
    } else if (ch === 59 /* ; */ && depth === 0) {
      // Semicolon-terminated at-STATEMENT — a real rule with no braces.
      const stmt = cssText.slice(start, i + 1).trim()
      if (stmt.charCodeAt(0) === 64 /* @ */) rules.push(stmt)
      // Non-@ content before a top-level `;` is invalid CSS (a stray
      // declaration outside any block) — dropped, matching browser error
      // recovery; without the reset it would prefix (and break) the NEXT
      // rule's insertRule.
      start = i + 1
    }
    i++
  }

  if (process.env.NODE_ENV !== 'production') {
    // Unbalanced input (`.x{` missing its close brace) leaves a non-empty
    // tail that never became a rule — previously EVERYTHING from the
    // unclosed rule on was dropped with zero signal. Name it in dev.
    // Strip comments (incl. an unterminated trailing one) before judging.
    const tail = cssText
      .slice(start)
      .replace(/\/\*[\s\S]*?(?:\*\/|$)/g, '')
      .trim()
    if (tail) {
      // oxlint-disable-next-line no-console
      console.warn(
        `[styler] splitRules: dropped unparseable trailing CSS (missing a closing brace?): "${tail.slice(0, 120)}"`,
      )
    }
  }

  return rules
}

// Dev-time counter sink — see styler/resolve.ts for the contract.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

// Dev-mode gate. `import.meta.env.DEV` is literal-replaced by Vite at build
// time and tree-shakes to zero bytes in prod. The previous
// `process.env.NODE_ENV !== 'production'` form was dead code in real Vite
// browser bundles (Vite does not polyfill `process`), so insertRule failures
// were silently swallowed in production — masking malformed CSS bugs.
const PREFIX = 'pyr'
const ATTR = 'data-pyreon-styler'
const DEFAULT_MAX_CACHE_SIZE = 10000

export interface StyleSheetOptions {
  /**
   * Register `globalThis.__PYREON_STYLER_FLUSH__` (streaming-SSR delta flush)
   * for THIS instance. Only the package's `sheet` singleton sets it —
   * `createSheet()` per-request instances must not clobber the global.
   */
  registerSSRFlush?: boolean
  /** Maximum number of cached rules before eviction (default: 10000). */
  maxCacheSize?: number
  /** CSS @layer name to wrap scoped rules in. */
  layer?: string
  /**
   * CSP nonce. When set, the SSR `<style>` tag from `getStyleTag()` carries a
   * `nonce="…"` attribute, and the client `<style>` element created by
   * `mount()` gets the same nonce — so a strict `style-src 'nonce-…'` policy
   * (no `'unsafe-inline'`) does NOT block the critical CSS on first paint.
   * Per-request nonces (which rotate per response) are best passed at call time
   * via `getStyleTag(nonce)`, which overrides this default. Client-side CSSOM
   * `insertRule` is exempt from CSP regardless, so this only matters for the
   * SSR-emitted inline `<style>` and the initial client `<style>` element.
   */
  nonce?: string
}

export class StyleSheet {
  private cache = new Map<string, string>()
  private insertCache = new Map<string, string>()
  // Reverse index: cache key (className / keyframe name / global key) →
  // the insertCache keys that resolve to it. Lets eviction drop the
  // (large) cssText-keyed insertCache entries in lockstep with `cache`,
  // instead of letting them grow unbounded for the process lifetime.
  private icKeysByClass = new Map<string, Set<string>>()
  // Reverse index: cache key → the top-level CSSRule objects it inserted
  // into the live sheet. Object references survive `deleteRule()`
  // reindexing (only the numeric index shifts), so eviction can locate
  // and remove the exact DOM rules without fragile index bookkeeping.
  private domRules = new Map<string, CSSRule[]>()
  private sheet: CSSStyleSheet | null = null
  private ssrBuffer: string[] = []
  // Watermark for streaming SSR — index into `ssrBuffer` of the first
  // rule NOT yet flushed by `flushSSRPending()`. Lets the streaming
  // pipeline emit `<style>` tags inline next to each Suspense boundary
  // that resolves, so boundary content arrives at the browser with its
  // styles already present (instead of FOUCing until the final
  // consolidated `<style>` flushes at end-of-stream).
  private ssrFlushedIdx = 0
  private isSSR: boolean
  private maxCacheSize: number
  private layer: string | undefined
  private nonce: string | undefined
  private supportsLayer = false

  constructor(options: StyleSheetOptions = {}) {
    this.maxCacheSize = options.maxCacheSize ?? DEFAULT_MAX_CACHE_SIZE
    this.layer = options.layer
    this.nonce = options.nonce
    this.isSSR = typeof document === 'undefined'
    if (!this.isSSR) this.mount()
    // Streaming-SSR flush hook, singleton-only (`registerSSRFlush` is set by
    // the `sheet` export below; `createSheet()` instances must NOT clobber the
    // global). Registration lives in the constructor — not at module top
    // level — so it exists exactly when the singleton is retained: the
    // top-level form referenced `sheet` unconditionally, which pinned the
    // whole sheet engine into every consumer bundle (a `typeof document`
    // guard is NOT statically foldable, so browser bundles paid it too; even
    // `useTheme`-only imports cost ~6.1KB gz). A styling-free app has nothing
    // to flush, so dropping the registration with the sheet is correct.
    if (options.registerSSRFlush && this.isSSR) {
      ;(
        globalThis as { __PYREON_STYLER_FLUSH__?: () => string }
      ).__PYREON_STYLER_FLUSH__ = () => this.flushSSRPending()
    }
  }

  private mount() {
    // SSR guard: the constructor only calls mount() when !this.isSSR, but
    // keep the guard in-method so it's self-evidently SSR-safe regardless
    // of caller (matches `this.isSSR = typeof document === 'undefined'`).
    // Unreachable in practice (the only caller already gates on !isSSR), so
    // the early-return arm is never taken — ignored for coverage.
    /* v8 ignore next */
    if (this.isSSR) return
    // Reuse existing <style> tag from SSR hydration
    const existing = document.querySelector(`style[${ATTR}]`) as HTMLStyleElement | null

    if (existing) {
      this.sheet = existing.sheet ?? null
      this.hydrateFromTag(existing)
    } else {
      const el = document.createElement('style')
      el.setAttribute(ATTR, '')
      // CSP: tag the client <style> with the nonce so a strict
      // `style-src 'nonce-…'` policy admits the element. (CSSOM insertRule
      // mutations below are CSP-exempt regardless — this covers the element
      // itself.)
      if (this.nonce) el.setAttribute('nonce', this.nonce)
      document.head.appendChild(el)
      this.sheet = el.sheet ?? null
    }

    // Inject CSS @layer ordering for the framework's cascade.
    //
    // Two layers: `elements` (base layout primitives) < `rocketstyle`
    // (themed component styles). The explicit ordering declaration
    // ensures rocketstyle theme styles always override element base
    // styles regardless of source order, while media queries within
    // each layer still work correctly (media conditions are evaluated
    // within each layer independently).
    //
    // Previously this used a single `@layer pyreon` which put
    // rocketstyle and elements in the same layer, relying on source
    // order. That broke when Elements were rendered WITHOUT a layer
    // (unlayered CSS always wins over layered CSS per the cascade
    // spec), making rocketstyle themes unable to override element
    // base styles.
    if (this.sheet) {
      try {
        this.sheet.insertRule('@layer elements, rocketstyle;', 0)
        this.supportsLayer = true
      } catch {
        // @layer not supported — falls back to source order
      }
    }
  }

  /** Extract className from a selector like ".pyr-abc" or ".pyr-abc.pyr-abc" → "pyr-abc" */
  private extractClassName(selectorText: string): string | null {
    if (selectorText[0] !== '.') return null
    const dotIdx = selectorText.indexOf('.', 1)
    return dotIdx > 0 ? selectorText.slice(1, dotIdx) : selectorText.slice(1)
  }

  /** Parse existing rules from SSR-rendered <style> tag into cache. */
  private hydrateFromTag(el: HTMLStyleElement) {
    const sheet = el.sheet
    if (!sheet) return

    for (let i = 0; i < sheet.cssRules.length; i++) {
      const rule = sheet.cssRules[i]

      if (rule instanceof CSSStyleRule) {
        const className = this.extractClassName(rule.selectorText)
        if (className) this.cache.set(className, className)
      }

      // Handle split @media rules that wrap our selectors
      if (typeof CSSMediaRule !== 'undefined' && rule instanceof CSSMediaRule) {
        for (let j = 0; j < rule.cssRules.length; j++) {
          const inner = rule.cssRules[j]
          if (inner instanceof CSSStyleRule) {
            const className = this.extractClassName(inner.selectorText)
            if (className) this.cache.set(className, className)
          }
        }
      }
    }
  }

  /** Record that `icKey` resolves to `cacheKey` (for lockstep eviction). */
  private trackIcKey(cacheKey: string, icKey: string): void {
    let s = this.icKeysByClass.get(cacheKey)
    if (!s) {
      s = new Set()
      this.icKeysByClass.set(cacheKey, s)
    }
    s.add(icKey)
  }

  /** Record a top-level CSSRule this `cacheKey` inserted into the sheet. */
  private trackDomRule(cacheKey: string, ref: CSSRule | null | undefined): void {
    if (!ref) return
    let a = this.domRules.get(cacheKey)
    if (!a) {
      a = []
      this.domRules.set(cacheKey, a)
    }
    a.push(ref)
  }

  /**
   * Evict the given cache keys across ALL three storage layers:
   * the `cache` Map, the cssText-keyed `insertCache` Map, and the live
   * DOM rules. Without the latter two, `maxCacheSize` bounded only the
   * smallest of the three — `insertCache` keys (full CSS text) and the
   * `<style>` tag's `cssRules` grew unbounded for the app's lifetime,
   * which is the actual memory leak this method exists to prevent.
   */
  private evictKeys(keys: string[]): void {
    const ruleRefs = new Set<CSSRule>()
    for (const key of keys) {
      this.cache.delete(key)
      const ics = this.icKeysByClass.get(key)
      if (ics) {
        for (const ic of ics) this.insertCache.delete(ic)
        this.icKeysByClass.delete(key)
      }
      const refs = this.domRules.get(key)
      if (refs) {
        for (const r of refs) ruleRefs.add(r)
        this.domRules.delete(key)
      }
    }
    if (this.sheet && ruleRefs.size > 0) {
      // Descending walk: deleting at i never shifts a not-yet-visited
      // lower index, so identity matching stays correct mid-loop.
      for (let i = this.sheet.cssRules.length - 1; i >= 0; i--) {
        const r = this.sheet.cssRules[i]
        if (r && ruleRefs.has(r)) {
          try {
            this.sheet.deleteRule(i)
          } catch {
            // Rule already gone (e.g. external clearAll) — ignore.
          }
        }
      }
    }
  }

  /** Evict oldest entries when cache exceeds max size. */
  private evictIfNeeded() {
    if (this.cache.size <= this.maxCacheSize) return

    // Map iteration order is insertion order — delete oldest 10%
    const toDelete = Math.floor(this.maxCacheSize * 0.1)
    const evicted: string[] = []
    let count = 0
    for (const key of this.cache.keys()) {
      if (count >= toDelete) break
      evicted.push(key)
      count++
    }
    this.evictKeys(evicted)
  }

  /**
   * Extract nested at-rules (@media, @supports, @container) from CSS text
   * and wrap their content in the given selector as separate top-level rules.
   */
  private splitAtRules(cssText: string, selector: string): { base: string; atRules: string[] } {
    // Fast path: no at-rules to split
    if (cssText.indexOf('@') === -1) return { base: cssText, atRules: [] }

    const atRules: string[] = []
    const baseParts: string[] = []
    const len = cssText.length
    let depth = 0
    let atStart = -1
    let atOpen = -1
    let lastBase = 0

    // Same string/comment/url-aware scan as `splitTopLevelRules`. Braces
    // inside quoted strings, block comments, or unquoted url(…) tokens must
    // not move the depth counter — a `content:"}"` BEFORE the @media block
    // poisoned depth negative so the at-rule was never extracted (it stayed
    // NESTED inside the class rule and the browser dropped it), and a `}`
    // inside a string WITHIN the @media body terminated the block early
    // (garbage at-rule + mangled trailing base). The comment skip also
    // stops a commented-out `@media {…}` from being extracted as a LIVE
    // rule.
    // `charCodeAt(i)` returns a primitive int; `cssText[i]` allocates a
    // fresh 1-char string in V8 per iteration. On long stylesheets with
    // at-rule blocks the per-char allocation dominates. Ported from
    // vitus-labs `c483cabc`.
    let i = 0
    while (i < len) {
      const ch = cssText.charCodeAt(i)

      if (ch === 47 /* / */ && cssText.charCodeAt(i + 1) === 42 /* * */) {
        const close = cssText.indexOf('*/', i + 2)
        i = close === -1 ? len : close + 2
        continue
      }
      if (ch === 34 /* " */ || ch === 39 /* ' */) {
        i = skipQuoted(cssText, i)
        continue
      }
      if ((ch === 117 || ch === 85) /* u/U */ && isUrlOpen(cssText, i)) {
        let j = i + 4
        while (j < len && cssText.charCodeAt(j) <= 32 /* ws */) j++
        const q = cssText.charCodeAt(j)
        if (q === 34 /* " */ || q === 39 /* ' */) {
          // Quoted url — the generic string handler above covers the body.
          i += 4
        } else {
          // Unquoted url TOKEN — may legally contain `{`/`}`; skip to `)`.
          const close = cssText.indexOf(')', j)
          i = close === -1 ? len : close + 1
        }
        continue
      }

      if (ch === 123 /* { */) {
        depth++
        // Record the tracked at-rule's REAL block opener via the state
        // machine (the old `indexOf('{', atStart)` could land on a `{`
        // inside a prelude string).
        if (depth === 1 && atStart >= 0 && atOpen < 0) atOpen = i
      } else if (ch === 125 /* } */) {
        if (depth > 0) {
          depth--
          if (depth === 0 && atStart >= 0) {
            // End of a tracked at-rule block — extract and wrap with selector
            const atPrefix = cssText.slice(atStart, atOpen).trim()
            const innerCSS = cssText.slice(atOpen + 1, i).trim()
            if (innerCSS) {
              atRules.push(`${atPrefix}{${selector}{${innerCSS}}}`)
            }
            atStart = -1
            atOpen = -1
            lastBase = i + 1
          }
        }
        // A stray depth-0 `}` stays in the base text (the browser drops
        // that bad declaration); crucially it no longer drives depth
        // negative, which blocked ALL subsequent at-rule detection.
      } else if (depth === 0 && ch === 64 /* @ */ && atStart < 0) {
        // Check if this starts a splittable at-rule (not @keyframes, @font-face, etc.)
        const remaining = cssText.slice(i, i + 20)
        if (/^@(?:media|supports|container)\b/.test(remaining)) {
          // Save any base CSS that precedes this at-rule
          const baseBefore = cssText.slice(lastBase, i).trim()
          if (baseBefore) baseParts.push(baseBefore)
          atStart = i
        }
      }
      i++
    }

    // Collect remaining base CSS after the last at-rule
    if (lastBase < cssText.length && atStart < 0) {
      const remaining = cssText.slice(lastBase).trim()
      if (remaining) baseParts.push(remaining)
    }

    // If no at-rules were found, return original unchanged
    if (atRules.length === 0) return { base: cssText, atRules: [] }

    return { base: baseParts.join(' '), atRules }
  }

  /**
   * Compute a className from CSS text without injecting (pure function).
   */
  getClassName(cssText: string): string {
    const cached = this.insertCache.get(cssText)
    if (cached) return cached
    const h = hash(cssText)
    return `${PREFIX}-${h}`
  }

  /**
   * Insert CSS rules for a component. Returns the class name (deterministic, hash-based).
   * Deduplicates: same CSS text always produces the same class name and
   * the rules are only injected once.
   *
   * @param cssText - CSS declarations to insert
   * @param _unused - Reserved for backward compatibility (was `boost`)
   * @param insertLayer - CSS @layer to wrap this rule in (e.g. 'rocketstyle').
   *   Used by rocketstyle to ensure wrapper styles override inner component styles
   *   via @layer order (base < rocketstyle) instead of specificity hacks.
   */
  // Dedup set for the dev-mode resolved-CSS validator — one warning per
  // unique (finding, snippet) pair, so a hot re-render can't spam the console.
  private warnedInvalidCss = new Set<string>()

  /**
   * Dev-only sanity scan over resolved CSS text — the safety net for the
   * CSS-variables theming mode. Var-leaf theme tokens are plain strings, so
   * legacy JS arithmetic (`t.spacing.small * 2` → `NaN`) and string concat
   * (`t.color.x + '99'` → `var(--px-…)99`) produce silently-invalid CSS
   * that the browser drops. This scan names the offending declaration the
   * moment it reaches the sheet. It ALSO flags `content-visibility: auto`
   * resolved without `contain-intrinsic-size` — a Cumulative Layout Shift
   * footgun the static `pyreon/content-visibility-needs-intrinsic-size`
   * lint rule can't see when the CSS is computed at runtime. Tree-shaken
   * from production (call site is gated on
   * `process.env.NODE_ENV !== 'production'`).
   */
  private validateDevCss(cssText: string): void {
    if (process.env.NODE_ENV === 'production') return
    const found: string[] = []
    if (/[:\s(,]NaN(?:[a-z%]*)?[;\s)}]/.test(`:${cssText};`)) {
      found.push(
        "a 'NaN' value — JS arithmetic on a var()/string theme token? Compose with native CSS calc() instead",
      )
    }
    if (/:\s*(?:undefined|null)[;\s}]/.test(`${cssText};`)) {
      found.push("an 'undefined'/'null' value — a theme token path that does not exist?")
    }
    const malformed = /var\(--[a-zA-Z0-9-]+\)[a-zA-Z0-9#%]/.exec(cssText)
    if (malformed) {
      found.push(
        `a malformed var() concatenation ('${malformed[0]}…') — string-concat on a CSS-variable theme token? Use calc() for math or color-mix() for alpha`,
      )
    }
    // CLS footgun: `content-visibility: auto` reserves NO box without
    // `contain-intrinsic-size`, so the browser estimates the off-screen
    // height then corrects it on render, shifting content below. Linear,
    // ReDoS-safe scans (anchored on a literal property + `:`).
    if (
      /content-visibility\s*:\s*auto\b/i.test(cssText) &&
      !/contain-intrinsic-(?:size|width|height|block-size|inline-size)\s*:/i.test(cssText)
    ) {
      found.push(
        "'content-visibility: auto' without 'contain-intrinsic-size' — the browser estimates the off-screen box height then corrects it on render, shifting content below (CLS). Add 'contain-intrinsic-size: auto <height>'",
      )
    }
    if (found.length === 0) return
    const key = `${found.join('|')}::${cssText.slice(0, 120)}`
    if (this.warnedInvalidCss.has(key)) return
    this.warnedInvalidCss.add(key)
    // oxlint-disable-next-line no-console
    console.warn(
      `[Pyreon] styler: resolved CSS contains ${found.join(' AND ')}.\n  in: ${cssText.slice(0, 200)}`,
    )
  }

  insert(cssText: string, _unused = false, insertLayer?: string): string {
    if (process.env.NODE_ENV !== 'production') {
      _countSink.__pyreon_count__?.('styler.sheet.insert')
      this.validateDevCss(cssText)
    }
    // Fast path: skip hash computation on repeated insertions of same CSS text
    const icKey = insertLayer ? `${cssText}\0L:${insertLayer}` : cssText
    const icHit = this.insertCache.get(icKey)
    if (icHit) {
      if (process.env.NODE_ENV !== 'production')
        _countSink.__pyreon_count__?.('styler.sheet.insert.hit')
      return icHit
    }

    const h = hash(cssText)
    const className = `${PREFIX}-${h}`

    if (this.cache.has(className)) {
      this.insertCache.set(icKey, className)
      this.trackIcKey(className, icKey)
      return className
    }

    this.evictIfNeeded()
    this.cache.set(className, className)

    const selector = `.${className}`

    // Split nested at-rules into separate top-level rules
    const { base, atRules } = this.splitAtRules(cssText, selector)

    const rules: string[] = []
    if (base) rules.push(`${selector}{${base}}`)
    rules.push(...atRules)

    // Apply @layer wrapping — per-insert layer takes precedence over sheet-level layer.
    // In SSR, always apply layers (output goes to real browsers).
    // In client, skip if @layer isn't supported (e.g. happy-dom in tests).
    const layerName = this.isSSR || this.supportsLayer ? (insertLayer ?? this.layer) : undefined
    const finalRules = layerName ? rules.map((r) => `@layer ${layerName}{${r}}`) : rules

    if (this.isSSR) {
      for (const rule of finalRules) {
        this.ssrBuffer.push(rule)
      }
    } else if (this.sheet) {
      for (const rule of finalRules) {
        try {
          const at = this.sheet.insertRule(rule, this.sheet.cssRules.length)
          this.trackDomRule(className, this.sheet.cssRules[at])
        } catch (_e) {
          if (process.env.NODE_ENV !== 'production') {
            // oxlint-disable-next-line no-console
            console.warn('[styler] Failed to insert CSS rule:', rule, _e)
          }
        }
      }
    }

    this.insertCache.set(icKey, className)
    this.trackIcKey(className, icKey)
    return className
  }

  /** Insert a @keyframes rule. Deduplicates by animation name. */
  insertKeyframes(name: string, body: string): void {
    if (this.cache.has(name)) return

    this.evictIfNeeded()
    this.cache.set(name, name)

    const rule = `@keyframes ${name}{${body}}`

    if (this.isSSR) {
      this.ssrBuffer.push(rule)
    } else if (this.sheet) {
      try {
        const at = this.sheet.insertRule(rule, this.sheet.cssRules.length)
        this.trackDomRule(name, this.sheet.cssRules[at])
      } catch (_e) {
        if (process.env.NODE_ENV !== 'production') {
          // oxlint-disable-next-line no-console
          console.warn('[styler] Failed to insert @keyframes rule:', rule, _e)
        }
      }
    }
  }

  /** Insert global CSS rules (no wrapper selector). Deduplicates by hash. */
  insertGlobal(cssText: string): void {
    const h = hash(cssText)
    const key = `global-${h}`

    if (this.cache.has(key)) return

    this.evictIfNeeded()
    this.cache.set(key, key)

    if (this.isSSR) {
      this.ssrBuffer.push(cssText)
    } else if (this.sheet) {
      // When @layer isn't supported (e.g. happy-dom in tests, pre-2022
      // engines), the init probe leaves `supportsLayer` false. The scoped
      // `insert()` path already skips the @layer wrap in that case;
      // `insertGlobal` receives PRE-wrapped content from the caller
      // (user-authored `createGlobalStyle` CSS), so flatten every
      // `@layer <name>?{…}` block — sibling, nested, anonymous, AND nested
      // inside @media/@supports/@container group rules — here too.
      // Otherwise the inner rules (e.g. a global reset) are silently
      // dropped AND every insert warns a DOMException.
      //
      // HONEST CAVEAT — flattening CHANGES cascade semantics; it does not
      // emulate @layer: (a) in a real @layer engine, UNLAYERED rules beat
      // LAYERED ones — flattened rules become unlayered, so they can now
      // WIN specificity ties they were authored to lose; (b) `@layer a, b;`
      // ordering statements are meaningless once flattened and are dropped
      // (dev-warned in unwrapLayers) — rules fall back to plain source
      // order. This is the least-bad fallback (the content lands instead
      // of vanishing), not a faithful one. Apps that must reproduce
      // layer-order inversions in pre-@layer browsers need a different
      // strategy (specificity / source order).
      const rules = this.supportsLayer
        ? splitTopLevelRules(cssText)
        : unwrapLayers(cssText, splitTopLevelRules)
      for (const rule of rules) {
        try {
          const at = this.sheet.insertRule(rule, this.sheet.cssRules.length)
          this.trackDomRule(key, this.sheet.cssRules[at])
        } catch (_e) {
          if (process.env.NODE_ENV !== 'production') {
            // oxlint-disable-next-line no-console
            console.warn('[styler] Failed to insert global CSS rule:', rule, _e)
          }
        }
      }
    }
  }

  /**
   * Returns collected CSS for SSR as a complete `<style>` tag string.
   *
   * @param nonce - CSP nonce to stamp on the `<style>` tag (overrides the
   *   instance `nonce` option). Pass the per-request nonce here so a strict
   *   `style-src 'nonce-…'` policy admits the SSR-inlined critical CSS on first
   *   paint. Omit to fall back to the instance nonce (if any). Quotes in the
   *   nonce are stripped so it can't break out of the attribute.
   */
  getStyleTag(nonce?: string): string {
    const n = nonce ?? this.nonce
    const nonceAttr = n ? ` nonce="${n.replace(/["'<>]/g, '')}"` : ''
    if (this.ssrBuffer.length === 0) return `<style ${ATTR}=""${nonceAttr}></style>`
    // Emit the layer ordering declaration for SSR output so the cascade
    // is correct when the browser parses the SSR HTML. On the client side
    // this ordering is injected via insertRule in mount().
    const layerDecl = this.hasLayeredRules()
      ? '@layer elements, rocketstyle;'
      : this.layer
        ? `@layer ${this.layer};`
        : ''
    const css = (layerDecl + this.ssrBuffer.join('')).replace(/<\/style/gi, '<\\/style')
    return `<style ${ATTR}=""${nonceAttr}>${css}</style>`
  }

  /**
   * Returns the collected SSR rules as a raw array (one entry per
   * top-level rule, already `@layer`-wrapped + class-prefixed exactly as
   * `insert()` produced them). Used by the compile-time rocketstyle
   * collapse resolver: it renders a component under SSR, reads the rules
   * here, and the build emits an idempotent `injectRules()` call so the
   * collapsed `_tpl()` site is self-sufficient (no prior runtime mount
   * needed to populate the sheet). A copy — callers must not mutate the
   * internal buffer.
   */
  getStyleRules(): readonly string[] {
    return this.ssrBuffer.slice()
  }

  // Idempotency guard for injectRules — keyed by the FNV hash the
  // collapse resolver computes over the rule set. A second injection of
  // the same resolved bundle (e.g. the module re-evaluated under HMR, or
  // two collapsed call sites resolving to the same dimension combo) is a
  // no-op instead of duplicate live `cssRules`.
  private injectedBundles = new Set<string>()

  /**
   * Inject pre-resolved CSS rule text (from `getStyleRules()` captured at
   * build time by the rocketstyle-collapse resolver) directly into the
   * live sheet. Unlike `insert()` this does NOT re-hash — the class names
   * are already baked into `rules` and into the collapsed `_tpl()` HTML;
   * re-hashing would produce a different class and break the contract.
   * Idempotent by `key` (the resolver's FNV hash of the bundle).
   */
  injectRules(rules: readonly string[], key: string): void {
    if (this.injectedBundles.has(key)) return
    this.injectedBundles.add(key)
    if (this.isSSR) {
      for (const rule of rules) this.ssrBuffer.push(rule)
      return
    }
    if (!this.sheet) return
    for (const rule of rules) {
      try {
        this.sheet.insertRule(rule, this.sheet.cssRules.length)
      } catch (_e) {
        if (process.env.NODE_ENV !== 'production') {
          // oxlint-disable-next-line no-console
          console.warn('[styler] injectRules: failed to insert collapsed rule:', rule, _e)
        }
      }
    }
  }

  /**
   * Test-only: live `cssRules.length` (0 in SSR). Mirrors runtime-dom's
   * `_tplCacheSize()` test-only-accessor convention; lets injectRules /
   * eviction tests assert without reaching into the private sheet.
   */
  ruleCountForTest(): number {
    return this.sheet?.cssRules.length ?? 0
  }

  /**
   * Clear the SSR rule-capture buffer ONLY. Leaves `cache`,
   * `insertCache`, `icKeysByClass`, `domRules`, and `injectedBundles`
   * intact.
   *
   * Used by the rocketstyle-collapse build-time resolver to isolate
   * per-site rule captures between concurrent renders against the
   * shared singleton sheet (audit #8). Without resetting the buffer
   * between the resolver's render pairs, the `getStyleRules()` slice
   * for site N captures `[...site1Rules, ...site2Rules, ..., siteNRules]`
   * — every FNV key becomes unique per call order, and the cross-site
   * `injectedBundles` runtime dedup at consumer sites silently breaks
   * even when the underlying rule bundles are identical.
   *
   * Important context — the resolver MUST also pair this with per-test
   * resolver isolation OR truly-distinct dimension props per render to
   * actually produce non-empty `getStyleRules()` slices: `insert()`
   * short-circuits at `cache.has(className)` / `insertCache.get(icKey)`
   * when a className has been seen, AND cache layers above the styler
   * (styled.tsx `classCache` / `elClassCache` keyed on rocketstyle's
   * `$rocketstyle`/`$rocketstate` identity, and rocketstyle's `_rsMemo`)
   * survive between resolves within a single nested-Vite-SSR lifetime.
   * A second resolve sharing dimension props with a prior one will hit
   * the styled-component cache, skip `sheet.insert()` entirely, and
   * leave the just-reset buffer empty for that className. The fix is
   * resolver-level isolation (fresh nested Vite SSR per build) plus
   * this buffer-reset to keep concurrent captures from interleaving.
   *
   * Internal-use only — NEVER call this from a request-handling path
   * (the per-request `reset()` is the correct shape there, since the
   * request lifecycle is bounded and the styler caches should be
   * dropped wholesale).
   */
  resetSSRBuffer(): void {
    this.ssrBuffer = []
    this.ssrFlushedIdx = 0
  }

  /**
   * Streaming SSR — return CSS rules added to the buffer since the last
   * `flushSSRPending()` call, joined as a raw CSS body (no `<style>`
   * wrapper). Advances an internal watermark so subsequent calls return
   * only newer rules. Returns `''` when no new rules.
   *
   * Used by `@pyreon/runtime-server`'s streaming pipeline to emit
   * `<style data-pyreon-stream>` tags inline next to each Suspense
   * boundary's resolved HTML — so boundary content arrives at the
   * browser with its styles already present, instead of FOUCing until
   * the final consolidated `<style>` flushes at end-of-stream.
   *
   * Discovery contract: runtime-server reads this via
   * `globalThis.__PYREON_STYLER_FLUSH__` (set by sheet.ts on module
   * load when running under SSR). This avoids a hard
   * `runtime-server → styler` dependency — the streamer is no-op when
   * no styler is loaded. Mirrors the `__pyreon_count__` perf-counter
   * pattern.
   *
   * Idempotent on the watermark: `flushSSRPending()` immediately after
   * another `flushSSRPending()` returns `''` regardless of any prior
   * `getStyleTag()` / `reset()` calls. The watermark resets to 0 when
   * the buffer is reset (via `reset()` / `resetSSRBuffer()` /
   * `clearAll()` — request boundaries).
   *
   * NOT meant to be used WITH `getStyleTag()` on the same render —
   * `getStyleTag()` returns ALL buffered rules (SSG / non-streaming
   * SSR). Streaming SSR drives the buffer entirely through
   * `flushSSRPending()`.
   */
  flushSSRPending(): string {
    if (this.ssrBuffer.length === this.ssrFlushedIdx) return ''
    // Emit `@layer` ordering declaration on the FIRST flush of a stream
    // — only when there are layered rules to order. Once emitted, never
    // re-emitted (idempotent — second declaration would be redundant).
    const isFirstFlush = this.ssrFlushedIdx === 0
    let prefix = ''
    if (isFirstFlush) {
      const hasLayered = this.ssrBuffer
        .slice(this.ssrFlushedIdx)
        .some((r) => r.startsWith('@layer '))
      prefix = hasLayered
        ? '@layer elements, rocketstyle;'
        : this.layer
          ? `@layer ${this.layer};`
          : ''
    }
    const slice = this.ssrBuffer.slice(this.ssrFlushedIdx).join('')
    this.ssrFlushedIdx = this.ssrBuffer.length
    return prefix + slice
  }

  /** Returns collected CSS rules as a raw string (useful for streaming SSR). */
  getStyles(): string {
    if (this.ssrBuffer.length === 0) return ''
    const layerDecl = this.hasLayeredRules()
      ? '@layer elements, rocketstyle;'
      : this.layer
        ? `@layer ${this.layer};`
        : ''
    return layerDecl + this.ssrBuffer.join('')
  }

  /** Check if any buffered SSR rules use @layer wrapping. */
  private hasLayeredRules(): boolean {
    return this.ssrBuffer.some((r) => r.startsWith('@layer '))
  }

  /** Reset SSR buffer and cache (call between server requests). */
  reset(): void {
    this.ssrBuffer = []
    this.ssrFlushedIdx = 0
    this.cache.clear()
    this.insertCache.clear()
    this.icKeysByClass.clear()
    this.domRules.clear()
  }

  /** Clear the dedup cache. Useful for HMR / dev-time reloads. */
  clearCache(): void {
    this.cache.clear()
    this.insertCache.clear()
    this.icKeysByClass.clear()
    this.domRules.clear()
    clearNormCache()
  }

  /**
   * Full cleanup: clear cache and remove all CSS rules from the DOM.
   * Intended for HMR / dev-time reloads where stale styles must be purged.
   *
   * Also fires `onSheetClear` subscribers so downstream caches (e.g.
   * `styled.tsx`'s static-component cache) reset alongside the sheet.
   * Without this, stale `StaticStyled` ComponentFn references survive HMR
   * and continue to apply CSS class names that were just deleted from
   * the DOM — observable as missing styles after every hot reload.
   */
  clearAll(): void {
    this.cache.clear()
    this.insertCache.clear()
    this.icKeysByClass.clear()
    this.domRules.clear()
    clearNormCache()
    this.ssrBuffer = []
    this.ssrFlushedIdx = 0
    if (this.sheet) {
      while (this.sheet.cssRules.length > 0) {
        this.sheet.deleteRule(0)
      }
    }
    fireSheetClearSubscribers()
  }

  /**
   * Compute className and full CSS rule text without injecting.
   */
  prepare(cssText: string): { className: string; rules: string } {
    const h = hash(cssText)
    const className = `${PREFIX}-${h}`
    const selector = `.${className}`
    const { base, atRules } = this.splitAtRules(cssText, selector)

    const allRules: string[] = []
    if (base) allRules.push(`${selector}{${base}}`)
    allRules.push(...atRules)

    const finalRules = this.layer ? allRules.map((r) => `@layer ${this.layer}{${r}}`) : allRules

    return { className, rules: finalRules.join('') }
  }

  /** Check if a className is already in the cache. O(1) Map lookup. */
  has(className: string): boolean {
    return this.cache.has(className)
  }

  /** Current number of cached rules. */
  get cacheSize(): number {
    return this.cache.size
  }
}

/** Default singleton sheet for client-side use.
 * No default layer — each consumer specifies their own:
 *   Elements use `{ layer: 'elements' }`
 *   Rocketstyle uses `{ layer: 'rocketstyle' }`
 * The layer ordering `@layer elements, rocketstyle` is injected
 * in mount() so rocketstyle always overrides elements.
 */
// PURE: droppable exactly when NO styling API is used (then no <style> tag
// belongs in the document and no SSR flush is needed). Any real consumer of
// css/styled/keyframes references `sheet` and retains it — construction and
// mount timing are unchanged for them.
export const sheet = /* @__PURE__ */ new StyleSheet({ registerSSRFlush: true })

/**
 * Factory for creating isolated StyleSheet instances.
 * Use in SSR to get per-request isolation.
 */
export const createSheet = (options?: StyleSheetOptions): StyleSheet => new StyleSheet(options)

// ─── onSheetClear subscriber registry ─────────────────────────────────────
//
// Used by `styled.tsx` to reset its static-component cache when the
// singleton sheet is cleared via `clearAll()`. Module-level Set so the
// subscription survives between calls; ports the vitus-labs pattern from
// `connector-styler/sheet.ts:onClear`. Scoped to the singleton sheet —
// per-instance sheets created via `createSheet()` don't fire the hook.
const _sheetClearSubscribers = new Set<() => void>()

const fireSheetClearSubscribers = (): void => {
  for (const cb of _sheetClearSubscribers) cb()
}

/**
 * Subscribe to `sheet.clearAll()`. Fires after the sheet has been
 * fully cleared, so subscribers can drop downstream caches that depend
 * on the sheet's class names being live in the DOM.
 *
 * Returns a disposer for symmetry; in practice subscribers register
 * once at module load and never unsubscribe.
 */
export const onSheetClear = (callback: () => void): (() => void) => {
  _sheetClearSubscribers.add(callback)
  return () => _sheetClearSubscribers.delete(callback)
}

// ─── Streaming SSR hook ───────────────────────────────────────────────────
//
// On SSR module init, register a global flush callback so
// `@pyreon/runtime-server`'s streaming pipeline can emit collected CSS
// rules inline alongside each Suspense boundary's HTML — without a hard
// `runtime-server → styler` dependency.
//
// Same pattern as the `__pyreon_count__` perf-counter sink and the SSG
// plugin's `getStyleTag` lookup: the consumer reads the global and
// no-ops if styler isn't loaded.
//
// Client-side: `IS_SERVER === false` → registration skipped. The hook
// is server-only.
// (Flush registration moved into the StyleSheet constructor — see the
// `registerSSRFlush` option — so it is dropped together with the singleton
// when no styling API is used.)
