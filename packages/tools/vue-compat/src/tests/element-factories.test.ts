import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, KeepAlive, ref, TransitionGroup } from '../index'
import { jsx } from '../jsx-runtime'

// Every public way vue-compat turns a user component into a vnode must give
// it the compat wrapper, exactly as JSX does — the wrapper is what re-runs a
// Vue-style component when its reactive state changes. `createApp(Root)` and
// `h(Comp)` used core's raw `h()`, so a stateful root never re-rendered.

const tick = () => new Promise<void>((r) => setTimeout(r, 0))
const host = (): HTMLElement => document.body.appendChild(document.createElement('div'))
afterEach(() => {
  document.body.innerHTML = ''
})

function Counter() {
  const count = ref(0)
  return jsx('button', { onClick: () => count.value++, children: `count ${count.value}` })
}

describe('vue-compat element factories wrap user components', () => {
  it('createApp(Root).mount(el): a stateful root re-renders on state change', async () => {
    const el = host()
    const unmount = createApp(Counter).mount(el)
    el.querySelector('button')!.click()
    await tick()
    expect(el.textContent).toBe('count 1')
    el.querySelector('button')!.click()
    await tick()
    expect(el.textContent).toBe('count 2')
    unmount()
  })

  it('h(Comp) builds the same wrapped component as JSX', async () => {
    expect(h(Counter, null).type).toBe(jsx(Counter, {}).type)
    const el = host()
    mount(h('section', null, h(Counter, null)), el)
    el.querySelector('button')!.click()
    await tick()
    expect(el.textContent).toBe('count 1')
  })

  it('h passes key out of props and positional children win', () => {
    const vnode = h('ul', { key: 'k', class: 'x' }, h('li', null, 'a'), h('li', null, 'b'))
    expect(vnode.key).toBe('k')
    expect((vnode.props as Record<string, unknown>).class).toBe('x')
    expect(vnode.children).toHaveLength(2)
  })

  it('framework components (KeepAlive, TransitionGroup) render their children through JSX and h', () => {
    const a = host()
    mount(jsx(KeepAlive as never, { children: jsx('span', { children: 'kept' }) }), a)
    expect(a.textContent).toBe('kept')
    const b = host()
    mount(h(KeepAlive as never, null, h('span', null, 'kept')), b)
    expect(b.textContent).toBe('kept')
    const c = host()
    mount(
      jsx(TransitionGroup as never, {
        tag: 'ul',
        items: () => [1, 2, 3],
        keyFn: (n: number) => n,
        render: (n: number) => jsx('li', { children: String(n) }),
      }),
      c,
    )
    expect(c.querySelectorAll('li')).toHaveLength(3)
  })
})
