/**
 * Consumer-shaped tests for previously-unmeasured paths. Until this
 * excellence pass, the package's ENTIRE core module (src/index.ts) was
 * excluded from coverage by the default `src/**\/index.ts` barrel exclude —
 * these tests close the real gaps that surfaced once `includeIndexInCoverage`
 * was flipped on.
 */
import { afterEach, describe, expect, test, vi } from 'vitest'
import { batch, signal } from '@pyreon/reactivity'
import { addStorePlugin, defineStore, resetAllStores } from '../index'
import type { SchemaIssue } from '../index'

afterEach(() => resetAllStores())

// Minimal Standard Schema factory for the edge cases below.
function stdSchema(validate: (v: unknown) => { value?: unknown; issues?: { message: string }[] } | Promise<unknown>) {
  return {
    '~standard': { version: 1 as const, vendor: 'test', validate },
  }
}

describe('setup return classification — plain values', () => {
  test('non-signal non-function values pass through inert', () => {
    const CONFIG = { flag: true }
    const useStore = defineStore('cov-plain-value', () => ({
      count: signal(0),
      config: CONFIG, // plain object — passthrough, not state
      version: 3, // primitive — passthrough
    }))
    const api = useStore()
    expect(api.store.config).toBe(CONFIG)
    expect(api.store.version).toBe(3)
    expect(Object.keys(api.state)).toEqual(['count']) // only the signal is state
  })
})

describe('dev perf-counter sink is invoked across the hot paths', () => {
  // With no `__pyreon_count__` sink installed, every `_countSink.__pyreon_count__?.()`
  // short-circuits, leaving the "sink present" arm of each emit uncovered. This
  // installs a sink (the perf-harness contract) and drives each counter-emitting
  // path so those arms are exercised — and doubles as a check that the store's
  // named counters actually fire (defineStore / patchKey / subscribeNotify /
  // actionCall).
  test('counters fire for setup, action, and every patch form', () => {
    const g = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }
    const prev = g.__pyreon_count__
    const seen = new Set<string>()
    g.__pyreon_count__ = (name) => {
      seen.add(name)
    }
    try {
      const useStore = defineStore('cov-counters', () => {
        const count = signal(0)
        const label = signal('x')
        return { count, label, inc: () => count.set(count() + 1) }
      })
      const api = useStore()
      api.subscribe(() => {})
      api.store.inc() // actionCall + subscribeNotify (direct)
      api.patch({ count: 5, label: 'y' }) // detach path: patchKey + subscribeNotify
      api.patch((s) => (s.count as { set(v: number): void }).set(6)) // functional form
      // A fresh (no-subscriber) store exercises the no-sub applyPatchFn patchKey path.
      const useOther = defineStore('cov-counters-2', () => ({ n: signal(0) }))
      useOther().patch({ n: 1 })
      expect(seen.has('store.defineStore')).toBe(true)
      expect(seen.has('store.actionCall')).toBe(true)
      expect(seen.has('store.patchKey')).toBe(true)
      expect(seen.has('store.subscribeNotify')).toBe(true)
    } finally {
      if (prev === undefined) delete g.__pyreon_count__
      else g.__pyreon_count__ = prev
    }
  })
})

describe('subscriber removing itself mid-notification', () => {
  test('remaining queued per-signal notifications no-op once the last subscriber left', () => {
    const useStore = defineStore('cov-self-unsub', () => ({
      a: signal(0),
      b: signal(0),
    }))
    const api = useStore()
    const seen: string[] = []
    const unsub = api.subscribe((m) => {
      seen.push(m.events.map((e) => e.key).join(','))
      unsub() // last subscriber leaves DURING the first notification
    })
    // One batch writing both fields: the first drained per-signal callback
    // notifies + unsubscribes; the second drained callback must hit the
    // "no subscribers" early-return without throwing.
    batch(() => {
      api.store.a.set(1)
      api.store.b.set(2)
    })
    expect(seen).toEqual(['a'])
    expect(api.store.b()).toBe(2)
  })
})

describe('schema-mode edge paths', () => {
  test('setup ctx set/patch/reset helpers route through the validated wrapper', () => {
    const useStore = defineStore('cov-ctx-helpers', {
      schema: stdSchema((v) => {
        const val = v as { count: number }
        return typeof val.count === 'number' && val.count >= 0
          ? { value: val }
          : { issues: [{ message: 'count must be >= 0' }] }
      }),
      initial: { count: 1 },
      setup: ({ state, set, patch, reset }) => ({
        setTo: (n: number) => set({ count: n }),
        bump: () => patch({ count: (state.count!() as number) + 1 }),
        restore: () => reset(),
      }),
    })
    const api = useStore()
    ;(api.store.setTo as (n: number) => void)(5)
    expect(api.state.count).toBe(5)
    ;(api.store.bump as () => void)()
    expect(api.state.count).toBe(6)
    ;(api.store.restore as () => void)()
    expect(api.state.count).toBe(1)
    // Validated: a bad write through the ctx helper throws.
    expect(() => (api.store.setTo as (n: number) => void)(-1)).toThrow('count must be >= 0')
  })

  test('wrapper patch functional form is an unvalidated escape hatch', () => {
    const useStore = defineStore('cov-fn-patch', {
      schema: stdSchema((v) => {
        const val = v as { count: number }
        return val.count >= 0 ? { value: val } : { issues: [{ message: 'no negatives' }] }
      }),
      initial: { count: 0 },
    })
    const api = useStore()
    // Functional form bypasses validation by design.
    api.patch((s) => (s.count as { set(v: number): void }).set(-5))
    expect(api.state.count).toBe(-5)
  })

  test('onValidationError suppresses the throw and skips the write for patch/deepPatch/update', () => {
    const errors: { issues: SchemaIssue[]; op: string }[] = []
    const useStore = defineStore('cov-validation-cb', {
      schema: stdSchema((v) => {
        const val = v as { count: number; prefs: { theme: string } }
        return val.count >= 0
          ? { value: val }
          : { issues: [{ message: 'no negatives' }] }
      }),
      initial: { count: 0, prefs: { theme: 'light' } },
      onValidationError: (issues, op) => errors.push({ issues, op }),
    })
    const api = useStore()
    api.patch({ count: -1 })
    expect(api.state.count).toBe(0) // write skipped
    api.deepPatch({ count: -2 })
    expect(api.state.count).toBe(0)
    api.update('count', () => -3)
    expect(api.state.count).toBe(0)
    expect(errors.map((e) => e.op)).toEqual(['patch', 'patch', 'patch'])
  })

  test('deepPatch replaces non-plain-object branches (array top level)', () => {
    const useStore = defineStore('cov-deep-replace', {
      schema: stdSchema((v) => ({ value: v as { items: number[] } })),
      initial: { items: [1, 2] },
    })
    const api = useStore()
    api.deepPatch({ items: [9] })
    expect(api.state.items).toEqual([9])
  })

  test('a schema that turns async at runtime throws with a clear message', () => {
    let calls = 0
    const useStore = defineStore('cov-late-async', {
      schema: stdSchema((v) => {
        calls++
        if (calls > 1) return Promise.resolve({ value: v })
        return { value: v as { count: number } }
      }),
      initial: { count: 0 },
    })
    const api = useStore()
    expect(() => api.set({ count: 1 })).toThrow('async unsupported')
  })

  test('reset() falls back to inner.reset() when the initial no longer re-parses', () => {
    let calls = 0
    const useStore = defineStore('cov-reset-fallback', {
      schema: stdSchema((v) => {
        calls++
        // Valid at init; becomes async later so reset()'s re-parse bails to
        // the setup-time snapshot path.
        if (calls > 1) return Promise.resolve({ value: v })
        return { value: v as { count: number } }
      }),
      initial: { count: 7 },
    })
    const api = useStore()
    api.store.count!.set(99) // direct write — bypasses validation
    api.reset()
    expect(api.state.count).toBe(7) // restored via inner.reset() fallback
  })
})

describe('plugin cleanup error handling', () => {
  test('a throwing plugin cleanup is caught (dev-warned), dispose completes', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      addStorePlugin((api) => {
        if (api.id !== 'cov-plugin-throwing-cleanup') return
        return () => {
          throw new Error('cleanup boom')
        }
      })
      const useStore = defineStore('cov-plugin-throwing-cleanup', () => ({ v: signal(0) }))
      const api = useStore()
      expect(() => api.dispose()).not.toThrow()
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('plugin cleanup error'),
        expect.any(Error),
      )
    } finally {
      warn.mockRestore()
    }
  })
})

describe('remaining branch arms', () => {
  test('schema setup returning undefined yields a signals-only store', () => {
    const useStore = defineStore('cov-setup-undefined', {
      schema: stdSchema((v) => ({ value: v as { count: number } })),
      initial: { count: 4 },
      // Returns undefined — the `?? {}` fallback arm.
      setup: () => undefined as unknown as Record<string, unknown>,
    })
    const api = useStore()
    expect(api.state.count).toBe(4)
    api.patch({ count: 5 })
    expect(api.state.count).toBe(5)
  })

  test('store subscriber torn down by an effect mid-patch — remaining per-signal notifications skip cleanly', async () => {
    const { effect } = await import('@pyreon/reactivity')
    const useStore = defineStore('cov-mid-patch-unsub', () => ({
      a: signal(0),
      b: signal(0),
    }))
    const api = useStore()
    const events: string[] = []
    const unsub = api.subscribe((m) => events.push(m.type))
    // Effect on `a` that removes the store subscriber when a changes — it
    // drains BETWEEN the two per-signal change callbacks of the same patch.
    let torn = false
    effect(() => {
      api.store.a()
      if (!torn && api.store.a() === 1) {
        torn = true
        unsub()
      }
    })
    expect(() => api.patch({ a: 1, b: 2 })).not.toThrow()
    expect(api.store.b()).toBe(2)
  })
})
