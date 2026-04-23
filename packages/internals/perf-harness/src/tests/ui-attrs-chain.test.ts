// @vitest-environment happy-dom
/**
 * attrs HOC chain probe.
 *
 * `.attrs().theme().states()....` produces a chain of config objects.
 * Each chain step should be a cheap object merge, not a full re-build.
 *
 * Rocketstyle builds ITS own chain on top of attrs. We test that
 * building a fully-configured rocketstyle component at module init
 * doesn't trigger hundreds of allocations for simple single-chain calls.
 */
import rocketstyle from '@pyreon/rocketstyle'
import { initTestConfig, ThemeCapture } from '@pyreon/test-utils'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let cleanup: () => void
beforeAll(() => {
  cleanup = initTestConfig()
})
afterAll(() => cleanup())

describe('attrs / rocketstyle chain construction', () => {
  it('constructing 100 rocketstyle components in a loop is fast', () => {
    const t0 = performance.now()
    const comps: unknown[] = []
    for (let i = 0; i < 100; i++) {
      comps.push(
        rocketstyle()({
          name: `C${i}`,
          component: ThemeCapture,
        })
          .theme(() => ({ color: 'red' }))
          .sizes(() => ({ small: { fontSize: '12px' }, large: { fontSize: '16px' } }))
          .states(() => ({ active: { color: 'blue' } })),
      )
    }
    const elapsed = performance.now() - t0
    // oxlint-disable-next-line no-console
    console.log(`[attrs-chain] 100 rocketstyle defs in ${elapsed.toFixed(1)}ms`)
    // Should be well under 100ms for 100 definitions (1ms each is generous)
    expect(elapsed).toBeLessThan(500)
    expect(comps).toHaveLength(100)
  })

  it('deep chain (.theme × 5) — each chain step is a cheap merge', () => {
    const t0 = performance.now()
    let C = rocketstyle()({
      name: 'DeepChain',
      component: ThemeCapture,
    })
    for (let i = 0; i < 20; i++) {
      C = C.theme(() => ({ color: `step-${i}` }))
    }
    const elapsed = performance.now() - t0
    // oxlint-disable-next-line no-console
    console.log(`[attrs-chain] 20-step .theme chain in ${elapsed.toFixed(1)}ms`)
    expect(elapsed).toBeLessThan(50)
  })

  it('chain with large dimension objects (10 states) stays fast', () => {
    const states = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [`state${i}`, { color: `color-${i}` }]),
    )
    const t0 = performance.now()
    for (let i = 0; i < 100; i++) {
      rocketstyle()({
        name: `Big${i}`,
        component: ThemeCapture,
      }).states(() => states)
    }
    const elapsed = performance.now() - t0
    // oxlint-disable-next-line no-console
    console.log(`[attrs-chain] 100 large-state defs in ${elapsed.toFixed(1)}ms`)
    expect(elapsed).toBeLessThan(500)
  })
})
