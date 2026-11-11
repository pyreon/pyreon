// Vue parity for reactive() — https://vuejs.org/api/reactivity-core.html#reactive
// "The reactive conversion is deep... also deeply unwraps any properties that are
// refs"; "Calling reactive() on the same object returns the identical proxy, and
// calling reactive() on an existing proxy returns that same proxy"; collections
// (Map / Set) are reactive.
import { reactive, ref, watch, watchEffect } from '../index'

describe('reactive() — Vue parity', () => {
  test('a ref property is unwrapped on read and written through on assignment', () => {
    const count = ref(1)
    const state = reactive({ count })
    expect(state.count).toBe(1)
    state.count = 5
    expect(count.value).toBe(5)
    count.value = 7
    expect(state.count).toBe(7)
  })

  test('a nested ref property is unwrapped too; array elements are not', () => {
    const r = ref('x')
    const state = reactive({ nested: { r }, list: [r] })
    expect(state.nested.r).toBe('x')
    expect(state.list[0]).toBe(r)
  })

  test('reads of an unwrapped ref are tracked', () => {
    const count = ref(1)
    const state = reactive({ count })
    const seen: number[] = []
    watchEffect(() => {
      seen.push(state.count as number)
    })
    count.value = 2
    expect(seen).toEqual([1, 2])
  })

  test('identity: same raw → same proxy; reactive(proxy) → proxy', () => {
    const raw = { a: 1 }
    const p = reactive(raw)
    expect(reactive(raw)).toBe(p)
    expect(reactive(p)).toBe(p)
  })

  test('a reactive Map is tracked through get / has / size / iteration', () => {
    const m = reactive(new Map<string, number>())
    const seen: unknown[] = []
    watchEffect(() => {
      seen.push([m.get('a'), m.has('a'), m.size, [...m.keys()]])
    })
    m.set('a', 1)
    m.delete('a')
    expect(seen).toEqual([
      [undefined, false, 0, []],
      [1, true, 1, ['a']],
      [undefined, false, 0, []],
    ])
  })

  test('a reactive Set is tracked; a no-op add does not notify', () => {
    const s = reactive(new Set<string>())
    let runs = 0
    watchEffect(() => {
      runs++
      s.has('x')
    })
    s.add('x')
    s.add('x')
    expect(runs).toBe(2)
    s.clear()
    expect(runs).toBe(3)
  })

  test('a Map nested in a reactive object is reactive', () => {
    const state = reactive({ users: new Map<number, { name: string }>() })
    const seen: unknown[] = []
    watchEffect(() => {
      seen.push(state.users.get(1)?.name)
    })
    state.users.set(1, { name: 'a' })
    state.users.get(1)!.name = 'b'
    expect(seen).toEqual([undefined, 'a', 'b'])
  })
})

// https://vuejs.org/guide/essentials/watchers.html#callback-flush-timing —
// "if you mutate reactive state multiple times in the same tick, the watcher
// callback is only invoked once"; `flush: 'sync'` fires on every change.
describe('watch flush timing — Vue parity', () => {
  test('default flush batches the writes of one tick into one call (latest, value before the first write)', async () => {
    const c = ref(0)
    const calls: unknown[] = []
    watch(c, (n, o) => calls.push([n, o]))
    c.value = 1
    c.value = 2
    c.value = 3
    expect(calls).toEqual([])
    await Promise.resolve()
    expect(calls).toEqual([[3, 0]])
  })

  test('a value that returns to where it started in the same tick does not call back', async () => {
    const c = ref(0)
    let calls = 0
    watch(c, () => calls++)
    c.value = 1
    c.value = 0
    await Promise.resolve()
    expect(calls).toBe(0)
  })

  test("flush: 'sync' calls back on every write", async () => {
    const c = ref(0)
    const calls: unknown[] = []
    watch(c, (n, o) => calls.push([n, o]), { flush: 'sync' })
    c.value = 1
    c.value = 2
    expect(calls).toEqual([
      [1, 0],
      [2, 1],
    ])
  })

  test('stop() before the flush cancels the pending call', async () => {
    const c = ref(0)
    let calls = 0
    const stop = watch(c, () => calls++)
    c.value = 1
    stop()
    await Promise.resolve()
    expect(calls).toBe(0)
  })
})
