import {
  calculateChainOptions,
  calculateStylingAttrs,
  pickStyledAttrs,
  removeUndefinedProps,
} from "../utils/attrs"

describe("removeUndefinedProps", () => {
  it("removes keys with undefined values", () => {
    const result = removeUndefinedProps({ a: 1, b: undefined, c: "hello" })
    expect(result).toEqual({ a: 1, c: "hello" })
  })

  it("keeps null values", () => {
    const result = removeUndefinedProps({ a: null, b: 0 })
    expect(result).toEqual({ a: null, b: 0 })
  })

  it("keeps all falsy non-undefined values", () => {
    const result = removeUndefinedProps({ a: 0, b: "", c: false, d: null })
    expect(result).toEqual({ a: 0, b: "", c: false, d: null })
  })

  it("returns empty for all undefined", () => {
    expect(removeUndefinedProps({ a: undefined, b: undefined })).toEqual({})
  })

  it("returns empty for empty input", () => {
    expect(removeUndefinedProps({})).toEqual({})
  })
})

describe("pickStyledAttrs", () => {
  it("picks keys that exist in keywords with truthy values", () => {
    const result = pickStyledAttrs(
      { state: "primary", size: "large", label: "hello" },
      { state: true, size: true },
    )
    expect(result).toEqual({ state: "primary", size: "large" })
  })

  it("ignores falsy prop values", () => {
    const result = pickStyledAttrs({ state: "", size: "large" }, { state: true, size: true })
    expect(result).toEqual({ size: "large" })
  })

  it("returns empty when no keywords match", () => {
    const result = pickStyledAttrs({ label: "hello" } as any, { state: true })
    expect(result).toEqual({})
  })

  it("returns empty for empty props", () => {
    const result = pickStyledAttrs({}, { state: true })
    expect(result).toEqual({})
  })
})

describe("calculateChainOptions", () => {
  it("returns empty object when options is empty array", () => {
    const calc = calculateChainOptions([])
    expect(calc([])).toEqual({})
  })

  it("returns empty object when options is undefined", () => {
    const calc = calculateChainOptions(undefined)
    expect(calc([])).toEqual({})
  })

  it("evaluates chain of functions and merges via Object.assign", () => {
    const fn1 = (props: any) => ({ a: 1, ...props })
    const fn2 = (_props: any) => ({ b: 2 })
    const calc = calculateChainOptions([fn1, fn2])
    expect(calc([{ c: 3 }])).toEqual({ a: 1, b: 2, c: 3 })
  })

  it("later functions override earlier ones (shallow)", () => {
    const fn1 = () => ({ a: 1 })
    const fn2 = () => ({ a: 2 })
    const calc = calculateChainOptions([fn1, fn2])
    expect(calc([])).toEqual({ a: 2 })
  })

  it("passes all args to each function", () => {
    const fn = vi.fn(() => ({}))
    const calc = calculateChainOptions([fn])
    calc(["arg1", "arg2"] as any)
    expect(fn).toHaveBeenCalledWith("arg1", "arg2")
  })
})

describe("calculateStylingAttrs", () => {
  it("picks string values from props for dimensions", () => {
    const calc = calculateStylingAttrs({ useBooleans: false, multiKeys: {} })
    const result = calc({
      props: { state: "primary", size: "large" },
      dimensions: { state: {}, size: {} },
    })
    expect(result).toEqual({ state: "primary", size: "large" })
  })

  it("picks number values from props", () => {
    const calc = calculateStylingAttrs({ useBooleans: false, multiKeys: {} })
    const result = calc({
      props: { state: 0 },
      dimensions: { state: {} },
    })
    expect(result).toEqual({ state: 0 })
  })

  it("sets undefined for non-string/non-number values when booleans disabled", () => {
    const calc = calculateStylingAttrs({ useBooleans: false, multiKeys: {} })
    const result = calc({
      props: { state: true },
      dimensions: { state: {} },
    })
    expect(result).toEqual({ state: undefined })
  })

  it("allows arrays for multi-key dimensions", () => {
    const calc = calculateStylingAttrs({
      useBooleans: false,
      multiKeys: { multiple: true },
    })
    const result = calc({
      props: { multiple: ["a", "b"] },
      dimensions: { multiple: {} },
    })
    expect(result).toEqual({ multiple: ["a", "b"] })
  })

  it("resolves boolean props when useBooleans is true (single key)", () => {
    const calc = calculateStylingAttrs({
      useBooleans: true,
      multiKeys: {},
    })
    const result = calc({
      props: { primary: true },
      dimensions: { state: { primary: true, secondary: true } },
    })
    expect(result).toEqual({ state: "primary" })
  })

  it("resolves multi-key boolean props as array", () => {
    const calc = calculateStylingAttrs({
      useBooleans: true,
      multiKeys: { multiple: true },
    })
    const result = calc({
      props: { a: true, b: true },
      dimensions: { multiple: { a: true, b: true, c: true } },
    })
    expect(result.multiple).toEqual(expect.arrayContaining(["a", "b"]))
  })

  it("prefers explicit string prop over boolean shorthand", () => {
    const calc = calculateStylingAttrs({
      useBooleans: true,
      multiKeys: {},
    })
    const result = calc({
      props: { state: "secondary", primary: true },
      dimensions: { state: { primary: true, secondary: true } },
    })
    expect(result).toEqual({ state: "secondary" })
  })

  it("skips boolean keyword when prop value is falsy", () => {
    const calc = calculateStylingAttrs({
      useBooleans: true,
      multiKeys: {},
    })
    const result = calc({
      props: { primary: false },
      dimensions: { state: { primary: true, secondary: true } },
    })
    expect(result.state).toBeUndefined()
  })

  it("skips boolean resolution when value is already set", () => {
    const calc = calculateStylingAttrs({
      useBooleans: true,
      multiKeys: {},
    })
    const result = calc({
      props: { state: "primary", secondary: true },
      dimensions: { state: { primary: true, secondary: true } },
    })
    expect(result.state).toBe("primary")
  })
})
