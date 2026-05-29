import { describe, expect, it } from 'vitest'
import { css } from '../css'
import { CSSResult } from '../resolve'
import { isDynamic } from '../shared'

describe('isDynamic', () => {
  it('returns true for function values', () => {
    expect(isDynamic(() => 'red')).toBe(true)
  })

  it('returns false for string values', () => {
    expect(isDynamic('color: red;')).toBe(false)
  })

  it('returns false for number values', () => {
    expect(isDynamic(42)).toBe(false)
  })

  it('returns false for null and undefined', () => {
    expect(isDynamic(null)).toBe(false)
    expect(isDynamic(undefined)).toBe(false)
  })

  it('returns false for boolean values', () => {
    expect(isDynamic(true)).toBe(false)
    expect(isDynamic(false)).toBe(false)
  })

  it('returns true for arrays containing functions', () => {
    expect(isDynamic(['a', () => 'b'])).toBe(true)
  })

  it('returns false for arrays of static values', () => {
    expect(isDynamic(['a', 'b', 42])).toBe(false)
  })

  it('returns true for CSSResult with dynamic values', () => {
    const result = css`
      color: ${() => 'red'};
    `
    expect(isDynamic(result)).toBe(true)
  })

  it('returns false for CSSResult with only static values', () => {
    const result = css`
      color: ${'red'};
    `
    expect(isDynamic(result)).toBe(false)
  })

  it('returns true for nested dynamic CSSResult', () => {
    const inner = css`
      color: ${() => 'red'};
    `
    const outer = css`
      ${inner}
    `
    expect(isDynamic(outer)).toBe(true)
  })

  it('returns false for nested static CSSResult', () => {
    const inner = css`
      color: red;
    `
    const outer = css`
      ${inner}
    `
    expect(isDynamic(outer)).toBe(false)
  })

  it('detects deeply nested dynamic values', () => {
    const deep = css`
      color: ${() => 'red'};
    `
    const mid = css`
      ${deep}
    `
    const outer = css`
      ${mid}
    `
    expect(isDynamic(outer)).toBe(true)
  })

  it('handles arrays inside CSSResult', () => {
    const result = new CSSResult(
      Object.assign(['', ''], { raw: ['', ''] }) as TemplateStringsArray,
      [['a', () => 'b']],
    )
    expect(isDynamic(result)).toBe(true)
  })

  // Behavioural lock-in for the CSSResult._isDynamic memoization (ported
  // from vitus-labs `c483cabc` + lock-in `60fc25c1`). Without these tests
  // a future regression that removed the cache would only show up as a
  // perf regression, never as a test failure.
  describe('CSSResult _isDynamic memoization', () => {
    it('populates _isDynamic on first call for dynamic templates', () => {
      const r = css`
        color: ${() => 'red'};
      `
      expect(r._isDynamic).toBe(undefined)
      isDynamic(r)
      expect(r._isDynamic).toBe(true)
    })

    it('populates _isDynamic on first call for static templates', () => {
      const r = css`
        color: ${'red'};
      `
      expect(r._isDynamic).toBe(undefined)
      isDynamic(r)
      expect(r._isDynamic).toBe(false)
    })

    it('returns cached result on subsequent calls without rescanning values', () => {
      const r = css`
        color: ${() => 'red'};
      `
      const first = isDynamic(r)
      expect(first).toBe(true)
      expect(r._isDynamic).toBe(true)

      // Mutate values to a sentinel that would invert the answer if rescanned.
      // The memoized path must NOT consult `values` again — it should return
      // the cached `_isDynamic` directly.
      ;(r as unknown as { values: unknown[] }).values = ['static-only']
      expect(isDynamic(r)).toBe(true) // still uses cached value, not rescan
    })

    it('memoizes nested CSSResults independently', () => {
      const inner = css`
        color: ${() => 'red'};
      `
      const outer = css`
        ${inner}
      `
      isDynamic(outer)
      // Recursing through outer populates inner too.
      expect(inner._isDynamic).toBe(true)
      expect(outer._isDynamic).toBe(true)
    })
  })
})
