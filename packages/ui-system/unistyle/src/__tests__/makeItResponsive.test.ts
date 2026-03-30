import { describe, expect, it, vi } from 'vitest'

vi.mock('@pyreon/ui-core', () => ({
  isEmpty: (val: unknown) =>
    val == null || (typeof val === 'object' && Object.keys(val as object).length === 0),
  set: (obj: any, path: (string | number)[], value: unknown) => {
    let current = obj
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i] as string | number
      if (current[key] == null || typeof current[key] !== 'object') {
        current[key] = {}
      }
      current = current[key]
    }
    const lastKey = path[path.length - 1] as string | number
    current[lastKey] = value
  },
}))

import makeItResponsive from '../responsive/makeItResponsive'

const mockCss = (strings: TemplateStringsArray, ...vals: any[]) => {
  let r = ''
  for (let i = 0; i < strings.length; i++) {
    r += strings[i]
    if (i < vals.length) r += String(vals[i])
  }
  return r
}

const mockStyles = ({ theme }: { theme: Record<string, unknown> }) => {
  return Object.entries(theme)
    .map(([k, v]) => `${k}: ${v};`)
    .join(' ')
}

describe('makeItResponsive', () => {
  it('returns empty string when customTheme is empty/undefined', () => {
    const responsive = makeItResponsive({
      key: 'styles',
      css: mockCss,
      styles: mockStyles,
    })

    const result = responsive({ theme: {} })
    expect(result).toBe('')
  })

  it('returns empty string when customTheme is empty object', () => {
    const responsive = makeItResponsive({
      theme: {},
      key: 'styles',
      css: mockCss,
      styles: mockStyles,
    })

    const result = responsive({ theme: {} })
    expect(result).toBe('')
  })

  it('without breakpoints: wraps styles output in css template', () => {
    const responsive = makeItResponsive({
      theme: { color: 'red' },
      css: mockCss,
      styles: mockStyles,
    })

    const result = responsive({ theme: {} })
    expect(result).toContain('color: red;')
  })

  it('uses props[key] when theme is not provided', () => {
    const responsive = makeItResponsive({
      key: 'myStyles',
      css: mockCss,
      styles: mockStyles,
    })

    const result = responsive({
      theme: {},
      myStyles: { fontSize: '16px' },
    })

    expect(result).toContain('fontSize: 16px;')
  })

  it('with breakpoints and __PYREON__: returns array of media-wrapped styles per breakpoint', () => {
    const sortedBreakpoints = ['xs', 'sm']
    const media: Record<string, (strings: TemplateStringsArray, ...vals: any[]) => string> = {
      xs: mockCss,
      sm: (strings: TemplateStringsArray, ...vals: any[]) => {
        let r = '@media (min-width: 36em) {'
        for (let i = 0; i < strings.length; i++) {
          r += strings[i]
          if (i < vals.length) r += String(vals[i])
        }
        r += '}'
        return r
      },
    }

    const responsive = makeItResponsive({
      theme: { color: { xs: 'red', sm: 'blue' } },
      css: mockCss,
      styles: mockStyles,
      normalize: true,
    })

    const result = responsive({
      theme: {
        breakpoints: { xs: 0, sm: 576 },
        __PYREON__: { sortedBreakpoints, media },
      },
    })

    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(2)
  })

  it('caching: second call with same internalTheme object returns same result', () => {
    const sortedBreakpoints = ['xs', 'sm']
    const media: Record<string, (strings: TemplateStringsArray, ...vals: any[]) => string> = {
      xs: mockCss,
      sm: mockCss,
    }

    const themeObj = { color: { xs: 'red', sm: 'blue' } }

    const responsive = makeItResponsive({
      theme: themeObj,
      css: mockCss,
      styles: mockStyles,
    })

    const globalTheme = {
      breakpoints: { xs: 0, sm: 576 },
      __PYREON__: { sortedBreakpoints, media },
    }

    const result1 = responsive({ theme: globalTheme })
    const result2 = responsive({ theme: globalTheme })

    expect(result1).toEqual(result2)
  })

  it('normalize=false skips normalizeTheme step', () => {
    const sortedBreakpoints = ['xs', 'sm']
    const media: Record<string, (strings: TemplateStringsArray, ...vals: any[]) => string> = {
      xs: mockCss,
      sm: mockCss,
    }

    // When normalize=false, object values are not expanded across breakpoints.
    // Provide a pre-normalized theme (object keyed by breakpoint names).
    const responsive = makeItResponsive({
      theme: { color: { xs: 'red', sm: 'blue' } },
      css: mockCss,
      styles: mockStyles,
      normalize: false,
    })

    const result = responsive({
      theme: {
        breakpoints: { xs: 0, sm: 576 },
        __PYREON__: { sortedBreakpoints, media },
      },
    })

    expect(Array.isArray(result)).toBe(true)
  })
})
