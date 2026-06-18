import { describe, expect, it } from 'vitest'
import { CSS_VARS_DEFAULT_EXCLUDE, resolveCssVarReferences, themeToCssVars } from '../cssVariables'

describe('themeToCssVars — generator', () => {
  describe('leaf tokenization', () => {
    it('replaces string and number leaves with var() references', () => {
      const theme = {
        spacing: { small: 8 },
        color: { primary: '#3b82f6' },
      }
      const { vars } = themeToCssVars(theme)
      expect(vars.spacing.small).toBe('var(--px-spacing-small)')
      expect(vars.color.primary).toBe('var(--px-color-primary)')
    })

    it('walks nested objects to any depth (zIndex.popover.content shape)', () => {
      const theme = { zIndex: { popover: { content: 101, overlay: 100 } } }
      const { vars, registry } = themeToCssVars(theme)
      expect(vars.zIndex.popover.content).toBe('var(--px-z-index-popover-content)')
      expect(registry.get('--px-z-index-popover-content')).toBe('101')
    })

    it('kebab-cases camelCase path segments and numeric keys stay verbatim', () => {
      const theme = { color: { system: { primary: { 900: 'rgba(59,130,246,0.9)' } } } }
      const { vars } = themeToCssVars(theme)
      expect(vars.color.system.primary[900]).toBe('var(--px-color-system-primary-900)')
    })

    it('keeps arrays, functions, booleans, null, undefined raw', () => {
      const fn = () => 'x'
      const theme = {
        flags: { enabled: true },
        list: { stack: ['a', 'b'] },
        cb: { make: fn },
        nothing: { a: null, b: undefined },
      }
      const { vars, registry } = themeToCssVars(theme)
      expect(vars.flags.enabled).toBe(true)
      expect(vars.list.stack).toEqual(['a', 'b'])
      expect(vars.cb.make).toBe(fn)
      expect(vars.nothing.a).toBeNull()
      expect(vars.nothing.b).toBeUndefined()
      expect(registry.size).toBe(0)
    })

    it('keeps empty strings and non-finite numbers raw', () => {
      const theme = { weird: { empty: '', nan: NaN, inf: Infinity } }
      const { vars, registry } = themeToCssVars(theme)
      expect(vars.weird.empty).toBe('')
      expect(vars.weird.nan).toBeNaN()
      expect(vars.weird.inf).toBe(Infinity)
      expect(registry.size).toBe(0)
    })
  })

  describe('exclusions', () => {
    it('keeps default-excluded top-level keys raw (breakpoints, rootSize, __PYREON__)', () => {
      const theme = {
        rootSize: 16,
        breakpoints: { xs: 0, sm: 576 },
        __PYREON__: { sortedBreakpoints: ['xs'], media: undefined },
        spacing: { small: 8 },
      }
      const { vars, registry } = themeToCssVars(theme)
      expect(vars.rootSize).toBe(16)
      expect(vars.breakpoints).toEqual({ xs: 0, sm: 576 })
      expect(vars.__PYREON__).toBe(theme.__PYREON__)
      expect(vars.spacing.small).toBe('var(--px-spacing-small)')
      expect(registry.has('--px-root-size')).toBe(false)
      expect(registry.has('--px-breakpoints-xs')).toBe(false)
    })

    it('custom exclude list replaces the default', () => {
      const theme = { spacing: { small: 8 }, color: { primary: 'red' } }
      const { vars } = themeToCssVars(theme, { exclude: ['color'] as const })
      expect(vars.spacing.small).toBe('var(--px-spacing-small)')
      expect(vars.color).toEqual({ primary: 'red' })
    })

    it('exports the default exclude list', () => {
      expect(CSS_VARS_DEFAULT_EXCLUDE).toEqual(['breakpoints', 'rootSize', '__PYREON__'])
    })
  })

  describe('unit baking at emission (rootSize → rem)', () => {
    it('converts length-key numbers to rem using theme.rootSize — themes stay authored in px', () => {
      const theme = { rootSize: 16, spacing: { small: 8, medium: 12 }, fontSize: { base: 14 } }
      const { registry } = themeToCssVars(theme)
      expect(registry.get('--px-spacing-small')).toBe('0.5rem')
      expect(registry.get('--px-spacing-medium')).toBe('0.75rem')
      expect(registry.get('--px-font-size-base')).toBe('0.875rem')
    })

    it('respects a non-default theme.rootSize', () => {
      const theme = { rootSize: 10, spacing: { small: 8 } }
      const { registry } = themeToCssVars(theme)
      expect(registry.get('--px-spacing-small')).toBe('0.8rem')
    })

    it('options.rootSize overrides theme.rootSize', () => {
      const theme = { rootSize: 16, spacing: { small: 8 } }
      const { registry } = themeToCssVars(theme, { rootSize: 10 })
      expect(registry.get('--px-spacing-small')).toBe('0.8rem')
    })

    it('borderWidth emits px (mirrors the edge shorthand)', () => {
      const theme = { borderWidth: { base: 1, large: 4 } }
      const { registry } = themeToCssVars(theme)
      expect(registry.get('--px-border-width-base')).toBe('1px')
      expect(registry.get('--px-border-width-large')).toBe('4px')
    })

    it('unknown keys default to none — unitless numbers stay raw so calc() multiplication works', () => {
      const theme = { ratio: { medium: 1.5 }, lineHeight: { base: 1.5 }, zIndex: { base: 10 } }
      const { registry } = themeToCssVars(theme)
      expect(registry.get('--px-ratio-medium')).toBe('1.5')
      expect(registry.get('--px-line-height-base')).toBe('1.5')
      expect(registry.get('--px-z-index-base')).toBe('10')
    })

    it('strings that already carry units or symbols pass through verbatim', () => {
      const theme = { borderRadius: { circle: '50%', custom: '2rem' }, spacing: { auto: 'auto' } }
      const { registry } = themeToCssVars(theme)
      expect(registry.get('--px-border-radius-circle')).toBe('50%')
      expect(registry.get('--px-border-radius-custom')).toBe('2rem')
      expect(registry.get('--px-spacing-auto')).toBe('auto')
    })

    it('zero emits as plain 0', () => {
      const theme = { spacing: { reset: 0 } }
      const { registry } = themeToCssVars(theme)
      expect(registry.get('--px-spacing-reset')).toBe('0')
    })

    it('options.units overrides + extends the defaults per top-level key', () => {
      const theme = { spacing: { small: 8 }, mySizes: { card: 320 } }
      const { registry } = themeToCssVars(theme, {
        units: { spacing: 'none', mySizes: 'rem' },
      })
      expect(registry.get('--px-spacing-small')).toBe('8')
      expect(registry.get('--px-my-sizes-card')).toBe('20rem')
    })

    it('nested objects inherit the top-level key policy', () => {
      const theme = { elementSize: { buttons: { small: 20 } } }
      const { registry } = themeToCssVars(theme)
      expect(registry.get('--px-element-size-buttons-small')).toBe('1.25rem')
    })
  })

  describe('css output', () => {
    it('emits a ready-to-inject :root block', () => {
      const theme = { spacing: { small: 8 }, ratio: { medium: 1.5 } }
      const { css } = themeToCssVars(theme)
      expect(css).toBe(':root {\n  --px-spacing-small: 0.5rem;\n  --px-ratio-medium: 1.5;\n}')
    })

    it('emits an empty string when nothing is tokenizable', () => {
      const { css } = themeToCssVars({ breakpoints: { xs: 0 } })
      expect(css).toBe('')
    })

    it('custom prefix flows into names, references, and css', () => {
      const theme = { spacing: { small: 8 } }
      const { vars, css, registry } = themeToCssVars(theme, { prefix: 'app' })
      expect(vars.spacing.small).toBe('var(--app-spacing-small)')
      expect(registry.get('--app-spacing-small')).toBe('0.5rem')
      expect(css).toContain('--app-spacing-small: 0.5rem;')
    })
  })

  describe('collisions', () => {
    it('throws loudly when kebab-case normalization collapses two paths', () => {
      const theme = { spacing: { xSmall: 4, 'x-small': 6 } }
      expect(() => themeToCssVars(theme)).toThrow(
        /\[Pyreon\] themeToCssVars: variable name collision — '--px-spacing-x-small'/,
      )
    })
  })

  describe('caching', () => {
    it('same theme identity + same options returns the SAME result object', () => {
      const theme = { spacing: { small: 8 } }
      const a = themeToCssVars(theme)
      const b = themeToCssVars(theme)
      expect(a).toBe(b)
      expect(a.vars).toBe(b.vars)
    })

    it('different options on the same theme produce a distinct cached result', () => {
      const theme = { spacing: { small: 8 } }
      const a = themeToCssVars(theme)
      const b = themeToCssVars(theme, { prefix: 'app' })
      const b2 = themeToCssVars(theme, { prefix: 'app' })
      expect(a).not.toBe(b)
      expect(b).toBe(b2)
    })

    it('a different theme identity with equal content is generated fresh', () => {
      const a = themeToCssVars({ spacing: { small: 8 } })
      const b = themeToCssVars({ spacing: { small: 8 } })
      expect(a).not.toBe(b)
      expect(a.css).toBe(b.css)
    })
  })

  describe('proportional sizing idiom', () => {
    it('var references compose into native CSS calc() via template interpolation', () => {
      const theme = { spacing: { small: 8 }, ratio: { medium: 1.5 } }
      const { vars } = themeToCssVars(theme)
      const width = `calc(${vars.spacing.small} * ${vars.ratio.medium})`
      expect(width).toBe('calc(var(--px-spacing-small) * var(--px-ratio-medium))')
    })
  })
})

describe('resolveCssVarReferences — non-CSS consumer resolution', () => {
  const { registry } = themeToCssVars({
    rootSize: 16,
    spacing: { small: 8 },
    ratio: { medium: 1.5 },
    color: { surface: '#0f172a' },
  })

  it('resolves a plain var reference to the emitted value', () => {
    expect(resolveCssVarReferences('var(--px-spacing-small)', registry)).toBe('0.5rem')
    expect(resolveCssVarReferences('var(--px-color-surface)', registry)).toBe('#0f172a')
  })

  it('inlines var references inside calc() without evaluating the calc', () => {
    expect(
      resolveCssVarReferences('calc(var(--px-spacing-small) * var(--px-ratio-medium))', registry),
    ).toBe('calc(0.5rem * 1.5)')
  })

  it('uses the inline fallback for unknown names, keeps verbatim without one', () => {
    expect(resolveCssVarReferences('var(--px-missing, 1rem)', registry)).toBe('1rem')
    expect(resolveCssVarReferences('var(--px-missing)', registry)).toBe('var(--px-missing)')
  })

  it('passes non-strings through untouched', () => {
    expect(resolveCssVarReferences(8, registry)).toBe(8)
    expect(resolveCssVarReferences(null, registry)).toBeNull()
  })
})

describe('resolveCssVarReferences — ReDoS-safe (linear scan)', () => {
  const { registry } = themeToCssVars({ spacing: { small: 8 } })

  it('the CodeQL-flagged pathological input resolves in linear time', () => {
    // `var(---,` + many spaces was the polynomial-ReDoS attack string for the
    // old alternation regex. The linear scanner must handle it instantly.
    const evil = 'var(--' + '-'.repeat(0) + ',' + ' '.repeat(100000) + ')'
    const t0 = performance.now()
    const out = resolveCssVarReferences(evil, registry)
    const ms = performance.now() - t0
    expect(ms).toBeLessThan(50) // linear: trivially fast even at 100k chars
    // unknown name → falls back to the (whitespace) fallback, trimmed to ''
    expect(out).toBe('')
  })

  it('handles a deep nested-paren fallback without backtracking', () => {
    const out = resolveCssVarReferences('var(--px-missing, calc(calc(1rem) * 2))', registry)
    expect(out).toBe('calc(calc(1rem) * 2)')
  })

  it('still resolves a known name even with a calc() fallback present', () => {
    expect(resolveCssVarReferences('var(--px-spacing-small, calc(1rem))', registry)).toBe('0.5rem')
  })

  it('emits a malformed var( verbatim and does not hang', () => {
    expect(resolveCssVarReferences('var(--px-spacing-small', registry)).toBe('var(--px-spacing-small')
  })
})

describe('resolveCssVarReferences — scanner character + whitespace edges', () => {
  const { registry } = themeToCssVars({ spacing: { small: 8 } })

  it('returns a string with no var( reference untouched', () => {
    // input.indexOf('var(') === -1 → early return before the scan loop.
    expect(resolveCssVarReferences('color: red', registry)).toBe('color: red')
    expect(resolveCssVarReferences('1.5rem', registry)).toBe('1.5rem')
  })

  it('reads uppercase letters and digits in var names (isNameChar A-Z + 0-9)', () => {
    // Names carry uppercase + digit chars — the scanner's isNameChar must
    // accept them. Unknown names with no fallback are emitted verbatim.
    expect(resolveCssVarReferences('var(--Color9Surface)', registry)).toBe('var(--Color9Surface)')
    expect(resolveCssVarReferences('var(--ABC123)', registry)).toBe('var(--ABC123)')
  })

  it('skips leading whitespace after var( and trailing whitespace before close', () => {
    // `var( --x )` → the space-skip loops advance past the spaces around the
    // name. Known name resolves through the surrounding whitespace.
    expect(resolveCssVarReferences('var( --px-spacing-small )', registry)).toBe('0.5rem')
    // Whitespace before the comma fallback separator too.
    expect(resolveCssVarReferences('var( --px-missing , 2rem)', registry)).toBe('2rem')
  })
})
