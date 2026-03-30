import { describe, expect, it } from 'vitest'
import createMediaQueries from '../responsive/createMediaQueries'

const mockCss = (strings: TemplateStringsArray, ...vals: any[]) => {
  let r = ''
  for (let i = 0; i < strings.length; i++) {
    r += strings[i]
    if (i < vals.length) r += String(vals[i])
  }
  return r
}

describe('createMediaQueries', () => {
  it('returns an object with keys matching breakpoint names', () => {
    const result = createMediaQueries({
      breakpoints: { xs: 0, sm: 576, md: 768 },
      rootSize: 16,
      css: mockCss,
    })

    expect(Object.keys(result)).toEqual(['xs', 'sm', 'md'])
  })

  it('multiple breakpoints produce correct number of keys', () => {
    const result = createMediaQueries({
      breakpoints: { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200 },
      rootSize: 16,
      css: mockCss,
    })

    expect(Object.keys(result)).toHaveLength(5)
  })

  it('for breakpoint with value 0: passes through to css directly (no @media wrapper)', () => {
    const result = createMediaQueries({
      breakpoints: { xs: 0 },
      rootSize: 16,
      css: mockCss,
    })

    const output = result.xs`color: red;`
    expect(output).toBe('color: red;')
    expect(output).not.toContain('@media')
  })

  it('for breakpoint with non-zero value: wraps in @media with em calculation', () => {
    const result = createMediaQueries({
      breakpoints: { sm: 576 },
      rootSize: 16,
      css: mockCss,
    })

    const output = result.sm`color: blue;`
    // 576 / 16 = 36
    expect(output).toContain('@media only screen and (min-width: 36em)')
    expect(output).toContain('color: blue;')
  })

  it('calculates em size as breakpointValue / rootSize', () => {
    const result = createMediaQueries({
      breakpoints: { md: 768 },
      rootSize: 16,
      css: mockCss,
    })

    const output = result.md`font-size: 1rem;`
    // 768 / 16 = 48
    expect(output).toContain('48em')
  })

  it('respects custom rootSize', () => {
    const result = createMediaQueries({
      breakpoints: { lg: 992 },
      rootSize: 10,
      css: mockCss,
    })

    const output = result.lg`display: flex;`
    // 992 / 10 = 99.2
    expect(output).toContain('99.2em')
  })

  it('handles mixed zero and non-zero breakpoints', () => {
    const result = createMediaQueries({
      breakpoints: { xs: 0, sm: 576, md: 768 },
      rootSize: 16,
      css: mockCss,
    })

    const xsOutput = result.xs`color: red;`
    const smOutput = result.sm`color: blue;`
    const mdOutput = result.md`color: green;`

    expect(xsOutput).not.toContain('@media')
    expect(smOutput).toContain('@media only screen and (min-width: 36em)')
    expect(mdOutput).toContain('@media only screen and (min-width: 48em)')
  })
})
