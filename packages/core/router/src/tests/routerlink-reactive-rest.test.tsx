import { _rp, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { createRouter, RouterLink, RouterProvider } from '../index'
import { setActiveRouter } from '../router'

describe('RouterLink forwards reactive attributes live', () => {
  afterEach(() => setActiveRouter(null))

  it('a signal-driven aria-label / class / title on RouterLink updates the <a>', () => {
    const label = signal('first')
    const cls = signal('a')
    const router = createRouter({ routes: [{ path: '/', component: () => h('div', null) }], mode: 'hash' })
    const host = document.createElement('div')
    document.body.append(host)
    const dispose = mount(
      h(
        RouterProvider,
        { router },
        h(RouterLink, {
          to: '/x',
          id: 'l',
          'aria-label': _rp(() => label()),
          title: _rp(() => `t-${label()}`),
          class: _rp(() => cls()),
        } as never, 'go'),
      ),
      host,
    )
    const a = host.querySelector('#l')!
    expect(a.getAttribute('aria-label')).toBe('first')
    label.set('second')
    cls.set('b')
    expect(a.getAttribute('aria-label')).toBe('second')
    expect(a.getAttribute('title')).toBe('t-second')
    expect(a.classList.contains('b')).toBe(true)
    expect(a.classList.contains('a')).toBe(false)
    dispose()
    host.remove()
  })
})
