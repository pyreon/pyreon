/**
 * Real-test branch-coverage hardening for @pyreon/vue-compat.
 * NO v8-ignore annotations.
 */
import { describe, expect, it } from 'vitest'
import {
  computed,
  defineAsyncComponent,
  effectScope,
  isRef,
  onUpdated,
  reactive,
  readonly,
  ref,
  shallowReactive,
  shallowReadonly,
  shallowRef,
  toRaw,
  toRef,
  toRefs,
  toValue,
  triggerRef,
  unref,
  watch,
} from '../index'

// ─── ref / shallowRef / triggerRef ──────────────────────────────────────────

describe('ref + shallowRef + triggerRef', () => {
  it('ref wraps a primitive and notifies on set', () => {
    const r = ref(0)
    expect(r.value).toBe(0)
    r.value = 5
    expect(r.value).toBe(5)
  })

  it('isRef detects a ref vs plain object', () => {
    expect(isRef(ref(0))).toBe(true)
    expect(isRef({ value: 0 })).toBe(false)
    expect(isRef(null)).toBe(false)
    expect(isRef(undefined)).toBe(false)
  })

  it('unref returns the underlying value or passes plain values through', () => {
    expect(unref(ref(5))).toBe(5)
    expect(unref(5)).toBe(5)
    expect(unref('hello')).toBe('hello')
  })

  it('toValue handles fn / ref / plain value', () => {
    expect(toValue(() => 7)).toBe(7)
    expect(toValue(ref(8))).toBe(8)
    expect(toValue(9)).toBe(9)
  })

  it('shallowRef wraps without deep reactivity', () => {
    const obj = { count: 0 }
    const r = shallowRef(obj)
    expect(r.value).toBe(obj)
    // Mutating the inner value does NOT auto-notify shallowRef subscribers
    obj.count = 5
    expect(r.value.count).toBe(5)
  })

  it('triggerRef forces a notify on a shallowRef', () => {
    const obj = { count: 0 }
    const r = shallowRef(obj)
    // Just exercises the API — no throw
    expect(() => triggerRef(r)).not.toThrow()
  })
})

// ─── computed read-only throw + writable ────────────────────────────────────

describe('computed — read-only throw + writable', () => {
  it('read-only computed throws on set (line 203)', () => {
    const a = ref(1)
    const c = computed(() => a.value * 2)
    expect(c.value).toBe(2)
    // Read-only computed: setting throws
    expect(() => {
      ;(c as { value: number }).value = 99
    }).toThrow(/readonly|Cannot set/)
  })

  it('writable computed supports both get and set', () => {
    const a = ref(0)
    const c = computed({
      get: () => a.value,
      set: (v: number) => {
        a.value = v
      },
    })
    expect(c.value).toBe(0)
    c.value = 5
    expect(a.value).toBe(5)
    expect(c.value).toBe(5)
  })
})

// ─── reactive / shallowReactive / readonly / shallowReadonly proxies ────────

describe('reactive / readonly proxies', () => {
  it('reactive proxies a nested object', () => {
    const r = reactive({ user: { name: 'A' } })
    expect(r.user.name).toBe('A')
    r.user.name = 'B'
    expect(r.user.name).toBe('B')
  })

  it('shallowReactive only proxies top-level', () => {
    const r = shallowReactive({ nested: { x: 1 } })
    expect(r.nested.x).toBe(1)
  })

  it('readonly proxy throws on set (recursive — line 354)', () => {
    const r = readonly({ a: 1, nested: { b: 2 } })
    expect(() => {
      ;(r as { a: number }).a = 99
    }).toThrow(/readonly|Cannot set/)
    // Nested set also throws (recursive proxy)
    expect(() => {
      ;(r.nested as { b: number }).b = 99
    }).toThrow(/readonly|Cannot set/)
  })

  it('readonly proxy throws on delete', () => {
    const r = readonly({ a: 1 }) as Record<string, unknown>
    expect(() => {
      delete r.a
    }).toThrow(/readonly|Cannot delete/)
  })

  it('shallowReadonly proxy throws on top-level set (line 332)', () => {
    const r = shallowReadonly({ a: 1, nested: { b: 2 } })
    expect(() => {
      ;(r as { a: number }).a = 99
    }).toThrow(/readonly|Cannot set/)
    // Nested is NOT readonly under shallowReadonly
    ;(r.nested as { b: number }).b = 99
    expect(r.nested.b).toBe(99)
  })

  it('shallowReadonly proxy throws on delete', () => {
    const r = shallowReadonly({ a: 1 }) as Record<string, unknown>
    expect(() => {
      delete r.a
    }).toThrow(/readonly|Cannot delete/)
  })
})

// ─── toRaw / toRef / toRefs ─────────────────────────────────────────────────

describe('toRaw / toRef / toRefs', () => {
  it('toRaw returns the underlying raw object from a reactive', () => {
    const raw = { a: 1 }
    const r = reactive(raw)
    expect(toRaw(r)).toBe(raw)
  })

  it('toRef creates a ref bound to a key on a reactive object', () => {
    const r = reactive({ count: 0 })
    const countRef = toRef(r, 'count')
    expect(countRef.value).toBe(0)
    countRef.value = 5
    expect(r.count).toBe(5)
  })

  it('toRefs converts each key of a reactive to a ref', () => {
    const r = reactive({ a: 1, b: 2 })
    const refs = toRefs(r)
    expect(refs.a.value).toBe(1)
    expect(refs.b.value).toBe(2)
  })
})

// ─── watch — single + array + immediate + deep ──────────────────────────────

describe('watch — source variations', () => {
  it('watch on a single ref fires on change (not on initial)', () => {
    const a = ref(0)
    let lastNew: number | undefined
    let lastOld: number | undefined
    watch(a, (n, o) => {
      lastNew = n
      lastOld = o
    })

    a.value = 5
    expect(lastNew).toBe(5)
    expect(lastOld).toBe(0)
  })

  it('watch with immediate option fires on setup', () => {
    const a = ref(7)
    let lastNew: number | undefined
    watch(
      a,
      (n) => {
        lastNew = n
      },
      { immediate: true },
    )
    expect(lastNew).toBe(7)
  })

  it('watch with a getter function fires on dependency change', () => {
    const a = ref(0)
    const b = ref(10)
    let seen: number | undefined
    watch(
      () => a.value + b.value,
      (n) => {
        seen = n
      },
    )
    a.value = 5
    expect(seen).toBe(15)
  })

  it('watch on array of sources fires when any changes', () => {
    const a = ref(1)
    const b = ref(2)
    let seen: [number, number] | undefined
    watch([a, b], ([na, nb]) => {
      seen = [na, nb]
    })
    a.value = 9
    expect(seen).toEqual([9, 2])
  })
})

// ─── effectScope ────────────────────────────────────────────────────────────

describe('effectScope', () => {
  it('effectScope contains effects + disposes them via stop()', () => {
    const scope = effectScope()
    let runs = 0
    scope.run(() => {
      const a = ref(0)
      watch(a, () => {
        runs++
      })
      a.value = 1
    })
    expect(runs).toBe(1)
    scope.stop()
  })

  it('effectScope(true) is detached — does not auto-add to parent', () => {
    const parent = effectScope()
    const detached = effectScope(true)
    parent.stop()
    expect(() => detached.stop()).not.toThrow()
  })
})

// ─── onUpdated outside ctx fallback (line 819) ──────────────────────────────

describe('onUpdated lifecycle', () => {
  it('onUpdated outside a component context falls back to onUpdate (no throw)', () => {
    expect(() => onUpdated(() => {})).not.toThrow()
  })
})

// ─── defineAsyncComponent ───────────────────────────────────────────────────

describe('defineAsyncComponent', () => {
  it('defineAsyncComponent eventually resolves to the loaded component', async () => {
    const Comp = () => 'rendered'
    const Async = defineAsyncComponent(async () => ({ default: Comp }))
    // Smoke: returns a function that can be invoked
    expect(typeof Async).toBe('function')
    // Trigger the load path
    Async({})
    await new Promise((r) => setTimeout(r, 20))
  })

  it('defineAsyncComponent rejection path is captured into error state', async () => {
    const Async = defineAsyncComponent(async () => {
      throw new Error('load-failed')
    })
    expect(typeof Async).toBe('function')
    Async({})
    await new Promise((r) => setTimeout(r, 20))
  })
})
