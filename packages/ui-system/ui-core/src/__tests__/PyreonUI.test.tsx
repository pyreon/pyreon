import { h } from "@pyreon/core"
import { describe, expect, it, vi } from "vitest"

const mockProvide = vi.fn()

vi.mock("@pyreon/core", async (importOriginal) => {
  const original = await importOriginal<typeof import("@pyreon/core")>()
  return {
    ...original,
    provide: (...args: any[]) => mockProvide(...args),
  }
})

describe("PyreonUI", () => {
  const theme = {
    rootSize: 16,
    breakpoints: { xs: 0, sm: 576, md: 768 },
    colors: { primary: "#228be6" },
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders children", async () => {
    const { PyreonUI } = await import("../PyreonUI")
    const child = h("div", null, "hello")
    const result = PyreonUI({ theme, children: child })
    expect(result).toBe(child)
  })

  it("returns null when no children", async () => {
    const { PyreonUI } = await import("../PyreonUI")
    const result = PyreonUI({ theme })
    expect(result).toBeNull()
  })

  it("provides to three contexts (styler ThemeContext, core context, mode context)", async () => {
    const { PyreonUI } = await import("../PyreonUI")
    PyreonUI({ theme, children: null })
    // 3 provide() calls: ThemeContext, core context, ModeContext
    expect(mockProvide).toHaveBeenCalledTimes(3)
  })

  it("defaults mode to light", async () => {
    const { PyreonUI } = await import("../PyreonUI")
    PyreonUI({ theme, children: null })

    // Core context (2nd call) should have mode: "light"
    const coreCtxCall = mockProvide.mock.calls[1]!
    expect(coreCtxCall[1].mode).toBe("light")
    expect(coreCtxCall[1].isLight).toBe(true)
    expect(coreCtxCall[1].isDark).toBe(false)

    // Mode context (3rd call)
    const modeCall = mockProvide.mock.calls[2]!
    expect(modeCall[1]).toBe("light")
  })

  it("provides dark mode", async () => {
    const { PyreonUI } = await import("../PyreonUI")
    PyreonUI({ theme, mode: "dark", children: null })

    const coreCtxCall = mockProvide.mock.calls[1]!
    expect(coreCtxCall[1].mode).toBe("dark")
    expect(coreCtxCall[1].isDark).toBe(true)
    expect(coreCtxCall[1].isLight).toBe(false)

    const modeCall = mockProvide.mock.calls[2]!
    expect(modeCall[1]).toBe("dark")
  })

  it("inverts mode when inversed=true", async () => {
    const { PyreonUI } = await import("../PyreonUI")
    PyreonUI({ theme, mode: "light", inversed: true, children: null })

    const coreCtxCall = mockProvide.mock.calls[1]!
    expect(coreCtxCall[1].mode).toBe("dark")

    const modeCall = mockProvide.mock.calls[2]!
    expect(modeCall[1]).toBe("dark")
  })

  it("inverts dark to light", async () => {
    const { PyreonUI } = await import("../PyreonUI")
    PyreonUI({ theme, mode: "dark", inversed: true, children: null })

    const modeCall = mockProvide.mock.calls[2]!
    expect(modeCall[1]).toBe("light")
  })

  it("enriches theme with __PYREON__ before providing", async () => {
    const { PyreonUI } = await import("../PyreonUI")
    PyreonUI({ theme, children: null })

    // ThemeContext (1st call) should have enriched theme
    const themeCall = mockProvide.mock.calls[0]!
    const providedTheme = themeCall[1]
    expect(providedTheme.__PYREON__).toBeDefined()
    expect(providedTheme.__PYREON__.sortedBreakpoints).toEqual(["xs", "sm", "md"])
    expect(providedTheme.colors).toEqual({ primary: "#228be6" })
  })

  it("works with system mode (falls back to OS preference)", async () => {
    const { PyreonUI } = await import("../PyreonUI")
    // In happy-dom, matchMedia returns false for dark → resolves to "light"
    PyreonUI({ theme, mode: "system", children: null })

    const modeCall = mockProvide.mock.calls[2]!
    expect(modeCall[1]).toBe("light")
  })
})
