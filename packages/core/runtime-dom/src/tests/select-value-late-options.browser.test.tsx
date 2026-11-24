/**
 * #4820 in real Chromium: a controlled `<select value>` selects the matching
 * option when that option is added AFTER mount. In a real browser assigning
 * `select.value` before the option exists is a no-op and appending options
 * selects the first one, so only the framework can re-apply the value. The
 * node-level matrix (both compiler backends, h(), hydration, user changes) is
 * `select-value-late-options.test.tsx`.
 *
 * Bisect-verified: with the reconcilers' `_resyncSelect` calls removed, every
 * spec here fails with the first option selected (`'a'` / `'none'`).
 */
import { For, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { flush } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { ForPicker, MapPicker } from './fixtures/select-late-options.fixture'

const cleanups: (() => void)[] = []

afterEach(() => {
  for (const c of cleanups.splice(0)) c()
})

function render(vnode: Parameters<typeof mount>[0]): HTMLSelectElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const unmount = mount(vnode, container)
  cleanups.push(() => {
    unmount()
    container.remove()
  })

  return container.querySelector('select')!
}

describe('<select value> with options added after mount — real Chromium', () => {
  it('compiled <For> options (the issue repro)', async () => {
    const value = signal('b')
    const options = signal<string[]>([])
    const select = render(h(ForPicker, { value, options }))
    options.set(['a', 'b', 'c'])
    await flush()
    expect(select.options.length).toBe(3)
    expect([value(), select.value]).toEqual(['b', 'b'])
    // The user picks another option; a later options change keeps it.
    select.value = 'c'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    expect(value()).toBe('c')
    options.set(['a', 'b', 'c', 'd'])
    await flush()
    expect(select.value).toBe('c')
  })

  it('compiled unkeyed .map options inside an <optgroup>', async () => {
    const value = signal('y')
    const options = signal<string[]>([])
    const select = render(h(MapPicker, { value, options }))
    options.set(['x', 'y'])
    await flush()
    expect(select.value).toBe('y')
  })

  it('h() path: <For> options', async () => {
    const value = signal('b')
    const options = signal<string[]>([])
    const select = render(
      h(
        'select',
        { value: () => value() },
        h(For, { each: () => options(), by: (o: string) => o, children: (o: string) => h('option', { value: o }, o) }),
      ),
    )
    options.set(['a', 'b'])
    await flush()
    expect(select.value).toBe('b')
  })
})
