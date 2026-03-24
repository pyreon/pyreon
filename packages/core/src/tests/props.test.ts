import { createUniqueId, mergeProps, splitProps } from "../props"

describe("splitProps", () => {
  test("splits known keys from rest", () => {
    const props = { label: "Hi", icon: "star", class: "btn", id: "x" }
    const [own, html] = splitProps(props, ["label", "icon"])
    expect(own).toEqual({ label: "Hi", icon: "star" })
    expect(html).toEqual({ class: "btn", id: "x" })
  })

  test("preserves getters", () => {
    let count = 0
    const props = Object.defineProperty({} as Record<string, unknown>, "value", {
      get: () => ++count,
      enumerable: true,
      configurable: true,
    })
    const [own] = splitProps(props, ["value"])
    expect(own.value).toBe(1)
    expect(own.value).toBe(2) // getter called again
  })

  test("handles empty keys array", () => {
    const props = { a: 1, b: 2 }
    const [own, rest] = splitProps(props, [])
    expect(own).toEqual({})
    expect(rest).toEqual({ a: 1, b: 2 })
  })
})

describe("mergeProps", () => {
  test("later sources override earlier", () => {
    const result = mergeProps({ a: 1, b: 2 }, { b: 3, c: 4 })
    expect(result).toEqual({ a: 1, b: 3, c: 4 })
  })

  test("undefined values don't override defined", () => {
    const result = mergeProps({ size: "md" }, { size: undefined as string | undefined })
    expect(result.size).toBe("md")
  })

  test("preserves getters from sources", () => {
    let count = 0
    const source = Object.defineProperty({} as Record<string, unknown>, "val", {
      get: () => ++count,
      enumerable: true,
      configurable: true,
    })
    const result = mergeProps({ val: 0 }, source)
    expect(result.val).toBe(1)
    expect(result.val).toBe(2)
  })

  test("getter returning undefined falls back to previous value", () => {
    let override: string | undefined
    const source = Object.defineProperty({} as Record<string, unknown>, "size", {
      get: () => override,
      enumerable: true,
      configurable: true,
    })
    const result = mergeProps({ size: "md" }, source)
    expect(result.size).toBe("md") // getter returns undefined, fallback

    override = "lg"
    expect(result.size).toBe("lg") // getter returns value
  })
})

describe("createUniqueId", () => {
  test("returns incrementing IDs", () => {
    const id1 = createUniqueId()
    const id2 = createUniqueId()
    expect(id1).toMatch(/^pyreon-\d+$/)
    expect(id2).toMatch(/^pyreon-\d+$/)
    expect(id1).not.toBe(id2)
  })
})
