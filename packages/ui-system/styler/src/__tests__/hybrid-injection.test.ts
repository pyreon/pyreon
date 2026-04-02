/**
 * Tests for the hybrid injection approach:
 * - Client (jsdom): shared <style data-pyreon-styler> sheet
 * - CSS rules present in the CSSOM sheet after insertion
 * - `layer` option threaded from styled() through to the sheet
 *
 * Ported to VNode-level testing: we call the component function directly
 * and inspect the returned VNode + the sheet's CSSOM.
 */

import type { VNode } from '@pyreon/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGlobalStyle } from '../globalStyle'
import { sheet } from '../sheet'
import { styled } from '../styled'

/** Helper: collect all CSS rule texts from the shared <style data-pyreon-styler> sheet. */
const getSheetRules = (): string[] => {
  const el = document.querySelector('style[data-pyreon-styler]') as HTMLStyleElement | null
  if (!el?.sheet) return []
  return Array.from(el.sheet.cssRules).map((r) => r.cssText)
}

/** Helper: find rules matching a className in the CSSOM. */
const findRulesFor = (className: string): string[] =>
  getSheetRules().filter((r) => r.includes(`.${className}`))

describe('hybrid injection — CSS in shared sheet', () => {
  afterEach(() => {
    sheet.clearAll()
  })

  describe('static styled components', () => {
    it('injects CSS rules into the shared <style data-pyreon-styler> element', () => {
      const Comp = styled('div')`
        color: red;
      `
      const vnode = Comp({}) as VNode
      const className = vnode.props.class as string

      const rules = findRulesFor(className)
      expect(rules.length).toBeGreaterThanOrEqual(1)
      expect(rules.some((r) => r.includes('color: red'))).toBe(true)
    })

    it('multiple static components share the same <style> element', () => {
      const A = styled('div')`
        color: red;
      `
      const B = styled('span')`
        font-size: 20px;
      `

      A({})
      B({})

      // Both should be in the same sheet
      const styleEls = document.querySelectorAll('style[data-pyreon-styler]')
      expect(styleEls.length).toBe(1)

      const rules = getSheetRules()
      expect(rules.some((r) => r.includes('color: red'))).toBe(true)
      expect(rules.some((r) => r.includes('font-size: 20px'))).toBe(true)
    })
  })

  describe('dynamic styled components', () => {
    it('injects CSS into the shared sheet', () => {
      const Comp = styled('div')`
        color: ${(p: any) => p.$color};
      `
      const vnode = Comp({ $color: 'blue' }) as VNode
      const className = vnode.props.class as string

      const rules = findRulesFor(className)
      expect(rules.length).toBeGreaterThanOrEqual(1)
      expect(rules.some((r) => r.includes('color: blue'))).toBe(true)
    })

    it('different prop values inject different CSS rules into the sheet', () => {
      const Comp = styled('div')`
        color: ${(p: any) => p.$color};
      `
      const vnode1 = Comp({ $color: 'red' }) as VNode
      const cls1 = vnode1.props.class as string

      const vnode2 = Comp({ $color: 'green' }) as VNode
      const cls2 = vnode2.props.class as string

      expect(cls1).not.toBe(cls2)

      // Both rules should be in the sheet
      expect(findRulesFor(cls1).some((r) => r.includes('color: red'))).toBe(true)
      expect(findRulesFor(cls2).some((r) => r.includes('color: green'))).toBe(true)
    })
  })

  describe('createGlobalStyle', () => {
    it('static global styles are injected into the shared sheet', () => {
      const GlobalStyle = createGlobalStyle`
        body { margin: 0; }
      `
      // Static global styles are injected at creation time
      GlobalStyle({})

      const rules = getSheetRules()
      expect(rules.some((r) => r.includes('margin') && r.includes('0'))).toBe(true)
    })
  })
})

describe('hybrid injection — VNode output (no <style> in tree)', () => {
  afterEach(() => {
    sheet.clearAll()
  })

  describe('styled components', () => {
    it('static component returns a VNode of the correct tag', () => {
      const Comp = styled('div')`
        color: red;
      `
      const vnode = Comp({}) as VNode

      // Should return a VNode for <div>, not a <style>
      expect(vnode.type).toBe('div')
    })

    it('dynamic component returns a VNode of the correct tag', () => {
      const Comp = styled('div')`
        color: ${(p: any) => p.$color};
      `
      const vnode = Comp({ $color: 'red' }) as VNode

      expect(vnode.type).toBe('div')
    })

    it('multiple styled components produce correct VNode types', () => {
      const A = styled('div')`
        color: red;
      `
      const B = styled('span')`
        color: blue;
      `

      const vnodeA = A({}) as VNode
      const vnodeB = B({}) as VNode

      expect(vnodeA.type).toBe('div')
      expect(vnodeB.type).toBe('span')
    })
  })

  describe('createGlobalStyle', () => {
    it('static global style returns null', () => {
      const GlobalStyle = createGlobalStyle`body { margin: 0; }`
      const result = GlobalStyle({})

      expect(result).toBeNull()
    })
  })
})

describe('hybrid injection — layer option at component level', () => {
  afterEach(() => {
    sheet.clearAll()
  })

  it('static layered component generates className', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const Comp = styled('div', { layer: 'rocketstyle' })`
      color: red;
    `
    const vnode = Comp({}) as VNode
    const className = vnode.props.class as string

    // className is generated regardless of CSSOM @layer support
    expect(className).toMatch(/^pyr-/)
    warnSpy.mockRestore()
  })

  it('dynamic layered component generates className', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const Comp = styled('div', { layer: 'rocketstyle' })`
      color: ${(p: any) => p.$color};
    `
    const vnode = Comp({ $color: 'blue' }) as VNode
    const className = vnode.props.class as string

    // className is generated regardless of CSSOM @layer support
    expect(className).toMatch(/^pyr-/)
    warnSpy.mockRestore()
  })

  it('default sheet component produces valid className and injects rule', () => {
    const Comp = styled('div')`
      color: green;
    `
    const vnode = Comp({}) as VNode
    const className = vnode.props.class as string

    expect(className).toMatch(/^pyr-/)
    // In environments without @layer support (happy-dom), rules are inserted
    // without layer wrapping. In real browsers, they'd be in @layer pyreon.
    const rules = findRulesFor(className)
    expect(rules.length).toBeGreaterThanOrEqual(1)
    const baseRule = rules[0] as string
    expect(baseRule).toContain(`.${className}`)
    expect(baseRule).toContain('color: green')
  })

  it('layered component with @media generates className', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const Comp = styled('div', { layer: 'rocketstyle' })`
      color: red;
      @media (min-width: 768px) {
        font-size: 20px;
      }
    `
    const vnode = Comp({}) as VNode
    const className = vnode.props.class as string

    expect(className).toMatch(/^pyr-/)
    warnSpy.mockRestore()
  })
})
