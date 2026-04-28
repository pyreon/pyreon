import { Dynamic } from '../dynamic'
import { h } from '../h'
import type { ComponentFn, VNode, VNodeChild } from '../types'

describe('Dynamic', () => {
  test('renders component function', () => {
    const Greeting: ComponentFn = (props) => h('span', null, (props as { name: string }).name)
    const result = Dynamic({ component: Greeting, name: 'world' })
    expect(result).not.toBeNull()
    expect((result as VNode).type).toBe(Greeting)
    expect((result as VNode).props).toEqual({ name: 'world' })
  })

  test('renders string element', () => {
    const result = Dynamic({ component: 'div', class: 'box', id: 'main' })
    expect(result).not.toBeNull()
    expect((result as VNode).type).toBe('div')
    expect((result as VNode).props).toEqual({ class: 'box', id: 'main' })
  })

  test('strips component prop from rest props', () => {
    const result = Dynamic({ component: 'span', id: 'x' })
    expect((result as VNode).props.component).toBeUndefined()
    expect((result as VNode).props.id).toBe('x')
  })

  test('returns null for empty string component', () => {
    const result = Dynamic({ component: '' })
    expect(result).toBeNull()
  })

  test('warns when component prop is falsy', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    Dynamic({ component: '' })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('<Dynamic>'))
    warnSpy.mockRestore()
  })

  test('passes all extra props to the rendered component', () => {
    const Comp: ComponentFn = (props) => h('div', null, JSON.stringify(props))
    const result = Dynamic({
      component: Comp,
      a: 1,
      b: 'two',
      c: true,
    })
    expect((result as VNode).props).toEqual({ a: 1, b: 'two', c: true })
  })

  test('renders with no extra props', () => {
    const result = Dynamic({ component: 'br' })
    expect(result).not.toBeNull()
    expect((result as VNode).type).toBe('br')
  })

  test('does not leak children as a prop on string-tag mount', () => {
    // Regression: for string `component`, runtime-dom forwards every prop
    // key to setAttribute. If `children` stayed in props it crashed at
    // mount with `setAttribute('children', ...)`. The fix re-emits them
    // as h() rest args, landing them in vnode.children.
    const result = Dynamic({ component: 'h3', children: 'hello' })
    expect((result as VNode).type).toBe('h3')
    expect((result as VNode).props.children).toBeUndefined()
    expect((result as VNode).children).toEqual(['hello'])
  })

  test('flattens array children to vnode.children', () => {
    const a = h('span', null, 'a')
    const b = h('span', null, 'b')
    const result = Dynamic({ component: 'div', children: [a, b] })
    expect((result as VNode).props.children).toBeUndefined()
    expect((result as VNode).children).toHaveLength(2)
  })

  test('component children still reach props.children at mount', () => {
    // For component (not string), the merge happens at mount via
    // mergeChildrenIntoProps — verified end-to-end by mount tests in
    // runtime-dom. Here we just confirm the vnode shape is correct so the
    // merge will fire (children must be on vnode.children, not props).
    const Comp: ComponentFn = (props) =>
      h('div', null, (props as { children?: VNodeChild }).children ?? null)
    const result = Dynamic({ component: Comp, children: 'hi' })
    expect((result as VNode).type).toBe(Comp)
    expect((result as VNode).props.children).toBeUndefined()
    expect((result as VNode).children).toEqual(['hi'])
  })
})
