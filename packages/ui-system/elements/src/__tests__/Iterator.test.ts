import type { ComponentFn, VNode, VNodeChild } from '@pyreon/core'
import { Fragment, h } from '@pyreon/core'
import { describe, expect, it, vi } from 'vitest'
import Iterator from '../helpers/Iterator/component'

const asVNode = (v: unknown) => v as VNode

const TextItem: ComponentFn = (props: any) =>
  h('span', { 'data-testid': 'item', ...props }, props.children)

describe('Iterator', () => {
  describe('static properties', () => {
    it('has isIterator flag', () => {
      expect(Iterator.isIterator).toBe(true)
    })

    it('has RESERVED_PROPS', () => {
      expect(Iterator.RESERVED_PROPS).toContain('children')
      expect(Iterator.RESERVED_PROPS).toContain('component')
      expect(Iterator.RESERVED_PROPS).toContain('data')
      expect(Iterator.RESERVED_PROPS).toContain('itemKey')
      expect(Iterator.RESERVED_PROPS).toContain('valueName')
      expect(Iterator.RESERVED_PROPS).toContain('itemProps')
      expect(Iterator.RESERVED_PROPS).toContain('wrapComponent')
      expect(Iterator.RESERVED_PROPS).toContain('wrapProps')
    })
  })

  describe('children mode', () => {
    it('renders children directly', () => {
      const children = [
        h('span', { 'data-testid': 'child-1' }, 'A'),
        h('span', { 'data-testid': 'child-2' }, 'B'),
      ]
      const result = Iterator({ children })
      expect(result).toEqual(children)
    })

    it('renders single child', () => {
      const child = h('span', { 'data-testid': 'only' }, 'Only')
      const result = Iterator({ children: child })
      expect(result).toBe(child)
    })

    it('returns null when children is null/undefined', () => {
      const result = Iterator({})
      expect(result).toBeNull()
    })

    it('renders fragment children', () => {
      const children = [
        h('span', { 'data-testid': 'frag-1' }, 'A'),
        h('span', { 'data-testid': 'frag-2' }, 'B'),
      ]
      const result = Iterator({ children })
      expect(result).toEqual(children)
    })

    it('renders Fragment children with itemProps', () => {
      const itemPropsFn = vi.fn((_item: unknown, extended: any) => ({
        'data-pos': String(extended.position),
      }))
      const fragChildren = [
        h('span', { 'data-testid': 'frag-a' }, 'A'),
        h('span', { 'data-testid': 'frag-b' }, 'B'),
      ]
      const fragment = h(Fragment, null, ...fragChildren)
      const result = Iterator({ children: fragment, itemProps: itemPropsFn })
      expect(itemPropsFn).toHaveBeenCalled()
      expect(Array.isArray(result)).toBe(true)
    })

    it('renders Fragment children with wrapComponent', () => {
      const Wrap: ComponentFn = (props: any) => h('div', { 'data-testid': 'wrap' }, props.children)
      const fragChildren = [
        h('span', { 'data-testid': 'frag-a' }, 'A'),
        h('span', { 'data-testid': 'frag-b' }, 'B'),
      ]
      const fragment = h(Fragment, null, ...fragChildren)
      const result = Iterator({ children: fragment, wrapComponent: Wrap }) as VNodeChild[]
      expect(Array.isArray(result)).toBe(true)
      expect((result as any[]).length).toBe(2)
      // Each item should be wrapped
      const first = asVNode(result[0])
      expect(first.type).toBe(Wrap)
    })

    it('children take priority over data', () => {
      const child = h('span', { 'data-testid': 'child' }, 'Child wins')
      const result = Iterator({
        children: child,
        component: TextItem,
        data: ['x', 'y'],
      })
      expect(result).toBe(child)
    })
  })

  describe('simple array mode', () => {
    it('renders string array with component', () => {
      const result = Iterator({
        component: TextItem,
        data: ['hello', 'world'],
      }) as VNodeChild[]
      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(2)
    })

    it('renders number array with component', () => {
      const result = Iterator({
        component: TextItem,
        data: [1, 2, 3],
      }) as VNodeChild[]
      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(3)
    })

    it('filters null/undefined from data', () => {
      const result = Iterator({
        component: TextItem,
        data: ['a', null, 'b', undefined],
      }) as VNodeChild[]
      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(2)
    })

    it('returns null for empty array', () => {
      const result = Iterator({ component: TextItem, data: [] })
      expect(result).toBeNull()
    })

    it('returns null for all-null array', () => {
      const result = Iterator({ component: TextItem, data: [null, null] })
      expect(result).toBeNull()
    })

    it('uses valueName to set prop name', () => {
      const Item: ComponentFn = (props: any) => h('span', { 'data-testid': 'item' }, props.title)
      const result = Iterator({
        component: Item,
        data: ['hello'],
        valueName: 'title',
      }) as VNodeChild[]
      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(1)
    })

    it('defaults valueName to children', () => {
      const result = Iterator({
        component: TextItem,
        data: ['test'],
      }) as VNodeChild[]
      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(1)
    })
  })

  describe('object array mode', () => {
    it('renders object array with component', () => {
      const Item: ComponentFn = (props: any) => h('span', { 'data-testid': 'item' }, props.name)
      const result = Iterator({
        component: Item,
        data: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
      }) as VNodeChild[]
      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(2)
    })

    it('filters empty objects from data', () => {
      const Item: ComponentFn = (props: any) => h('span', { 'data-testid': 'item' }, props.name)
      const result = Iterator({
        component: Item,
        data: [{ name: 'Alice' }, {}, { name: 'Bob' }],
      }) as VNodeChild[]
      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(2)
    })

    it('supports per-item component override', () => {
      const Default: ComponentFn = (props: any) =>
        h('span', { 'data-testid': 'default' }, props.label)
      const Custom: ComponentFn = (props: any) => h('em', { 'data-testid': 'custom' }, props.label)
      const result = Iterator({
        component: Default,
        data: [{ label: 'one' }, { label: 'two', component: Custom }],
      }) as VNodeChild[]
      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(2)
      // Second item should use Custom component
      const second = asVNode(result[1])
      expect(second.type).toBe(Custom)
    })

    it('uses itemKey string to pick key from item', () => {
      const Item: ComponentFn = (props: any) => h('span', { 'data-testid': 'item' }, props.slug)
      const result = Iterator({
        component: Item,
        data: [{ slug: 'a' }, { slug: 'b' }],
        itemKey: 'slug',
      }) as VNodeChild[]
      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(2)
    })

    it('uses itemKey function for custom keys', () => {
      const keyFn = vi.fn((_item: unknown, index: number) => `custom-${index}`)
      const Item: ComponentFn = (props: any) => h('span', { 'data-testid': 'item' }, props.name)
      Iterator({
        component: Item,
        data: [{ name: 'a' }, { name: 'b' }],
        itemKey: keyFn,
      })
      expect(keyFn).toHaveBeenCalledTimes(2)
    })

    it('falls back to id/key/itemId for keys', () => {
      const Item: ComponentFn = (props: any) => h('span', { 'data-testid': 'item' }, props.name)
      const result = Iterator({
        component: Item,
        data: [
          { id: 'x', name: 'Alice' },
          { key: 'y', name: 'Bob' },
          { itemId: 'z', name: 'Charlie' },
        ],
      }) as VNodeChild[]
      expect(result).toHaveLength(3)
    })
  })

  describe('itemProps', () => {
    it('passes static itemProps to items', () => {
      const result = Iterator({
        component: TextItem,
        data: ['hello'],
        itemProps: { extra: 'yes' },
      }) as VNodeChild[]
      expect(result).toHaveLength(1)
    })

    it('passes itemProps callback with extended props', () => {
      const itemPropsFn = vi.fn((_item: unknown, extended: any) => ({
        pos: extended.position,
        isFirst: extended.first,
        isLast: extended.last,
      }))
      Iterator({
        component: TextItem,
        data: ['a', 'b', 'c'],
        itemProps: itemPropsFn,
      })
      expect(itemPropsFn).toHaveBeenCalledTimes(3)
      // First call: position 1, first=true, last=false
      const calls = itemPropsFn.mock.calls as unknown[][]
      expect((calls[0] as unknown[])[1]).toMatchObject({
        position: 1,
        first: true,
        last: false,
      })
      // Last call: position 3, first=false, last=true
      expect((calls[2] as unknown[])[1]).toMatchObject({
        position: 3,
        first: false,
        last: true,
      })
    })
  })

  describe('wrapComponent', () => {
    it('wraps each item with wrapComponent', () => {
      const Wrap: ComponentFn = (props: any) => h('div', { 'data-testid': 'wrap' }, props.children)
      const result = Iterator({
        component: TextItem,
        data: ['a', 'b'],
        wrapComponent: Wrap,
      }) as VNodeChild[]
      expect(result).toHaveLength(2)
      const first = asVNode(result[0])
      expect(first.type).toBe(Wrap)
    })

    it('wraps children with wrapComponent', () => {
      const Wrap: ComponentFn = (props: any) => h('div', { 'data-testid': 'wrap' }, props.children)
      const result = Iterator({
        wrapComponent: Wrap,
        children: [h('span', null, 'A'), h('span', null, 'B')],
      }) as VNodeChild[]
      expect(result).toHaveLength(2)
      const first = asVNode(result[0])
      expect(first.type).toBe(Wrap)
    })

    it('passes wrapProps to wrapComponent', () => {
      const Wrap: ComponentFn = (props: any) =>
        h('div', { 'data-testid': 'wrap', 'data-extra': props.extra }, props.children)
      const result = Iterator({
        component: TextItem,
        data: ['a'],
        wrapComponent: Wrap,
        wrapProps: { extra: 'val' },
      }) as VNodeChild[]
      expect(result).toHaveLength(1)
      const first = asVNode(result[0])
      expect(first.type).toBe(Wrap)
      expect(first.props.extra).toBe('val')
    })

    it('passes wrapProps callback with extended props', () => {
      const wrapPropsFn = vi.fn((_item: unknown, extended: any) => ({
        'data-pos': extended.position,
      }))
      const Wrap: ComponentFn = (props: any) =>
        h('div', { 'data-testid': 'wrap', ...props }, props.children)
      Iterator({
        component: TextItem,
        data: ['a', 'b'],
        wrapComponent: Wrap,
        wrapProps: wrapPropsFn,
      })
      expect(wrapPropsFn).toHaveBeenCalledTimes(2)
      const wCalls = wrapPropsFn.mock.calls as unknown[][]
      expect((wCalls[0] as unknown[])[1]).toMatchObject({ position: 1 })
      expect((wCalls[1] as unknown[])[1]).toMatchObject({ position: 2 })
    })

    it('wraps object array items with wrapComponent and wrapProps callback', () => {
      const wrapPropsFn = vi.fn((_item: unknown, extended: any) => ({
        'data-pos': String(extended.position),
      }))
      const Item: ComponentFn = (props: any) => h('span', { 'data-testid': 'item' }, props.name)
      const Wrap: ComponentFn = (props: any) =>
        h('div', { 'data-testid': 'wrap', ...props }, props.children)
      const result = Iterator({
        component: Item,
        data: [{ name: 'Alice' }, { name: 'Bob' }],
        wrapComponent: Wrap,
        wrapProps: wrapPropsFn,
      }) as VNodeChild[]
      expect(result).toHaveLength(2)
      expect(wrapPropsFn).toHaveBeenCalledTimes(2)
    })

    it('passes itemProps callback to object array items', () => {
      const itemPropsFn = vi.fn((_item: unknown, extended: any) => ({
        'data-first': String(extended.first),
      }))
      const Item: ComponentFn = (props: any) =>
        h('span', { 'data-testid': 'item', ...props }, props.name)
      Iterator({
        component: Item,
        data: [{ name: 'Alice' }, { name: 'Bob' }],
        itemProps: itemPropsFn,
      })
      expect(itemPropsFn).toHaveBeenCalledTimes(2)
      const ipCalls = itemPropsFn.mock.calls as unknown[][]
      expect((ipCalls[0] as unknown[])[1]).toMatchObject({ first: true })
      expect((ipCalls[1] as unknown[])[1]).toMatchObject({ first: false })
    })

    it('skips wrapComponent for items with custom component in object array', () => {
      const Default: ComponentFn = (props: any) =>
        h('span', { 'data-testid': 'default' }, props.label)
      const Custom: ComponentFn = (props: any) => h('em', { 'data-testid': 'custom' }, props.label)
      const Wrap: ComponentFn = (props: any) => h('div', { 'data-testid': 'wrap' }, props.children)
      const result = Iterator({
        component: Default,
        data: [{ label: 'one' }, { label: 'two', component: Custom }],
        wrapComponent: Wrap,
      }) as VNodeChild[]
      expect(result).toHaveLength(2)
      // First item (default) should be wrapped
      const first = asVNode(result[0])
      expect(first.type).toBe(Wrap)
      // Second item (custom component) should NOT be wrapped
      const second = asVNode(result[1])
      expect(second.type).toBe(Custom)
    })
  })

  describe('children with itemProps (no wrapComponent)', () => {
    it('injects itemProps into children without wrapping', () => {
      const itemPropsFn = vi.fn(() => ({ 'data-injected': 'yes' }))
      Iterator({
        itemProps: itemPropsFn,
        children: [
          h('span', { 'data-testid': 'child-a' }, 'A'),
          h('span', { 'data-testid': 'child-b' }, 'B'),
        ],
      })
      expect(itemPropsFn).toHaveBeenCalled()
    })

    it('injects itemProps into single child', () => {
      const itemPropsFn = vi.fn(() => ({}))
      Iterator({
        itemProps: itemPropsFn,
        children: h('span', { 'data-testid': 'only' }, 'Only'),
      })
      expect(itemPropsFn).toHaveBeenCalled()
    })
  })

  describe('children rendering paths', () => {
    it('renders single child without itemProps or wrapComponent (direct passthrough)', () => {
      const child = h('span', { 'data-testid': 'single' }, 'Single')
      const result = Iterator({ children: child })
      expect(result).toBe(child)
    })

    it('renders array children without itemProps or wrapComponent', () => {
      const children = [
        h('span', { 'data-testid': 'a' }, 'A'),
        h('span', { 'data-testid': 'b' }, 'B'),
      ]
      const result = Iterator({ children })
      expect(result).toEqual(children)
    })

    it('renders single child with wrapComponent', () => {
      const Wrap: ComponentFn = (props: any) => h('div', { 'data-testid': 'wrap' }, props.children)
      const result = Iterator({
        wrapComponent: Wrap,
        children: h('span', { 'data-testid': 'only' }, 'Only'),
      })
      const vnode = asVNode(result)
      expect(vnode.type).toBe(Wrap)
    })

    it('renders single child with itemProps function', () => {
      const itemPropsFn = vi.fn((_item: unknown, extended: any) => ({
        'data-pos': String(extended.position),
      }))
      Iterator({
        itemProps: itemPropsFn,
        children: h('span', { 'data-testid': 'only' }, 'Only'),
      })
      expect(itemPropsFn).toHaveBeenCalledTimes(1)
    })
  })

  describe('edge cases', () => {
    it('returns null when component is missing but data exists', () => {
      const result = Iterator({ data: ['a', 'b'] })
      expect(result).toBeNull()
    })

    it('returns null when data is not an array', () => {
      const result = Iterator({
        component: TextItem,
        data: 'not-array' as any,
      })
      expect(result).toBeNull()
    })

    it('returns null for mixed simple and object array', () => {
      const result = Iterator({
        component: TextItem,
        data: ['hello', { name: 'world' }] as any,
      })
      expect(result).toBeNull()
    })

    it('returns null for unsupported data types in array', () => {
      const result = Iterator({
        component: TextItem,
        data: [true, false] as any,
      })
      expect(result).toBeNull()
    })

    it('handles itemKey as number (fallback to index)', () => {
      const Item: ComponentFn = (props: any) => h('span', { 'data-testid': 'item' }, props.name)
      const result = Iterator({
        component: Item,
        data: [{ name: 'Alice' }, { name: 'Bob' }],
        itemKey: 42 as any,
      }) as VNodeChild[]
      expect(result).toHaveLength(2)
    })
  })
})
