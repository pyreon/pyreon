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

  describe('delta optimization (mirrors vitus-labs)', () => {
    it('strips re-emitted unchanged declarations across breakpoints', () => {
      // mockStyles emits `color: red; padding: 0;` at xs and the same color
      // with a different padding at sm. The delta optimizer should drop
      // `color: red` from sm because it's already cascaded from xs via
      // `@media (min-width: …)`.
      const sortedBreakpoints = ['xs', 'sm']
      const captured: Record<string, string> = {}
      const media: Record<string, (s: TemplateStringsArray, ...v: any[]) => string> = {
        xs: (s, ...vals) => {
          let out = ''
          for (let i = 0; i < s.length; i++) {
            out += s[i]
            if (i < vals.length) out += String(vals[i])
          }
          captured.xs = out
          return out
        },
        sm: (s, ...vals) => {
          let out = ''
          for (let i = 0; i < s.length; i++) {
            out += s[i]
            if (i < vals.length) out += String(vals[i])
          }
          captured.sm = out
          return out
        },
      }

      const responsive = makeItResponsive({
        theme: { color: { xs: 'red', sm: 'red' }, padding: { xs: '0', sm: '1rem' } },
        css: mockCss,
        styles: mockStyles,
        normalize: true,
      })

      responsive({
        theme: {
          breakpoints: { xs: 0, sm: 576 },
          __PYREON__: { sortedBreakpoints, media },
        },
      })

      // xs sees full output
      expect(captured.xs).toContain('color: red;')
      expect(captured.xs).toContain('padding: 0;')
      // sm sees only the delta — color is in cascade already
      expect(captured.sm).toContain('padding: 1rem;')
      expect(captured.sm).not.toContain('color:')
    })

    it('skips the media-template call entirely when a breakpoint has no deltas', () => {
      const sortedBreakpoints = ['xs', 'sm']
      let xsCalls = 0
      let smCalls = 0
      const media: Record<string, (s: TemplateStringsArray, ...v: any[]) => string> = {
        xs: (s, ...vals) => {
          xsCalls++
          let out = ''
          for (let i = 0; i < s.length; i++) {
            out += s[i]
            if (i < vals.length) out += String(vals[i])
          }
          return out
        },
        sm: (s, ...vals) => {
          smCalls++
          let out = ''
          for (let i = 0; i < s.length; i++) {
            out += s[i]
            if (i < vals.length) out += String(vals[i])
          }
          return out
        },
      }

      const responsive = makeItResponsive({
        // Identical values at both breakpoints — sm produces zero deltas.
        theme: { color: { xs: 'red', sm: 'red' } },
        css: mockCss,
        styles: mockStyles,
      })

      const result = responsive({
        theme: {
          breakpoints: { xs: 0, sm: 576 },
          __PYREON__: { sortedBreakpoints, media },
        },
      })

      // xs renders (has content); sm produces no @media wrapper at all
      expect(xsCalls).toBe(1)
      expect(smCalls).toBe(0)
      // sm slot is the empty-string sentinel
      expect((result as unknown[])[1]).toBe('')
    })
  })

  describe('stringify fallback (mirrors vitus-labs)', () => {
    // Where the two paths diverge observably: `styles` is invoked
    // ONCE per breakpoint in the optimized path (for stringification),
    // and TWICE per breakpoint in the fallback path (once for
    // stringify which returns null, then again to re-render against
    // the engine for the @media wrapper). With 2 breakpoints that's
    // 2 calls vs 4 calls — clean observable distinction.

    it('takes the unoptimized path when styles result has [object Foo] toString', () => {
      // Foreign-engine result whose default toString is `[object ForeignResult]`.
      // stringifyResult returns null → canOptimize=false → fallback path.
      class ForeignResult {
        constructor(public payload: string) {}
        // Default toString → "[object ForeignResult]"
      }

      const sortedBreakpoints = ['xs', 'sm']
      const media: Record<string, (s: TemplateStringsArray, ...v: any[]) => string> = {
        xs: mockCss,
        sm: mockCss,
      }

      let stylesCalls = 0
      const stylesReturningForeign = ({ theme }: { theme: Record<string, unknown> }) => {
        stylesCalls++
        return new ForeignResult(JSON.stringify(theme))
      }

      // Distinct values per breakpoint so optimizeTheme keeps both keys
      // (identical values get deduplicated upstream and never reach the
      // optimization-vs-fallback split).
      const responsive = makeItResponsive({
        theme: { color: { xs: 'red', sm: 'blue' } },
        css: mockCss,
        styles: stylesReturningForeign as any,
      })

      responsive({
        theme: {
          breakpoints: { xs: 0, sm: 576 },
          __PYREON__: { sortedBreakpoints, media },
        },
      })

      // Fallback signature: stringify pass + re-render pass = 2 calls per bp
      expect(stylesCalls).toBe(4)
    })

    it('stringifyResult: null/undefined styles result coerces to empty string (optimized path)', () => {
      // styles returning null → stringifyResult(null) → '' (NOT null), so
      // canOptimize stays true and the optimized path runs. Exercises the
      // `result == null` early-return in stringifyResult.
      const sortedBreakpoints = ['xs', 'sm']
      const media: Record<string, (s: TemplateStringsArray, ...v: any[]) => string> = {
        xs: mockCss,
        sm: mockCss,
      }
      let stylesCalls = 0
      const stylesReturningNull = () => {
        stylesCalls++
        return null as unknown as string
      }
      const responsive = makeItResponsive({
        theme: { color: { xs: 'red', sm: 'blue' } },
        css: mockCss,
        styles: stylesReturningNull as any,
      })
      const out = responsive({
        theme: {
          breakpoints: { xs: 0, sm: 576 },
          __PYREON__: { sortedBreakpoints, media },
        },
      })
      // Optimized signature: stringify pass only = 1 call per bp (no re-render).
      expect(stylesCalls).toBe(2)
      expect(Array.isArray(out)).toBe(true)
    })

    it('stringifyResult: CSSResult duck-type (strings + values) takes the String() fast path', () => {
      // A result with `strings` + `values` props is treated as a CSSResult —
      // stringified via String() without the "[object Foo]" validation.
      const sortedBreakpoints = ['xs', 'sm']
      const media: Record<string, (s: TemplateStringsArray, ...v: any[]) => string> = {
        xs: mockCss,
        sm: mockCss,
      }
      let stylesCalls = 0
      const stylesReturningCssResult = ({ theme }: { theme: Record<string, unknown> }) => {
        stylesCalls++
        const text = Object.entries(theme)
          .map(([k, v]) => `${k}: ${v};`)
          .join(' ')
        // CSSResult-shaped object: carries strings/values + a clean toString.
        return {
          strings: [text],
          values: [],
          toString() {
            return text
          },
        }
      }
      const responsive = makeItResponsive({
        theme: { color: { xs: 'red', sm: 'blue' } },
        css: mockCss,
        styles: stylesReturningCssResult as any,
      })
      responsive({
        theme: {
          breakpoints: { xs: 0, sm: 576 },
          __PYREON__: { sortedBreakpoints, media },
        },
      })
      // CSSResult duck-type stringifies cleanly → optimized path → 1 call/bp.
      expect(stylesCalls).toBe(2)
    })

    it('stringifyResult: foreign object with a clean toString stays on the optimized path', () => {
      // A non-CSSResult object whose custom toString() yields clean text (no
      // "[object Foo]") → stringifyResult returns the text (the `: text` arm).
      const sortedBreakpoints = ['xs', 'sm']
      const media: Record<string, (s: TemplateStringsArray, ...v: any[]) => string> = {
        xs: mockCss,
        sm: mockCss,
      }
      let stylesCalls = 0
      const stylesReturningCleanForeign = ({ theme }: { theme: Record<string, unknown> }) => {
        stylesCalls++
        const text = Object.entries(theme)
          .map(([k, v]) => `${k}: ${v};`)
          .join(' ')
        // No `strings`/`values` keys → not a CSSResult, but toString is clean.
        return { toString: () => text }
      }
      const responsive = makeItResponsive({
        theme: { color: { xs: 'red', sm: 'blue' } },
        css: mockCss,
        styles: stylesReturningCleanForeign as any,
      })
      responsive({
        theme: {
          breakpoints: { xs: 0, sm: 576 },
          __PYREON__: { sortedBreakpoints, media },
        },
      })
      // Clean stringify → optimized path → 1 call per bp.
      expect(stylesCalls).toBe(2)
    })

    it('takes the optimized path for plain-string styles results', () => {
      const sortedBreakpoints = ['xs', 'sm']
      const media: Record<string, (s: TemplateStringsArray, ...v: any[]) => string> = {
        xs: mockCss,
        sm: mockCss,
      }

      let stylesCalls = 0
      const stylesCountingMock = (args: { theme: Record<string, unknown> }) => {
        stylesCalls++
        return mockStyles(args)
      }

      const responsive = makeItResponsive({
        theme: { color: { xs: 'red', sm: 'blue' } },
        css: mockCss,
        styles: stylesCountingMock,
      })

      responsive({
        theme: {
          breakpoints: { xs: 0, sm: 576 },
          __PYREON__: { sortedBreakpoints, media },
        },
      })

      // Optimized signature: stringify pass only = 1 call per bp
      expect(stylesCalls).toBe(2)
    })
  })

  describe('render-output cache (mirrors vitus-labs)', () => {
    it('returns the same rendered output by reference when called twice with stable theme + internal-theme refs', () => {
      const sortedBreakpoints = ['xs', 'sm']
      let xsCalls = 0
      const media: Record<string, (s: TemplateStringsArray, ...v: any[]) => string> = {
        xs: (s, ...vals) => {
          xsCalls++
          let out = ''
          for (let i = 0; i < s.length; i++) {
            out += s[i]
            if (i < vals.length) out += String(vals[i])
          }
          return out
        },
        sm: mockCss,
      }

      const themeObj = { color: { xs: 'red', sm: 'blue' } }
      const globalTheme = {
        breakpoints: { xs: 0, sm: 576 },
        __PYREON__: { sortedBreakpoints, media },
      }

      const responsive = makeItResponsive({
        theme: themeObj,
        css: mockCss,
        styles: mockStyles,
      })

      const result1 = responsive({ theme: globalTheme })
      const xsCallsAfterFirst = xsCalls
      const result2 = responsive({ theme: globalTheme })

      // Same identity means the rendered cache hit (no re-rendering)
      expect(result2).toBe(result1)
      // Render cache hit means the media template was NOT called again
      expect(xsCalls).toBe(xsCallsAfterFirst)
    })

    it('re-renders when the outer theme reference changes (e.g. provider value swap)', () => {
      const sortedBreakpoints = ['xs', 'sm']
      let xsCalls = 0
      const media: Record<string, (s: TemplateStringsArray, ...v: any[]) => string> = {
        xs: (s, ...vals) => {
          xsCalls++
          let out = ''
          for (let i = 0; i < s.length; i++) {
            out += s[i]
            if (i < vals.length) out += String(vals[i])
          }
          return out
        },
        sm: mockCss,
      }

      const themeObj = { color: { xs: 'red', sm: 'blue' } }

      const responsive = makeItResponsive({
        theme: themeObj,
        css: mockCss,
        styles: mockStyles,
      })

      // Two distinct outer-theme objects with the same content
      const globalA = {
        breakpoints: { xs: 0, sm: 576 },
        __PYREON__: { sortedBreakpoints, media },
      }
      const globalB = {
        breakpoints: { xs: 0, sm: 576 },
        __PYREON__: { sortedBreakpoints, media },
      }

      responsive({ theme: globalA })
      const callsAfterA = xsCalls
      responsive({ theme: globalB })

      // New outer theme object → no render cache hit → media template re-runs
      expect(xsCalls).toBeGreaterThan(callsAfterA)
    })

  })
})
