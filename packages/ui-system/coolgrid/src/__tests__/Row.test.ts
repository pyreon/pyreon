import type { VNode } from "@pyreon/core"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mockProvide = vi.fn()
const mockUseContext = vi.fn()

vi.mock("@pyreon/core", async (importOriginal) => {
  const original = await importOriginal<typeof import("@pyreon/core")>()
  return {
    ...original,
    provide: (...args: any[]) => {
      mockProvide(...args)
    },
    useContext: (ctx: any) => {
      if (mockUseContext.mock.calls.length > 0) {
        return mockUseContext(ctx)
      }
      return original.useContext(ctx)
    },
  }
})

const asVNode = (v: unknown) => v as VNode

describe("Row", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // unistyle context returns empty theme, container context returns empty
    mockUseContext.mockReturnValue({})
  })

  it("returns a VNode", async () => {
    const Row = (await import("../Row")).default
    const result = asVNode(Row({ children: "test" }))
    expect(result).toBeDefined()
    expect(result.type).toBeDefined()
  })

  it("has correct displayName", async () => {
    const Row = (await import("../Row")).default
    expect(Row.displayName).toBe("@pyreon/coolgrid/Row")
  })

  it("has correct pkgName", async () => {
    const Row = (await import("../Row")).default
    expect(Row.pkgName).toBe("@pyreon/coolgrid")
  })

  it("has PYREON__COMPONENT static", async () => {
    const Row = (await import("../Row")).default
    expect(Row.PYREON__COMPONENT).toBe("@pyreon/coolgrid/Row")
  })

  it("passes $coolgrid prop with row values", async () => {
    const Row = (await import("../Row")).default
    const result = asVNode(Row({ gap: 16, children: "test" }))
    expect(result.props).toHaveProperty("$coolgrid")
    expect(result.props.$coolgrid).toHaveProperty("gap")
  })

  it("provides RowContext", async () => {
    const Row = (await import("../Row")).default
    Row({ gap: 16, columns: 12, children: "test" })
    expect(mockProvide).toHaveBeenCalledTimes(1)
  })

  it("provides context with grid values", async () => {
    const Row = (await import("../Row")).default
    Row({ columns: 24, gap: 16, gutter: 8, children: "test" })
    const config = mockProvide.mock.calls[0]?.[1] as Record<string, unknown>
    expect(config.columns).toBe(24)
    expect(config.gap).toBe(16)
    expect(config.gutter).toBe(8)
  })

  it("passes contentAlignX to $coolgrid", async () => {
    const Row = (await import("../Row")).default
    const result = asVNode(Row({ contentAlignX: "center", children: "test" }))
    expect((result.props.$coolgrid as Record<string, unknown>).contentAlignX).toBe("center")
  })

  it("strips context keys from DOM props", async () => {
    const Row = (await import("../Row")).default
    const result = asVNode(
      Row({
        columns: 12,
        gap: 16,
        "data-testid": "row",
        children: "test",
      }),
    )
    expect(result.props["data-testid"]).toBe("row")
  })

  it("passes css as extraStyles in $coolgrid when provided", async () => {
    const Row = (await import("../Row")).default
    const customCss = "background: blue;"
    const result = asVNode(Row({ css: customCss, children: "test" }))
    expect((result.props.$coolgrid as Record<string, unknown>).extraStyles).toBe(customCss)
  })

  it("passes gutter in $coolgrid", async () => {
    const Row = (await import("../Row")).default
    const result = asVNode(Row({ gutter: 24, children: "test" }))
    expect((result.props.$coolgrid as Record<string, unknown>).gutter).toBe(24)
  })

  it("provides context including colCss and colComponent", async () => {
    const Row = (await import("../Row")).default
    const colComp = (() => null) as any
    Row({ colCss: "color: red;", colComponent: colComp, children: "test" })
    const config = mockProvide.mock.calls[0]?.[1] as Record<string, unknown>
    expect(config.colCss).toBe("color: red;")
    expect(config.colComponent).toBe(colComp)
  })

  it("renders with data-coolgrid attribute in dev mode", async () => {
    const Row = (await import("../Row")).default
    const result = asVNode(Row({ children: "test" }))
    expect(result.props["data-coolgrid"]).toBe("row")
  })

  it("passes component prop as 'as'", async () => {
    const Row = (await import("../Row")).default
    const customComponent = (() => null) as any
    const result = asVNode(Row({ component: customComponent, children: "test" }))
    expect(result.props.as).toBe(customComponent)
  })

  it("renders children in VNode", async () => {
    const Row = (await import("../Row")).default
    const result = asVNode(Row({ children: "hello" }))
    expect(result.children).toBeDefined()
  })
})
