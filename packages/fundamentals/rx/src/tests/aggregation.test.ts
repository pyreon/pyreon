import { signal } from "@pyreon/reactivity"
import { describe, expect, it } from "vitest"
import { count, max, min, sum } from "../aggregation"

describe("aggregation — plain values", () => {
  it("count", () => {
    expect(count([1, 2, 3])).toBe(3)
    expect(count([])).toBe(0)
  })

  it("sum", () => {
    expect(sum([1, 2, 3])).toBe(6)
  })

  it("sum with key", () => {
    const items = [{ v: 10 }, { v: 20 }, { v: 30 }]
    expect(sum(items, "v")).toBe(60)
  })

  it("min", () => {
    const items = [{ v: 3 }, { v: 1 }, { v: 2 }]
    expect(min(items, "v")?.v).toBe(1)
  })

  it("max", () => {
    const items = [{ v: 3 }, { v: 1 }, { v: 2 }]
    expect(max(items, "v")?.v).toBe(3)
  })

  it("min/max empty array", () => {
    expect(min([])).toBeUndefined()
    expect(max([])).toBeUndefined()
  })
})

describe("aggregation — signal values", () => {
  it("count returns computed", () => {
    const src = signal([1, 2, 3])
    const c = count(src)
    expect(c()).toBe(3)
    src.set([1])
    expect(c()).toBe(1)
  })

  it("sum returns computed", () => {
    const src = signal([1, 2, 3])
    const s = sum(src)
    expect(s()).toBe(6)
    src.set([10, 20])
    expect(s()).toBe(30)
  })
})
