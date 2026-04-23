// @vitest-environment happy-dom
/**
 * Big-list scaling probe — 1k and 10k rows.
 *
 * This is where real-world apps feel slow. The goal: find any
 * super-linear counter behaviour in list mount / shuffle / reverse
 * operations. Each test reports its numbers; assertions fail only on
 * genuine regression patterns (ops scaling worse than O(n log n)).
 */
import { For, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
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

function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const rand = mulberry32(seed)
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const ai = out[i] as T
    out[i] = out[j] as T
    out[j] = ai
  }
  return out
}

async function mountList(N: number): Promise<{ items: ReturnType<typeof signal<number[]>>; dispose: () => void }> {
  const root = resetDom()
  const initial = Array.from({ length: N }, (_, i) => i)
  const items = signal(initial)
  const dispose = mount(
    h(For, {
      each: () => items(),
      by: (n: number) => n,
      children: (n: number) => h('li', null, String(n)),
    }),
    root,
  )
  return { items, dispose }
}

describe('big-list scaling', () => {
  it('1000-row INITIAL MOUNT counter shape', async () => {
    const outcome = await perfHarness.record('mount-1k', async () => {
      const { dispose } = await mountList(1000)
      dispose()
    })
    // Report — no hard assertion, just visibility.
    const mountChild = outcome.after['runtime.mountChild'] ?? 0
    const mount = outcome.after['runtime.mount'] ?? 0
    expect(mount).toBe(1)
    // Each row = 2 VNodes (li + text). 1000 rows → ~2000+ mountChild plus scaffolding.
    // Upper bound: 10× = 10000 would flag something wrong.
    expect(mountChild).toBeLessThan(10_000)
    // oxlint-disable-next-line no-console
    console.log(`[big-list] 1k mount: mountChild=${mountChild}`)
  })

  it(
    '10000-row INITIAL MOUNT counter shape',
    async () => {
      const outcome = await perfHarness.record('mount-10k', async () => {
        const { dispose } = await mountList(10_000)
        dispose()
      })
      const mountChild = outcome.after['runtime.mountChild'] ?? 0
      expect(mountChild).toBeLessThan(100_000)
      // oxlint-disable-next-line no-console
      console.log(`[big-list] 10k mount: mountChild=${mountChild}`)
    },
    30_000, // happy-dom takes ~15s on CI to mount 10k nodes
  )

  it('1000-row RANDOM SHUFFLE — scaling snapshot', async () => {
    const { items, dispose } = await mountList(1000)
    const outcome = await perfHarness.record('shuffle-1k', () => {
      items.set(seededShuffle(items(), 42))
    })
    const lisOps = outcome.after['runtime.mountFor.lisOps'] ?? 0
    expect(lisOps).toBeGreaterThan(0)
    // oxlint-disable-next-line no-console
    console.log(`[big-list] 1k shuffle: lisOps=${lisOps}`)
    dispose()
  })

  it(
    '10000-row RANDOM SHUFFLE — scaling snapshot',
    async () => {
      const { items, dispose } = await mountList(10_000)
      const outcome = await perfHarness.record('shuffle-10k', () => {
        items.set(seededShuffle(items(), 42))
      })
      const lisOps = outcome.after['runtime.mountFor.lisOps'] ?? 0
      expect(lisOps).toBeGreaterThan(0)
      // oxlint-disable-next-line no-console
      console.log(`[big-list] 10k shuffle: lisOps=${lisOps}`)
      dispose()
    },
    30_000,
  )

  it('1000-row REVERSAL', async () => {
    const { items, dispose } = await mountList(1000)
    const outcome = await perfHarness.record('reverse-1k', () => {
      items.set([...items()].reverse())
    })
    const lisOps = outcome.after['runtime.mountFor.lisOps'] ?? 0
    // oxlint-disable-next-line no-console
    console.log(`[big-list] 1k reverse: lisOps=${lisOps}`)
    expect(lisOps).toBeGreaterThan(0)
    dispose()
  })

  it(
    '10000-row REVERSAL',
    async () => {
      const { items, dispose } = await mountList(10_000)
      const outcome = await perfHarness.record('reverse-10k', () => {
        items.set([...items()].reverse())
      })
      const lisOps = outcome.after['runtime.mountFor.lisOps'] ?? 0
      // oxlint-disable-next-line no-console
      console.log(`[big-list] 10k reverse: lisOps=${lisOps}`)
      expect(lisOps).toBeGreaterThan(0)
      dispose()
    },
    30_000,
  )

  it('append 1000 rows to existing 1000-row list', async () => {
    const { items, dispose } = await mountList(1000)
    const outcome = await perfHarness.record('append-1k-to-1k', () => {
      items.set([...items(), ...Array.from({ length: 1000 }, (_, i) => i + 1000)])
    })
    const mountChild = outcome.after['runtime.mountChild'] ?? 0
    const lisOps = outcome.after['runtime.mountFor.lisOps'] ?? 0
    // oxlint-disable-next-line no-console
    console.log(`[big-list] 1k→2k append: mountChild=${mountChild}, lisOps=${lisOps}`)
    // Should mount 1000 new rows (one mountChild per row).
    expect(mountChild).toBeGreaterThanOrEqual(1000)
    // Monotonic append fast path: zero binary-search probes.
    expect(lisOps).toBe(0)
    dispose()
  })

  it('prepend 1000 rows to existing 1000-row list', async () => {
    const { items, dispose } = await mountList(1000)
    const outcome = await perfHarness.record('prepend-1k-to-1k', () => {
      items.set([...Array.from({ length: 1000 }, (_, i) => i + 1000), ...items()])
    })
    const mountChild = outcome.after['runtime.mountChild'] ?? 0
    const lisOps = outcome.after['runtime.mountFor.lisOps'] ?? 0
    // oxlint-disable-next-line no-console
    console.log(`[big-list] 1k→2k prepend: mountChild=${mountChild}, lisOps=${lisOps}`)
    dispose()
  })
})
