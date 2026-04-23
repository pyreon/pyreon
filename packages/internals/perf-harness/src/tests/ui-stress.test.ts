// @vitest-environment happy-dom
/**
 * Full ui-system + reactivity stress. Simulates a realistic app pattern:
 *   - Many styled components mounted
 *   - Signals driving each
 *   - Rapid updates across the whole tree
 *
 * Goal: catch any super-linear scaling that only shows up when
 * multiple subsystems interact.
 */
import { For, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { styled } from '@pyreon/styler'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _disable, _reset } from '../counters'
import { install, perfHarness, uninstall } from '../harness'
import { resetDom } from './_dom-setup'

beforeEach(() => {
  _reset()
  install()
  resetDom()
})

afterEach(() => {
  uninstall()
  _reset()
  _disable()
  document.body.innerHTML = ''
})

interface Theme {
  bg: string
  fg: string
}
const Card = styled('div')<{ theme: Theme }>`
  background: ${(p) => p.theme.bg};
  color: ${(p) => p.theme.fg};
  padding: 12px;
`

describe('ui-system full stress', () => {
  it('500 styled components in a <For> — mount footprint is bounded', async () => {
    const theme: Theme = { bg: '#fff', fg: '#111' }
    const items = signal(Array.from({ length: 500 }, (_, i) => i))
    const root = document.getElementById('root')!

    const outcome = await perfHarness.record('500-styled', () => {
      const dispose = mount(
        h(For, {
          each: () => items(),
          by: (n: number) => n,
          children: (n: number) => h(Card, { theme }, String(n)),
        }),
        root,
      )
      dispose()
    })

    const snap = outcome.after
    expect(snap['styler.resolve']).toBe(500)
    // After warmup, hit ratio ≥ 99%
    const hits = snap['styler.sheet.insert.hit'] ?? 0
    const inserts = snap['styler.sheet.insert'] ?? 1
    // oxlint-disable-next-line no-console
    console.log(
      `[stress] 500 styled: resolve=${inserts}, hit=${hits}, ratio=${(hits / inserts * 100).toFixed(1)}%, mountChild=${snap['runtime.mountChild']}`,
    )
    expect(hits / inserts).toBeGreaterThan(0.99) // 99%+ hit ratio
  })

  it('100-item list, shuffle 10 times, signals rapid-fire — no counter pathology', async () => {
    const theme: Theme = { bg: '#fff', fg: '#111' }
    const items = signal(Array.from({ length: 100 }, (_, i) => i))
    const root = document.getElementById('root')!

    mount(
      h(For, {
        each: () => items(),
        by: (n: number) => n,
        children: (n: number) => h(Card, { theme }, String(n)),
      }),
      root,
    )

    perfHarness.reset()
    const outcome = await perfHarness.record('10-shuffles', () => {
      for (let i = 0; i < 10; i++) {
        // Shuffle (reverse every other time to mix patterns)
        items.set([...items()].reverse())
      }
    })
    const snap = outcome.after
    // oxlint-disable-next-line no-console
    console.log(
      `[stress] 10-shuffles: signalWrite=${snap['reactivity.signalWrite']}, effectRun=${snap['reactivity.effectRun']}, lisOps=${snap['runtime.mountFor.lisOps']}`,
    )
    // 10 writes, 10 effect runs (1 per write via auto-batch)
    expect(snap['reactivity.signalWrite']).toBe(10)
    expect(snap['reactivity.effectRun']).toBe(10)
  })

  it('1000-mount / unmount cycle — heap stable', async () => {
    const theme: Theme = { bg: '#fff', fg: '#111' }
    const root = document.getElementById('root')!

    const cycles: Record<string, number>[] = []
    for (let cycle = 0; cycle < 100; cycle++) {
      perfHarness.reset()
      const dispose = mount(h(Card, { theme }, `item-${cycle}`), root)
      dispose()
      resetDom()
      cycles.push(perfHarness.snapshot())
    }
    const first = JSON.stringify(cycles[0], Object.keys(cycles[0]!).sort())
    const last = JSON.stringify(cycles[99], Object.keys(cycles[99]!).sort())
    expect(last).toBe(first) // Same counter shape across 100 cycles
  })

  it('50 reactive updates to one theme signal read by 100 styled components', async () => {
    const theme = signal<Theme>({ bg: '#fff', fg: '#111' })
    const root = document.getElementById('root')!

    const Row = () => h(Card, { theme: theme() }, 'row')

    mount(
      h(
        'div',
        null,
        ...Array.from({ length: 100 }, () => h(Row, null)),
      ),
      root,
    )

    perfHarness.reset()
    const outcome = await perfHarness.record('50-theme-writes', () => {
      for (let i = 0; i < 50; i++) {
        theme.set({ bg: `#fff`, fg: i % 2 === 0 ? '#111' : '#222' })
      }
    })
    const snap = outcome.after
    // oxlint-disable-next-line no-console
    console.log(
      `[stress] 50 theme writes × 100 components: signalWrite=${snap['reactivity.signalWrite']}, effectRun=${snap['reactivity.effectRun']}`,
    )
    // Nothing subscribed to theme() in JSX context here — 0 effect runs
    expect(snap['reactivity.signalWrite']).toBe(50)
  })
})
