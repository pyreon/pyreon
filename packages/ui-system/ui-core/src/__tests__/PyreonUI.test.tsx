import { h } from "@pyreon/core"
import { describe, expect, it, vi } from "vitest"
import { PyreonUI } from "../PyreonUI"

// Spy on provide to verify context provision
const provideSpy = vi.spyOn(await import("@pyreon/core"), "provide")

/** Get the value argument (2nd arg) from a provide() call by index. */
const getProvideValue = (callIndex: number): any => provideSpy.mock.calls[callIndex]![1]

describe("PyreonUI", () => {
  const theme = {
    rootSize: 16,
    breakpoints: { xs: 0, sm: 576, md: 768 },
    colors: { primary: "#228be6" },
  }

  beforeEach(() => {
    provideSpy.mockClear()
  })

  it("renders children", () => {
    const child = h("div", null, "hello")
    const result = PyreonUI({ theme, children: child })
    expect(result).toBe(child)
  })

  it("returns null when no children", () => {
    const result = PyreonUI({ theme })
    expect(result).toBeNull()
  })

  it("calls provide three times (ThemeContext, core context, mode context)", () => {
    PyreonUI({ theme, children: null })
    expect(provideSpy).toHaveBeenCalledTimes(3)
  })

  it("defaults mode to light", () => {
    PyreonUI({ theme, children: null })

    const coreCtx = getProvideValue(1)
    expect(coreCtx.mode).toBe("light")
    expect(coreCtx.isLight).toBe(true)
    expect(coreCtx.isDark).toBe(false)
    expect(getProvideValue(2)).toBe("light")
  })

  it("provides dark mode", () => {
    PyreonUI({ theme, mode: "dark", children: null })

    const coreCtx = getProvideValue(1)
    expect(coreCtx.mode).toBe("dark")
    expect(coreCtx.isDark).toBe(true)
    expect(coreCtx.isLight).toBe(false)
    expect(getProvideValue(2)).toBe("dark")
  })

  it("inverts mode when inversed=true", () => {
    PyreonUI({ theme, mode: "light", inversed: true, children: null })
    expect(getProvideValue(2)).toBe("dark")
  })

  it("inverts dark to light", () => {
    PyreonUI({ theme, mode: "dark", inversed: true, children: null })
    expect(getProvideValue(2)).toBe("light")
  })

  it("enriches theme with __PYREON__ before providing", () => {
    PyreonUI({ theme, children: null })

    const providedTheme = getProvideValue(0)
    expect(providedTheme.__PYREON__).toBeDefined()
    expect(providedTheme.__PYREON__.sortedBreakpoints).toEqual(["xs", "sm", "md"])
    expect(providedTheme.colors).toEqual({ primary: "#228be6" })
  })

  it("works with system mode (resolves to light in happy-dom)", () => {
    PyreonUI({ theme, mode: "system", children: null })
    expect(getProvideValue(2)).toBe("light")
  })
})
