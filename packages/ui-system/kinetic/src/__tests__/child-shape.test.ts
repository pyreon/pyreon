/**
 * The child shapes kinetic's per-item renderers accept (#4359): nested
 * accessors, arrays, fragments, and compiled static markup (a `_tpl` item,
 * which carries a pre-built element instead of props). `cloneVNode` must give
 * every shape the renderer's `ref` / `style` / `class`; for a `_tpl` item that
 * means setting them on its element at mount.
 */
import { createRef, Fragment, h, Show } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { query } from '@pyreon/test-utils'
import { _tpl, mount } from '@pyreon/runtime-dom'
import { flattenChildren, isNativeItem, isVNodeLike } from '../child-shape'
import { cloneVNode } from '../utils'

const tpl = (html: string) => _tpl(html, () => null)

describe('flattenChildren', () => {
  it('unwraps nested accessors, flattens arrays and fragments, drops primitives', () => {
    const a = h('li', null, 'a')
    const b = h('li', null, 'b')
    const c = tpl('<li>c</li>')
    const out = flattenChildren(() => () => [
      a,
      [null, false, 'text', 3, true],
      h(Fragment, null, b),
      c,
    ])
    expect(out).toEqual([a, b, c])
  })

  it('reads a fragment that keeps its children on props', () => {
    const a = h('li', null, 'a')
    const frag = { type: Fragment, props: { children: [a] }, children: [], key: null }
    expect(flattenChildren(frag)).toEqual([a])
  })

  it('classifies shapes', () => {
    expect(isNativeItem(tpl('<i></i>'))).toBe(true)
    expect(isNativeItem(h('i', null))).toBe(false)
    expect(isVNodeLike(h('i', null))).toBe(true)
    expect(isVNodeLike({ value: '<i></i>' })).toBe(false)
  })
})

describe('cloneVNode over compiled static markup', () => {
  it('sets ref, class and style (custom properties included) on the element at mount', () => {
    let seen: HTMLElement | null = null
    const callbackRef = (el: HTMLElement | null) => {
      seen = el
    }
    const objectRef = createRef<HTMLElement>()
    const root = document.createElement('div')
    const dispose = mount(
      h(
        'ul',
        null,
        cloneVNode(
          cloneVNode(tpl('<li class="own" style="color: red">x</li>') as never, {
            ref: callbackRef,
            class: 'hidden  extra',
            style: { opacity: 0, '--kinetic-delay': '80ms', transform: undefined },
          }),
          { ref: objectRef },
        ),
      ),
      root,
    )
    const li = query<HTMLElement>(root, 'li')
    // The second clone's ref wins over the first, as for a VNode.
    expect(objectRef.current).toBe(li)
    expect(seen).toBeNull()
    expect(li.className).toBe('own hidden extra')
    expect(li.style.color).toBe('red')
    expect(li.style.opacity).toBe('0')
    expect(li.style.getPropertyValue('--kinetic-delay')).toBe('80ms')
    dispose()
    expect(objectRef.current).toBeNull()
  })

  it('decorates the fresh element each time a <Show> remounts it', () => {
    const show = signal(true)
    const elements: (HTMLElement | null)[] = []
    const root = document.createElement('div')
    const dispose = mount(
      h(
        Show,
        { when: () => show() },
        cloneVNode(tpl('<p>x</p>') as never, {
          ref: (el: HTMLElement | null) => elements.push(el),
          style: { opacity: 0.5 },
        }),
      ),
      root,
    )
    show.set(false)
    expect(root.querySelector('p')).toBeNull()
    show.set(true)
    const p = query<HTMLElement>(root, 'p')
    expect(p.style.opacity).toBe('0.5')
    expect(elements.at(-1)).toBe(p)
    expect(elements).toContain(null)
    dispose()
  })

  it('returns a shape it cannot decorate (raw server HTML) unchanged', () => {
    const raw = { value: '<li>x</li>' }
    expect(cloneVNode(raw as never, { ref: () => {} })).toBe(raw)
  })

  it('a ref-less decoration needs no ref', () => {
    const root = document.createElement('div')
    const dispose = mount(cloneVNode(tpl('<b>x</b>') as never, { class: 7 }), root)
    expect(root.querySelector('b')?.className).toBe('')
    dispose()
  })
})
