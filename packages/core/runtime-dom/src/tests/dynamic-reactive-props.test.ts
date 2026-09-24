import { _rp, Dynamic, h } from '@pyreon/core'
import type { ComponentFn } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '../index'

// `<Dynamic component={components[current()]} label={label()} />` compiles to
// getter-backed props (`_rp`). The documented contract: when `component`
// changes, the old one unmounts and the new one mounts — and forwarded props
// stay live. A destructure inside Dynamic read both once.
describe('Dynamic with compiler-shaped reactive props', () => {
  it('switches component when the reactive `component` prop changes', () => {
    const el = document.createElement('div')
    const A: ComponentFn = () => h('div', { id: 'a' }, 'A')
    const B: ComponentFn = () => h('div', { id: 'b' }, 'B')
    const components: Record<string, ComponentFn> = { a: A, b: B }
    const current = signal('a')
    const dispose = mount(
      h('div', null, h(Dynamic, { component: _rp(() => components[current()]) } as never)),
      el,
    )
    expect(el.querySelector('#a')).not.toBeNull()
    current.set('b')
    expect(el.querySelector('#b')).not.toBeNull()
    expect(el.querySelector('#a')).toBeNull()
    dispose()
  })

  it('forwards reactive props live to a string-tag component', () => {
    const el = document.createElement('div')
    const title = signal('one')
    const dispose = mount(
      h(Dynamic, { component: 'section', id: 's', title: _rp(() => title()) } as never, 'x'),
      el,
    )
    expect(el.querySelector('#s')!.getAttribute('title')).toBe('one')
    title.set('two')
    expect(el.querySelector('#s')!.getAttribute('title')).toBe('two')
    dispose()
  })

  it('forwards reactive props live to a function component', () => {
    const el = document.createElement('div')
    const label = signal('x')
    const Show: ComponentFn<{ label: string }> = (p) => h('span', { id: 'lbl' }, () => p.label)
    const dispose = mount(h(Dynamic, { component: Show, label: _rp(() => label()) } as never), el)
    expect(el.querySelector('#lbl')!.textContent).toBe('x')
    label.set('y')
    expect(el.querySelector('#lbl')!.textContent).toBe('y')
    dispose()
  })
})

describe('Dynamic with a reactive `component` across SSR → hydrate', () => {
  it('server-renders the initial component, hydrates without mismatch, then switches', async () => {
    const { renderToString } = await import('@pyreon/runtime-server')
    const { hydrateRoot } = await import('../hydrate')
    const { onHydrationMismatch } = await import('../hydration-debug')
    const A: ComponentFn = () => h('div', { id: 'a' }, 'A')
    const B: ComponentFn = () => h('div', { id: 'b' }, 'B')
    const components: Record<string, ComponentFn> = { a: A, b: B }
    const current = signal('a')
    const view = () =>
      h('main', null, h(Dynamic, { component: _rp(() => components[current()]) } as never))

    const html = await renderToString(view())
    expect(html).toContain('id="a"')

    const el = document.createElement('div')
    el.innerHTML = html
    const serverA = el.querySelector('#a')
    const mismatches: unknown[] = []
    const off = onHydrationMismatch((m) => mismatches.push(m))
    const dispose = hydrateRoot(el, view())
    off()
    expect(mismatches).toEqual([])
    expect(el.querySelector('#a'), 'server node adopted, not rebuilt').toBe(serverA)
    current.set('b')
    expect(el.querySelector('#b')).not.toBeNull()
    expect(el.querySelector('#a')).toBeNull()
    dispose()
  })
})
