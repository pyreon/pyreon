/**
 * Coverage hardening — targets the error/edge branches that were uncovered
 * when the CI `Coverage (Full)` gate started failing this package at
 * 94.14% statements vs the 95% threshold (while local runs measured 96.45%
 * — environment variance; margin is the cure). Every spec here exercises a
 * REAL contract: schema-mode async-validator rejection at each lifecycle
 * point (create / set / patch / reset), onValidationError fallback shapes,
 * config-shape validation, and the devtools/registry introspection surface.
 */
import { describe, expect, it, vi } from 'vitest'
import { getActiveModels, registerInstance, unregisterInstance } from '../devtools'
import { addMiddleware } from '../middleware'
import { model } from '../model'
import { onPatch } from '../patch'
import { isModelInstance } from '../registry'
import { getSnapshot } from '../snapshot'
import type { MiddlewareFn } from '../types'

type Shape = { name: string; age: number }

/**
 * Stateful Tier-B adapter: `mode` switches parse behavior AFTER the
 * instance is constructed, so each lifecycle point (create / set / patch /
 * reset) can be driven into the async-Promise / invalid branches
 * independently.
 */
function makeAdapter() {
  const state = { mode: 'ok' as 'ok' | 'promise' | 'invalid' }
  const adapter = {
    _infer: undefined as unknown as Shape,
    validator: async () => ({}) as never,
    parse: (value: unknown) => {
      if (state.mode === 'promise') return Promise.resolve({ ok: true, value }) as never
      if (state.mode === 'invalid') {
        return { ok: false as const, issues: [{ path: 'name', message: 'forced invalid' }] }
      }
      return { ok: true as const, value: value as Shape }
    },
  }
  return { adapter, state }
}

describe('schema mode — async parse rejected at every lifecycle point', () => {
  it('create(): parse returning a Promise throws the async-unsupported error', () => {
    const { adapter, state } = makeAdapter()
    state.mode = 'promise'
    const M = model({ schema: adapter })
    expect(() => M.create({ name: 'a', age: 1 })).toThrow(/Async schemas are unsupported/)
  })

  it('set(): parse returning a Promise throws and leaves state intact', () => {
    const { adapter, state } = makeAdapter()
    const M = model({ schema: adapter, initial: { name: 'a', age: 1 } })
    const m = M.create() as ReturnType<typeof M.create> & {
      name: () => string
      set: (next: Shape) => void
    }
    state.mode = 'promise'
    expect(() => m.set({ name: 'b', age: 2 })).toThrow(/Async schemas are unsupported/)
    expect(m.name()).toBe('a')
  })

  it('patch(): parse returning a Promise throws and leaves state intact', () => {
    const { adapter, state } = makeAdapter()
    const M = model({ schema: adapter, initial: { name: 'a', age: 1 } })
    const m = M.create() as ReturnType<typeof M.create> & {
      age: () => number
      patch: (next: Partial<Shape>) => void
    }
    state.mode = 'promise'
    expect(() => m.patch({ age: 2 })).toThrow(/Async schemas are unsupported/)
    expect(m.age()).toBe(1)
  })

  it('reset(): parse returning a Promise throws the reset-specific error', () => {
    const { adapter, state } = makeAdapter()
    const M = model({ schema: adapter, initial: { name: 'a', age: 1 } })
    const m = M.create() as ReturnType<typeof M.create> & { reset: () => void }
    state.mode = 'promise'
    expect(() => m.reset()).toThrow(/model\.reset\(\): schema returned a Promise/)
  })

  it('reset(): re-parse failing validation throws with the reset op label', () => {
    const { adapter, state } = makeAdapter()
    const M = model({ schema: adapter, initial: { name: 'a', age: 1 } })
    const m = M.create() as ReturnType<typeof M.create> & { reset: () => void }
    state.mode = 'invalid'
    expect(() => m.reset()).toThrow(/reset/)
  })
})

describe('schema mode — create-time initial resolution branches', () => {
  it('create() with no initial anywhere throws the no-initial error', () => {
    const { adapter } = makeAdapter()
    const M = model({ schema: adapter })
    expect(() => M.create()).toThrow(/no `initial` value available/)
  })

  it('invalid create-arg WITHOUT onValidationError throws the formatted message', () => {
    const { adapter, state } = makeAdapter()
    const M = model({ schema: adapter, initial: { name: 'a', age: 1 } })
    state.mode = 'invalid'
    expect(() => M.create({ name: '', age: 0 })).toThrow(/forced invalid/)
  })

  it('invalid create-arg WITH onValidationError falls back to the definition initial', () => {
    const { adapter, state } = makeAdapter()
    const onValidationError = vi.fn()
    const M = model({ schema: adapter, initial: { name: 'def', age: 9 }, onValidationError })
    state.mode = 'invalid'
    const m = M.create({ name: '', age: 0 }) as ReturnType<typeof M.create> & {
      name: () => string
    }
    expect(onValidationError).toHaveBeenCalledWith(
      [{ path: 'name', message: 'forced invalid' }],
      'init',
    )
    expect(m.name()).toBe('def')
  })

  it('invalid create-arg WITH onValidationError but NO definition initial still throws', () => {
    const { adapter, state } = makeAdapter()
    const onValidationError = vi.fn()
    const M = model({ schema: adapter, onValidationError })
    state.mode = 'invalid'
    expect(() => M.create({ name: '', age: 0 })).toThrow(/forced invalid/)
    expect(onValidationError).toHaveBeenCalled()
  })

  it('invalid DEFINITION initial WITH onValidationError suppresses the definition-time throw', () => {
    const { adapter, state } = makeAdapter()
    state.mode = 'invalid'
    const onValidationError = vi.fn()
    const M = model({ schema: adapter, initial: { name: '', age: 0 }, onValidationError })
    expect(onValidationError).toHaveBeenCalledWith(
      [{ path: 'name', message: 'forced invalid' }],
      'init',
    )
    // Definition constructed; a later VALID create-arg works normally.
    state.mode = 'ok'
    const m = M.create({ name: 'ok', age: 1 }) as ReturnType<typeof M.create> & {
      name: () => string
    }
    expect(m.name()).toBe('ok')
  })
})

describe('config-shape validation', () => {
  it('model({}) with neither state nor schema throws', () => {
    expect(() => model({} as never)).toThrow(/must carry either `state` \(plain mode\) or/)
  })

  it('plain-mode create() with no argument uses defaults (initial ?? {})', () => {
    const M = model({ state: { n: 1 } })
    const m = M.create() as ReturnType<typeof M.create> & { n: () => number }
    expect(m.n()).toBe(1)
  })
})

describe('introspection surfaces', () => {
  it('getSnapshot on a non-instance throws', () => {
    expect(() => getSnapshot({})).toThrow(/not a model instance/)
  })

  it('isModelInstance discriminates instances from plain values', () => {
    const M = model({ state: { n: 1 } })
    const m = M.create()
    expect(isModelInstance(m)).toBe(true)
    expect(isModelInstance({})).toBe(false)
    expect(isModelInstance(null)).toBe(false)
    expect(isModelInstance(42)).toBe(false)
  })

  it('getActiveModels lists registered instances and prunes nothing while alive', () => {
    const M = model({ state: { n: 1 } })
    const m = M.create()
    registerInstance('coverage-hardening-probe', m)
    expect(getActiveModels()).toContain('coverage-hardening-probe')
    unregisterInstance('coverage-hardening-probe')
    expect(getActiveModels()).not.toContain('coverage-hardening-probe')
  })

  it('onPatch listener receives emitted patches for real writes', () => {
    const M = model({ state: { n: 1 } })
    const m = M.create() as ReturnType<typeof M.create> & {
      n: { (): number; set: (v: number) => void }
    }
    const seen: unknown[] = []
    const off = onPatch(m, (p) => {
      seen.push(p)
    })
    m.n.set(1) // Object.is-equal — must NOT emit
    expect(seen).toHaveLength(0)
    m.n.set(2)
    expect(seen).toHaveLength(1)
    off()
  })
})

describe('middleware dispatch defensive branch', () => {
  it('an undefined middleware entry falls through to the action', () => {
    const M = model({ state: { n: 1 } }).actions((self: { n: () => number }) => ({
      double: () => self.n() * 2,
    }))
    const m = M.create() as ReturnType<typeof M.create> & { double: () => number }
    // Defensive branch: a hole in the middleware chain dispatches the
    // action directly instead of crashing.
    const off = addMiddleware(m, undefined as unknown as MiddlewareFn)
    expect(m.double()).toBe(2)
    off()
  })
})
