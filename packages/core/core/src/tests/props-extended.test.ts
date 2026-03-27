import { _resetIdCounter, createUniqueId, mergeProps, splitProps } from "../props"

describe("createUniqueId — extended", () => {
  test("returns pyreon- prefixed string", () => {
    const id = createUniqueId()
    expect(id).toMatch(/^pyreon-\d+$/)
  })

  test("returns incrementing values", () => {
    const id1 = createUniqueId()
    const id2 = createUniqueId()
    const id3 = createUniqueId()
    const num1 = Number.parseInt(id1.replace("pyreon-", ""), 10)
    const num2 = Number.parseInt(id2.replace("pyreon-", ""), 10)
    const num3 = Number.parseInt(id3.replace("pyreon-", ""), 10)
    expect(num2).toBe(num1 + 1)
    expect(num3).toBe(num2 + 1)
  })

  test("all IDs are unique", () => {
    const ids = new Set<string>()
    for (let i = 0; i < 100; i++) {
      ids.add(createUniqueId())
    }
    expect(ids.size).toBe(100)
  })
})

describe("_resetIdCounter", () => {
  test("resets the counter so IDs restart", () => {
    // Generate some IDs to advance counter
    createUniqueId()
    createUniqueId()

    _resetIdCounter()

    const id = createUniqueId()
    expect(id).toBe("pyreon-1")
  })

  test("subsequent calls after reset increment from 1", () => {
    _resetIdCounter()
    expect(createUniqueId()).toBe("pyreon-1")
    expect(createUniqueId()).toBe("pyreon-2")
    expect(createUniqueId()).toBe("pyreon-3")
  })
})

describe("splitProps — extended", () => {
  test("non-existent keys produce empty picked object", () => {
    const props = { a: 1, b: 2 }
    const [own, rest] = splitProps(props, ["c" as keyof typeof props])
    expect(Object.keys(own)).toEqual([])
    expect(rest).toEqual({ a: 1, b: 2 })
  })

  test("all keys in picked leaves rest empty", () => {
    const props = { x: 10, y: 20 }
    const [own, rest] = splitProps(props, ["x", "y"])
    expect(own).toEqual({ x: 10, y: 20 })
    expect(Object.keys(rest)).toEqual([])
  })

  test("preserves getter on rest side", () => {
    let count = 0
    const props = {} as Record<string, unknown>
    Object.defineProperty(props, "reactive", {
      get: () => ++count,
      enumerable: true,
      configurable: true,
    })
    Object.defineProperty(props, "other", {
      value: "static",
      enumerable: true,
      configurable: true,
    })

    const [_own, rest] = splitProps(props, ["other"])
    expect((rest as Record<string, unknown>).reactive).toBe(1)
    expect((rest as Record<string, unknown>).reactive).toBe(2) // getter called again
  })

  test("handles object with undefined values", () => {
    const props = { a: undefined, b: "defined" }
    const [own, rest] = splitProps(props, ["a"])
    expect(own.a).toBeUndefined()
    expect((rest as Record<string, unknown>).b).toBe("defined")
  })
})

describe("mergeProps — extended", () => {
  test("single source returns copy", () => {
    const src = { a: 1, b: 2 }
    const result = mergeProps(src)
    expect(result).toEqual({ a: 1, b: 2 })
    expect(result).not.toBe(src) // should be a new object
  })

  test("three sources merge correctly", () => {
    const result = mergeProps({ a: 1 }, { b: 2 }, { c: 3 })
    expect(result).toEqual({ a: 1, b: 2, c: 3 })
  })

  test("later defined value overrides earlier", () => {
    const result = mergeProps({ x: "first" }, { x: "second" }, { x: "third" })
    expect(result.x).toBe("third")
  })

  test("undefined in later source does not override earlier defined value", () => {
    const result = mergeProps({ x: "keep" }, { x: undefined as string | undefined })
    expect(result.x).toBe("keep")
  })

  test("getter merging: later getter overrides earlier static when defined", () => {
    let dynamic: string | undefined = "from-getter"
    const getterSrc = {} as Record<string, unknown>
    Object.defineProperty(getterSrc, "val", {
      get: () => dynamic,
      enumerable: true,
      configurable: true,
    })
    const result = mergeProps({ val: "static" }, getterSrc)
    expect(result.val).toBe("from-getter")

    // When getter returns undefined, falls back to static
    dynamic = undefined
    expect(result.val).toBe("static")
  })

  test("two getters: later getter wins when defined, falls to earlier getter", () => {
    let g1val: string | undefined = "g1"
    let g2val: string | undefined = "g2"

    const src1 = {} as Record<string, unknown>
    Object.defineProperty(src1, "x", {
      get: () => g1val,
      enumerable: true,
      configurable: true,
    })

    const src2 = {} as Record<string, unknown>
    Object.defineProperty(src2, "x", {
      get: () => g2val,
      enumerable: true,
      configurable: true,
    })

    const result = mergeProps(src1, src2)
    expect(result.x).toBe("g2")

    g2val = undefined
    expect(result.x).toBe("g1")

    g1val = undefined
    expect(result.x).toBeUndefined()
  })
})
