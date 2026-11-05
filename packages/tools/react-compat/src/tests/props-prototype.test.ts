import { _rp, nativeCompat } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { describe, expect, it } from 'vitest'
import { jsx } from '../jsx-runtime'

// `makeReactiveProps` builds a NULL-prototype props object when a component
// receives a reactive prop (a V8 hidden-class win). Third-party code written
// for react cannot be asked to use `Object.hasOwn`, so the compat wrapper
// re-links `Object.prototype` at setup — in place, so getters stay live.
// Bisect-verified: removing the `_compatProps(props)` call from the wrapper
// fails the first spec with `props.hasOwnProperty is not a function`.

function container(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

describe('react-compat — props keep Object.prototype', () => {
  it('a wrapped component with a reactive prop can call props.hasOwnProperty', () => {
    const s = signal('a')
    let captured: Record<string, unknown> | null = null
    let own = false
    function Comp(props: Record<string, unknown>) {
      captured = props
      own = (props as { hasOwnProperty(k: string): boolean }).hasOwnProperty('label')
      return null
    }
    const dispose = mount(jsx(Comp as never, { label: _rp(() => s()) }) as never, container())
    expect(own).toBe(true)
    const p = captured as unknown as Record<string, unknown>
    expect(Object.getPrototypeOf(p)).toBe(Object.prototype)
    expect(String(p)).toBe('[object Object]')
    // Still a live getter, not a value copy.
    expect(p.label).toBe('a')
    s.set('b')
    expect(p.label).toBe('b')
    dispose()
  })

  it('a nativeCompat component is not touched (keeps the null-prototype props)', () => {
    const s = signal('a')
    let proto: unknown = 'unset'
    const Native = nativeCompat(function Native(props: Record<string, unknown>) {
      proto = Object.getPrototypeOf(props)
      return null
    })
    const dispose = mount(jsx(Native as never, { label: _rp(() => s()) }) as never, container())
    expect(proto).toBe(null)
    dispose()
  })
})
