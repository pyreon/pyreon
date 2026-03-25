import { h } from "@pyreon/core"
import { describe, expect, it, vi } from "vitest"
import { PyreonUI } from "../PyreonUI"

// Spy on provide to verify context provision
const provideSpy = vi.spyOn(await import("@pyreon/core"), "provide")

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

    // Core context (2nd call) should have mode: "light"
    const coreCtxCall = provideSpy.mock.calls[1]!
    expect(coreCtxCall[1].mode).toBe("light")
    expect(coreCtxCall[1].isLight).toBe(true)
    expect(coreCtxCall[1].isDark).toBe(false)

    // Mode context (3rd call)
    const modeCall = provideSpy.mock.calls[2]!
    expect(modeCall[1]).toBe("light")
  })

  it("provides dark mode", () => {
    PyreonUI({ theme, mode: "dark", children: null })

    const coreCtxCall = provideSpy.mock.calls[1]!
    expect(coreCtxCall[1].mode).toBe("dark")
    expect(coreCtxCall[1].isDark).toBe(true)
    expect(coreCtxCall[1].isLight).toBe(false)

    const modeCall = provideSpy.mock.calls[2]!
    expect(modeCall[1]).toBe("dark")
  })

  it("inverts mode when inversed=true", () => {
    PyreonUI({ theme, mode: "light", inversed: true, children: null })

    const modeCall = provideSpy.mock.calls[2]!
    expect(modeCall[1]).toBe("dark")
  })

  it("inverts dark to light", () => {
    PyreonUI({ theme, mode: "dark", inversed: true, children: null })

    const modeCall = provideSpy.mock.calls[2]!
    expect(modeCall[1]).toBe("light")
  })

  it("enriches theme with __PYREON__ before providing", () => {
    PyreonUI({ theme, children: null })

    // ThemeContext (1st call) should have enriched theme
    const themeCall = provideSpy.mock.calls[0]!
    const providedTheme = themeCall[1]
    expect(providedTheme.__PYREON__).toBeDefined()
    expect(providedTheme.__PYREON__.sortedBreakpoints).toEqual(["xs", "sm", "md"])
    expect(providedTheme.colors).toEqual({ primary: "#228be6" })
  })

  it("works with system mode (resolves to light in happy-dom)", () => {
    PyreonUI({ theme, mode: "system", children: null })

    // happy-dom matchMedia returns false for dark → resolves to "light"
    const modeCall = provideSpy.mock.calls[2]!
    expect(modeCall[1]).toBe("light")
  })
})
