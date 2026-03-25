import { popContext } from "@pyreon/core"
import { afterEach, describe, expect, it } from "vitest"
import { ThemeContext, ThemeProvider, useTheme } from "../ThemeProvider"

describe("ThemeContext", () => {
  it("is a Context object with an id", () => {
    expect(ThemeContext).toBeDefined()
    expect(ThemeContext.id).toBeDefined()
  })

  it("has a symbol id for context identification", () => {
    expect(typeof ThemeContext.id).toBe("symbol")
  })
})

describe("ThemeProvider", () => {
  afterEach(() => {
    try {
      popContext()
    } catch {
      // Ignore if no context was pushed
    }
  })

  it("returns children when provided", () => {
    const children = "Hello world"
    const result = ThemeProvider({ theme: {}, children })
    expect(result).toBe("Hello world")
  })

  it("returns null when no children are provided", () => {
    const result = ThemeProvider({ theme: {} })
    expect(result).toBeNull()
  })

  it("returns null when children is undefined", () => {
    const result = ThemeProvider({ theme: {}, children: undefined })
    expect(result).toBeNull()
  })

  it("provides theme via context (useTheme returns it)", () => {
    const theme = { colors: { primary: "red" }, spacing: 8 }
    ThemeProvider({ theme, children: "child" })
    const result = useTheme()
    expect(result).toEqual(theme)
  })
})

describe("useTheme", () => {
  it("is a function", () => {
    expect(typeof useTheme).toBe("function")
  })

  it("returns the default theme (empty object) when called outside a provider", () => {
    const theme = useTheme()
    expect(theme).toEqual({})
  })

  it("can be called with a type parameter", () => {
    interface MyTheme {
      primary: string
      spacing: number
    }
    const theme = useTheme<MyTheme>()
    expect(theme).toBeDefined()
  })
})
