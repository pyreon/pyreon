import type { VNode } from '@pyreon/core'
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { Element } from '../Element'
import Content from '../helpers/Content/component'
import Wrapper from '../helpers/Wrapper/component'

const asVNode = (v: unknown) => v as VNode

/**
 * Helper to extract Content VNodes from the Wrapper's props.children.
 * In Pyreon, JSX children are passed as props.children (not result.children).
 */
const getContentSlots = (result: VNode): VNode[] => {
  const children = result.props.children
  if (!Array.isArray(children)) return []
  return children.filter(
    (c: unknown) =>
      c != null && typeof c === 'object' && 'type' in (c as VNode) && (c as VNode).type === Content,
  ) as VNode[]
}

/**
 * Element's simple-Element fast path inlines the Wrapper helper directly into
 * a single Styled invocation — saves a component hop, splitProps call, and
 * mountChild per Element. After the inline, layout props live on
 * `props.$element.{direction,alignX,…}` and the HTML tag moves from `tag` to
 * `as`. Compound (with-beforeContent/afterContent) renders and the rare
 * needsFix tags (button/fieldset/legend) still go through the original
 * `Wrapper` component.
 *
 * `getLayoutProps()` reads from whichever shape the result happens to be in
 * so the test assertions don't need to know which path Element took.
 */
const getLayoutProps = (result: VNode): Record<string, unknown> => {
  const p = result.props as Record<string, unknown>
  // Inlined path: layout lives in $element bag, tag in `as`
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
      // isInline is no longer a separate prop in the inlined path —
      // SUB_TAG/childFix decisions happen at compose-time.
      isInline: undefined,
    }
  }
  // Wrapper-helper path: flat props
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

describe('Element', () => {
  describe('basic rendering', () => {
    it('returns a VNode whose type is the Wrapper component (a function)', () => {
      const result = asVNode(Element({ children: 'hello' }))
      expect(typeof result.type).toBe('function')
      expect(typeof result.type).toBe("function")
    })

    it('passes tag as the tag prop to Wrapper', () => {
      const result = asVNode(Element({ tag: 'section', children: 'content' }))
      expect(getLayoutProps(result).tag).toBe('section')
    })

    it('defaults tag to undefined when not specified', () => {
      const result = asVNode(Element({ children: 'hello' }))
      expect(getLayoutProps(result).tag).toBeUndefined()
    })

    it('renders with no children', () => {
      const result = asVNode(Element({}))
      expect(typeof result.type).toBe("function")
    })
  })

  describe('simple element (no beforeContent/afterContent)', () => {
    it('uses contentDirection as wrapper direction (defaults to rows)', () => {
      const result = asVNode(Element({ children: 'test' }))
      expect(getLayoutProps(result).direction).toBe('rows')
    })

    it('uses contentAlignX as wrapper alignX (defaults to left)', () => {
      const result = asVNode(Element({ children: 'test' }))
      expect(getLayoutProps(result).alignX).toBe('left')
    })

    it('uses contentAlignY as wrapper alignY (defaults to center)', () => {
      const result = asVNode(Element({ children: 'test' }))
      expect(getLayoutProps(result).alignY).toBe('center')
    })

    it('overrides direction with contentDirection when simple', () => {
      const result = asVNode(Element({ contentDirection: 'inline', children: 'test' }))
      expect(getLayoutProps(result).direction).toBe('inline')
    })

    it('overrides alignX with contentAlignX when simple', () => {
      const result = asVNode(Element({ contentAlignX: 'center', children: 'test' }))
      expect(getLayoutProps(result).alignX).toBe('center')
    })

    it('overrides alignY with contentAlignY when simple', () => {
      const result = asVNode(Element({ contentAlignY: 'top', children: 'test' }))
      expect(getLayoutProps(result).alignY).toBe('top')
    })

    it('renders children directly via render() without Content wrappers', () => {
      const result = asVNode(Element({ children: h('span', null, 'inner') }))
      const slots = getContentSlots(result)
      expect(slots).toHaveLength(0)
    })

    it('renders string children directly as props.children', () => {
      const result = asVNode(Element({ children: 'hello' }))
      // Simple element fast path — passes children as a single value, not a
      // 3-slot array wrapping falsy beforeContent/afterContent. This avoids
      // 2 extra mountChild calls per Element in the common case.
      expect(result.props.children).toBe('hello')
    })

    it('passes block prop to Wrapper', () => {
      const result = asVNode(Element({ block: true, children: 'test' }))
      expect(getLayoutProps(result).block).toBe(true)
    })
  })

  describe('three-section layout (with beforeContent/afterContent)', () => {
    it('defaults wrapper direction to inline', () => {
      const result = asVNode(
        Element({
          beforeContent: h('span', null, 'B'),
          children: 'test',
          afterContent: h('span', null, 'A'),
        }),
      )
      expect(getLayoutProps(result).direction).toBe('inline')
    })

    it('uses explicit direction when provided', () => {
      const result = asVNode(
        Element({
          direction: 'rows',
          beforeContent: h('span', null, 'B'),
          children: 'test',
          afterContent: h('span', null, 'A'),
        }),
      )
      expect(getLayoutProps(result).direction).toBe('rows')
    })

    it('uses default alignX (left) and alignY (center)', () => {
      const result = asVNode(
        Element({
          beforeContent: 'B',
          children: 'test',
          afterContent: 'A',
        }),
      )
      expect(getLayoutProps(result).alignX).toBe('left')
      expect(getLayoutProps(result).alignY).toBe('center')
    })

    it('uses explicit alignX and alignY', () => {
      const result = asVNode(
        Element({
          alignX: 'center',
          alignY: 'top',
          beforeContent: 'B',
          children: 'test',
          afterContent: 'A',
        }),
      )
      expect(getLayoutProps(result).alignX).toBe('center')
      expect(getLayoutProps(result).alignY).toBe('top')
    })

    it('renders three Content children when both before and after exist', () => {
      const before = h('span', null, 'Before')
      const after = h('span', null, 'After')
      const result = asVNode(
        Element({
          beforeContent: before,
          children: 'Main',
          afterContent: after,
        }),
      )

      const slots = getContentSlots(result)
      expect(slots).toHaveLength(3)
    })

    it('sets correct contentType on each Content slot', () => {
      const before = h('span', null, 'Before')
      const after = h('span', null, 'After')
      const result = asVNode(
        Element({
          beforeContent: before,
          children: 'Main',
          afterContent: after,
        }),
      )

      const slots = getContentSlots(result)
      const [slot0, slot1, slot2] = slots as [VNode, VNode, VNode]
      expect(slot0.props.contentType).toBe('before')
      expect(slot1.props.contentType).toBe('content')
      expect(slot2.props.contentType).toBe('after')
    })

    it('passes parentDirection to Content slots', () => {
      const result = asVNode(
        Element({
          direction: 'rows',
          beforeContent: 'B',
          children: 'M',
          afterContent: 'A',
        }),
      )

      const slots = getContentSlots(result)
      for (const slot of slots) {
        expect(slot.props.parentDirection).toBe('rows')
      }
    })

    it('renders before and content Content slots when no afterContent', () => {
      const before = h('span', null, 'Before')
      const result = asVNode(
        Element({
          beforeContent: before,
          children: 'Main',
        }),
      )

      const slots = getContentSlots(result)
      // beforeContent makes isSimpleElement false, so content also gets a Content wrapper
      expect(slots).toHaveLength(2)
      const [s0, s1] = slots as [VNode, VNode]
      expect(s0.props.contentType).toBe('before')
      expect(s1.props.contentType).toBe('content')
    })

    it('renders content and after Content slots when no beforeContent', () => {
      const after = h('span', null, 'After')
      const result = asVNode(
        Element({
          children: 'Main',
          afterContent: after,
        }),
      )

      const slots = getContentSlots(result)
      // content slot + after slot (both are Content wrappers since afterContent makes it non-simple)
      expect(slots).toHaveLength(2)
      const [c0, c1] = slots as [VNode, VNode]
      expect(c0.props.contentType).toBe('content')
      expect(c1.props.contentType).toBe('after')
    })

    it('uses span sub-tag for inline parent elements (like span)', () => {
      const result = asVNode(
        Element({
          tag: 'span',
          beforeContent: 'B',
          children: 'M',
          afterContent: 'A',
        }),
      )

      const slots = getContentSlots(result)
      for (const slot of slots) {
        expect(slot.props.tag).toBe('span')
      }
    })

    it('uses undefined sub-tag for block parent elements (like div)', () => {
      const result = asVNode(
        Element({
          tag: 'div',
          beforeContent: 'B',
          children: 'M',
          afterContent: 'A',
        }),
      )

      const slots = getContentSlots(result)
      for (const slot of slots) {
        expect(slot.props.tag).toBeUndefined()
      }
    })

    it('passes equalCols to Content slots', () => {
      const result = asVNode(
        Element({
          equalCols: true,
          beforeContent: 'B',
          children: 'M',
          afterContent: 'A',
        }),
      )

      const slots = getContentSlots(result)
      for (const slot of slots) {
        expect(slot.props.equalCols).toBe(true)
      }
    })

    it('passes gap to before and after Content slots but not content slot', () => {
      const result = asVNode(
        Element({
          gap: 16,
          beforeContent: 'B',
          children: 'M',
          afterContent: 'A',
        }),
      )

      const slots = getContentSlots(result)
      const beforeSlot = slots.find((v) => v.props.contentType === 'before')
      const contentSlot = slots.find((v) => v.props.contentType === 'content')
      const afterSlot = slots.find((v) => v.props.contentType === 'after')

      expect(beforeSlot?.props.gap).toBe(16)
      expect(contentSlot?.props.gap).toBeUndefined()
      expect(afterSlot?.props.gap).toBe(16)
    })

    it('passes content-level alignment to the content Content slot', () => {
      const result = asVNode(
        Element({
          contentDirection: 'inline',
          contentAlignX: 'center',
          contentAlignY: 'top',
          beforeContent: 'B',
          children: 'M',
          afterContent: 'A',
        }),
      )

      const slots = getContentSlots(result)
      const contentSlot = slots.find((v) => v.props.contentType === 'content')
      expect(contentSlot?.props.direction).toBe('inline')
      expect(contentSlot?.props.alignX).toBe('center')
      expect(contentSlot?.props.alignY).toBe('top')
    })

    it('passes before-level alignment to the before Content slot', () => {
      const result = asVNode(
        Element({
          beforeContentDirection: 'rows',
          beforeContentAlignX: 'right',
          beforeContentAlignY: 'bottom',
          beforeContent: 'B',
          children: 'M',
          afterContent: 'A',
        }),
      )

      const slots = getContentSlots(result)
      const beforeSlot = slots.find((v) => v.props.contentType === 'before')
      expect(beforeSlot?.props.direction).toBe('rows')
      expect(beforeSlot?.props.alignX).toBe('right')
      expect(beforeSlot?.props.alignY).toBe('bottom')
    })

    it('passes after-level alignment to the after Content slot', () => {
      const result = asVNode(
        Element({
          afterContentDirection: 'rows',
          afterContentAlignX: 'center',
          afterContentAlignY: 'top',
          beforeContent: 'B',
          children: 'M',
          afterContent: 'A',
        }),
      )

      const slots = getContentSlots(result)
      const afterSlot = slots.find((v) => v.props.contentType === 'after')
      expect(afterSlot?.props.direction).toBe('rows')
      expect(afterSlot?.props.alignX).toBe('center')
      expect(afterSlot?.props.alignY).toBe('top')
    })
  })

  describe('HTML attribute filtering', () => {
    it('passes through id', () => {
      const result = asVNode(Element({ id: 'my-el', children: 'test' }))
      expect(result.props.id).toBe('my-el')
    })

    it('passes through role', () => {
      const result = asVNode(Element({ role: 'button', children: 'test' }))
      expect(result.props.role).toBe('button')
    })

    it('passes through data- attributes', () => {
      const result = asVNode(Element({ 'data-testid': 'el', children: 'test' }))
      expect(result.props['data-testid']).toBe('el')
    })

    it('passes through aria- attributes', () => {
      const result = asVNode(Element({ 'aria-label': 'label', children: 'test' }))
      expect(result.props['aria-label']).toBe('label')
    })

    it('passes through on-prefixed event handlers', () => {
      const handler = () => {
        /* noop */
      }
      const result = asVNode(Element({ onClick: handler, children: 'test' }))
      expect(result.props.onClick).toBe(handler)
    })

    it('passes through tabindex', () => {
      // @ts-expect-error — testing element-specific attr forwarding
      const result = asVNode(Element({ tabindex: 0, children: 'test' }))
      expect(result.props.tabindex).toBe(0)
    })

    it('passes through title', () => {
      const result = asVNode(Element({ title: 'tooltip', children: 'test' }))
      expect(result.props.title).toBe('tooltip')
    })

    it('passes through href for anchor tag', () => {
      // @ts-expect-error — testing element-specific attr forwarding
      const result = asVNode(Element({ tag: 'a', href: '/link', children: 'test' }))
      expect(result.props.href).toBe('/link')
    })

    it('passes through disabled for button tag', () => {
      // @ts-expect-error — testing element-specific attr forwarding
      const result = asVNode(Element({ tag: 'button', disabled: true, children: 'test' }))
      expect(result.props.disabled).toBe(true)
    })

    it('passes through class', () => {
      const result = asVNode(Element({ class: 'my-class', children: 'test' }))
      expect(result.props.class).toBe('my-class')
    })

    it('does not set class when not provided', () => {
      const result = asVNode(Element({ children: 'test' }))
      expect(result.props.class).toBeUndefined()
    })

    it('filters out reserved props (gap, beforeContent, afterContent, css, etc.)', () => {
      const result = asVNode(
        Element({
          beforeContent: h('span', null, 'x'),
          afterContent: h('span', null, 'y'),
          children: 'test',
          direction: 'inline',
          alignX: 'center',
          alignY: 'center',
          gap: 8,
          block: true,
          equalCols: true,
        }),
      )
      // These reserved props are consumed by Element and should not leak to Wrapper
      expect(result.props.gap).toBeUndefined()
      expect(result.props.beforeContent).toBeUndefined()
      expect(result.props.afterContent).toBeUndefined()
      expect(result.props.contentDirection).toBeUndefined()
      expect(result.props.css).toBeUndefined()
      expect(result.props.contentCss).toBeUndefined()
      expect(result.props.beforeContentCss).toBeUndefined()
      expect(result.props.afterContentCss).toBeUndefined()
    })
  })

  describe('ref handling', () => {
    it('passes a merged ref function to Wrapper', () => {
      const result = asVNode(Element({ children: 'test' }))
      expect(typeof result.props.ref).toBe('function')
    })

    it('wraps function ref in mergedRef', () => {
      let captured: HTMLElement | null = null
      const ref = (node: HTMLElement | null) => {
        captured = node
      }
      const result = asVNode(Element({ ref, children: 'test' }))
      expect(typeof result.props.ref).toBe('function')
      const fakeNode = {} as HTMLElement
      ;(result.props.ref as (node: HTMLElement | null) => void)(fakeNode)
      expect(captured).toBe(fakeNode)
    })

    it('wraps object ref in mergedRef', () => {
      const ref = { current: null as HTMLElement | null }
      const result = asVNode(Element({ ref, children: 'test' }))
      expect(typeof result.props.ref).toBe('function')
      const fakeNode = {} as HTMLElement
      ;(result.props.ref as (node: HTMLElement | null) => void)(fakeNode)
      expect(ref.current).toBe(fakeNode)
    })
  })

  describe('void / empty elements', () => {
    it('renders img with no children', () => {
      // @ts-expect-error — testing element-specific attr forwarding
      const result = asVNode(Element({ tag: 'img', src: '/pic.png' }))
      expect(typeof result.type).toBe("function")
      expect(getLayoutProps(result).tag).toBe('img')
      expect(result.props.src).toBe('/pic.png')
      expect(result.props.children).toBeUndefined()
    })

    it('renders input with no children', () => {
      // @ts-expect-error — testing element-specific attr forwarding
      const result = asVNode(Element({ tag: 'input', type: 'text' }))
      expect(typeof result.type).toBe("function")
      expect(getLayoutProps(result).tag).toBe('input')
      expect(result.props.type).toBe('text')
      expect(result.props.children).toBeUndefined()
    })

    it('renders with dangerouslySetInnerHTML (treated as empty)', () => {
      const result = asVNode(Element({ dangerouslySetInnerHTML: { __html: '<b>hi</b>' } }))
      expect(typeof result.type).toBe("function")
      expect(result.props.dangerouslySetInnerHTML).toEqual({ __html: '<b>hi</b>' })
      expect(result.props.children).toBeUndefined()
    })

    it('renders br with no children', () => {
      const result = asVNode(Element({ tag: 'br' }))
      expect(typeof result.type).toBe("function")
      expect(result.props.children).toBeUndefined()
    })

    it('renders hr with no children', () => {
      const result = asVNode(Element({ tag: 'hr' }))
      expect(typeof result.type).toBe("function")
      expect(result.props.children).toBeUndefined()
    })
  })

  describe('inline-vs-block tag rendering', () => {
    // The simple-element fast path inlines Wrapper into Styled and forwards
    // `tag` as the `as` prop. The pre-fast-path `isInline` flag was an
    // internal Wrapper plumbing detail that determined the inner SUB_TAG
    // for the rare needsFix (button/fieldset/legend) path — invisible on
    // span/a/section, which never need that fix. After the fast path the
    // flag is gone in the simple path; the rendered tag is the contract.
    it('renders inline tags like span as <span>', () => {
      const result = asVNode(Element({ tag: 'span', children: 'text' }))
      expect(getLayoutProps(result).tag).toBe('span')
    })

    it('renders anchor tag as <a>', () => {
      // @ts-expect-error — testing element-specific attr forwarding
      const result = asVNode(Element({ tag: 'a', href: '#', children: 'link' }))
      expect(getLayoutProps(result).tag).toBe('a')
    })

    it('renders block tags like section as <section>', () => {
      const result = asVNode(Element({ tag: 'section', children: 'text' }))
      expect(getLayoutProps(result).tag).toBe('section')
    })

    it('leaves tag undefined when not specified (default div)', () => {
      const result = asVNode(Element({ children: 'text' }))
      expect(getLayoutProps(result).tag).toBeUndefined()
    })
  })

  describe('extendCss prop', () => {
    it('passes css prop as extendCss to Wrapper', () => {
      const customCss = 'color: red;'
      const result = asVNode(Element({ css: customCss, children: 'test' }))
      expect(getLayoutProps(result).extendCss).toBe(customCss)
    })

    it('does not pass extendCss when css not provided', () => {
      const result = asVNode(Element({ children: 'test' }))
      expect(getLayoutProps(result).extendCss).toBeUndefined()
    })
  })

  describe('content fallback chain', () => {
    it('prefers children over content', () => {
      const result = asVNode(Element({ children: 'child', content: 'alt' }))
      // Simple-element fast path returns children directly. The fallback
      // chain (children → content → label) is exercised inside getChildren().
      expect(result.props.children).toBe('child')
    })

    it('falls back to content when no children', () => {
      const result = asVNode(Element({ content: 'alt content' }))
      const children = result.props.children as unknown[]
      expect(children).toBeDefined()
    })

    it('falls back to label when no children or content', () => {
      const result = asVNode(Element({ label: 'label text' }))
      const children = result.props.children as unknown[]
      expect(children).toBeDefined()
    })
  })

  describe('Wrapper as prop reset', () => {
    it('resets the as prop to undefined on Wrapper', () => {
      const result = asVNode(Element({ children: 'test' }))
      expect(result.props.as).toBeUndefined()
    })
  })

  describe('button tag (flex fix needed)', () => {
    it('passes tag as button to Wrapper', () => {
      const result = asVNode(Element({ tag: 'button', children: 'click' }))
      expect(typeof result.type).toBe("function")
      expect(getLayoutProps(result).tag).toBe('button')
    })

    it('passes isInline=true for button (inline element)', () => {
      const result = asVNode(Element({ tag: 'button', children: 'click' }))
      expect(getLayoutProps(result).isInline).toBe(true)
    })
  })

  describe('component metadata', () => {
    it('has displayName set', () => {
      expect(Element.displayName).toBeDefined()
      expect(Element.displayName).toContain('Element')
    })

    it('has PYREON__COMPONENT set', () => {
      expect(Element.PYREON__COMPONENT).toBeDefined()
      expect(Element.PYREON__COMPONENT).toContain('Element')
    })

    it('has pkgName set', () => {
      expect(Element.pkgName).toBeDefined()
    })
  })
})
