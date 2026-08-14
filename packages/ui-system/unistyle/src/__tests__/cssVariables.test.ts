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

  // `var(--,` + a long whitespace run was the polynomial-ReDoS attack string
  // for the old alternation regex (quadratic backtracking over the fallback
  // whitespace). The linear scanner must stay O(n) in the run length.
  //
  // LOAD-IMMUNE SHAPE (the ws-relay lesson, .claude/rules/testing.md): the
  // previous absolute wall-clock ceiling (`ms < 50`) was a statement about
  // the MACHINE, not the algorithm — it read 51.1ms under full-workspace
  // saturation (2026-08) while green in isolation. Linearity is a statement
  // about GROWTH, so assert the growth: time the attack at N and 4N and
  // require the per-call ratio to stay far below the quadratic signature
  // (~16x). Load inflates both sizes proportionally, so the ratio survives
  // saturation; min-of-K sampling after a warm-up call discards scheduler
  // spikes + first-call JIT cost, and the timer-resolution floor keeps a
  // sub-resolution tSmall from fabricating a large ratio.
  const SPACES_SMALL = 10_000
  const SIZE_FACTOR = 4 // linear ⇒ per-call ratio ~4; quadratic ⇒ ~16
  const RATIO_CEILING = 8 // generous for linear (~4), unreachable for quadratic (~16)
  const TIMER_FLOOR_MS = 0.05
  const SAMPLES = 5

  const attackString = (spaces: number): string => 'var(--,' + ' '.repeat(spaces) + ')'

  const minTimeMs = (evil: string): number => {
    // Warm-up: the first call pays JIT/allocation cost that has nothing to do
    // with algorithmic growth. It doubles as the correctness assertion —
    // unknown name → falls back to the (whitespace) fallback, trimmed to ''.
    expect(resolveCssVarReferences(evil, registry)).toBe('')
    let best = Infinity
    for (let k = 0; k < SAMPLES; k++) {
      const t0 = performance.now()
      resolveCssVarReferences(evil, registry)
      const dt = performance.now() - t0
      if (dt < best) best = dt
    }
    return best
  }

  // V8 COVERAGE INSTRUMENTATION MAKES THIS UNMEASURABLE. The ratio is a
  // statement about the ALGORITHM, and instrumentation adds a per-basic-block
  // cost plus GC pressure that is NOT proportional to input size — so under
  // `--coverage` the number measures the instrumenter, not the scan. Observed
  // on main (run 31788903029, `Coverage (Full)`):
  //
  //   super-linear growth: 4x input took 11.9x the time
  //   (tSmall=0.567ms @ 10000 spaces, tBig=6.753ms @ 40000 spaces)
  //
  // ...while the SAME spec is green in the Test cells and green locally under
  // node + --coverage in isolation. Skipping under coverage keeps the gate
  // where it can actually measure (the Test cell, which runs on every PR) and
  // stops a meaningless number turning main red. Deleting it instead would
  // drop the ReDoS guard entirely, which is the wrong trade.
  // Set by scripts/check-coverage.ts when it spawns the instrumented run.
  // vitest exposes no env var of its own for this, so the runner states it
  // explicitly rather than the test guessing.
  it.skipIf(process.env.PYREON_COVERAGE_RUN === '1')(
    'the CodeQL-flagged pathological input resolves in linear time (N vs 4N growth ratio)',
    () => {
      const tSmall = minTimeMs(attackString(SPACES_SMALL))
      const tBig = minTimeMs(attackString(SPACES_SMALL * SIZE_FACTOR))
      const ratio = Math.max(tBig, TIMER_FLOOR_MS) / Math.max(tSmall, TIMER_FLOOR_MS)
      expect(
        ratio,
        `super-linear growth: ${SIZE_FACTOR}x input took ${ratio.toFixed(1)}x the time ` +
          `(tSmall=${tSmall.toFixed(3)}ms @ ${SPACES_SMALL} spaces, ` +
          `tBig=${tBig.toFixed(3)}ms @ ${SPACES_SMALL * SIZE_FACTOR} spaces; ` +
          `linear ~${SIZE_FACTOR}x, quadratic ~${SIZE_FACTOR ** 2}x)`,
      ).toBeLessThan(RATIO_CEILING)
      // Belt-and-braces against an "equally catastrophic at both sizes"
      // implementation the ratio alone can't see: ~4 orders of magnitude above
      // the linear reality (~0.1ms), so no plausible load spike reaches it —
      // this is NOT a perf assertion.
      expect(
        tBig,
        `pathological input took ${tBig.toFixed(1)}ms at ${SPACES_SMALL * SIZE_FACTOR} spaces`,
      ).toBeLessThan(2000)
    },
    // Generous backstop so a genuinely quadratic regression completes its
    // samples and fails on the DIAGNOSTIC ratio assertion above rather than
    // an opaque vitest timeout (the healthy path is single-digit ms).
    120_000,
  )

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
