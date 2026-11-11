// Vue parity for reactive Map / Set and proxy assignment —
// https://vuejs.org/guide/extras/reactivity-in-depth.html (collections are
// reactive; every read method tracks, a mutation that changes nothing does not
// notify) and https://vuejs.org/api/reactivity-core.html#reactive (a reactive
// object assigned into another is stored raw and read back reactive).
import { reactive, ref, watchEffect } from '../index'

function runs(read: () => void): { count: () => number } {
  let n = 0
  watchEffect(() => {
    read()
    n++
  })
  return { count: () => n }
}

describe('reactive Map', () => {
  test('forEach, keys, values, entries and for-of track; values and keys come back reactive', () => {
    const key = { k: 1 }
    const m = reactive(new Map<object | string, { n: number }>([[key, { n: 1 }]]))
    const seen: number[] = []
    const keys: unknown[] = []
    const r = runs(() => {
      m.forEach((v) => {
        seen.push(v.n)
      })
      for (const k of m.keys()) keys.push(k)
      for (const v of m.values()) seen.push(v.n)
      for (const [, v] of m.entries()) seen.push(v.n)
      for (const [, v] of m) seen.push(v.n)
    })
    expect(seen).toEqual([1, 1, 1, 1])
    // An object key comes back through the reactive layer (not the raw key).
    expect(keys[0]).not.toBe(key)
    expect(keys[0]).toEqual(key)
    m.set('b', { n: 2 })
    expect(r.count()).toBe(2)
    expect(seen.slice(4)).toEqual([1, 2, 1, 2, 1, 2, 1, 2])
  })

  test('a key passed as the reactive proxy finds the raw entry', () => {
    const key = { id: 1 }
    const m = reactive(new Map<object, string>([[key, 'v']]))
    const wrappedKey = [...m.keys()][0] as object
    expect(wrappedKey).not.toBe(key)
    expect(m.get(wrappedKey)).toBe('v')
    expect(m.has(wrappedKey)).toBe(true)
  })

  test('a write that changes nothing does not notify; a real one does', () => {
    const m = reactive(new Map([['a', 1]]))
    const r = runs(() => m.get('a'))
    m.set('a', 1)
    expect(r.count()).toBe(1)
    expect(m.delete('missing')).toBe(false)
    expect(r.count()).toBe(1)
    m.set('a', 2)
    expect(r.count()).toBe(2)
    expect(m.delete('a')).toBe(true)
    expect(r.count()).toBe(3)
    m.clear()
    expect(r.count()).toBe(3)
    m.set('x', 1)
    m.clear()
    expect(r.count()).toBe(5)
  })

  test('non-method properties pass through (Symbol.toStringTag, methods bound to the target)', () => {
    const m = reactive(new Map([['a', 1]]))
    expect(Object.prototype.toString.call(m)).toBe('[object Map]')
    expect(m[Symbol.toStringTag]).toBe('Map')
  })
})

describe('reactive Set', () => {
  test('forEach passes the value as both arguments; values and for-of track', () => {
    const s = reactive(new Set([1]))
    const seen: unknown[] = []
    const r = runs(() => {
      s.forEach((v, k) => seen.push([v, k]))
      for (const v of s) seen.push(v)
      for (const v of s.values()) seen.push(v)
    })
    expect(seen).toEqual([[1, 1], 1, 1])
    s.add(2)
    expect(r.count()).toBe(2)
    s.delete(2)
    expect(r.count()).toBe(3)
  })
})

describe('reactive objects — assignment and refs in arrays', () => {
  test('assigning a reactive object stores the raw one and reads back reactive', () => {
    const inner = { n: 1 }
    const a = reactive({ child: null as { n: number } | null })
    const b = reactive(inner)
    a.child = b
    const seen: number[] = []
    watchEffect(() => {
      seen.push(a.child?.n ?? 0)
    })
    b.n = 2
    expect(seen).toEqual([1, 2])
  })

  test('assigning a ref over a ref property replaces it instead of writing through', () => {
    const first = ref(1)
    const second = ref(2)
    const state = reactive({ r: first as unknown as number })
    ;(state as { r: unknown }).r = second
    expect(state.r).toBe(2)
    expect(first.value).toBe(1)
  })

  test('a ref at an array index is returned as the ref; a ref under a non-index key is unwrapped', () => {
    const r = ref('x')
    const list = reactive([r]) as unknown as unknown[] & { extra?: unknown }
    expect(list[0]).toBe(r)
    ;(list as unknown as Record<string, unknown>).extra = r
    expect((list as unknown as Record<string, unknown>).extra).toBe('x')
  })
})
