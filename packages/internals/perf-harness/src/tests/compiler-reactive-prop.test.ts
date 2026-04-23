// @vitest-environment happy-dom
/**
 * End-to-end probe: does a child component that receives a signal prop
 * and renders `{propName}` in JSX text actually update when the parent's
 * signal changes?
 *
 * This tests the compiler + runtime contract around reactive props in
 * text children. A failure here would mean `<Child name={signal} />`
 * renders stale text.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _disable, _reset } from '../counters'
import { install, uninstall } from '../harness'
import { resetDom } from './_dom-setup'

beforeEach(() => {
  _reset()
  install()
  resetDom()
})

afterEach(() => {
  uninstall()
  _reset()
  _disable()
  document.body.innerHTML = ''
})

describe('reactive text from props', () => {
  it('child renders signal prop via h() — reads the signal as accessor', () => {
    const name = signal('Alice')
    // Manual h() construction bypasses compiler; we emulate what
    // a compiler-aware parent would emit.
    const Child = (props: { name: () => string }) => {
      return h('div', null, () => props.name())
    }
    const root = document.getElementById('root')!
    const dispose = mount(h(Child, { name: name as unknown as () => string }), root)

    expect(root.textContent).toBe('Alice')

    name.set('Bob')
    expect(root.textContent).toBe('Bob')

    name.set('Carol')
    expect(root.textContent).toBe('Carol')
    dispose()
  })

  it('child renders signal prop via bare reference — manual test', () => {
    // User writes `<div>{props.name}</div>` — does it update?
    const name = signal('Alice')
    const Child = (props: { name: () => string }) => {
      // h() with a raw signal — the runtime should treat it as an accessor
      return h('div', null, props.name)
    }
    const root = document.getElementById('root')!
    const dispose = mount(h(Child, { name: name as unknown as () => string }), root)

    const initialText = root.textContent
    name.set('Bob')
    const afterText = root.textContent

    // If the runtime treats the callable as an accessor, it'll update.
    // If it stringifies the function, initialText will be "function () ..."
    // oxlint-disable-next-line no-console
    console.log(`[reactive-prop] initial="${initialText}" after-write="${afterText}"`)

    // Either the runtime updates (good) or it doesn't (finding).
    // We don't assert a specific outcome here — just capture what happens.
    expect(typeof initialText === 'string').toBe(true)
    dispose()
  })
})
