/**
 * #4820 in real Chromium: a controlled `<select value>` selects the matching
 * option when that option is added AFTER mount. In a real browser assigning
 * `select.value` before the option exists is a no-op and appending options
 * selects the first one, so only the framework can re-apply the value. The
 * node-level matrix (both compiler backends, h(), hydration, user changes) is
 * `select-value-late-options.test.tsx`.
 *
 * The value is applied once its option exists and then forgotten, so the user
 * owns the selection afterwards: a pick survives option updates, an unmatched
 * value leaves the browser default, a `multiple` select keeps its selection.
 */
import { For, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { _selectWait, mount } from '@pyreon/runtime-dom'
import { flush } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { ForPicker, MapPicker } from './fixtures/select-late-options.fixture'

// The h() specs below build `<select value>` without the compiler, which would
// otherwise emit this call (the fixture module's own compile emits it too).
_selectWait()

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

describe('after the value applied, the selection is the user\'s — real Chromium', () => {
  const forOptions = (options: ReturnType<typeof signal<string[]>>) =>
    h(For, { each: () => options(), by: (o: string) => o, children: (o: string) => h('option', { value: o }, o) })

  it('a value applied when its option arrived is not applied again after the user picks', async () => {
    const options = signal<string[]>([])
    const select = render(
      h(
        'select',
        { value: 'b' },
        h(For, { each: () => options(), by: (o: string) => o, children: (o: string) => h('option', { value: o }, o) }),
      ),
    )
    options.set(['a', 'b'])
    await flush()
    expect(select.value).toBe('b')
    select.value = 'a'
    options.set(['a', 'b', 'c'])
    await flush()
    expect(select.value).toBe('a')
  })

  it('a pick the app does not mirror into the signal survives option updates', async () => {
    const value = signal('a')
    const options = signal(['a', 'b'])
    const select = render(h('select', { value: () => value() }, forOptions(options)))
    expect(select.value).toBe('a')
    select.value = 'b'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    options.set(['a', 'b', 'c'])
    await flush()
    expect(select.value).toBe('b')
  })

  it('an unmatched value shows the browser default after an options update, not a blank select', async () => {
    const options = signal(['a'])
    const select = render(h('select', { value: 'z' }, forOptions(options)))
    options.set(['a', 'b'])
    await flush()
    expect(select.selectedIndex).not.toBe(-1)
    // …and the value still applies if its option arrives.
    options.set(['a', 'b', 'z'])
    await flush()
    expect(select.value).toBe('z')
  })

  it('a multiple select keeps its selection across option updates', async () => {
    const options = signal(['a', 'b'])
    const select = render(h('select', { multiple: true, value: 'a' }, forOptions(options)))
    select.options[1]!.selected = true
    options.set(['a', 'b', 'c'])
    await flush()
    expect([...select.selectedOptions].map((o) => o.value)).toEqual(['a', 'b'])
  })
})
