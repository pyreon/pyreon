/**
 * Real-Chromium twin of `reactive-range-reentrant-render.test.tsx`: a reactive
 * boundary re-run by a sibling that writes during its setup must mount content
 * it can remove. `TransitionGroup` is only judgeable here — its leave path waits
 * on computed transition state, which happy-dom never settles.
 */
import { h, Show } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { TransitionGroup } from '../index'

// A real, short leave transition so `transitionend` fires (without one the
// leave waits on its 5 s safety timer).
const style = document.createElement('style')

style.textContent =
  'li.pyreon-leave-active, li.pyreon-enter-active { transition: opacity 20ms linear } li.pyreon-leave-to, li.pyreon-enter-from { opacity: 0 }'

document.head.appendChild(style)

const settle = async () => {
  await frames(4)
  await new Promise((r) => setTimeout(r, 120))
  await frames(2)
}

const frames = async (n = 4) => {
  for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(() => r(undefined)))
}

describe('reactive range re-rendered by a sibling setup write (real Chromium)', () => {
  it('an accessor array: the later empty render removes every row', () => {
    const items = signal<string[]>(['a'])
    const Writer = () => {
      items.set(['a', 'b'])
      return null
    }
    const { container, unmount } = mountInBrowser(
      h('ul', null, () => items().map((t) => h('li', null, t)), h(Writer, null)),
    )
    expect(container.querySelectorAll('li').length).toBe(2)
    items.set([])
    expect(container.querySelectorAll('li').length).toBe(0)
    unmount()
  })

  it('<Show> toggled on by a sibling setup, then off, leaves nothing', () => {
    const on = signal(false)
    const Writer = () => {
      on.set(true)
      return null
    }
    const { container, unmount } = mountInBrowser(
      h('div', null, h(Show, { when: () => on() }, h('b', null, 'x')), h(Writer, null)),
    )
    expect(container.querySelectorAll('b').length).toBe(1)
    on.set(false)
    expect(container.querySelectorAll('b').length).toBe(0)
    unmount()
  })

  it('TransitionGroup: an item added by a sibling setup is removed when it leaves', async () => {
    const items = signal<string[]>(['a'])
    const Writer = () => {
      items.set(['a', 'b'])
      return null
    }
    const { container, unmount } = mountInBrowser(
      h(
        'div',
        null,
        h(TransitionGroup as never, {
          tag: 'ul',
          items: () => items(),
          keyFn: (t: string) => t,
          render: (t: string) => h('li', null, t),
        }),
        h(Writer, null),
      ),
    )
    await settle()
    expect(container.querySelectorAll('li').length).toBe(2)
    items.set(['a'])
    await settle()
    expect([...container.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['a'])
    unmount()
  })
  it('TransitionGroup control: an item added after mount is removed when it leaves', async () => {
    const items = signal<string[]>(['a'])
    const { container, unmount } = mountInBrowser(
      h('div', null, h(TransitionGroup as never, { tag: 'ul', items: () => items(), keyFn: (t: string) => t, render: (t: string) => h('li', null, t) })),
    )
    await settle()
    items.set(['a', 'b'])
    await settle()
    expect([...container.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['a', 'b'])
    items.set(['a'])
    await settle()
    expect([...container.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['a'])
    unmount()
  })
})

