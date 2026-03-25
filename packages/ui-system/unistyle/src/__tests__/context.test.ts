import { describe, expect, it, vi } from "vitest"

vi.mock("@pyreon/ui-core", () => {
  const mockContext = { id: Symbol("test-context") }
  return {
    Provider: vi.fn((props: any) => props.children ?? null),
    config: {
      css: (strings: TemplateStringsArray, ...vals: any[]) => {
        let r = ""
        for (let i = 0; i < strings.length; i++) {
          r += strings[i]
          if (i < vals.length) r += String(vals[i])
        }
        return r
      },
    },
    context: mockContext,
    isEmpty: (val: unknown) =>
      val == null || (typeof val === "object" && Object.keys(val as object).length === 0),
  }
})

import { Provider as CoreProvider } from "@pyreon/ui-core"
import Provider, { context } from "../context"

const mockCoreProvider = CoreProvider as ReturnType<typeof vi.fn>

/** Extract the first argument from the first mock call. */
const firstCallArg = () => {
  const calls = mockCoreProvider.mock.calls
  expect(calls.length).toBeGreaterThan(0)
  return (calls[0] as any[])[0] as any
}

describe("Provider", () => {
  it("exports context from @pyreon/ui-core", () => {
    expect(context).toBeDefined()
    expect(context).toHaveProperty("id")
  })

  it("calls CoreProvider with enriched theme", () => {
    mockCoreProvider.mockClear()

    Provider({
      theme: { rootSize: 16 },
      children: null,
    })

    expect(mockCoreProvider).toHaveBeenCalledTimes(1)
    const calledWith = firstCallArg()
    expect(calledWith.theme).toHaveProperty("__PYREON__")
  })

  it("when theme has no breakpoints: __PYREON__ has undefined sortedBreakpoints and media", () => {
    mockCoreProvider.mockClear()

    Provider({
      theme: { rootSize: 16 },
      children: null,
    })

    const enrichedTheme = firstCallArg().theme
    expect(enrichedTheme.__PYREON__.sortedBreakpoints).toBeUndefined()
    expect(enrichedTheme.__PYREON__.media).toBeUndefined()
  })

  it("when theme has empty breakpoints: __PYREON__ has undefined sortedBreakpoints and media", () => {
    mockCoreProvider.mockClear()

    Provider({
      theme: { rootSize: 16, breakpoints: {} },
      children: null,
    })

    const enrichedTheme = firstCallArg().theme
    expect(enrichedTheme.__PYREON__.sortedBreakpoints).toBeUndefined()
    expect(enrichedTheme.__PYREON__.media).toBeUndefined()
  })

  it("when theme has breakpoints: __PYREON__ has sortedBreakpoints and media objects", () => {
    mockCoreProvider.mockClear()

    Provider({
      theme: {
        rootSize: 16,
        breakpoints: { xs: 0, sm: 576, md: 768 },
      },
      children: null,
    })

    const enrichedTheme = firstCallArg().theme
    expect(enrichedTheme.__PYREON__.sortedBreakpoints).toEqual(["xs", "sm", "md"])
    expect(enrichedTheme.__PYREON__.media).toBeDefined()
    expect(Object.keys(enrichedTheme.__PYREON__.media)).toEqual(["xs", "sm", "md"])
  })

  it("passes children through to CoreProvider", () => {
    mockCoreProvider.mockClear()

    const mockChild = { type: "div" } as any
    Provider({
      theme: { rootSize: 16 },
      children: mockChild,
    })

    const calledWith = firstCallArg()
    expect(calledWith.children).toBe(mockChild)
  })

  it("preserves other theme properties in enriched theme", () => {
    mockCoreProvider.mockClear()

    Provider({
      theme: { rootSize: 16, customProp: "hello" } as any,
      children: null,
    })

    const enrichedTheme = firstCallArg().theme
    expect(enrichedTheme.rootSize).toBe(16)
    expect(enrichedTheme.customProp).toBe("hello")
  })

  it("media functions are callable tagged template functions", () => {
    mockCoreProvider.mockClear()

    Provider({
      theme: {
        rootSize: 16,
        breakpoints: { xs: 0, sm: 576 },
      },
      children: null,
    })

    const media = firstCallArg().theme.__PYREON__.media
    expect(typeof media.xs).toBe("function")
    expect(typeof media.sm).toBe("function")

    // xs (value 0) should pass through
    const xsResult = media.xs`color: red;`
    expect(xsResult).toContain("color: red;")
    expect(xsResult).not.toContain("@media")

    // sm (value 576) should wrap in media query
    const smResult = media.sm`color: blue;`
    expect(smResult).toContain("@media only screen and (min-width: 36em)")
  })
})
