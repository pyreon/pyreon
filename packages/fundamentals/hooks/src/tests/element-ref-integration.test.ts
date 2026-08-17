import { elementRef, h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { describe, expect, it } from 'vitest'
import { useClickOutside } from '../useClickOutside'

describe('elementRef through a REAL mount and a REAL hook', () => {
  it('the same value wires the ref AND feeds the hook — no thunk, no let', () => {
    const host = document.createElement('div')
    document.body.append(host)
    let outside = 0

    function Panel() {
      // ONE declaration. No `let el = null`, no `() => el`.
      const panel = elementRef<HTMLDivElement>()
      useClickOutside(panel, () => { outside++ })
      return h('div', { ref: panel, 'data-testid': 'panel' }, 'panel')
    }

    const dispose = mount(h(Panel, null), host)
    const panel = host.querySelector('[data-testid="panel"]') as HTMLDivElement
    expect(panel, 'the ref wired the element').toBeTruthy()

    // A mousedown INSIDE must not fire; the hook is reading through the same ref.
    panel.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(outside, 'inside mousedown ignored').toBe(0)

    // A mousedown OUTSIDE must fire — proving the hook actually resolved the node.
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(outside, 'outside mousedown fired').toBe(1)

    dispose()
    host.remove()
  })

  it('unmount clears it, so a later read cannot resurrect a detached node', () => {
    const host = document.createElement('div')
    document.body.append(host)
    let captured!: ReturnType<typeof elementRef<HTMLDivElement>>
    function Panel() {
      const panel = elementRef<HTMLDivElement>()
      captured = panel
      return h('div', { ref: panel }, 'x')
    }
    const dispose = mount(h(Panel, null), host)
    expect(captured()).not.toBeNull()
    dispose()
    expect(captured(), 'cleared on unmount').toBeNull()
    host.remove()
  })
})
