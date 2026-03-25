import { popContext, useContext } from "@pyreon/core"
import { afterEach, describe, expect, it } from "vitest"
import Provider, { context } from "../context"

describe("Provider", () => {
  afterEach(() => {
    // Clean up any pushed context frames
    try {
      popContext()
    } catch {
      // Ignore if no context was pushed
    }
  })

  it("returns children when no theme is provided", () => {
    const children = "Hello"
    const result = Provider({ children })
    expect(result).toBe("Hello")
  })

  it("returns children with empty theme", () => {
    const children = "Hello"
    const result = Provider({ theme: {}, children })
    expect(result).toBe("Hello")
  })

  it("returns children with null theme", () => {
    const children = "Hello"
    // @ts-expect-error testing null theme
    const result = Provider({ theme: null, children })
    expect(result).toBe("Hello")
  })

  it("returns children when theme is provided and pushes context", () => {
    const theme = { rootSize: 16, breakpoints: { xs: 0 } }
    const children = "Styled"
    const result = Provider({ theme, children })
    expect(result).toBe("Styled")
  })

  it("pushes context with theme and extra props", () => {
    const theme = { rootSize: 16 }
    const children = "Content"
    Provider({ theme, children, custom: "value" })
    // After Provider runs, context should have been pushed
    // We can verify by reading the context value
    const ctx = useContext(context)
    expect(ctx.theme).toEqual({ rootSize: 16 })
    expect(ctx.custom).toBe("value")
  })

  it("returns null when no children and no theme", () => {
    const result = Provider({})
    expect(result).toBeNull()
  })

  it("returns null when theme is provided but no children", () => {
    const theme = { rootSize: 16 }
    const result = Provider({ theme })
    expect(result).toBeNull()
  })
})

describe("context", () => {
  it("exports context object with an id", () => {
    expect(context).toBeDefined()
    expect(context.id).toBeDefined()
    expect(typeof context.id).toBe("symbol")
  })
})
