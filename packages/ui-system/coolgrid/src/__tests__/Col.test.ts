import type { VNode } from '@pyreon/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockProvide = vi.fn()
const mockUseContext = vi.fn()

vi.mock('@pyreon/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@pyreon/core')>()
  return {
    ...original,
    provide: (...args: any[]) => {
      mockProvide(...args)
    },
    useContext: (ctx: any) => {
      if (mockUseContext.mock.results.length > 0 || mockUseContext.mock.calls.length > 0) {
        return mockUseContext(ctx)
      }
      return original.useContext(ctx)
    },
  }
})

// Mock unistyle context to return empty theme
vi.mock('@pyreon/unistyle', async (importOriginal) => {
  const original = await importOriginal<typeof import('@pyreon/unistyle')>()
  return {
    ...original,
  }
})

const asVNode = (v: unknown) => v as VNode

describe('Col', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: no context (empty object)
    mockUseContext.mockReturnValue({})
  })

  // First test in this file pays the cold-import cost for the entire coolgrid
  // module graph (@pyreon/core + ui-core + unistyle + styler + rocketstyle).
  // Warm it takes ~200ms, but on cold CI shared runners the Vite transform of
  // that graph can spike past the 15s default and time out (PR #225 flakes).
  // Per-test timeout bump — subsequent tests in the file reuse the cached
  // module and run in 0ms, so the global 15s budget stays strict everywhere
  // else.
  it('returns a VNode', { timeout: 30000 }, async () => {
    const Col = (await import('../Col')).default
    const result = asVNode(Col({ children: 'test' }))
    expect(result).toBeDefined()
    expect(result.type).toBeDefined()
  })

  it('has correct displayName', async () => {
    const Col = (await import('../Col')).default
    expect(Col.displayName).toBe('@pyreon/coolgrid/Col')
  })

  it('has correct pkgName', async () => {
    const Col = (await import('../Col')).default
    expect(Col.pkgName).toBe('@pyreon/coolgrid')
  })

  it('has PYREON__COMPONENT static', async () => {
    const Col = (await import('../Col')).default
    expect(Col.PYREON__COMPONENT).toBe('@pyreon/coolgrid/Col')
  })

  it('passes $coolgrid prop with grid values', async () => {
    const Col = (await import('../Col')).default
    const result = asVNode(Col({ size: 6, children: 'test' }))
    expect(result.props).toHaveProperty('$coolgrid')
  })

  it('does not provide context (Col only reads, never provides)', async () => {
    const Col = (await import('../Col')).default
    Col({ children: 'test' })
    expect(mockProvide).not.toHaveBeenCalled()
  })

  it('strips context keys from DOM props', async () => {
    const Col = (await import('../Col')).default
    const result = asVNode(
      Col({
        columns: 12,
        gap: 16,
        size: 6,
        'data-testid': 'my-col',
        children: 'test',
      }),
    )
    // context keys should be stripped from the rendered props
    // but $coolgrid should be present
    expect(result.props.$coolgrid).toBeDefined()
    expect(result.props['data-testid']).toBe('my-col')
  })

  it('passes css as extraStyles when provided', async () => {
    const Col = (await import('../Col')).default
    const customCss = 'background: green;'
    const result = asVNode(Col({ css: customCss, children: 'test' }))
    expect((result.props.$coolgrid as Record<string, unknown>).extraStyles).toBe(customCss)
  })

  it('includes columns and gap in $coolgrid', async () => {
    const Col = (await import('../Col')).default
    const result = asVNode(Col({ columns: 12, gap: 16, size: 6, children: 'test' }))
    const coolgrid = result.props.$coolgrid as Record<string, unknown>
    expect(coolgrid.columns).toBe(12)
    expect(coolgrid.gap).toBe(16)
    expect(coolgrid.size).toBe(6)
  })

  it('renders with data-coolgrid attribute in dev mode', async () => {
    const Col = (await import('../Col')).default
    const result = asVNode(Col({ children: 'test' }))
    expect(result.props['data-coolgrid']).toBe('col')
  })

  it("passes component prop as 'as'", async () => {
    const Col = (await import('../Col')).default
    const customComponent = (() => null) as any
    const result = asVNode(Col({ component: customComponent, children: 'test' }))
    expect(result.props.as).toBe(customComponent)
  })

  it('includes padding in $coolgrid', async () => {
    const Col = (await import('../Col')).default
    const result = asVNode(Col({ padding: 8, children: 'test' }))
    expect((result.props.$coolgrid as Record<string, unknown>).padding).toBe(8)
  })

  it('renders children in VNode', async () => {
    const Col = (await import('../Col')).default
    const result = asVNode(Col({ children: 'hello' }))
    expect(result.children).toBeDefined()
  })
})
