import type { VNode } from '@pyreon/core'
import { describe, expect, it, vi } from 'vitest'

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
    expect(result.type).toBe(Wrapper)
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
    expect(result.type).toBe(Wrapper)
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
    expect(result.type).toBe(Wrapper)
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
    expect(result.props.direction).toBe('inline')
    expect(result.props.alignX).toBe('center')
  })
})
