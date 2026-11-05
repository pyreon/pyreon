import { _rp, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { describe, expect, it } from 'vitest'
import { createEffect, createMemo } from '../index'
import { jsx, toCompatComponent } from '../jsx-runtime'

// A Pyreon-native parent passes a signal-driven prop as `_rp(() => s())`, which
// the mount pipeline turns into a property GETTER. The compat wrapper must hand
// the Solid component a props object that keeps that getter: real Solid props
// are reactive, so `props.x` read inside an effect, a memo or a JSX accessor
// re-runs when the prop changes. A value copy (rest-destructure) read every
// getter once at mount and froze the prop for the component's lifetime.

function container(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

describe('solid-compat — reactive props survive the component wrapper', () => {
  it('a JSX accessor, createEffect and createMemo all see a prop change', () => {
    const s = signal('a')
    const effectRuns: unknown[] = []
    let memo: (() => unknown) | null = null
    function Child(props: { label: string }) {
      createEffect(() => {
        effectRuns.push(props.label)
      })
      memo = createMemo(() => `${props.label}!`)
      return jsx('span', { children: () => props.label })
    }
    const el = container()
    const dispose = mount(jsx(Child as never, { label: _rp(() => s()) }) as never, el)
    expect(el.textContent).toBe('a')

    s.set('b')
    expect(el.textContent).toBe('b')
    expect(effectRuns).toEqual(['a', 'b'])
    expect(memo!()).toBe('b!')
    dispose()
  })

  it('a getter prop arriving through h() stays live', () => {
    const s = signal(1)
    function Child(props: { n: number }) {
      return jsx('i', { children: () => props.n })
    }
    const el = container()
    const dispose = mount(h(toCompatComponent(Child as never), { n: _rp(() => s()) }), el)
    expect(el.textContent).toBe('1')
    s.set(2)
    expect(el.textContent).toBe('2')
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
