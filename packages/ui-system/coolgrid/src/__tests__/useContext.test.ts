import { beforeEach, describe, expect, it, vi } from "vitest"

const mockUseContext = vi.fn()

vi.mock("@pyreon/core", async (importOriginal) => {
  const original = await importOriginal<typeof import("@pyreon/core")>()
  return {
    ...original,
    useContext: mockUseContext,
  }
})

describe("useGridContext", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: empty theme context
    mockUseContext.mockReturnValue({ theme: {} })
  })

  it("returns props merged with theme grid context", async () => {
    mockUseContext.mockReturnValue({
      theme: {
        grid: {
          columns: 12,
          container: { xs: "100%", md: 720 },
        },
      },
    })
    const useGridContext = (await import("../useContext")).default
    const result = useGridContext({ gap: 16 })
    expect(result.gap).toBe(16)
    expect(result.columns).toBe(12)
  })

  it("props override theme values", async () => {
    mockUseContext.mockReturnValue({
      theme: {
        grid: { columns: 12 },
      },
    })
    const useGridContext = (await import("../useContext")).default
    const result = useGridContext({ columns: 24 })
    expect(result.columns).toBe(24)
  })

  it("falls back to coolgrid namespace in theme", async () => {
    mockUseContext.mockReturnValue({
      theme: {
        coolgrid: {
          columns: 16,
          container: { xs: "100%" },
        },
      },
    })
    const useGridContext = (await import("../useContext")).default
    const result = useGridContext({})
    expect(result.columns).toBe(16)
  })

  it("returns empty context when no theme or props", async () => {
    mockUseContext.mockReturnValue({ theme: {} })
    const useGridContext = (await import("../useContext")).default
    const result = useGridContext({})
    expect(result).toBeDefined()
  })
})

describe("getGridContext", () => {
  it("resolves columns from props first", async () => {
    const { getGridContext } = await import("../useContext")
    const result = getGridContext({ columns: 24 }, { grid: { columns: 12 } })
    expect(result.columns).toBe(24)
  })

  it("resolves columns from theme.grid", async () => {
    const { getGridContext } = await import("../useContext")
    const result = getGridContext({}, { grid: { columns: 12 } })
    expect(result.columns).toBe(12)
  })

  it("resolves columns from theme.coolgrid", async () => {
    const { getGridContext } = await import("../useContext")
    const result = getGridContext({}, { coolgrid: { columns: 16 } })
    expect(result.columns).toBe(16)
  })

  it("resolves containerWidth from theme.grid.container", async () => {
    const { getGridContext } = await import("../useContext")
    const result = getGridContext({}, { grid: { container: { xs: "100%" } } })
    expect(result.containerWidth).toEqual({ xs: "100%" })
  })
})
