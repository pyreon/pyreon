// Solid parity, against Solid's documented behaviour:
// - createMemo is eager: https://docs.solidjs.com/reference/basic-reactivity/create-memo
//   (the memo runs immediately and re-runs when a dependency changes; `prev` is
//   the value of the previous run).
// - The setter returns the new value: https://docs.solidjs.com/reference/basic-reactivity/create-signal
// - mapArray maps each item once, by reference, and disposes an item's
//   mapping when it leaves: https://docs.solidjs.com/reference/reactive-utilities/map-array
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { createEffect, createMemo, createRoot, createSignal, mapArray } from '../index'
import { jsx } from '../jsx-runtime'

const tick = () => new Promise<void>((r) => setTimeout(r, 10))

describe('createMemo — eager', () => {
  test('runs at creation and once per change, threading prev through every run', () => {
    createRoot((dispose) => {
      const [d, setD] = createSignal(1)
      let runs = 0
      const sum = createMemo<number>((prev) => {
        runs++
        return (prev ?? 0) + d()
      }, 0)
      expect(runs).toBe(1)
      setD(2)
      setD(3)
      expect(runs).toBe(3)
      expect(sum()).toBe(6)
      dispose()
    })
  })
})

describe('signal setter return value', () => {
  test('returns the new value for a value and an updater; also when unchanged', () => {
    const [, set] = createSignal(1)
    expect(set(5)).toBe(5)
    expect(set((n) => n + 1)).toBe(6)
    expect(set(6)).toBe(6)
    const [, setAlways] = createSignal(0, { equals: false })
    expect(setAlways(3)).toBe(3)
  })
})

describe('mapArray — keyed by reference', () => {
  test('maps only new items and moves the index of kept ones', () => {
    createRoot((dispose) => {
      const a = { id: 'a' }
      const b = { id: 'b' }
      const c = { id: 'c' }
      const [list, setList] = createSignal([a, b])
      const calls: string[] = []
      const indexOf = new Map<string, () => number>()
      const mapped = mapArray(list, (item, i) => {
        calls.push(item.id)
        indexOf.set(item.id, i)
        return item.id.toUpperCase()
      })
      expect(mapped()).toEqual(['A', 'B'])
      setList([c, b, a])
      expect(mapped()).toEqual(['C', 'B', 'A'])
      expect(calls).toEqual(['a', 'b', 'c'])
      expect(indexOf.get('a')!()).toBe(2)
      dispose()
    })
  })

  test("a removed item's mapping is disposed (its effects stop), the rest on root dispose", () => {
    const runs: string[] = []
    let setTick!: (n: number) => number
    createRoot((dispose) => {
      const [tick, st] = createSignal(0)
      setTick = st
      const [list, setList] = createSignal(['x', 'y'])
      const mapped = mapArray(list, (item) => {
        createEffect(() => {
          runs.push(`${item}:${tick()}`)
        })
        return item
      })
      createEffect(() => {
        mapped()
      })
      setList(['y'])
      runs.length = 0
      setTick(1)
      expect(runs).toEqual(['y:1'])
      dispose()
    })
    runs.length = 0
    setTick(2)
    expect(runs).toEqual([])
  })
})

describe('mapArray — duplicates, owners', () => {
  test('a repeated item maps once per occurrence and keeps both mappings on a reorder', () => {
    createRoot((dispose) => {
      const a = { id: 'a' }
      const b = { id: 'b' }
      const [list, setList] = createSignal([a, a, b])
      let calls = 0
      const mapped = mapArray(list, (item) => ({ id: item.id, n: ++calls }))
      const first = mapped()
      expect(first.map((m) => m.id)).toEqual(['a', 'a', 'b'])
      expect(calls).toBe(3)
      setList([a, b, a])
      const second = mapped()
      expect(calls).toBe(3)
      // Occurrences pair up in order: the 1st `a` stays first, the 2nd moves last.
      expect(second).toEqual([first[0], first[2], first[1]])
      dispose()
    })
  })

  test('works with no owner at all (no component, no root)', () => {
    const [list, setList] = createSignal(['x'])
    let calls = 0
    const mapped = mapArray(list, (item) => {
      calls++
      return item.toUpperCase()
    })
    expect(mapped()).toEqual(['X'])
    setList(['x', 'y'])
    expect(mapped()).toEqual(['X', 'Y'])
    expect(calls).toBe(2)
  })

  test('inside a component: survives re-renders, maps each item once, stops at unmount', async () => {
    let setList!: (v: string[]) => string[]
    let bump!: (v: number) => number
    let calls = 0
    let seen: string[] = []
    const Comp = () => {
      const [list, sl] = createSignal(['a', 'b'])
      const [n, sn] = createSignal(0)
      setList = sl
      bump = sn
      const mapped = mapArray(list, (item) => {
        calls++
        return item.toUpperCase()
      })
      seen = mapped()
      return jsx('div', { children: `${n()}:${mapped().join(',')}` })
    }
    const el = document.createElement('div')
    document.body.appendChild(el)
    const unmount = mount(
      h(() => jsx(Comp, {}), null),
      el,
    )
    expect(seen).toEqual(['A', 'B'])
    bump(1)
    await tick()
    expect(el.textContent).toBe('1:A,B')
    setList(['b', 'c'])
    await tick()
    expect(el.textContent).toBe('1:B,C')
    expect(calls).toBe(3)
    unmount()
    setList(['d'])
    await tick()
    expect(calls).toBe(3)
    el.remove()
  })
})
