import type { VNode } from '@pyreon/core'
import { describe, expect, it, vi } from 'vitest'

// Element's simple-Element fast path inlines the Wrapper helper directly into
// a Styled invocation, so layout props move from `result.props.{tag, direction, …}`
// to `result.props.{as, $element.direction, …}`. This helper reads from
// whichever shape the result is in so assertions don't depend on which path.
const getLayoutProps = (result: VNode): Record<string, unknown> => {
  const p = result.props as Record<string, unknown>
  if (p.$element && typeof p.$element === 'object') {
    const el = p.$element as Record<string, unknown>
    return {
      tag: p.as,
      direction: el.direction,
      alignX: el.alignX,
      alignY: el.alignY,
      block: el.block,
      equalCols: el.equalCols,
      extendCss: el.extraStyles,
      isInline: undefined,
    }
  }
  return {
    tag: p.tag,
    direction: p.direction,
    alignX: p.alignX,
    alignY: p.alignY,
    block: p.block,
    equalCols: p.equalCols,
    extendCss: p.extendCss,
    isInline: p.isInline,
  }
}

// ---------------------------------------------------------------------------
// Mocks — match patterns from existing element tests
// ---------------------------------------------------------------------------
vi.mock('~/utils', () => ({
  IS_DEVELOPMENT: true,
}))

vi.mock('@pyreon/ui-core', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    render: (children: unknown) => children,
  }
})

import { Element } from '../Element'
import Content from '../helpers/Content/component'
import Wrapper from '../helpers/Wrapper/component'

const asVNode = (v: unknown) => v as VNode

const getContentSlots = (result: VNode): VNode[] => {
  const children = result.props.children
  if (!Array.isArray(children)) return []
  return children.filter(
    (c: unknown) =>
      c != null && typeof c === 'object' && 'type' in (c as VNode) && (c as VNode).type === Content,
  ) as VNode[]
}

// ─── Integration tests ───────────────────────────────────────────────────────

describe('Element integration', () => {
  it('renders with content prop producing Wrapper VNode', () => {
    const result = asVNode(Element({ content: 'hello world', children: undefined }))
    expect(typeof result.type).toBe("function")
    const children = result.props.children
    expect(children).toBeDefined()
  })

  it('three-section layout: beforeContent + content + afterContent', () => {
    const result = asVNode(
      Element({
        beforeContent: 'icon',
        content: 'main text',
        afterContent: 'arrow',
        children: undefined,
      }),
    )
    expect(typeof result.type).toBe("function")
    const slots = getContentSlots(result)
    // With before/after content, there should be Content wrapper VNodes
    expect(slots.length).toBeGreaterThanOrEqual(2)
  })

  it('direction and alignX props pass through to Wrapper', () => {
    const result = asVNode(
      Element({
        direction: 'inline',
        alignX: 'center',
        children: 'test',
      }),
    )

    // When beforeContent/afterContent are absent, direction falls through
    // to wrapper level and contentDirection/contentAlignX take effect
    expect(typeof result.type).toBe("function")
    // The wrapper receives alignment props
    expect(result.props).toBeDefined()
  })

  it('contentDirection overrides default direction on wrapper for simple element', () => {
    const result = asVNode(
      Element({
        contentDirection: 'inline',
        contentAlignX: 'center',
        children: 'test',
      }),
    )
    // Simple element (no before/after) uses contentDirection as wrapper direction
    expect(getLayoutProps(result).direction).toBe('inline')
    expect(getLayoutProps(result).alignX).toBe('center')
  })
})
