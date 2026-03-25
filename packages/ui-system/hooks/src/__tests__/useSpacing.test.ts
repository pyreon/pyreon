import { describe, expect, it, vi } from "vitest"

// Mock @pyreon/styler to provide theme values
vi.mock("@pyreon/styler", () => ({
  useTheme: () => ({}),
}))

import { useSpacing } from "../useSpacing"

describe("useSpacing", () => {
  it("returns spacing function with default base (rootSize/2 = 8)", () => {
    const spacing = useSpacing()
    expect(spacing(1)).toBe("8px")
    expect(spacing(2)).toBe("16px")
    expect(spacing(0.5)).toBe("4px")
  })

  it("accepts custom base unit", () => {
    const spacing = useSpacing(4)
    expect(spacing(1)).toBe("4px")
    expect(spacing(3)).toBe("12px")
  })
})
