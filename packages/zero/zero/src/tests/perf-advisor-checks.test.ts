import { describe, expect, it } from 'vitest'
import {
  type RouteAdvisorInput,
  checkClsFootgun,
  checkCollapseOff,
  checkHeroNotAvif,
  checkJsBudget,
  runAdvisor,
  runRouteAdvisor,
} from '../perf-advisor/checks'

// A clean baseline route — every check returns null. Each test overrides
// only the field(s) under test, so a finding can only come from that field.
function base(over: Partial<RouteAdvisorInput> = {}): RouteAdvisorInput {
  return {
    path: '/resume',
    collapseEnabled: true,
    collapsibleSiteCount: 0,
    jsBytes: 10_000,
    jsBudget: 100_000,
    ...over,
  }
}

describe('perf-advisor — checkCollapseOff', () => {
  it('FIRES when collapse is off and there are collapsible sites', () => {
    const f = checkCollapseOff(base({ collapseEnabled: false, collapsibleSiteCount: 41 }))
    expect(f?.check).toBe('collapse-off')
    expect(f?.severity).toBe('warn')
    expect(f?.message).toContain('41 literal-prop')
  })
  it('does NOT fire when collapse is enabled', () => {
    expect(checkCollapseOff(base({ collapseEnabled: true, collapsibleSiteCount: 41 }))).toBeNull()
  })
  it('does NOT fire when there are no collapsible sites', () => {
    expect(checkCollapseOff(base({ collapseEnabled: false, collapsibleSiteCount: 0 }))).toBeNull()
  })
  it('singularizes the message for one site', () => {
    const f = checkCollapseOff(base({ collapseEnabled: false, collapsibleSiteCount: 1 }))
    expect(f?.message).toContain('1 literal-prop rocketstyle site would')
  })
})

describe('perf-advisor — checkClsFootgun', () => {
  it('FIRES on content-visibility:auto without contain-intrinsic-size', () => {
    const f = checkClsFootgun(base({ cssText: '.x{display:block;content-visibility:auto}' }))
    expect(f?.check).toBe('cls-footgun')
  })
  it('does NOT fire when contain-intrinsic-size is present', () => {
    expect(
      checkClsFootgun(base({ cssText: '.x{content-visibility:auto;contain-intrinsic-size:auto 800px}' })),
    ).toBeNull()
  })
  it('does NOT fire when a contain-intrinsic-* longhand is present', () => {
    expect(
      checkClsFootgun(base({ cssText: '.x{content-visibility:auto;contain-intrinsic-height:800px}' })),
    ).toBeNull()
  })
  it('does NOT fire on content-visibility:hidden', () => {
    expect(checkClsFootgun(base({ cssText: '.x{content-visibility:hidden}' }))).toBeNull()
  })
  it('does NOT fire when no cssText is attributed', () => {
    expect(checkClsFootgun(base({ cssText: undefined }))).toBeNull()
  })
})

describe('perf-advisor — checkJsBudget', () => {
  it('FIRES when jsBytes exceeds the budget', () => {
    const f = checkJsBudget(base({ jsBytes: 150_000, jsBudget: 100_000 }))
    expect(f?.check).toBe('route-js-budget')
    expect(f?.message).toContain('146.5 KB')
  })
  it('does NOT fire at or under budget', () => {
    expect(checkJsBudget(base({ jsBytes: 100_000, jsBudget: 100_000 }))).toBeNull()
    expect(checkJsBudget(base({ jsBytes: 50_000, jsBudget: 100_000 }))).toBeNull()
  })
})

describe('perf-advisor — checkHeroNotAvif', () => {
  it('FIRES (info) when the hero image has no AVIF variant', () => {
    const f = checkHeroNotAvif(base({ heroImage: { src: '/hero.webp', formats: ['webp'] } }))
    expect(f?.check).toBe('hero-not-avif')
    expect(f?.severity).toBe('info')
  })
  it('does NOT fire when AVIF is present (case-insensitive)', () => {
    expect(
      checkHeroNotAvif(base({ heroImage: { src: '/hero.avif', formats: ['AVIF', 'webp'] } })),
    ).toBeNull()
  })
  it('does NOT fire when there is no hero image', () => {
    expect(checkHeroNotAvif(base({ heroImage: undefined }))).toBeNull()
  })
})

describe('perf-advisor — runRouteAdvisor / runAdvisor', () => {
  it('aggregates findings in actionable order (collapse, cls, js, hero)', () => {
    const findings = runRouteAdvisor(
      base({
        collapseEnabled: false,
        collapsibleSiteCount: 5,
        cssText: '.x{content-visibility:auto}',
        jsBytes: 200_000,
        jsBudget: 100_000,
        heroImage: { src: '/h.webp', formats: ['webp'] },
      }),
    )
    expect(findings.map((f) => f.check)).toEqual([
      'collapse-off',
      'cls-footgun',
      'route-js-budget',
      'hero-not-avif',
    ])
  })
  it('returns [] for a clean route', () => {
    expect(runRouteAdvisor(base())).toEqual([])
  })
  it('runAdvisor drops routes with no findings, keeps the rest', () => {
    const results = runAdvisor([
      base({ path: '/clean' }),
      base({ path: '/heavy', jsBytes: 200_000, jsBudget: 100_000 }),
    ])
    expect(results.map((r) => r.path)).toEqual(['/heavy'])
    expect(results[0]?.findings[0]?.check).toBe('route-js-budget')
  })
})
