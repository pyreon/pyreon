import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { publicationVisibilityTargets } from '../../../../../scripts/check-published-state'
import { waitForRegistryVisibility } from '../../../../../scripts/wait-for-registry'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('accepted publication visibility', () => {
  it('bounds simultaneous requests even for a full release receipt', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let active = 0
    let peak = 0
    const lookup = vi.fn(async () => {
      peak = Math.max(peak, ++active)
      await gate
      active--
      return true
    })
    const work = waitForRegistryVisibility(
      Array.from({ length: 20 }, (_, i) => `pkg-${i}`),
      lookup,
    )
    await vi.advanceTimersByTimeAsync(0)
    const initial = lookup.mock.calls.length
    release?.()
    expect(await work).toEqual({ pending: [], timedOut: false })
    expect(initial).toBe(8)
    expect(peak).toBeLessThanOrEqual(8)
    expect(lookup).toHaveBeenCalledTimes(20)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('waits for a stale registry view to catch up and rechecks only pending packages', async () => {
    let laggingReads = 0
    const lookup = vi.fn(async (pkg: string) => pkg === 'ready' || ++laggingReads === 2)
    const work = waitForRegistryVisibility(['ready', 'pending'], lookup, {
      timeoutMs: 100,
      intervalMs: 10,
    })
    await vi.advanceTimersByTimeAsync(10)
    expect(await work).toEqual({ pending: [], timedOut: false })
    expect(lookup.mock.calls.map(([pkg]) => pkg)).toEqual(['ready', 'pending', 'pending'])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reports a permanently invisible accepted package at the hard deadline', async () => {
    const work = waitForRegistryVisibility(['missing'], async () => false, {
      timeoutMs: 30,
      intervalMs: 10,
    })
    await vi.advanceTimersByTimeAsync(30)
    expect(await work).toEqual({ pending: ['missing'], timedOut: true })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('bounds an unresponsive lookup even if it ignores abort', async () => {
    let signal: AbortSignal | undefined
    const work = waitForRegistryVisibility(
      ['hung'],
      async (_, abort) => {
        signal = abort
        return new Promise<boolean>(() => {})
      },
      { timeoutMs: 30 },
    )
    await vi.advanceTimersByTimeAsync(30)
    expect(await work).toEqual({ pending: ['hung'], timedOut: true })
    expect(signal?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('preserves lookup errors and cleans up the backstop', async () => {
    await expect(
      waitForRegistryVisibility(['denied'], async () => {
        throw new Error('registry HTTP 403')
      }),
    ).rejects.toThrow('registry HTTP 403')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('makes no registry requests without accepted publications', async () => {
    const lookup = vi.fn(async () => false)
    expect(await waitForRegistryVisibility([], lookup)).toEqual({ pending: [], timedOut: false })
    expect(lookup).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('publication receipts do not hide release failures', () => {
  const version = '0.52.0'
  const packages = ['accepted', 'failed', 'blocked', 'bootstrap'].map((name) => ({
    pkg: `@pyreon/${name}`,
    repo: version,
  }))
  const receipt = (extra = {}) =>
    JSON.stringify({
      version,
      published: ['@pyreon/accepted'],
      failed: ['@pyreon/failed'],
      blocked: ['@pyreon/blocked'],
      needsBootstrap: ['@pyreon/bootstrap'],
      ...extra,
    })

  it('waits only for accepted submissions from the current checkout and version', () => {
    expect(publicationVisibilityTargets(receipt(), version, packages)).toEqual(['@pyreon/accepted'])
    expect(
      publicationVisibilityTargets(
        receipt({ published: ['@pyreon/accepted', '@pyreon/failed', '@pyreon/not-in-checkout'] }),
        version,
        packages,
      ),
    ).toEqual(['@pyreon/accepted'])
  })

  it('gives no grace for stale, missing, malformed or empty receipts', () => {
    for (const text of [null, '{', receipt({ version: '0.51.0' }), receipt({ published: [] })]) {
      expect(publicationVisibilityTargets(text, version, packages)).toEqual([])
    }
  })
})
