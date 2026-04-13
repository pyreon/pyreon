import { describe, expect, it } from 'vitest'
import breakpoints from '../responsive/breakpoints'
import normalizeTheme from '../responsive/normalizeTheme'
import optimizeTheme from '../responsive/optimizeTheme'
import sortBreakpoints from '../responsive/sortBreakpoints'
import transformTheme from '../responsive/transformTheme'

describe('breakpoints', () => {
  it('has expected default config', () => {
    expect(breakpoints.rootSize).toBe(16)
    expect(breakpoints.breakpoints).toHaveProperty('xs')
    expect(breakpoints.breakpoints).toHaveProperty('sm')
    expect(breakpoints.breakpoints).toHaveProperty('md')
    expect(breakpoints.breakpoints).toHaveProperty('lg')
    expect(breakpoints.breakpoints).toHaveProperty('xl')
    expect(breakpoints.breakpoints).toHaveProperty('xxl')
  })

  it('has correct pixel values', () => {
    expect(breakpoints.breakpoints.xs).toBe(0)
    expect(breakpoints.breakpoints.sm).toBe(576)
    expect(breakpoints.breakpoints.md).toBe(768)
    expect(breakpoints.breakpoints.lg).toBe(992)
    expect(breakpoints.breakpoints.xl).toBe(1200)
    expect(breakpoints.breakpoints.xxl).toBe(1440)
  })
})

describe('sortBreakpoints', () => {
  it('sorts breakpoints by value ascending, returns keys', () => {
    const bps = { md: 768, xs: 0, xl: 1200, sm: 576 }
    const sorted = sortBreakpoints(bps)
    expect(sorted).toEqual(['xs', 'sm', 'md', 'xl'])
  })

  it('handles already sorted breakpoints', () => {
    const sorted = sortBreakpoints({ xs: 0, sm: 576, md: 768 })
    expect(sorted).toEqual(['xs', 'sm', 'md'])
  })

  it('handles single breakpoint', () => {
    expect(sortBreakpoints({ xs: 0 })).toEqual(['xs'])
  })

  it('handles empty object', () => {
    expect(sortBreakpoints({})).toEqual([])
  })

  it('sorts full default breakpoint set', () => {
    const sorted = sortBreakpoints(breakpoints.breakpoints)
    expect(sorted).toEqual(['xs', 'sm', 'md', 'lg', 'xl', 'xxl'])
  })
})

describe('normalizeTheme', () => {
  const bpKeys = ['xs', 'sm', 'md', 'lg', 'xl']

  it('returns theme as-is when no nested objects/arrays', () => {
    const theme = { color: 'red', fontSize: 16 }
    const result = normalizeTheme({ theme, breakpoints: bpKeys })
    expect(result).toEqual(theme)
  })

  it('expands array values across breakpoints', () => {
    const theme = { fontSize: [12, 14, 16, 18, 20] }
    const result = normalizeTheme({ theme, breakpoints: bpKeys })
    expect(result.fontSize).toEqual({
      xs: 12,
      sm: 14,
      md: 16,
      lg: 18,
      xl: 20,
    })
  })

  it('array values use last value for extra breakpoints', () => {
    const theme = { fontSize: [12, 14] }
    const result = normalizeTheme({ theme, breakpoints: bpKeys })
    expect((result.fontSize as Record<string, unknown>).xs).toBe(12)
    expect((result.fontSize as Record<string, unknown>).sm).toBe(14)
    expect((result.fontSize as Record<string, unknown>).md).toBe(14)
  })

  it('expands object values with carry-forward', () => {
    const theme = { fontSize: { xs: 12, md: 16 } }
    const result = normalizeTheme({ theme, breakpoints: bpKeys })
    const fs = result.fontSize as Record<string, unknown>
    expect(fs.xs).toBe(12)
    expect(fs.sm).toBe(12) // carried from xs
    expect(fs.md).toBe(16)
    expect(fs.lg).toBe(16) // carried from md
  })

  it('skips null values', () => {
    const theme = { color: null, fontSize: 16 }
    const result = normalizeTheme({ theme, breakpoints: bpKeys })
    expect(result.color).toBeUndefined()
  })
})

describe('transformTheme', () => {
  const bpKeys = ['xs', 'sm', 'md']

  it('pivots scalar values to first breakpoint', () => {
    const theme = { color: 'red' }
    const result = transformTheme({ theme, breakpoints: bpKeys })
    expect(result.xs).toEqual({ color: 'red' })
  })

  it('pivots object values to breakpoints', () => {
    const theme = { color: { xs: 'red', md: 'blue' } }
    const result = transformTheme({ theme, breakpoints: bpKeys })
    expect(result.xs).toEqual({ color: 'red' })
    expect(result.md).toEqual({ color: 'blue' })
  })

  it('pivots array values by index', () => {
    const theme = { fontSize: [12, 14, 16] }
    const result = transformTheme({ theme, breakpoints: bpKeys })
    expect(result.xs).toEqual({ fontSize: 12 })
    expect(result.sm).toEqual({ fontSize: 14 })
    expect(result.md).toEqual({ fontSize: 16 })
  })

  it('returns empty object for empty theme', () => {
    expect(transformTheme({ theme: {}, breakpoints: bpKeys })).toEqual({})
  })

  it('returns empty object for empty breakpoints', () => {
    expect(transformTheme({ theme: { color: 'red' }, breakpoints: [] })).toEqual({})
  })

  it('filters out unexpected breakpoint keys', () => {
    const theme = { color: { xs: 'red', unknown: 'green' } }
    const result = transformTheme({ theme, breakpoints: bpKeys })
    expect(result).not.toHaveProperty('unknown')
  })
})

describe('optimizeTheme', () => {
  const bpKeys = ['xs', 'sm', 'md', 'lg']

  it('keeps first breakpoint', () => {
    const theme = {
      xs: { color: 'red' },
      sm: { color: 'blue' },
    }
    const result = optimizeTheme({ theme, breakpoints: bpKeys })
    expect(result.xs).toEqual({ color: 'red' })
  })

  it('removes duplicate breakpoints', () => {
    const theme = {
      xs: { color: 'red' },
      sm: { color: 'red' },
      md: { color: 'blue' },
    }
    const result = optimizeTheme({ theme, breakpoints: bpKeys })
    expect(result.xs).toEqual({ color: 'red' })
    expect(result.sm).toBeUndefined()
    expect(result.md).toEqual({ color: 'blue' })
  })

  it('keeps breakpoints with different values', () => {
    const theme = {
      xs: { color: 'red', fontSize: 12 },
      sm: { color: 'red', fontSize: 14 },
    }
    const result = optimizeTheme({ theme, breakpoints: bpKeys })
    expect(result.xs).toBeDefined()
    expect(result.sm).toBeDefined()
  })

  it('handles empty theme', () => {
    expect(optimizeTheme({ theme: {}, breakpoints: bpKeys })).toEqual({})
  })

  it('keeps entire breakpoint when ANY property differs from previous (all-or-nothing)', () => {
    // Simple all-or-nothing: if the breakpoint differs from the previous
    // one AT ALL (via shallow comparison), emit the ENTIRE breakpoint.
    // Matches reference implementation and original monorepo-migration
    // version. Previous per-property "optimizations" broke shorthand/
    // longhand interactions and property ordering guarantees.
    const theme = {
      xs: { maxWidth: '90%', height: '100%' },
      sm: { maxWidth: '33.75rem', height: '100%' },
      md: { maxWidth: '43.75rem', height: '100%' },
      lg: { maxWidth: '58.75rem', height: '100%' },
    }
    const result = optimizeTheme({ theme, breakpoints: bpKeys })
    expect(result.xs).toEqual({ maxWidth: '90%', height: '100%' })
    // Full breakpoints kept — height IS duplicated but that's correct:
    // the browser cascades one media query's properties independently,
    // and partial property emission breaks shorthand/longhand ordering.
    expect(result.sm).toEqual({ maxWidth: '33.75rem', height: '100%' })
    expect(result.md).toEqual({ maxWidth: '43.75rem', height: '100%' })
    expect(result.lg).toEqual({ maxWidth: '58.75rem', height: '100%' })
  })

  it('drops breakpoint when FULLY identical to previous (shallowEqual)', () => {
    const theme = {
      xs: { color: 'red', size: 12 },
      sm: { color: 'red', size: 12 }, // identical to xs — dropped
      md: { color: 'blue', size: 12 }, // differs → full breakpoint kept
    }
    const result = optimizeTheme({ theme, breakpoints: bpKeys })
    expect(result.xs).toEqual({ color: 'red', size: 12 })
    expect(result.sm).toBeUndefined()
    expect(result.md).toEqual({ color: 'blue', size: 12 })
  })

  it('emits full breakpoint when keys differ (property added/removed)', () => {
    const theme = {
      xs: { color: 'red' },
      sm: { color: 'red', padding: 10 },
    }
    const result = optimizeTheme({ theme, breakpoints: bpKeys })
    expect(result.xs).toEqual({ color: 'red' })
    expect(result.sm).toEqual({ color: 'red', padding: 10 })
  })
})
