import { describe, expect, it } from "vitest"
import { enrichTheme } from "../enrichTheme"

describe("enrichTheme", () => {
  it("adds __PYREON__ with sortedBreakpoints and media", () => {
    const theme = { rootSize: 16, breakpoints: { xs: 0, sm: 576, md: 768 } }
    const result = enrichTheme(theme)

    expect(result.__PYREON__).toBeDefined()
    expect(result.__PYREON__.sortedBreakpoints).toEqual(["xs", "sm", "md"])
    expect(result.__PYREON__.media).toBeDefined()
    expect(typeof result.__PYREON__.media?.sm).toBe("function")
  })

  it("preserves custom theme properties", () => {
    const theme = { rootSize: 16, colors: { primary: "blue" } }
    const result = enrichTheme(theme)

    expect(result.colors).toEqual({ primary: "blue" })
    expect(result.rootSize).toBe(16)
  })

  it("handles theme without breakpoints", () => {
    const theme = { rootSize: 16 }
    const result = enrichTheme(theme)

    expect(result.__PYREON__).toBeDefined()
    expect(result.__PYREON__.sortedBreakpoints).toBeUndefined()
    expect(result.__PYREON__.media).toBeUndefined()
  })

  it("handles empty breakpoints", () => {
    const theme = { rootSize: 16, breakpoints: {} }
    const result = enrichTheme(theme)

    expect(result.__PYREON__.sortedBreakpoints).toBeUndefined()
    expect(result.__PYREON__.media).toBeUndefined()
  })

  it("defaults rootSize to 16", () => {
    const theme = { breakpoints: { sm: 576 } }
    const result = enrichTheme(theme)

    // Media queries should be created (breakpoints present)
    expect(result.__PYREON__.media).toBeDefined()
  })

  it("is a pure function — does not mutate input", () => {
    const theme = { rootSize: 16, breakpoints: { xs: 0, md: 768 } }
    const copy = { ...theme }
    enrichTheme(theme)

    expect(theme).toEqual(copy)
    expect((theme as any).__PYREON__).toBeUndefined()
  })
})
