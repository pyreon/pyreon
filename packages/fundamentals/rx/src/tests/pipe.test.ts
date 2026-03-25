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
})
