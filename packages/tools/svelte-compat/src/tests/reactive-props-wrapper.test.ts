import { _rp } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { describe, expect, it } from 'vitest'
import { createEventDispatcher } from '../index'
import { jsx } from '../jsx-runtime'

// A Pyreon-native parent passes a signal-driven prop as `_rp(() => s())`, which
// the mount pipeline turns into a property GETTER. Svelte props are reactive
// (`$props()` in Svelte 5, `export let` before it): a parent's change reaches
// the child. The compat wrapper used to rest-destructure the props, a value
// copy that read every getter once at mount and froze the prop for the
// component's lifetime — including the `on<Event>` handler that
// `createEventDispatcher` reads at dispatch time.

function container(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

describe('svelte-compat — reactive props survive the component wrapper', () => {
  it('a JSX accessor reading a prop sees the parent change it', () => {
    const s = signal('a')
    function Child(props: { label: string }) {
      return jsx('span', { children: () => props.label })
    }
    const el = container()
    const dispose = mount(jsx(Child as never, { label: _rp(() => s()) }) as never, el)
    expect(el.textContent).toBe('a')
    s.set('b')
    expect(el.textContent).toBe('b')
    dispose()
  })

  it('createEventDispatcher calls the CURRENT handler prop, not the mount-time one', () => {
    const calls: string[] = []
    const first = () => calls.push('first')
    const second = () => calls.push('second')
    const handler = signal<() => void>(first)
    let dispatch: ((type: 'pick') => boolean) | null = null
    function Child() {
      dispatch = createEventDispatcher<{ pick: undefined }>()
      return null
    }
    const dispose = mount(
      jsx(Child as never, { onPick: _rp(() => handler()) }) as never,
      container(),
    )
    dispatch!('pick')
    handler.set(second)
    dispatch!('pick')
    expect(calls).toEqual(['first', 'second'])
    dispose()
  })

  it('the internal child-instance key is not visible to the component', () => {
    let keys: (string | symbol)[] = []
    function Child(props: Record<string | symbol, unknown>) {
      keys = Reflect.ownKeys(props)
      return null
    }
    function Parent() {
      return jsx(Child as never, { label: 'x' })
    }
    const dispose = mount(jsx(Parent as never, {}) as never, container())
    expect(keys).toEqual(['label'])
    dispose()
  })
})
