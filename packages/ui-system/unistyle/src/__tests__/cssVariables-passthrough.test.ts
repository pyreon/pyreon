import { describe, expect, it } from 'vitest'
import { themeToCssVars } from '../cssVariables'
import { createMediaQueries, makeItResponsive, optimizeBreakpointDeltas } from '../responsive'
import borderRadius from '../styles/shorthands/borderRadius'
import edge from '../styles/shorthands/edge'
import styles from '../styles/styles/index'
import { value, values } from '../units'

// CONTRACT: `var(...)` / `calc(...)` strings flow through the ENTIRE
// unistyle value pipeline untouched. Today this holds incidentally —
// `stripUnit`'s css-number regex doesn't match them, so `value()` returns
// them verbatim. These specs promote that accident to a locked guarantee:
// every package above unistyle (elements, rocketstyle, coolgrid, kinetic)
// consumes theme values ONLY through this pipeline, so this contract is
// what makes CSS-variable themes (`themeToCssVars`) work downstream.
//
// If a refactor of stripUnit/value/values/edge/borderRadius/styles ever
// converts, mangles, or drops a var()/calc() string, these fail.

const mockCss = (strings: TemplateStringsArray, ...vals: unknown[]) => {
  let r = ''
  for (let i = 0; i < strings.length; i++) {
    r += strings[i]
    if (i < vals.length) r += String(vals[i])
  }
  return r
}

describe('var()/calc() pass-through contract', () => {
  describe('value()', () => {
    it('returns var() references verbatim — no unit conversion', () => {
      expect(value('var(--px-spacing-small)', 16, 'rem')).toBe('var(--px-spacing-small)')
      expect(value('var(--px-spacing-small)', 16, 'px')).toBe('var(--px-spacing-small)')
    })

    it('returns calc() expressions verbatim', () => {
      const calc = 'calc(var(--px-spacing-small) * 1.5)'
      expect(value(calc, 16, 'rem')).toBe(calc)
    })

    it('returns nested var() fallbacks verbatim', () => {
      const v = 'var(--px-gap, var(--px-spacing-small))'
      expect(value(v, 16, 'rem')).toBe(v)
    })
  })

  describe('values()', () => {
    it('passes a single var() through', () => {
      expect(values(['var(--px-gap)'], 16)).toBe('var(--px-gap)')
    })

    it('joins arrays of var() references with spaces (multi-value shorthand)', () => {
      expect(values([['var(--px-a)', 'var(--px-b)']], 16)).toBe('var(--px-a) var(--px-b)')
    })

    it('joins mixed numbers and var() references — numbers convert, vars pass', () => {
      expect(values([[8, 'var(--px-b)']], 16)).toBe('0.5rem var(--px-b)')
    })
  })

  describe('edge shorthand (margin/padding/inset/border-*)', () => {
    const shorthand = edge(16)

    it('padding full value as var() emits verbatim', () => {
      expect(shorthand('padding', {
        full: 'var(--px-spacing-small)',
        x: null, y: null, top: null, left: null, right: null, bottom: null,
      })).toContain('padding: var(--px-spacing-small);')
    })

    it('per-side values mix var() and numbers correctly', () => {
      const out = shorthand('margin', {
        full: null, x: null, y: null,
        top: 'var(--px-spacing-small)', left: 8, right: null, bottom: null,
      })
      expect(out).toContain('margin-top: var(--px-spacing-small);')
      expect(out).toContain('margin-left: 0.5rem;')
    })

    it('border-width (px unit) passes var() verbatim', () => {
      const out = shorthand('border-width', {
        full: 'var(--px-border-width-base)',
        x: null, y: null, top: null, left: null, right: null, bottom: null,
      })
      expect(out).toContain('border-width: var(--px-border-width-base);')
    })
  })

  describe('borderRadius shorthand', () => {
    const radius = borderRadius(16)

    it('uniform radius as var() emits verbatim', () => {
      const out = radius({
        full: 'var(--px-border-radius-base)',
        topLeft: null, topRight: null, bottomLeft: null, bottomRight: null,
        top: null, bottom: null, left: null, right: null,
      })
      expect(out).toContain('var(--px-border-radius-base)')
    })

    it('individual corner as calc() emits verbatim', () => {
      const out = radius({
        full: null,
        topLeft: 'calc(var(--px-border-radius-base) * 2)',
        topRight: null, bottomLeft: null, bottomRight: null,
        top: null, bottom: null, left: null, right: null,
      })
      expect(out).toContain('border-top-left-radius: calc(var(--px-border-radius-base) * 2);')
    })
  })

  describe('styles() pipeline (the full propertyMap walk)', () => {
    it('convert-kind properties pass var() through (fontSize, width, gap)', () => {
      const result = styles({
        theme: {
          fontSize: 'var(--px-font-size-base)',
          width: 'var(--px-element-size-large)',
          gap: 'var(--px-spacing-small)',
        },
        css: mockCss,
        rootSize: 16,
      })
      expect(result).toContain('font-size: var(--px-font-size-base);')
      expect(result).toContain('width: var(--px-element-size-large);')
      expect(result).toContain('gap: var(--px-spacing-small);')
    })

    it('edge-kind properties pass var() through (padding, margin)', () => {
      const result = styles({
        theme: { padding: 'var(--px-spacing-small)', margin: 'var(--px-spacing-medium)' },
        css: mockCss,
        rootSize: 16,
      })
      expect(result).toContain('padding: var(--px-spacing-small);')
      expect(result).toContain('margin: var(--px-spacing-medium);')
    })

    it('simple-kind properties pass var() through (color, boxShadow)', () => {
      const result = styles({
        theme: {
          color: 'var(--px-color-system-base)',
          boxShadow: 'var(--px-shadows-base)',
        },
        css: mockCss,
        rootSize: 16,
      })
      expect(result).toContain('color: var(--px-color-system-base);')
      expect(result).toContain('box-shadow: var(--px-shadows-base);')
    })

    it('calc() expressions over vars survive the convert path — proportional sizing', () => {
      const result = styles({
        theme: { width: 'calc(var(--px-spacing-small) * var(--px-ratio-medium))' },
        css: mockCss,
        rootSize: 16,
      })
      expect(result).toContain('width: calc(var(--px-spacing-small) * var(--px-ratio-medium));')
    })
  })

  describe('makeItResponsive', () => {
    it('responsive array of var() references emits each breakpoint verbatim', () => {
      const breakpoints = { xs: 0, sm: 576 }
      const media = createMediaQueries({ breakpoints, css: mockCss as never, rootSize: 16 })
      const outerTheme = {
        rootSize: 16,
        breakpoints,
        __PYREON__: { sortedBreakpoints: ['xs', 'sm'], media },
      }
      const responsive = makeItResponsive({
        theme: { padding: ['var(--px-pad-xs)', 'var(--px-pad-sm)'] },
        css: mockCss as never,
        styles: styles as never,
      })
      const out = String(responsive({ theme: outerTheme }))
      expect(out).toContain('padding: var(--px-pad-xs);')
      expect(out).toContain('padding: var(--px-pad-sm);')
      expect(out).toContain('@media')
    })
  })

  describe('optimizeBreakpointDeltas', () => {
    it('dedups identical var() declarations across breakpoints, keeps changes', () => {
      const out = optimizeBreakpointDeltas([
        'color: var(--px-c-base); padding: var(--px-pad-xs);',
        'color: var(--px-c-base); padding: var(--px-pad-sm);',
      ])
      expect(out[0]).toBe('color: var(--px-c-base); padding: var(--px-pad-xs);')
      expect(out[1]).toBe('padding: var(--px-pad-sm);')
    })
  })

  describe('end-to-end: themeToCssVars output through styles()', () => {
    it('generated var leaves survive the full pipeline verbatim', () => {
      const theme = {
        rootSize: 16,
        spacing: { small: 8 },
        color: { system: { base: '#0f172a' } },
      }
      const { vars, registry } = themeToCssVars(theme)
      const result = styles({
        theme: { padding: vars.spacing.small, color: vars.color.system.base },
        css: mockCss,
        rootSize: 16,
      })
      expect(result).toContain('padding: var(--px-spacing-small);')
      expect(result).toContain('color: var(--px-color-system-base);')
      // and the registry carries the unit-baked raw values for non-CSS consumers
      expect(registry.get('--px-spacing-small')).toBe('0.5rem')
      expect(registry.get('--px-color-system-base')).toBe('#0f172a')
    })
  })
})
