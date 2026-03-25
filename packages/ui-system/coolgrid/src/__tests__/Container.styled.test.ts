import { describe, expect, it } from "vitest"
import { getContainerWidth } from "../Container/utils"

describe("Container/utils – getContainerWidth", () => {
  it("returns width from props when present", () => {
    const result = getContainerWidth({ width: 960 }, {})
    expect(result).toBe(960)
  })

  it("prefers props.width over theme.grid.container", () => {
    const result = getContainerWidth(
      { width: 800 },
      { grid: { container: { xs: "100%", md: 720 } } },
    )
    expect(result).toBe(800)
  })

  it("falls back to theme.grid.container", () => {
    const result = getContainerWidth({}, { grid: { container: { xs: "100%", md: 720 } } })
    expect(result).toEqual({ xs: "100%", md: 720 })
  })

  it("falls back to theme.coolgrid.container when grid is missing", () => {
    const result = getContainerWidth({}, { coolgrid: { container: { xs: "100%", lg: 960 } } })
    expect(result).toEqual({ xs: "100%", lg: 960 })
  })

  it("returns undefined/falsy when nothing matches", () => {
    expect(getContainerWidth({}, {})).toBeFalsy()
  })

  it("returns undefined/falsy when both are undefined", () => {
    expect(getContainerWidth(undefined, undefined)).toBeFalsy()
  })

  it("returns undefined/falsy when both are empty objects", () => {
    expect(getContainerWidth({}, {})).toBeFalsy()
  })

  it("returns string width from props", () => {
    const result = getContainerWidth({ width: "100%" }, {})
    expect(result).toBe("100%")
  })

  it("returns responsive object from props", () => {
    const result = getContainerWidth({ width: { xs: "100%", md: 720, lg: 960 } }, {})
    expect(result).toEqual({ xs: "100%", md: 720, lg: 960 })
  })
})
