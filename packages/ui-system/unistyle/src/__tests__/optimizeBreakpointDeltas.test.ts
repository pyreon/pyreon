import { describe, expect, it } from 'vitest'
import { optimizeBreakpointDeltas } from '../responsive'

describe('optimizeBreakpointDeltas', () => {
  describe('cascade pruning', () => {
    it('returns input unchanged when there is one or fewer breakpoints', () => {
      expect(optimizeBreakpointDeltas([])).toEqual([])
      expect(optimizeBreakpointDeltas(['color: red;'])).toEqual(['color: red;'])
    })

    it('strips re-emitted unchanged declarations from later breakpoints', () => {
      const out = optimizeBreakpointDeltas([
        'color: red; padding: 0;',
        'color: red; padding: 1rem;',
      ])
      expect(out[0]).toBe('color: red; padding: 0;')
      // `color: red` was already in the cascade — only padding survives
      expect(out[1]).toBe('padding: 1rem;')
    })

    it('keeps changed declarations across multiple breakpoints', () => {
      const out = optimizeBreakpointDeltas([
        'color: red; font-size: 12px;',
        'color: blue; font-size: 12px;',
        'color: blue; font-size: 16px;',
      ])
      expect(out[0]).toBe('color: red; font-size: 12px;')
      expect(out[1]).toBe('color: blue;')
      expect(out[2]).toBe('font-size: 16px;')
    })

    it('emits empty string when a later breakpoint adds no deltas', () => {
      const out = optimizeBreakpointDeltas([
        'color: red; padding: 0;',
        'color: red; padding: 0;',
      ])
      expect(out[0]).toBe('color: red; padding: 0;')
      expect(out[1]).toBe('')
    })

    it('passes through empty / null breakpoints unchanged', () => {
      const out = optimizeBreakpointDeltas(['color: red;', '', 'color: blue;'])
      expect(out[0]).toBe('color: red;')
      expect(out[1]).toBe('')
      expect(out[2]).toBe('color: blue;')
    })
  })

  describe('parser edge cases', () => {
    it('skips colons inside parens (linear-gradient args)', () => {
      const out = optimizeBreakpointDeltas([
        'background: linear-gradient(red 0%, blue 100%);',
        'background: linear-gradient(red 0%, blue 100%);',
      ])
      expect(out[0]).toBe('background: linear-gradient(red 0%, blue 100%);')
      // Same value cascades — delta is empty
      expect(out[1]).toBe('')
    })

    it('skips semicolons inside quoted strings (content: ";")', () => {
      const out = optimizeBreakpointDeltas([
        `content: ";"; color: red;`,
        `content: ";"; color: blue;`,
      ])
      // Both declarations parsed correctly on bp1; bp2 only color delta
      expect(out[0]).toContain(`content: ";";`)
      expect(out[0]).toContain('color: red;')
      expect(out[1]).toBe('color: blue;')
    })

    it('treats nested selector blocks as opaque, deduped by exact text', () => {
      const out = optimizeBreakpointDeltas([
        '&:hover { color: red; } padding: 0;',
        '&:hover { color: red; } padding: 1rem;',
      ])
      // The hover block dedupes; padding delta survives
      expect(out[1]).not.toContain('&:hover')
      expect(out[1]).toContain('padding: 1rem;')
    })

    it('keeps differently-shaped nested blocks across breakpoints', () => {
      const out = optimizeBreakpointDeltas([
        '&:hover { color: red; }',
        '&:hover { color: blue; }',
      ])
      expect(out[0]).toContain('&:hover { color: red; }')
      // Different inner text → not deduped
      expect(out[1]).toContain('&:hover { color: blue; }')
    })

    it('handles trailing declarations with no terminating semicolon', () => {
      const out = optimizeBreakpointDeltas(['color: red', 'color: blue'])
      expect(out[0]).toBe('color: red;')
      expect(out[1]).toBe('color: blue;')
    })

    it('preserves @supports / @media-style nested blocks as opaque blocks', () => {
      const out = optimizeBreakpointDeltas([
        '@supports (display: grid) { display: grid; }',
        '@supports (display: grid) { display: grid; } color: red;',
      ])
      expect(out[0]).toBe('@supports (display: grid) { display: grid; }')
      // @supports block dedupes; color is new
      expect(out[1]).toBe('color: red;')
    })

    it('keeps shorthand and longhand decls separately (no shorthand modeling)', () => {
      const out = optimizeBreakpointDeltas([
        'padding: 1rem;',
        'padding-top: 0;',
      ])
      // Different `prop` keys → both retained
      expect(out[0]).toBe('padding: 1rem;')
      expect(out[1]).toBe('padding-top: 0;')
    })

    it('keeps malformed declaration-shaped fragments without losing them', () => {
      const out = optimizeBreakpointDeltas([':abc;', ':abc;'])
      // No prop name (starts with `:`) → kept as opaque block; deduped on bp2
      expect(out[0]).toBe(':abc;')
      expect(out[1]).toBe('')
    })
  })
})
