import { h } from '@pyreon/core'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import type { PinInputState } from '@pyreon/ui-primitives'
import { describe, expect, it } from 'vitest'
import PinInput, { PinInputCell } from '../components/PinInput'

declare const __vitest_browser__: boolean | undefined

/**
 * PinInput was a styled `<div>` with an EMPTY `.theme()` and no cells — the
 * whole control was left to the consumer. These specs lock the wiring to
 * `PinInputBase`:
 *
 *  1. the rocketstyle class LANDS on the primitive's group element (#2372 —
 *     "delegates" != "works": a primitive that drops `rest` renders UNSTYLED,
 *     and this component's chain described NOTHING before), and
 *  2. the delegated behaviour is reachable THROUGH the public component, not
 *     just the primitive underneath it.
 *
 * Cells are rendered STATICALLY on purpose — wrapping them in `{() => …map()}`
 * subscribes that accessor to the cell state and remounts the inputs on every
 * keystroke, destroying the caret. `getCellProps` is accessor-valued, so the
 * cells stay live without the list re-rendering.
 */
const mountPin = (props: Record<string, unknown> = {}) =>
  mountInBrowser(
    h(PyreonUI, { theme }, h(PinInput as never, {
      length: 4,
      ...props,
      children: (s: PinInputState) =>
        h('div', s.rootProps(), [
          h(PinInputCell as never, s.getCellProps(0)),
          h(PinInputCell as never, s.getCellProps(1)),
          h(PinInputCell as never, s.getCellProps(2)),
          h(PinInputCell as never, s.getCellProps(3)),
        ]),
    })),
  )

describe('PinInput — wired to PinInputBase', () => {
  it('lands its rocketstyle class on the delegated group element', () => {
    const { container } = mountPin()
    const group = container.querySelector('[role="group"]') as HTMLElement
    expect(group).toBeTruthy()
    // The exact #2372 failure: the chain computes a class that reaches no
    // element. `rootProps()` mergeProps-forwards `rest`, so it must land here.
    expect(group.getAttribute('data-rocketstyle')).toBe('PinInput')
    expect(group.className.trim()).not.toBe('')
    // …and the class must actually describe the row that `.attrs()` used to.
    // Real-Chromium only: happy-dom does not resolve injected CSS, so it
    // reports the raw <div> default ('block') no matter what the class says —
    // asserting there would test happy-dom, not the component.
    if (typeof __vitest_browser__ !== 'undefined' && __vitest_browser__) {
      expect(getComputedStyle(group).display).toBe('inline-flex')
    }
  })

  it('styles the cells and renders one input per length', () => {
    const { container } = mountPin()
    const cells = container.querySelectorAll('input')
    expect(cells.length).toBe(4)
    expect((cells[0] as HTMLElement).getAttribute('data-rocketstyle')).toBe('PinInputCell')
    expect((cells[0] as HTMLElement).className.trim()).not.toBe('')
  })

  it('delegates auto-advance THROUGH the component (a state transition)', () => {
    const { container } = mountPin()
    const cells = [...container.querySelectorAll('input')] as HTMLInputElement[]
    cells[0]!.focus()
    cells[0]!.value = '7'
    cells[0]!.dispatchEvent(new Event('input', { bubbles: true }))
    // The behaviour a consumer previously hand-rolled: entry advances focus.
    expect(document.activeElement).toBe(cells[1]!)
  })

  it('delegates paste-distribute THROUGH the component', () => {
    const seen: string[] = []
    const { container } = mountPin({ onChange: (v: string) => seen.push(v) })
    const cells = [...container.querySelectorAll('input')] as HTMLInputElement[]
    const dt = new DataTransfer()
    dt.setData('text/plain', '1234')
    cells[0]!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    expect(seen.at(-1)).toBe('1234')
  })

  it('carries the OTP autofill hint on the FIRST cell only', () => {
    const { container } = mountPin()
    const cells = [...container.querySelectorAll('input')] as HTMLInputElement[]
    expect(cells[0]!.getAttribute('autocomplete')).toBe('one-time-code')
    expect(cells[1]!.getAttribute('autocomplete')).toBe('off')
  })
})
