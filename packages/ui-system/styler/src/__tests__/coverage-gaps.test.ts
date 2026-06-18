/**
 * Coverage-focused node tests for the structural (non-dev-gate) edge
 * paths in styler that the happy-dom live-DOM and SSR suites leave
 * unexercised. Each test drives a real code path:
 *
 * - sheet.ts: no-sheet defensive branches, hydrateFromTag edge cases
 *   (non-class selectors, media rules with non-style inners), empty-rule
 *   splits, layerDecl ternaries with a non-layered SSR buffer, the
 *   ruleCountForTest/injectRules no-sheet fallbacks, trackDomRule(null).
 * - forward.ts: reactive class getter returning nullish with no generated
 *   class, copyDescriptor over an inherited (non-own) enumerable key.
 * - useCSS.ts: the falsy-theme ternary branch (theme accessor returns
 *   null) with and without props.
 */
import { popContext, pushContext } from '@pyreon/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { css } from '../css'
import { buildProps } from '../forward'
import { StyleSheet } from '../sheet'
import { ThemeContext } from '../ThemeProvider'
import { useCSS } from '../useCSS'

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── sheet.ts: a StyleSheet whose live `sheet` failed to bind ──────────────
//
// Mocks document.createElement so the new <style> reports `sheet: null`.
// Drives `el.sheet ?? null` (right side) at mount, `if (this.sheet)`
// (false) for the @layer injection, and the `else if (this.sheet)`
// (false) fallthrough in insert/insertKeyframes/insertGlobal/injectRules.
function makeNullSheet(): StyleSheet {
  document.querySelectorAll('style[data-pyreon-styler]').forEach((e) => {
    e.remove()
  })
  const realCreate = document.createElement.bind(document)
  const spy = vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    const el = realCreate(tag as 'style')
    if (tag === 'style') {
      Object.defineProperty(el, 'sheet', { value: null, configurable: true })
    }
    return el
  }) as typeof document.createElement)
  const s = new StyleSheet()
  spy.mockRestore()
  return s
}

// Remove any leftover styler <style> tags so a fresh `new StyleSheet()`
// creates a real-sheet element instead of reusing a prior test's
// (possibly null-sheet) tag.
function cleanTags(): void {
  document.querySelectorAll('style[data-pyreon-styler]').forEach((e) => {
    e.remove()
  })
}

function makeSSRSheet(options?: ConstructorParameters<typeof StyleSheet>[0]): StyleSheet {
  const originalDoc = globalThis.document
  Object.defineProperty(globalThis, 'document', {
    value: undefined,
    configurable: true,
    writable: true,
  })
  const s = new StyleSheet(options)
  Object.defineProperty(globalThis, 'document', {
    value: originalDoc,
    configurable: true,
    writable: true,
  })
  return s
}

describe('StyleSheet — live sheet unavailable (this.sheet === null)', () => {
  it('mount with a null-sheet <style>: no @layer injected, insert is a no-op write', () => {
    const s = makeNullSheet()
    expect((s as unknown as { sheet: unknown }).sheet).toBeNull()
    // insert: else-if (this.sheet) is false → className still returned, no DOM write
    const cls = s.insert('color: red')
    expect(cls).toMatch(/^pyr-/)
    expect(s.ruleCountForTest()).toBe(0) // sheet?.cssRules right-side ?? 0
  })

  it('insertKeyframes with no sheet: no DOM write, no throw', () => {
    const s = makeNullSheet()
    expect(() => s.insertKeyframes('spin', 'from{opacity:0}to{opacity:1}')).not.toThrow()
  })

  it('insertGlobal with no sheet: no DOM write, no throw', () => {
    const s = makeNullSheet()
    expect(() => s.insertGlobal('body { margin: 0 }')).not.toThrow()
  })

  it('injectRules with no sheet: early-return before insertRule', () => {
    const s = makeNullSheet()
    expect(() => s.injectRules(['.pyr-x{color:red}'], 'k')).not.toThrow()
    expect(s.ruleCountForTest()).toBe(0)
  })

  it('ruleCountForTest returns 0 when sheet is null', () => {
    const s = makeNullSheet()
    expect(s.ruleCountForTest()).toBe(0)
  })
})

// ─── sheet.ts: hydrateFromTag edge cases ───────────────────────────────────
describe('StyleSheet — hydrateFromTag edge cases', () => {
  function freshTag(): HTMLStyleElement {
    document.querySelectorAll('style[data-pyreon-styler]').forEach((e) => {
      e.remove()
    })
    const el = document.createElement('style')
    el.setAttribute('data-pyreon-styler', '')
    document.head.appendChild(el)
    return el
  }

  it('existing <style> with a null sheet: hydrateFromTag early-returns', () => {
    const el = freshTag()
    Object.defineProperty(el, 'sheet', { value: null, configurable: true })
    // Construction finds the existing tag, takes `existing.sheet ?? null`
    // (null side), hydrateFromTag's `if (!sheet) return` fires.
    expect(() => new StyleSheet()).not.toThrow()
  })

  it('non-class top-level selector is skipped (extractClassName → null)', () => {
    const el = freshTag()
    // `body { ... }` does not start with '.', so extractClassName returns
    // null and `if (className)` is false — nothing cached.
    el.sheet?.insertRule('body { color: red }', 0)
    const s = new StyleSheet()
    expect(s.has('body')).toBe(false)
    expect(s.cacheSize).toBe(0)
  })

  it('compound class selector (.a.a) extracts the first class (dotIdx > 0)', () => {
    const el = freshTag()
    el.sheet?.insertRule('.pyr-dup.pyr-dup { color: red }', 0)
    const s = new StyleSheet()
    expect(s.has('pyr-dup')).toBe(true)
  })

  it('@media rule with a non-CSSStyleRule inner is skipped', () => {
    const el = freshTag()
    // Inner is a nested @media (a CSSMediaRule, not a CSSStyleRule) →
    // `if (inner instanceof CSSStyleRule)` false.
    el.sheet?.insertRule(
      '@media (min-width: 1px) { @media (min-width: 2px) { .pyr-deep { color: red } } }',
      0,
    )
    const s = new StyleSheet()
    // The directly-nested .pyr-deep is two levels deep, never hydrated.
    expect(s.has('pyr-deep')).toBe(false)
  })

  it('@media rule with a non-class inner selector is skipped (className null)', () => {
    const el = freshTag()
    el.sheet?.insertRule('@media (min-width: 1px) { span { color: red } }', 0)
    const s = new StyleSheet()
    // `span` extracts to null → `if (className)` false for the media inner.
    expect(s.cacheSize).toBe(0)
  })
})

// ─── sheet.ts: splitAtRules / splitRules empty-segment branches ─────────────
describe('StyleSheet — empty-segment splitting branches', () => {
  it('at-rule with an empty body is dropped (innerCSS falsy)', () => {
    const s = makeSSRSheet()
    // The @media block has no inner declarations → `if (innerCSS)` false,
    // so it is NOT pushed to atRules. With zero surviving at-rules,
    // splitAtRules returns the original cssText as the base.
    const cls = s.insert('color: red; @media (min-width: 1px) {  }')
    expect(cls).toMatch(/^pyr-/)
    const rules = s.getStyleRules()
    expect(rules.some((r) => r.includes('color: red'))).toBe(true)
  })

  it('trailing whitespace-only base after an at-rule is dropped (remaining falsy)', () => {
    const s = makeSSRSheet()
    // After the @media block, only whitespace remains → `if (remaining)`
    // false, so no extra base segment is pushed.
    s.insert('@media (min-width: 1px) { .x { color: red } }   ')
    const rules = s.getStyleRules()
    expect(rules.length).toBeGreaterThan(0)
  })

  it('splitRules drops empty/whitespace top-level rules (global insert)', () => {
    const s = makeNullSheet()
    // Two real rules separated by stray whitespace+braces — the trimmed
    // empty segment hits `if (rule)` false. No sheet → no DOM write, but
    // splitRules still runs over the cssText.
    ;(s as unknown as { sheet: CSSStyleSheet | null }).sheet =
      null as unknown as CSSStyleSheet | null
    // Re-point to a live sheet so splitRules is reached (else-if this.sheet).
    const live = document.createElement('style')
    document.head.appendChild(live)
    ;(s as unknown as { sheet: CSSStyleSheet | null }).sheet = live.sheet
    expect(() => s.insertGlobal('  body { margin: 0 }   .x { padding: 0 } ')).not.toThrow()
    live.remove()
  })
})

// ─── sheet.ts: getStyleTag / flushSSRPending layerDecl ternaries ───────────
describe('StyleSheet — layerDecl with a configured layer but no layered rules', () => {
  it('getStyleTag emits @layer <layer>; when buffer is non-layered', () => {
    const s = makeSSRSheet({ layer: 'mylayer' })
    // injectRules pushes RAW (non-@layer-wrapped) rules into the buffer,
    // so hasLayeredRules() is false → the nested `this.layer ? ... : ''`
    // (truthy) branch fires.
    s.injectRules(['.pyr-raw{color:red}'], 'k')
    const tag = s.getStyleTag()
    expect(tag).toContain('@layer mylayer;')
    expect(tag).not.toContain('@layer elements, rocketstyle;')
  })

  it('flushSSRPending emits @layer <layer>; when first-flush buffer is non-layered', () => {
    const s = makeSSRSheet({ layer: 'mylayer' })
    s.injectRules(['.pyr-raw{color:blue}'], 'k')
    const out = s.flushSSRPending()
    expect(out).toContain('@layer mylayer;')
    expect(out).not.toContain('@layer elements, rocketstyle;')
  })

  it('getStyles emits @layer <layer>; for a non-layered buffer', () => {
    const s = makeSSRSheet({ layer: 'mylayer' })
    s.injectRules(['.pyr-raw{color:green}'], 'k')
    expect(s.getStyles()).toContain('@layer mylayer;')
  })

  it('getStyleTag emits @layer elements, rocketstyle; when buffer IS layered', () => {
    // SSR `insert` with a layer wraps each rule in `@layer …{…}`, so
    // hasLayeredRules() is true → the truthy side of the layerDecl ternary.
    const s = makeSSRSheet({ layer: 'comp' })
    s.insert('color: red')
    expect(s.getStyleTag()).toContain('@layer elements, rocketstyle;')
  })
})

// ─── sheet.ts: insertKeyframes dev-mode failure warning ────────────────────
describe('StyleSheet — insertKeyframes dev-mode insertRule failure', () => {
  it('warns once when insertKeyframes.insertRule throws (dev gate)', () => {
    cleanTags()
    const s = new StyleSheet()
    const realSheet = (s as unknown as { sheet: CSSStyleSheet | null }).sheet
    if (!realSheet) return
    const Proto = Object.getPrototypeOf(realSheet) as CSSStyleSheet
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const orig = Proto.insertRule
    Proto.insertRule = function () {
      throw new Error('Invalid @keyframes')
    }
    try {
      expect(() => s.insertKeyframes('spin', 'from{opacity:0}to{opacity:1}')).not.toThrow()
      expect(warn).toHaveBeenCalledWith(
        '[styler] Failed to insert @keyframes rule:',
        expect.anything(),
        expect.anything(),
      )
    } finally {
      Proto.insertRule = orig
    }
  })
})

// ─── sheet.ts: trackDomRule(null) defensive skip ───────────────────────────
describe('StyleSheet — trackDomRule null-ref skip', () => {
  it('insert tolerates insertRule returning an out-of-range index', () => {
    // Some CSSOM shims may return an index that does not address a live
    // `cssRules[at]` entry; trackDomRule's `if (!ref) return` guards that.
    cleanTags()
    const s = new StyleSheet()
    const realSheet = (s as unknown as { sheet: CSSStyleSheet | null }).sheet
    if (!realSheet) return
    const orig = realSheet.insertRule.bind(realSheet)
    realSheet.insertRule = ((rule: string) => {
      orig(rule, realSheet.cssRules.length)
      // Report a bogus index so `cssRules[at]` is undefined → trackDomRule(null).
      return realSheet.cssRules.length + 5
    }) as typeof realSheet.insertRule
    try {
      expect(() => s.insert('color: rgb(0, 128, 129)')).not.toThrow()
    } finally {
      realSheet.insertRule = orig
    }
  })
})

// ─── sheet.ts: validateDevCss inner production guard ───────────────────────
describe('StyleSheet — validateDevCss inner production early-return', () => {
  it('validateDevCss returns immediately in production without scanning', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = new StyleSheet()
    // Call the private validator directly so its own `=== 'production'`
    // first-line guard is exercised (the public `insert` skips calling it
    // entirely in production via a separate outer gate).
    ;(s as unknown as { validateDevCss(t: string): void }).validateDevCss('padding: NaNrem;')
    expect(warn).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })
})

// ─── forward.ts: buildProps edge branches ──────────────────────────────────
describe('buildProps — uncovered branches', () => {
  it('reactive class getter returning undefined with no generated class → empty string', () => {
    const rawProps: Record<string, any> = {}
    Object.defineProperty(rawProps, 'class', {
      enumerable: true,
      configurable: true,
      get() {
        return undefined
      },
    })
    // generatedCls is '' → the getter's `return uc ?? ''` right-side fires.
    const result = buildProps(rawProps, '', true)
    expect(result.class).toBe('')
  })

  it('copyDescriptor over an inherited enumerable key (no own descriptor → no copy)', () => {
    // `for...in` enumerates inherited enumerable props, but
    // getOwnPropertyDescriptor only returns own ones → `if (d)` is false
    // for the inherited key, so it is not copied.
    const proto = { inheritedProp: 'fromProto' }
    const rawProps: Record<string, any> = Object.create(proto)
    rawProps.id = 'own'
    // isDOM=false routes every non-as/class/$ key through copyDescriptor.
    const result = buildProps(rawProps, 'pyr-gen', false)
    expect(result.id).toBe('own')
    // inheritedProp is enumerated by for-in but has no OWN descriptor →
    // copyDescriptor's `if (d)` is false and it is not forwarded.
    expect(Object.prototype.hasOwnProperty.call(result, 'inheritedProp')).toBe(false)
  })
})

// ─── useCSS.ts: falsy theme ternary ────────────────────────────────────────
describe('useCSS — falsy theme accessor', () => {
  function withFalsyTheme(fn: () => void) {
    // Provide a reactive ThemeContext whose accessor returns null, so
    // `theme` is falsy and the ternary's false branch (`props ?? {}`) runs.
    pushContext(new Map([[ThemeContext.id, (() => null) as unknown]]))
    try {
      fn()
    } finally {
      popContext()
    }
  }

  it('uses props when theme is falsy and props are provided', () => {
    const template = css`
      color: ${(p: any) => p.color};
    `
    let result = ''
    withFalsyTheme(() => {
      result = useCSS(template, { color: 'red' })
    })
    expect(result).toMatch(/^pyr-/)
  })

  it('uses empty object when theme is falsy and no props', () => {
    const template = css`
      display: flex;
    `
    let result = ''
    withFalsyTheme(() => {
      result = useCSS(template)
    })
    expect(result).toMatch(/^pyr-/)
  })
})
