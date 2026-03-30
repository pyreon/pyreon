import type { ComponentFn, VNode } from '@pyreon/core'
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { Element } from '../Element'
import Iterator from '../helpers/Iterator'
import { List } from '../List'

const asVNode = (v: unknown) => v as VNode

describe('List', () => {
  describe('statics', () => {
    it('has correct displayName', () => {
      expect(List.displayName).toBe('@pyreon/elements/List')
    })

    it('has correct pkgName', () => {
      expect(List.pkgName).toBe('@pyreon/elements')
    })

    it('has correct PYREON__COMPONENT', () => {
      expect(List.PYREON__COMPONENT).toBe('@pyreon/elements/List')
    })
  })

  describe('rootElement = false (default)', () => {
    it('returns a VNode whose type is Iterator', () => {
      const Comp: ComponentFn = (props: any) => h('span', null, props.children)
      const result = asVNode(
        List({
          data: ['a', 'b'],
          component: Comp,
        }),
      )

      expect(result.type).toBe(Iterator)
    })

    it('passes iterator-related props to the Iterator VNode', () => {
      const Comp: ComponentFn = (props: any) => h('span', null, props.children)
      const data = ['a', 'b', 'c']
      const itemKeyFn = (_item: unknown, i: number) => i
      const itemPropsFn = () => ({})
      const WrapComp: ComponentFn = (props: any) => h('div', null, ...props.children)

      const result = asVNode(
        List({
          data,
          component: Comp,
          itemKey: itemKeyFn,
          itemProps: itemPropsFn,
          valueName: 'label',
          wrapComponent: WrapComp,
          wrapProps: { className: 'wrap' },
        }),
      )

      expect(result.type).toBe(Iterator)
      expect(result.props.data).toBe(data)
      expect(result.props.component).toBe(Comp)
      expect(result.props.itemKey).toBe(itemKeyFn)
      expect(result.props.itemProps).toBe(itemPropsFn)
      expect(result.props.valueName).toBe('label')
      expect(result.props.wrapComponent).toBe(WrapComp)
      expect(result.props.wrapProps).toEqual({ className: 'wrap' })
    })

    it('does not pass non-iterator props to Iterator', () => {
      const Comp: ComponentFn = (props: any) => h('span', null, props.children)
      const result = asVNode(
        List({
          data: ['a'],
          component: Comp,
          block: true,
          gap: 8,
          direction: 'rows',
        } as any),
      )

      expect(result.type).toBe(Iterator)
      expect(result.props.block).toBeUndefined()
      expect(result.props.gap).toBeUndefined()
      expect(result.props.direction).toBeUndefined()
    })

    it('forwards children prop to Iterator', () => {
      const child = h('span', null, 'hello')
      const result = asVNode(List({ children: child }))

      expect(result.type).toBe(Iterator)
      expect(result.props.children).toBe(child)
    })
  })

  describe('rootElement = true', () => {
    it('returns a VNode whose type is Element', () => {
      const Comp: ComponentFn = (props: any) => h('span', null, props.children)
      const result = asVNode(
        List({
          data: ['a'],
          component: Comp,
          rootElement: true,
        }),
      )

      expect(result.type).toBe(Element)
    })

    it('passes layout props to the Element VNode', () => {
      const Comp: ComponentFn = (props: any) => h('span', null, props.children)
      const result = asVNode(
        List({
          data: ['a'],
          component: Comp,
          rootElement: true,
          block: true,
          gap: 8,
          direction: 'rows',
        } as any),
      )

      expect(result.type).toBe(Element)
      expect(result.props.block).toBe(true)
      expect(result.props.gap).toBe(8)
      expect(result.props.direction).toBe('rows')
    })

    it('does not pass iterator-reserved props to Element', () => {
      const Comp: ComponentFn = (props: any) => h('span', null, props.children)
      const result = asVNode(
        List({
          data: ['x'],
          component: Comp,
          rootElement: true,
          valueName: 'label',
        }),
      )

      expect(result.type).toBe(Element)
      // Iterator-reserved props should not leak to Element
      expect(result.props.data).toBeUndefined()
      expect(result.props.component).toBeUndefined()
      expect(result.props.valueName).toBeUndefined()
    })

    it('nests an Iterator VNode as children of Element', () => {
      const Comp: ComponentFn = (props: any) => h('span', null, props.children)
      const data = ['a', 'b']
      const result = asVNode(
        List({
          data,
          component: Comp,
          rootElement: true,
        }),
      )

      expect(result.type).toBe(Element)

      // The children of Element should contain the Iterator VNode
      const children = result.props.children as unknown
      const iteratorNode = asVNode(Array.isArray(children) ? children[0] : children)
      expect(iteratorNode.type).toBe(Iterator)
      expect(iteratorNode.props.data).toBe(data)
      expect(iteratorNode.props.component).toBe(Comp)
    })

    it('forwards ref to Element', () => {
      const Comp: ComponentFn = (props: any) => h('span', null, props.children)
      const refFn = (_node: unknown) => {
        /* noop */
      }
      const result = asVNode(
        List({
          data: ['a'],
          component: Comp,
          rootElement: true,
          ref: refFn,
        } as any),
      )

      expect(result.type).toBe(Element)
      expect(result.props.ref).toBe(refFn)
    })
  })

  describe('Iterator.RESERVED_PROPS', () => {
    it('contains the expected prop names', () => {
      expect(Iterator.RESERVED_PROPS).toEqual([
        'children',
        'component',
        'wrapComponent',
        'data',
        'itemKey',
        'valueName',
        'itemProps',
        'wrapProps',
      ])
    })
  })
})
