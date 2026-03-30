/**
 * StyleSheet manager. Handles CSS rule injection, hash-based deduplication,
 * SSR buffering, client-side hydration, bounded cache, and @layer support.
 *
 * Media queries (@media), @supports, and @container blocks nested inside
 * component CSS are automatically extracted into separate top-level rules.
 */
import { hash } from './hash'
import { clearNormCache } from './resolve'

const PREFIX = 'pyr'
const ATTR = 'data-pyreon-styler'
const DEFAULT_MAX_CACHE_SIZE = 10000

export interface StyleSheetOptions {
  /** Maximum number of cached rules before eviction (default: 10000). */
  maxCacheSize?: number
  /** CSS @layer name to wrap scoped rules in. */
  layer?: string
}

export class StyleSheet {
  private cache = new Map<string, string>()
  private insertCache = new Map<string, string>()
  private sheet: CSSStyleSheet | null = null
  private ssrBuffer: string[] = []
  private isSSR: boolean
  private maxCacheSize: number
  private layer: string | undefined

  constructor(options: StyleSheetOptions = {}) {
    this.maxCacheSize = options.maxCacheSize ?? DEFAULT_MAX_CACHE_SIZE
    this.layer = options.layer
    this.isSSR = typeof document === 'undefined'
    if (!this.isSSR) this.mount()
  }

  private mount() {
    // Reuse existing <style> tag from SSR hydration
    const existing = document.querySelector(`style[${ATTR}]`) as HTMLStyleElement | null

    if (existing) {
      this.sheet = existing.sheet ?? null
      this.hydrateFromTag(existing)
    } else {
      const el = document.createElement('style')
      el.setAttribute(ATTR, '')
      document.head.appendChild(el)
      this.sheet = el.sheet ?? null
    }

    // Inject @layer declaration if configured
    if (this.layer && this.sheet) {
      try {
        this.sheet.insertRule(`@layer ${this.layer};`, 0)
      } catch {
        // skip if @layer not supported
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
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex logic is inherent to this function
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

  /** Evict oldest entries when cache exceeds max size. */
  private evictIfNeeded() {
    if (this.cache.size <= this.maxCacheSize) return

    // Map iteration order is insertion order — delete oldest 10%
    const toDelete = Math.floor(this.maxCacheSize * 0.1)
    let count = 0
    for (const key of this.cache.keys()) {
      if (count >= toDelete) break
      this.cache.delete(key)
      count++
    }
  }

  /**
   * Extract nested at-rules (@media, @supports, @container) from CSS text
   * and wrap their content in the given selector as separate top-level rules.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex logic is inherent to this function
  private splitAtRules(cssText: string, selector: string): { base: string; atRules: string[] } {
    // Fast path: no at-rules to split
    if (cssText.indexOf('@') === -1) return { base: cssText, atRules: [] }

    const atRules: string[] = []
    const baseParts: string[] = []
    let depth = 0
    let atStart = -1
    let lastBase = 0

    for (let i = 0; i < cssText.length; i++) {
      const ch = cssText[i]

      if (ch === '{') {
        depth++
      } else if (ch === '}') {
        depth--
        if (depth === 0 && atStart >= 0) {
          // End of a tracked at-rule block — extract and wrap with selector
          const openBrace = cssText.indexOf('{', atStart)
          const atPrefix = cssText.slice(atStart, openBrace).trim()
          const innerCSS = cssText.slice(openBrace + 1, i).trim()
          if (innerCSS) {
            atRules.push(`${atPrefix}{${selector}{${innerCSS}}}`)
          }
          atStart = -1
          lastBase = i + 1
        }
      } else if (depth === 0 && ch === '@' && atStart < 0) {
        // Check if this starts a splittable at-rule (not @keyframes, @font-face, etc.)
        const remaining = cssText.slice(i, i + 20)
        if (/^@(?:media|supports|container)\b/.test(remaining)) {
          // Save any base CSS that precedes this at-rule
          const baseBefore = cssText.slice(lastBase, i).trim()
          if (baseBefore) baseParts.push(baseBefore)
          atStart = i
        }
      }
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
   * When `boost` is true, the selector is doubled (`.pyr-abc.pyr-abc`)
   * to raise specificity from (0,1,0) to (0,2,0).
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex logic is inherent to this function
  insert(cssText: string, boost = false): string {
    // Fast path: skip hash computation on repeated insertions of same CSS text
    const icKey = boost ? `${cssText}\0` : cssText
    const icHit = this.insertCache.get(icKey)
    if (icHit) return icHit

    const h = hash(cssText)
    const className = `${PREFIX}-${h}`

    if (this.cache.has(className)) {
      this.insertCache.set(icKey, className)
      return className
    }

    this.evictIfNeeded()
    this.cache.set(className, className)

    const selector = boost ? `.${className}.${className}` : `.${className}`

    // Split nested at-rules into separate top-level rules
    const { base, atRules } = this.splitAtRules(cssText, selector)

    const rules: string[] = []
    if (base) rules.push(`${selector}{${base}}`)
    rules.push(...atRules)

    // Apply @layer wrapping if configured
    const finalRules = this.layer ? rules.map((r) => `@layer ${this.layer}{${r}}`) : rules

    if (this.isSSR) {
      for (const rule of finalRules) {
        this.ssrBuffer.push(rule)
      }
    } else if (this.sheet) {
      for (const rule of finalRules) {
        try {
          this.sheet.insertRule(rule, this.sheet.cssRules.length)
        } catch (_e) {
          if (process.env.NODE_ENV !== 'production') {
            // biome-ignore lint/suspicious/noConsole: dev-only CSS rule insertion warning
            console.warn('[styler] Failed to insert CSS rule:', rule, _e)
          }
        }
      }
    }

    this.insertCache.set(icKey, className)
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
        this.sheet.insertRule(rule, this.sheet.cssRules.length)
      } catch (_e) {
        if (process.env.NODE_ENV !== 'production') {
          // silently ignore invalid CSS rules in production
        }
      }
    }
  }

  /**
   * Split CSS text into individual top-level rules.
   * CSSStyleSheet.insertRule() only accepts one rule at a time.
   */
  private splitRules(cssText: string): string[] {
    const rules: string[] = []
    let depth = 0
    let start = 0

    for (let i = 0; i < cssText.length; i++) {
      const ch = cssText[i]
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          const rule = cssText.slice(start, i + 1).trim()
          if (rule) rules.push(rule)
          start = i + 1
        }
      }
    }

    return rules
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
      const rules = this.splitRules(cssText)
      for (const rule of rules) {
        try {
          this.sheet.insertRule(rule, this.sheet.cssRules.length)
        } catch (_e) {
          if (process.env.NODE_ENV !== 'production') {
            // biome-ignore lint/suspicious/noConsole: dev-only CSS rule insertion warning
            console.warn('[styler] Failed to insert global CSS rule:', rule, _e)
          }
        }
      }
    }
  }

  /** Returns collected CSS for SSR as a complete `<style>` tag string. */
  getStyleTag(): string {
    const css = this.ssrBuffer.join('').replace(/<\/style/gi, '<\\/style')
    return `<style ${ATTR}="">${css}</style>`
  }

  /** Returns collected CSS rules as a raw string (useful for streaming SSR). */
  getStyles(): string {
    return this.ssrBuffer.join('')
  }

  /** Reset SSR buffer and cache (call between server requests). */
  reset(): void {
    this.ssrBuffer = []
    this.cache.clear()
    this.insertCache.clear()
  }

  /** Clear the dedup cache. Useful for HMR / dev-time reloads. */
  clearCache(): void {
    this.cache.clear()
    this.insertCache.clear()
    clearNormCache()
  }

  /**
   * Full cleanup: clear cache and remove all CSS rules from the DOM.
   * Intended for HMR / dev-time reloads where stale styles must be purged.
   */
  clearAll(): void {
    this.cache.clear()
    this.insertCache.clear()
    clearNormCache()
    this.ssrBuffer = []
    if (this.sheet) {
      while (this.sheet.cssRules.length > 0) {
        this.sheet.deleteRule(0)
      }
    }
  }

  /**
   * Compute className and full CSS rule text without injecting.
   */
  prepare(cssText: string, boost = false): { className: string; rules: string } {
    const h = hash(cssText)
    const className = `${PREFIX}-${h}`
    const selector = boost ? `.${className}.${className}` : `.${className}`
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

/** Default singleton sheet for client-side use. */
export const sheet = new StyleSheet()

/**
 * Factory for creating isolated StyleSheet instances.
 * Use in SSR to get per-request isolation.
 */
export const createSheet = (options?: StyleSheetOptions): StyleSheet => new StyleSheet(options)
