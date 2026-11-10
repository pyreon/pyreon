// Solid parity, against Solid's documented behaviour:
// - createMemo is eager: https://docs.solidjs.com/reference/basic-reactivity/create-memo
//   (the memo runs immediately and re-runs when a dependency changes; `prev` is
//   the value of the previous run).
// - The setter returns the new value: https://docs.solidjs.com/reference/basic-reactivity/create-signal
// - mapArray maps each item once, by reference, and disposes an item's
//   mapping when it leaves: https://docs.solidjs.com/reference/reactive-utilities/map-array
import { createEffect, createMemo, createRoot, createSignal, mapArray } from '../index'

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
