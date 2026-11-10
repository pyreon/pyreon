// Vue parity: `watch(reactiveObject, cb)` is a deep watch, and `deep: true`
// tracks the nested properties of what a ref / getter returns. A reactive
// source used to be invoked as a function, so the watcher threw "getter is
// not a function" inside its effect and never fired.
import { reactive, watch } from '../index'

describe('watch — reactive() sources and deep', () => {
  test('watch(reactive) fires on a nested mutation, with the proxy as both values', () => {
    const state = reactive({ user: { name: 'a' }, tags: ['x'] })
    const calls: unknown[][] = []
    watch(state, (n, o) => calls.push([n, o]))

    state.user.name = 'b'
    state.tags.push('y')
    expect(calls).toHaveLength(2)
    expect(calls[0]![0]).toBe(state)
    expect(calls[0]![1]).toBe(state)
  })

  test('a reactive array is one deep source, not a list of sources', () => {
    const list = reactive([{ done: false }])
    let calls = 0
    watch(list, () => {
      calls++
    })
    list[0]!.done = true
    list.push({ done: false })
    expect(calls).toBe(2)
  })

  test('deep: true tracks nested properties of a getter result; without it they are not tracked', () => {
    const state = reactive({ nested: { x: 1 } })
    let deepCalls = 0
    let shallowCalls = 0
    watch(() => state.nested, () => deepCalls++, { deep: true })
    watch(() => state.nested, () => shallowCalls++)

    state.nested.x = 2
    expect(deepCalls).toBe(1)
    expect(shallowCalls).toBe(0)
  })

  test('a reactive object inside a multi-source array is watched deeply', () => {
    const state = reactive({ a: { b: 1 } })
    let calls = 0
    watch([state], () => {
      calls++
    })
    state.a.b = 2
    expect(calls).toBe(1)
  })

  test('an invalid source warns instead of throwing inside the effect', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => watch({ plain: true } as never, () => {})).not.toThrow()
    expect(warn.mock.calls.some((c) => String(c[0]).includes('[Pyreon] vue-compat watch(): invalid source'))).toBe(true)
    warn.mockRestore()
  })
})
