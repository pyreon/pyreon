import type { VNode } from '@pyreon/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  resolveSlot: vi.fn((children: unknown) => children),
}))

// `Content` now consumes the canonical `resolveSlot` helper from
// `@pyreon/ui-core` (the slot-resolution discriminator + `render()` call
// previously inlined in `Content/component.tsx` were extracted there in
// the consolidation PR). The mock targets `resolveSlot` so the test still
// observes the children → ui-core-slot-pipeline forwarding.
vi.mock('@pyreon/ui-core', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    resolveSlot: mocks.resolveSlot,
  }
})

vi.mock('~/utils', () => ({
  IS_DEVELOPMENT: true,
}))

import Content from '../helpers/Content/component'
import Styled from '../helpers/Content/styled'

const asVNode = (v: unknown) => v as VNode

describe('Content component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a VNode whose type is the Styled component', () => {
    const result = asVNode(Content({ contentType: 'content' }))
    expect(result.type).toBe(Styled)
  })

  it("passes tag as the 'as' prop to Styled", () => {
    const result = asVNode(Content({ tag: 'span' }))
    expect(result.props.as).toBe('span')
  })

  it('passes contentType as $contentType prop', () => {
    const result = asVNode(Content({ contentType: 'before' }))
    expect(result.props.$contentType).toBe('before')
  })

  it('passes styling props bundled as $element prop', () => {
    const result = asVNode(
      Content({
        contentType: 'content',
        parentDirection: 'inline',
        direction: 'rows',
        alignX: 'center',
        alignY: 'top',
        equalCols: true,
        gap: 8,
        extendCss: 'color: red;',
      }),
    )

    expect(result.props.$element).toEqual({
      contentType: 'content',
      parentDirection: 'inline',
      direction: 'rows',
      alignX: 'center',
      alignY: 'top',
      equalCols: true,
      gap: 8,
      extraStyles: 'color: red;',
    })
  })

  it('adds data-pyr-element attribute in development mode', () => {
    const result = asVNode(Content({ contentType: 'after' }))
    expect(result.props['data-pyr-element']).toBe('after')
  })

  it('passes children through resolveSlot() when the slot accessor is invoked', () => {
    // Content wraps its children in a reactive accessor `() => resolveSlot(...)`
    // — the slot pipeline is no longer called synchronously at component setup.
    // The accessor is invoked by the runtime when the JSX child position mounts;
    // here we invoke it directly to assert the wiring. The
    // function-unwrap-then-render shape (now centralized in `@pyreon/ui-core`'s
    // `resolveSlot`) is what keeps `content={() => <X/>}` slot reactivity
    // working (see Element-slot-reactivity.browser.test.tsx).
    const children = 'Some text'
    const result = asVNode(Content({ children }))
    expect(typeof result.props.children).toBe('function')
    ;(result.props.children as () => unknown)()
    expect(mocks.resolveSlot).toHaveBeenCalledWith(children)
  })

  it('spreads remaining props to Styled', () => {
    const result = asVNode(Content({ id: 'test-id', className: 'custom' } as any))
    expect(result.props.id).toBe('test-id')
    expect(result.props.className).toBe('custom')
  })

  it('maps extendCss to extraStyles in $element', () => {
    const result = asVNode(Content({ extendCss: 'font-size: 14px;' }))
    expect((result.props.$element as any).extraStyles).toBe('font-size: 14px;')
  })
})

describe('Content component (production mode)', () => {
  it('does not add data-pyr-element when IS_DEVELOPMENT is false', async () => {
    // Reset module registry so the new mock takes effect
    vi.resetModules()
    vi.doMock('../utils', () => ({
      IS_DEVELOPMENT: false,
    }))
    // Re-mock @pyreon/ui-core after resetModules
    vi.doMock('@pyreon/ui-core', async (importOriginal) => {
      const actual = (await importOriginal()) as Record<string, unknown>
      return { ...actual, resolveSlot: (children: unknown) => children }
    })

    const { default: ContentProd } = await import('../helpers/Content/component')
    const result = asVNode(ContentProd({ contentType: 'before' }))

    expect(result.props['data-pyr-element']).toBeUndefined()
  })
})
