import { signal } from "@pyreon/reactivity"
import { describe, expect, it } from "vitest"
import { pipe } from "../pipe"

describe("pipe — plain values", () => {
  it("chains transforms", () => {
    const result = pipe(
      [3, 1, 4, 1, 5, 9],
      (arr) => arr.filter((n) => n > 2),
      (arr) => arr.sort((a, b) => a - b),
      (arr) => arr.slice(0, 3),
    )
    expect(result).toEqual([3, 4, 5])
  })

  it("single transform", () => {
    expect(pipe([1, 2, 3], (arr) => arr.length)).toBe(3)
  })
})

describe("pipe — signal values", () => {
  it("returns computed that tracks source", () => {
    const src = signal([3, 1, 4, 1, 5, 9])
    const result = pipe(
      src,
      (arr) => arr.filter((n) => n > 2),
      (arr) => arr.sort((a, b) => a - b),
    )
    expect(result()).toEqual([3, 4, 5, 9])

    src.set([10, 1])
    expect(result()).toEqual([10])
  })

  it("supports type narrowing across steps", () => {
    type User = { name: string; score: number }
    const users = signal<User[]>([
      { name: "A", score: 5 },
      { name: "B", score: 10 },
      { name: "C", score: 3 },
    ])

    const topNames = pipe(
      users,
      (items) => items.sort((a, b) => b.score - a.score),
      (items) => items.slice(0, 2),
      (items) => items.map((u) => u.name),
    )
    expect(topNames()).toEqual(["B", "A"])
  })

  it("supports 4 transforms", () => {
    const src = signal([10, 5, 20, 3, 15, 8])
    const result = pipe(
      src,
      (arr) => arr.filter((n) => n > 5),
      (arr) => arr.sort((a, b) => a - b),
      (arr) => arr.slice(0, 3),
      (arr) => arr.reduce((sum, n) => sum + n, 0),
    )
    // filter: [10, 20, 15, 8], sort: [8, 10, 15, 20], take 3: [8, 10, 15], sum: 33
    expect(result()).toBe(33)

    // Reactive: update source
    src.set([100, 1, 50])
    // filter: [100, 50], sort: [50, 100], take 3: [50, 100], sum: 150
    expect(result()).toBe(150)
  })

  it("supports 5 transforms", () => {
    const src = signal([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const result = pipe(
      src,
      (arr) => arr.filter((n) => n % 2 === 0), // [2, 4, 6, 8, 10]
      (arr) => arr.map((n) => n * 10), // [20, 40, 60, 80, 100]
      (arr) => arr.slice(1, 4), // [40, 60, 80]
      (arr) => arr.reduce((sum, n) => sum + n, 0), // 180
      (n) => `Total: ${n}`,
    )
    expect(result()).toBe("Total: 180")
  })

  it("4+ transforms with plain values (non-signal)", () => {
    const result = pipe(
      [5, 3, 8, 1, 9, 2],
      (arr) => arr.filter((n) => n > 3),
      (arr) => arr.sort((a, b) => b - a),
      (arr) => arr.slice(0, 2),
      (arr) => arr.join("-"),
    )
    expect(result).toBe("9-8")
  })
})
