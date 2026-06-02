/**
 * Coverage-focused tests for computed() WITH setter option ({ get, set }).
 *
 * Covers index.ts lines 200-209 (inside-component setter path) and the
 * outside-component readonly throw branch around line 227.
 */
import { describe, expect, it } from 'vitest'
import { computed, reactive, readonly, ref, shallowReadonly } from '../index'
import { beginRender, endRender, type RenderContext } from '../jsx-runtime'
// vue-compat re-exports the RenderContext type — keep beginRender/endRender from jsx-runtime.

function createCtx(): RenderContext {
  return {
    hooks: [],
    scheduleRerender: () => {},
    pendingEffects: [],
    pendingLayoutEffects: [],
    unmounted: false,
    unmountCallbacks: [],
  }
}

describe('computed() — { get, set } setter inside component', () => {
  it('writes through to underlying ref via setter', () => {
    const ctx = createCtx()
    const count = ref(10)
    beginRender(ctx)
    const dbl = computed({
      get: () => count.value * 2,
      set: (v: number) => {
        count.value = Math.floor(v / 2)
      },
    })
    expect(dbl.value).toBe(20)
    dbl.value = 100
    endRender()
    expect(count.value).toBe(50)
  })

  it('hook-indexed: same ref returned across renders', () => {
    const ctx = createCtx()
    let runs = 0
    const factory = () => {
      runs++
      beginRender(ctx)
      const x = ref(0)
      const dbl = computed({
        get: () => x.value * 2,
        set: (v: number) => {
          x.value = v / 2
        },
      })
      endRender()
      return dbl
    }
    const a = factory()
    const b = factory()
    expect(a).toBe(b)
    expect(runs).toBe(2)
  })
})

describe('reactive() — proxy traps inside component', () => {
  it('deleteProperty trap fires + schedules rerender', () => {
    let rerenders = 0
    const ctx: RenderContext = {
      hooks: [],
      scheduleRerender: () => {
        rerenders++
      },
      pendingEffects: [],
      pendingLayoutEffects: [],
      unmounted: false,
      unmountCallbacks: [],
    }
    beginRender(ctx)
    const obj = reactive({ a: 1, b: 2 } as { a?: number; b?: number })
    delete obj.a
    endRender()
    expect(obj.a).toBeUndefined()
    expect(obj.b).toBe(2)
    expect(rerenders).toBeGreaterThan(0)
  })

  it('set trap fires + schedules rerender', () => {
    let rerenders = 0
    const ctx: RenderContext = {
      hooks: [],
      scheduleRerender: () => {
        rerenders++
      },
      pendingEffects: [],
      pendingLayoutEffects: [],
      unmounted: false,
      unmountCallbacks: [],
    }
    beginRender(ctx)
    const obj = reactive({ a: 1 })
    obj.a = 99
    endRender()
    expect(obj.a).toBe(99)
    expect(rerenders).toBeGreaterThan(0)
  })
})

describe('readonly() / shallowReadonly() — write throws', () => {
  it('readonly object throws on set', () => {
    const r = readonly({ a: 1 })
    expect(() => {
      ;(r as { a: number }).a = 99
    }).toThrow(/readonly/)
  })

  it('readonly object throws on delete', () => {
    const r = readonly({ a: 1, b: 2 } as { a?: number; b?: number })
    expect(() => {
      // readonly<T>'s deleteProperty trap throws; the cast bypasses the
      // type-level readonly so the runtime trap fires.
      delete (r as { a?: number }).a
    }).toThrow(/readonly/)
  })

  it('shallowReadonly throws on top-level set', () => {
    const r = shallowReadonly({ a: 1 })
    expect(() => {
      ;(r as { a: number }).a = 99
    }).toThrow(/readonly/)
  })
})

describe('computed() — outside component, throws on set without setter', () => {
  it('throws when setting .value on getter-only computed', () => {
    const c = computed(() => 42)
    expect(() => {
      ;(c as { value: number }).value = 99
    }).toThrow('readonly')
  })

  it('accepts writes when set option provided', () => {
    const inner = ref(1)
    const c = computed({
      get: () => inner.value * 10,
      set: (v: number) => {
        inner.value = v / 10
      },
    })
    c.value = 50
    expect(inner.value).toBe(5)
  })
})
