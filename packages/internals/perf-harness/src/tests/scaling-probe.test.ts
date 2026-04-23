// @vitest-environment happy-dom
/**
 * Scaling probe — empirically verifies `runtime.mountFor.lisOps` is
 * O(n log n) in list size, which is the claim `COUNTERS.md` makes.
 *
 * Intentionally NOT pinning a specific ops count. Pinning would be fragile
 * (binary-search micro-details can shift by a few probes without changing
 * the complexity class). Instead we probe three sizes and assert the ratio
 * `ops(large) / ops(small)` is bounded by what O(n log n) predicts.
 *
 * If LIS ever regresses to O(n²), the ratio blows past the bound and the
 * test fails. If LIS gets faster, the ratio drops and the test still
 * passes — we only fail on regression.
 */
import { For, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _disable, _reset } from '../counters'
import { install, perfHarness, uninstall } from '../harness'

beforeEach(() => {
  _reset()
  install()
})

afterEach(() => {
  uninstall()
  _reset()
  _disable()
})

/**
 * Deterministic PRNG — mulberry32. Using it (rather than Math.random) so
 * the scaling probe produces stable numbers across CI runs.
 */
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
    const aj = out[j] as T
    out[i] = aj
    out[j] = ai
  }
  return out
}

async function measureShuffleOps(N: number): Promise<number> {
  document.body.innerHTML = '<div id="root"></div>'
  const root = document.getElementById('root')!
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
  perfHarness.reset()
  const shuffled = seededShuffle(initial, 42)
  const outcome = await perfHarness.record(`shuffle-${N}`, () => {
    items.set(shuffled)
  })
  dispose()
  document.body.innerHTML = ''
  return outcome.after['runtime.mountFor.lisOps'] ?? 0
}

describe('runtime.mountFor.lisOps scaling', () => {
  it('matches the O(n log n) claim in COUNTERS.md on random shuffles', async () => {
    // Random shuffles exercise the full binary-search path (unlike a full
    // reversal, which has LIS length 1 and degenerates to linear probes).
    // Three sizes, all above the small-k fast path.
    const ops100 = await measureShuffleOps(100)
    const ops500 = await measureShuffleOps(500)
    const ops1000 = await measureShuffleOps(1000)

    // Sanity: every size produced work.
    expect(ops100).toBeGreaterThan(0)
    expect(ops500).toBeGreaterThan(0)
    expect(ops1000).toBeGreaterThan(0)

    // Complexity check. For O(n log n): ops(k·n) / ops(n) ≈ k · (1 + log₂(k)/log₂(n)).
    //
    // Going 100 → 1000 (k=10): predicted ratio ≈ 10 · (1 + log₂(10)/log₂(100))
    //                                           ≈ 10 · 1.50 ≈ 15.0
    //
    // The probe asserts ops(1000) ≤ 25× ops(100) — generous enough for
    // implementation drift, tight enough to catch an O(n²) regression
    // (which would be 100×).
    const ratio1000over100 = ops1000 / ops100
    expect(
      ratio1000over100,
      `1000→100 ratio ${ratio1000over100.toFixed(1)}x suggests regression beyond O(n log n)`,
    ).toBeLessThan(25)

    // Log the actual numbers so the PR reviewer sees what "healthy" looks like.
    // biome-ignore lint/suspicious/noConsole: intentional probe output
    console.log(
      `[scaling-probe] lisOps: 100→${ops100}, 500→${ops500}, 1000→${ops1000}; ` +
        `1000/100 = ${ratio1000over100.toFixed(2)}x (O(n log n) predicts ~15x)`,
    )
  })

  it('reversal (LIS length = 1) degenerates to linear probes — a separate scaling class', async () => {
    // Full reversal is a pathological case for the LIS algorithm: the
    // longest increasing subsequence has length 1, so `lisLen` never grows,
    // and each binary search does exactly one probe. This is correct
    // O(n) behaviour for reversals — not a regression. Document it so
    // a future probe doesn't mistakenly use reversal and conclude LIS is
    // "linear and everyone who said O(n log n) was wrong."
    const reversalOps = async (N: number) => {
      document.body.innerHTML = '<div id="root"></div>'
      const root = document.getElementById('root')!
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
      perfHarness.reset()
      const outcome = await perfHarness.record(`rev-${N}`, () => {
        items.set([...initial].reverse())
      })
      dispose()
      document.body.innerHTML = ''
      return outcome.after['runtime.mountFor.lisOps'] ?? 0
    }
    const rev100 = await reversalOps(100)
    const rev1000 = await reversalOps(1000)
    // Linear scaling: ops(1000) / ops(100) ≈ 10.
    expect(rev1000 / rev100).toBeGreaterThan(8)
    expect(rev1000 / rev100).toBeLessThan(12)
  })
})
