import type { VNode } from '@pyreon/core'
import { describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock('~/utils', () => ({
  IS_DEVELOPMENT: true,
}))

import Wrapper from '../helpers/Wrapper/component'
import Styled from '../helpers/Wrapper/styled'

const asVNode = (v: unknown) => v as VNode

describe('Wrapper component', () => {
  describe('normal element (no flex fix needed)', () => {
    it('returns a VNode whose type is the Styled component', () => {
      const result = asVNode(Wrapper({ tag: 'div' }))
      expect(result.type).toBe(Styled)
    })

    it('passes normalElement as $element prop with block, direction, alignX, alignY, equalCols, extraStyles', () => {
      const result = asVNode(
        Wrapper({
          tag: 'div',
          block: true,
          direction: 'inline',
          alignX: 'center',
          alignY: 'top',
          equalCols: false,
          extendCss: 'color: red;',
        }),
      )

      expect(result.props.$element).toEqual({
        block: true,
        direction: 'inline',
        alignX: 'center',
        alignY: 'top',
        equalCols: false,
        extraStyles: 'color: red;',
      })
    })

    it("passes tag as the 'as' prop", () => {
      const result = asVNode(Wrapper({ tag: 'div' }))
      expect(result.props.as).toBe('div')
    })

    it('passes ref through', () => {
      const ref = () => {}
      const result = asVNode(Wrapper({ tag: 'div', ref }))
      expect(result.props.ref).toBe(ref)
    })

    it('passes children through', () => {
      const result = asVNode(Wrapper({ tag: 'div', children: 'child content' }))
      expect(result.props.children).toBe('child content')
    })

    it('adds data-pyr-element in development mode', () => {
      const result = asVNode(Wrapper({ tag: 'div' }))
      expect(result.props['data-pyr-element']).toBe('Element')
    })

    it('spreads extra props', () => {
      const result = asVNode(Wrapper({ tag: 'section', id: 'wrapper', role: 'main' } as any))
      expect(result.props.id).toBe('wrapper')
      expect(result.props.role).toBe('main')
    })
  })

  describe('flex-fix path (button/fieldset/legend)', () => {
    it('renders parent Styled with parentFixElement for button', () => {
      const result = asVNode(Wrapper({ tag: 'button', children: 'Click me' }))
      expect(result.type).toBe(Styled)
      expect((result.props.$element as any).parentFix).toBe(true)
    })

    it('parent Styled receives parentFixElement props (block + extraStyles only)', () => {
      const result = asVNode(
        Wrapper({
          tag: 'button',
          block: true,
          extendCss: 'border: none;',
          direction: 'inline',
          alignX: 'center',
          alignY: 'center',
        }),
      )

      expect(result.props.$element).toEqual({
        parentFix: true,
        block: true,
        extraStyles: 'border: none;',
      })
      expect(result.props.as).toBe('button')
    })

    it('child Styled receives childFixElement props (direction, alignX, alignY, equalCols)', () => {
      const result = asVNode(
        Wrapper({
          tag: 'fieldset',
          direction: 'rows',
          alignX: 'left',
          alignY: 'bottom',
          equalCols: true,
        }),
      )

      // The child is the first (only) child of the parent
      const child = asVNode(result.props.children)
      expect(child.type).toBe(Styled)
      expect(child.props.$childFix).toBe(true)
      expect(child.props.$element).toEqual({
        childFix: true,
        direction: 'rows',
        alignX: 'left',
        alignY: 'bottom',
        equalCols: true,
      })
    })

    it("uses 'div' as inner tag by default", () => {
      const result = asVNode(Wrapper({ tag: 'button' }))
      const child = asVNode(result.props.children)
      expect(child.props.as).toBe('div')
    })

    it("uses 'span' as inner tag when isInline is true", () => {
      const result = asVNode(Wrapper({ tag: 'button', isInline: true }))
      const child = asVNode(result.props.children)
      expect(child.props.as).toBe('span')
    })
  })

  describe('dangerouslySetInnerHTML skips fix', () => {
    it('renders single Styled without parentFix for button when dangerouslySetInnerHTML is set', () => {
      const result = asVNode(
        Wrapper({
          tag: 'button',
          dangerouslySetInnerHTML: { __html: '<b>Bold</b>' },
        } as any),
      )

      // Should be the normal (non-fix) path
      expect(result.type).toBe(Styled)
      expect((result.props.$element as any).parentFix).toBeUndefined()
    })
  })

  // Void HTML elements (hr, input, img, br, …) cannot have children. Element
  // already skips passing children to Wrapper for void tags, but the JSX
  // `{own.children}` slot still serialized `undefined` into the vnode and
  // tripped runtime-dom's void-element warning. Wrapper now drops the slot
  // entirely for void tags.
  describe('void HTML elements drop the children slot', () => {
    const VOID_TAGS = ['hr', 'input', 'img', 'br', 'area', 'base', 'col', 'embed', 'link', 'source', 'track', 'wbr'] as const

    for (const tag of VOID_TAGS) {
      it(`omits children for <${tag}>`, () => {
        // Cast to any — the Wrapper Props.tag type narrows out void
        // elements, but the runtime guard still has to cover the case
        // where a void tag reaches Wrapper (e.g. via rocketstyle attrs
        // composing `tag: 'hr'` from a callback whose return type is wider).
        const result = asVNode(Wrapper({ tag } as any))
        expect(result.type).toBe(Styled)
        expect(result.props.children).toBeUndefined()
        expect(result.children).toEqual([])
      })
    }

    it('still renders children for non-void tags', () => {
      const result = asVNode(Wrapper({ tag: 'div', children: 'kept' }))
      expect(result.props.children).toBe('kept')
    })

    it('omits children even when caller accidentally passes them to a void tag', () => {
      const result = asVNode(Wrapper({ tag: 'hr', children: 'should-not-leak' }))
      expect(result.props.children).toBeUndefined()
    })

    it('dangerouslySetInnerHTML on a normally-void tag bypasses the void path', () => {
      const result = asVNode(
        Wrapper({
          tag: 'hr',
          dangerouslySetInnerHTML: { __html: '<b>x</b>' },
        } as any),
      )
      // dangerouslySetInnerHTML opts out of the void-element guard
      // because the tag becomes a custom element / shadow host case.
      expect(result.type).toBe(Styled)
    })
  })
})
