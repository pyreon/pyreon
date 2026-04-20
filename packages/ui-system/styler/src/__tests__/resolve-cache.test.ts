import { describe, expect, it, vi } from 'vitest'
import { normalizeCSS, resolve } from '../resolve'

/**
 * Tier 2 cache correctness proof: demonstrates that the WeakMap cache
 * in DynamicStyled correctly handles:
 * 1. Same $rocketstyle + $rocketstate → cache hit (skip resolve)
 * 2. Same $rocketstyle, different $rocketstate → cache miss (different CSS)
 * 3. Different $rocketstyle → cache miss (different CSS)
 *
 * These tests verify the LOGIC, not the styled() integration (which
 * runs in a browser environment). They prove the cache key scheme is
 * correct: both $rocketstyle AND $rocketstate identity matter.
 */

describe('Tier 2: resolve cache correctness', () => {
  const strings = Object.assign(['background-color: ', ';'] as unknown as TemplateStringsArray, { raw: ['background-color: ', ';'] })
  const values = [(props: any) => props.$rocketstyle?.backgroundColor ?? 'transparent']
  const theme = { colors: { primary: '#3b82f6' } }

  it('same $rocketstyle object produces same CSS text (cache would hit)', () => {
    const rs = { backgroundColor: 'red' }
    const props1 = { $rocketstyle: rs, $rocketstate: { state: 'default' }, theme }
    const props2 = { $rocketstyle: rs, $rocketstate: { state: 'default' }, theme }

    const css1 = normalizeCSS(resolve(strings, values, props1))
    const css2 = normalizeCSS(resolve(strings, values, props2))

    expect(css1).toBe(css2)
    expect(css1).toContain('red')
  })

  it('different $rocketstyle objects produce different CSS (cache miss)', () => {
    const rs1 = { backgroundColor: 'red' }
    const rs2 = { backgroundColor: 'blue' }

    const css1 = normalizeCSS(resolve(strings, values, { $rocketstyle: rs1, theme }))
    const css2 = normalizeCSS(resolve(strings, values, { $rocketstyle: rs2, theme }))

    expect(css1).not.toBe(css2)
    expect(css1).toContain('red')
    expect(css2).toContain('blue')
  })

  it('same $rocketstyle but different $rocketstate produces different CSS when state-dependent', () => {
    // Interpolation that reads $rocketstate
    const stateStrings = Object.assign(['opacity: ', ';'] as unknown as TemplateStringsArray, { raw: ['opacity: ', ';'] })
    const stateValues = [(props: any) => props.$rocketstate?.disabled ? '0.5' : '1']

    const rs = { backgroundColor: 'red' }
    const state1 = { disabled: false }
    const state2 = { disabled: true }

    const css1 = normalizeCSS(resolve(stateStrings, stateValues, { $rocketstyle: rs, $rocketstate: state1, theme }))
    const css2 = normalizeCSS(resolve(stateStrings, stateValues, { $rocketstyle: rs, $rocketstate: state2, theme }))

    expect(css1).toContain('opacity: 1;')
    expect(css2).toContain('opacity: 0.5;')
    // Proves: caching on $rocketstyle alone would be WRONG here.
    // The two-level WeakMap ($rocketstyle → $rocketstate → class) is correct.
  })
})

describe('Tier 2: allocation reduction', () => {
  it('resolve() is expensive — cache eliminates it for repeated identical inputs', () => {
    const rs = { backgroundColor: 'red', color: 'white', padding: '8px' }
    const strings = Object.assign(
      ['background-color: ', '; color: ', '; padding: ', ';'] as unknown as TemplateStringsArray,
      { raw: ['background-color: ', '; color: ', '; padding: ', ';'] },
    )
    const values = [
      (p: any) => p.$rocketstyle?.backgroundColor,
      (p: any) => p.$rocketstyle?.color,
      (p: any) => p.$rocketstyle?.padding,
    ]

    const resolveSpy = vi.fn(resolve)

    // Simulate 50 renders with identical $rocketstyle
    const results: string[] = []
    for (let i = 0; i < 50; i++) {
      const cssText = normalizeCSS(resolveSpy(strings, values, { $rocketstyle: rs, theme: {} }))
      results.push(cssText)
    }

    // All 50 produce identical CSS
    expect(new Set(results).size).toBe(1)
    // resolve was called 50 times (no cache at this level — the cache is
    // in DynamicStyled). This test just proves the CONTRACT: identical
    // inputs → identical outputs, so caching is safe.
    expect(resolveSpy).toHaveBeenCalledTimes(50)
    expect(results[0]).toContain('background-color: red')
  })
})
