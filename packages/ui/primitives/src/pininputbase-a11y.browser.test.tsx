/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium lock for PinInputBase — the OTP behaviour set (auto-advance,
 * backspace-to-previous, arrow/Home/End navigation, paste-distribute) plus the
 * per-cell a11y contract.
 *
 * These specs assert STATE TRANSITIONS, not just initial state, which is only
 * possible because `getCellProps` emits ACCESSOR-valued entries: the package's
 * browser config uses plain oxc JSX (no reactive-prop compiler), so a
 * getter-backed value would be fired and FROZEN by the `{...spread}` below
 * (exactly why fileuploadbase-a11y has to re-mount per variant). A function
 * value survives the spread and `applyProp` renderEffect-wraps it at the
 * destination — so `cellAt(i).value` tracks the model for real.
 *
 * Cells are rendered STATICALLY on purpose: per-cell accessors keep every cell
 * live without a re-render, so a consumer only needs a reactive accessor when
 * `length` itself changes (see `getCellProps`' docblock for the cells()-in-the-
 * accessor trap that would remount on every keystroke and destroy focus).
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { PinInputBase, type PinInputBaseProps, type PinInputState } from './PinInputBase'

function mountPin(props: Partial<PinInputBaseProps> = {}) {
  let api!: PinInputState
  const n = (props.length as number | undefined) ?? 6

  // Copy DESCRIPTORS, never `{...props}` — a spread FIRES a getter-shaped
  // reactive prop and freezes it at its mount-time value, which is exactly how
  // the controlled-echo spec below first failed (the parent updated, the
  // primitive kept reading ''). `splitProps` preserves descriptors from here on.
  const vprops: Record<string, unknown> = {}
  Object.defineProperties(vprops, Object.getOwnPropertyDescriptors(props))
  vprops.children = (state: PinInputState) => {
    api = state
    return h(
      'div',
      { ...state.rootProps(), id: 'root' },
      ...Array.from({ length: n }, (_, i) => h('input', { ...state.getCellProps(i) })),
    )
  }

  const { container, unmount } = mountInBrowser(h(PinInputBase as never, vprops))
  return {
    container,
    unmount,
    state: () => api,
    root: () => container.querySelector('#root') as HTMLElement,
    cellAt: (i: number) => container.querySelectorAll('input')[i] as HTMLInputElement,
    cellValues: () =>
      Array.from(container.querySelectorAll('input')).map((el) => (el as HTMLInputElement).value),
  }
}

/** Simulate a keystroke: the browser mutates the field, THEN `input` fires. */
function typeInto(el: HTMLInputElement, text: string): void {
  el.value = text
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

function press(el: HTMLElement, key: string): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  el.dispatchEvent(ev)
  return ev
}

/** A REAL ClipboardEvent carrying a real DataTransfer — not a hand-faked object. */
function paste(el: HTMLElement, text: string): ClipboardEvent {
  const data = new DataTransfer()
  data.setData('text', text)
  const ev = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
  el.dispatchEvent(ev)
  return ev
}

describe('PinInputBase — structure + a11y', () => {
  it('renders `length` cells with per-cell labels, maxLength and one-time-code on the FIRST cell only', async () => {
    const { cellAt, container, unmount } = mountPin({ length: 4 })
    await flush()

    expect(container.querySelectorAll('input')).toHaveLength(4)
    expect(cellAt(0).getAttribute('aria-label')).toBe('Digit 1 of 4')
    expect(cellAt(3).getAttribute('aria-label')).toBe('Digit 4 of 4')
    expect(cellAt(0).maxLength).toBe(1)
    expect(cellAt(3).maxLength).toBe(1)

    // The OTP-autofill hook targets ONE field with the whole code.
    expect(cellAt(0).getAttribute('autocomplete')).toBe('one-time-code')
    expect(cellAt(1).getAttribute('autocomplete')).toBe('off')
    expect(cellAt(3).getAttribute('autocomplete')).toBe('off')
    unmount()
  })

  it('groups the cells and honours a custom cellLabel', async () => {
    const { root, cellAt, unmount } = mountPin({
      length: 3,
      cellLabel: (i, n) => `Character ${i + 1}/${n}`,
    })
    await flush()
    expect(root().getAttribute('role')).toBe('group')
    expect(cellAt(0).getAttribute('aria-label')).toBe('Character 1/3')
    unmount()
  })

  it('forwards `rest` (the class!) onto the container via rootProps', async () => {
    const { root, unmount } = mountPin({ class: 'x', 'data-testid': 'pin' })
    await flush()
    // A primitive that drops `rest` makes the wrapping component render UNSTYLED.
    expect(root().getAttribute('class')).toBe('x')
    expect(root().getAttribute('data-testid')).toBe('pin')
    unmount()
  })

  it('renders masked cells for type="password" and for mask', async () => {
    const pw = mountPin({ length: 2, type: 'password' })
    await flush()
    expect(pw.cellAt(0).type).toBe('password')
    pw.unmount()

    const masked = mountPin({ length: 2, mask: true, type: 'number' })
    await flush()
    expect(masked.cellAt(0).type).toBe('password')
    // Masking must not cost the numeric soft keyboard.
    expect(masked.cellAt(0).getAttribute('inputmode')).toBe('numeric')
    masked.unmount()
  })

  it('reflects disabled as a STRING aria value, never presence-only', async () => {
    const { cellAt, root, unmount } = mountPin({ length: 2, disabled: true })
    await flush()
    expect(cellAt(0).disabled).toBe(true)
    expect(cellAt(0).getAttribute('aria-disabled')).toBe('true')
    expect(root().getAttribute('data-disabled')).toBe('')
    unmount()
  })

  it('omits aria-disabled entirely when enabled', async () => {
    const { cellAt, root, unmount } = mountPin({ length: 2 })
    await flush()
    // `aria-disabled="false"` is noise; absent is the correct enabled state.
    expect(cellAt(0).getAttribute('aria-disabled')).toBeNull()
    expect(root().getAttribute('data-disabled')).toBeNull()
    unmount()
  })
})

describe('PinInputBase — typing + auto-advance', () => {
  it('auto-advances focus and accumulates value()', async () => {
    const { cellAt, state, cellValues, unmount } = mountPin({ length: 4 })
    await flush()

    cellAt(0).focus()
    typeInto(cellAt(0), '1')
    expect(document.activeElement).toBe(cellAt(1))
    expect(state().value()).toBe('1')

    typeInto(cellAt(1), '2')
    expect(document.activeElement).toBe(cellAt(2))
    expect(state().value()).toBe('12')
    expect(state().cells()).toEqual(['1', '2', '', ''])
    // The reactive per-cell binding drove the DOM — no manual sync in the test.
    expect(cellValues()).toEqual(['1', '2', '', ''])
    unmount()
  })

  it('does not advance past the last cell', async () => {
    const { cellAt, state, unmount } = mountPin({ length: 2 })
    await flush()
    typeInto(cellAt(0), '1')
    typeInto(cellAt(1), '2')
    expect(document.activeElement).toBe(cellAt(1))
    expect(state().value()).toBe('12')
    unmount()
  })

  it('tracks focusedIndex', async () => {
    const { cellAt, state, unmount } = mountPin({ length: 3 })
    await flush()
    cellAt(2).focus()
    expect(state().focusedIndex()).toBe(2)
    unmount()
  })

  it('clear() empties every cell', async () => {
    const { cellAt, state, cellValues, unmount } = mountPin({ length: 3 })
    await flush()
    typeInto(cellAt(0), '1')
    typeInto(cellAt(1), '2')
    expect(state().value()).toBe('12')

    state().clear()
    await flush()
    expect(state().value()).toBe('')
    expect(cellValues()).toEqual(['', '', ''])
    unmount()
  })
})

describe('PinInputBase — backspace', () => {
  it('clears a FILLED cell in place and keeps focus', async () => {
    const { cellAt, state, cellValues, unmount } = mountPin({ length: 3 })
    await flush()
    typeInto(cellAt(0), '1')
    typeInto(cellAt(1), '2')

    cellAt(1).focus()
    press(cellAt(1), 'Backspace')
    expect(state().cells()).toEqual(['1', '', ''])
    expect(cellValues()).toEqual(['1', '', ''])
    expect(document.activeElement).toBe(cellAt(1))
    unmount()
  })

  it('on an EMPTY cell moves back AND clears the previous one', async () => {
    const { cellAt, state, cellValues, unmount } = mountPin({ length: 3 })
    await flush()
    typeInto(cellAt(0), '1')
    typeInto(cellAt(1), '2')

    // Focus lands on cell 2 (empty) after auto-advance.
    expect(document.activeElement).toBe(cellAt(2))
    press(cellAt(2), 'Backspace')
    expect(document.activeElement).toBe(cellAt(1))
    expect(state().cells()).toEqual(['1', '', ''])
    expect(cellValues()).toEqual(['1', '', ''])
    unmount()
  })

  it('is a no-op on an empty FIRST cell', async () => {
    const { cellAt, state, unmount } = mountPin({ length: 3 })
    await flush()
    cellAt(0).focus()
    press(cellAt(0), 'Backspace')
    expect(state().value()).toBe('')
    expect(document.activeElement).toBe(cellAt(0))
    unmount()
  })

  it('preventDefaults so the browser does not double-delete', async () => {
    const { cellAt, unmount } = mountPin({ length: 3 })
    await flush()
    typeInto(cellAt(0), '1')
    const ev = press(cellAt(0), 'Backspace')
    expect(ev.defaultPrevented).toBe(true)
    unmount()
  })

  it('walks the pin out right-to-left over repeated presses', async () => {
    const { cellAt, state, unmount } = mountPin({ length: 3 })
    await flush()
    typeInto(cellAt(0), '1')
    typeInto(cellAt(1), '2')
    typeInto(cellAt(2), '3')

    // Focus stays on the last cell (no advance past the end).
    press(cellAt(2), 'Backspace') // filled → clear in place
    expect(state().cells()).toEqual(['1', '2', ''])
    press(cellAt(2), 'Backspace') // empty → back + clear
    expect(state().cells()).toEqual(['1', '', ''])
    expect(document.activeElement).toBe(cellAt(1))
    press(cellAt(1), 'Backspace')
    expect(state().cells()).toEqual(['', '', ''])
    expect(document.activeElement).toBe(cellAt(0))
    unmount()
  })
})

describe('PinInputBase — keyboard navigation', () => {
  it('ArrowLeft / ArrowRight move between cells', async () => {
    const { cellAt, unmount } = mountPin({ length: 4 })
    await flush()
    cellAt(1).focus()
    press(cellAt(1), 'ArrowRight')
    expect(document.activeElement).toBe(cellAt(2))
    press(cellAt(2), 'ArrowLeft')
    expect(document.activeElement).toBe(cellAt(1))
    unmount()
  })

  it('CLAMPS at the edges rather than wrapping', async () => {
    const { cellAt, unmount } = mountPin({ length: 3 })
    await flush()
    cellAt(0).focus()
    press(cellAt(0), 'ArrowLeft')
    // A tablist would wrap to the last cell; a pin must not.
    expect(document.activeElement).toBe(cellAt(0))

    cellAt(2).focus()
    press(cellAt(2), 'ArrowRight')
    expect(document.activeElement).toBe(cellAt(2))
    unmount()
  })

  it('Home / End jump to the first / last cell', async () => {
    const { cellAt, unmount } = mountPin({ length: 5 })
    await flush()
    cellAt(2).focus()
    press(cellAt(2), 'End')
    expect(document.activeElement).toBe(cellAt(4))
    press(cellAt(4), 'Home')
    expect(document.activeElement).toBe(cellAt(0))
    unmount()
  })

  it('preventDefaults navigation so the caret does not fight the focus move', async () => {
    const { cellAt, unmount } = mountPin({ length: 3 })
    await flush()
    cellAt(1).focus()
    expect(press(cellAt(1), 'ArrowLeft').defaultPrevented).toBe(true)
    expect(press(cellAt(0), 'ArrowRight').defaultPrevented).toBe(true)
    expect(press(cellAt(1), 'Home').defaultPrevented).toBe(true)
    expect(press(cellAt(0), 'End').defaultPrevented).toBe(true)
    unmount()
  })
})

describe('PinInputBase — paste-distribute', () => {
  it('distributes a full paste across every cell and focuses the last filled', async () => {
    const { cellAt, state, cellValues, unmount } = mountPin({ length: 6 })
    await flush()

    cellAt(0).focus()
    const ev = paste(cellAt(0), '123456')

    // The handler must own the insert — otherwise the browser ALSO drops the
    // whole string into cell 0.
    expect(ev.defaultPrevented).toBe(true)
    expect(state().value()).toBe('123456')
    expect(cellValues()).toEqual(['1', '2', '3', '4', '5', '6'])
    expect(document.activeElement).toBe(cellAt(5))
    unmount()
  })

  it('distributes from the pasted-into cell, not always from the start', async () => {
    const { cellAt, state, cellValues, unmount } = mountPin({ length: 6 })
    await flush()
    paste(cellAt(2), '99')
    expect(state().cells()).toEqual(['', '', '9', '9', '', ''])
    expect(cellValues()).toEqual(['', '', '9', '9', '', ''])
    // Ran out early → focus the next empty cell.
    expect(document.activeElement).toBe(cellAt(4))
    unmount()
  })

  it('fills only what a PARTIAL paste has', async () => {
    const { cellAt, state, cellValues, unmount } = mountPin({ length: 6 })
    await flush()
    paste(cellAt(0), '123')
    expect(state().value()).toBe('123')
    expect(cellValues()).toEqual(['1', '2', '3', '', '', ''])
    expect(document.activeElement).toBe(cellAt(3))
    unmount()
  })

  it('drops the overflow when the paste is longer than the remaining cells', async () => {
    const { cellAt, state, unmount } = mountPin({ length: 4 })
    await flush()
    paste(cellAt(2), '123456')
    expect(state().cells()).toEqual(['', '', '1', '2'])
    expect(document.activeElement).toBe(cellAt(3))
    unmount()
  })

  it('strips whitespace from a pasted code', async () => {
    const { cellAt, state, unmount } = mountPin({ length: 6 })
    await flush()
    paste(cellAt(0), '123 456')
    expect(state().value()).toBe('123456')
    unmount()
  })

  it('filters a paste to digits under type="number"', async () => {
    const { cellAt, state, unmount } = mountPin({ length: 4, type: 'number' })
    await flush()
    paste(cellAt(0), 'a1b2')
    expect(state().value()).toBe('12')
    unmount()
  })

  it('ignores an empty paste', async () => {
    const { cellAt, state, unmount } = mountPin({ length: 4 })
    await flush()
    typeInto(cellAt(0), '7')
    paste(cellAt(1), '')
    expect(state().value()).toBe('7')
    unmount()
  })

  it('distributes a multi-char INPUT (platform OTP autofill drops the whole code in one cell)', async () => {
    const { cellAt, state, cellValues, unmount } = mountPin({ length: 6 })
    await flush()
    // Autofill sets the field's value directly rather than firing a paste.
    typeInto(cellAt(0), '123456')
    expect(state().value()).toBe('123456')
    expect(cellValues()).toEqual(['1', '2', '3', '4', '5', '6'])
    unmount()
  })
})

describe('PinInputBase — type="number"', () => {
  it('rejects a non-digit and re-syncs the DOM', async () => {
    const { cellAt, state, unmount } = mountPin({ length: 4, type: 'number' })
    await flush()
    typeInto(cellAt(0), 'a')

    expect(state().value()).toBe('')
    // The model never changed, so the reactive binding cannot fire — the
    // handler must undo the browser's edit by hand or 'a' stays visible.
    expect(cellAt(0).value).toBe('')
    // A rejected keystroke must not advance.
    expect(document.activeElement).not.toBe(cellAt(1))
    unmount()
  })

  it('accepts digits and asks for the numeric keyboard', async () => {
    const { cellAt, state, unmount } = mountPin({ length: 4, type: 'number' })
    await flush()
    expect(cellAt(0).getAttribute('inputmode')).toBe('numeric')
    // NOT type="number" — that type ignores maxLength entirely.
    expect(cellAt(0).type).toBe('text')
    typeInto(cellAt(0), '7')
    expect(state().value()).toBe('7')
    unmount()
  })

  it('accepts a letter under the default type="text"', async () => {
    const { cellAt, state, unmount } = mountPin({ length: 4 })
    await flush()
    typeInto(cellAt(0), 'a')
    expect(state().value()).toBe('a')
    unmount()
  })
})

describe('PinInputBase — onComplete', () => {
  it('fires ONCE with the full value, and not again while still complete', async () => {
    const calls: string[] = []
    const { cellAt, unmount } = mountPin({ length: 3, onComplete: (v) => calls.push(v) })
    await flush()

    typeInto(cellAt(0), '1')
    typeInto(cellAt(1), '2')
    expect(calls).toEqual([])
    typeInto(cellAt(2), '3')
    expect(calls).toEqual(['123'])

    // Editing an already-complete pin must not re-announce completion.
    typeInto(cellAt(2), '9')
    expect(calls).toEqual(['123'])
    unmount()
  })

  it('fires on a completing PASTE', async () => {
    const calls: string[] = []
    const { cellAt, unmount } = mountPin({ length: 4, onComplete: (v) => calls.push(v) })
    await flush()
    paste(cellAt(0), '4242')
    expect(calls).toEqual(['4242'])
    unmount()
  })

  it('re-arms after the pin goes incomplete again', async () => {
    const calls: string[] = []
    const { cellAt, unmount } = mountPin({ length: 2, onComplete: (v) => calls.push(v) })
    await flush()
    typeInto(cellAt(0), '1')
    typeInto(cellAt(1), '2')
    expect(calls).toEqual(['12'])

    press(cellAt(1), 'Backspace') // → incomplete
    typeInto(cellAt(1), '5') // → complete again
    expect(calls).toEqual(['12', '15'])
    unmount()
  })

  it('does not fire when a hole keeps the pin incomplete', async () => {
    const calls: string[] = []
    const { cellAt, unmount } = mountPin({ length: 3, onComplete: (v) => calls.push(v) })
    await flush()
    typeInto(cellAt(0), '1')
    typeInto(cellAt(1), '2')
    typeInto(cellAt(2), '3')
    expect(calls).toEqual(['123'])

    // Clear the MIDDLE cell: 2 of 3 filled, so the pin is not complete...
    press(cellAt(1), 'Backspace')
    typeInto(cellAt(1), '9')
    // ...and re-filling it completes again exactly once more.
    expect(calls).toEqual(['123', '193'])
    unmount()
  })
})

describe('PinInputBase — controlled', () => {
  it('REPORTS through onChange without fighting a parent that ignores it', async () => {
    const calls: string[] = []
    const { cellAt, state, cellValues, unmount } = mountPin({
      length: 4,
      value: '12',
      onChange: (v) => calls.push(v),
    })
    await flush()
    expect(cellValues()).toEqual(['1', '2', '', ''])

    typeInto(cellAt(2), '3')
    // Reported...
    expect(calls).toEqual(['123'])
    // ...but the parent's value is authoritative and did not move.
    expect(state().value()).toBe('12')
    expect(cellValues()).toEqual(['1', '2', '', ''])
    unmount()
  })

  it('follows a parent that echoes the change back', async () => {
    const parent = signal('')
    const props: Record<string, unknown> = {
      length: 4,
      onChange: (v: string) => parent.set(v),
    }
    // Mirror what the compiler emits for `value={sig()}`: `makeReactiveProps`
    // turns an `_rp` thunk into a GETTER, which splitProps preserves — so the
    // controlled read is live.
    Object.defineProperty(props, 'value', {
      get: () => parent(),
      enumerable: true,
      configurable: true,
    })

    const { cellAt, state, cellValues, unmount } = mountPin(props)
    await flush()

    typeInto(cellAt(0), '7')
    await flush()
    expect(parent()).toBe('7')
    expect(state().value()).toBe('7')
    expect(cellValues()).toEqual(['7', '', '', ''])

    // An EXTERNAL change (not one we emitted) re-derives the cells.
    parent.set('4242')
    await flush()
    expect(state().cells()).toEqual(['4', '2', '4', '2'])
    expect(cellValues()).toEqual(['4', '2', '4', '2'])
    unmount()
  })

  it('renders a controlled value longer than `length` truncated to the cells', async () => {
    const { cellValues, state, unmount } = mountPin({ length: 3, value: '123456' })
    await flush()
    expect(cellValues()).toEqual(['1', '2', '3'])
    expect(state().cells()).toEqual(['1', '2', '3'])
    unmount()
  })
})

describe('PinInputBase — holes', () => {
  it('keeps a cleared MIDDLE cell empty instead of shifting the tail left', async () => {
    const { cellAt, state, cellValues, unmount } = mountPin({ length: 3 })
    await flush()
    typeInto(cellAt(0), '1')
    typeInto(cellAt(1), '2')
    typeInto(cellAt(2), '3')

    press(cellAt(1), 'Backspace')
    // The joined value collapses (it must — it is a string)...
    expect(state().value()).toBe('13')
    // ...but the DISPLAY must not shift: the '3' stays in cell 2. A naive
    // value[i] model would show ['1','3',''] and the 3 would jump left.
    expect(state().cells()).toEqual(['1', '', '3'])
    expect(cellValues()).toEqual(['1', '', '3'])
    unmount()
  })
})

describe('PinInputBase — the static-render contract', () => {
  it('keeps cell identity + focus across a keystroke when rendered statically', async () => {
    // The counterpart to `getCellProps`' documented TRAP: rendering cells inside
    // `{() => state.cells().map(...)}` subscribes the accessor to every
    // keystroke, remounting the list and dropping focus to <body> (measured).
    // Rendering statically — the shape every spec here uses — must NOT: the
    // per-cell accessors carry the state instead.
    const { cellAt, unmount } = mountPin({ length: 4 })
    await flush()
    const before = cellAt(0)
    before.focus()

    typeInto(before, '1')
    await flush()

    // Same element, not a remount...
    expect(cellAt(0)).toBe(before)
    // ...so auto-advance survives.
    expect(document.activeElement).toBe(cellAt(1))
    expect(document.activeElement).not.toBe(document.body)
    unmount()
  })
})

describe('PinInputBase — disabled', () => {
  it('ignores typing, backspace and paste', async () => {
    const calls: string[] = []
    const { cellAt, state, unmount } = mountPin({
      length: 4,
      defaultValue: '12',
      disabled: true,
      onChange: (v) => calls.push(v),
    })
    await flush()

    typeInto(cellAt(2), '3')
    press(cellAt(0), 'Backspace')
    paste(cellAt(0), '9999')

    expect(calls).toEqual([])
    expect(state().value()).toBe('12')
    unmount()
  })
})
