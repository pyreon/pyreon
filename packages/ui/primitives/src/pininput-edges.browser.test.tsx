/**
 * `PinInputBase` against the inputs an OTP field actually receives.
 *
 * The interesting cases here are not typing one digit per cell — they are
 * the ones where the browser and the user disagree with the component:
 *
 *   * **Paste.** The component calls `preventDefault` and distributes the
 *     string itself, because otherwise the browser ALSO drops the whole
 *     pasted value into the single cell under the caret. Pasting a code is
 *     how most people fill an OTP field, so this is the primary path, not
 *     an edge — and a clipboard event can arrive with no data at all
 *     (an image, a drag, a synthetic event), which must not throw.
 *   * **An emptied field is a DELETION, not a rejected character.** A user
 *     selecting a cell and pressing Delete produces `value === ''`, and the
 *     comment notes the two are only distinguishable at that point. Treat
 *     it as a rejection and the digit stays on screen.
 *   * **A bogus `length`.** `length={0}` or a fractional value from a
 *     computed prop would otherwise produce a field with no cells, or a
 *     `cells()` array whose length is not an integer.
 *
 * `Home` / `End` complete the navigation set; `End` in particular has to
 * derive the last index from the SAME length fallback, or a bogus prop
 * sends focus to index -1.
 */
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { PinInputBase, type PinInputState } from './index'

const mountPin = (props: Record<string, unknown> = {}): PinInputState => {
  let captured: PinInputState | undefined
  mountInBrowser(
    h(PinInputBase as never, {
      ...props,
      children: (s: PinInputState) => {
        captured = s
        return h('div', null)
      },
    }),
  )
  if (!captured) throw new Error('render child did not run')
  return captured
}

/** A paste event carrying `text`, or carrying nothing at all. */
const pasteEvent = (text: string | null): ClipboardEvent =>
  ({
    preventDefault: () => {},
    clipboardData: text === null ? null : { getData: () => text },
  }) as unknown as ClipboardEvent

const keyEvent = (key: string): KeyboardEvent =>
  ({ key, preventDefault: () => {} }) as unknown as KeyboardEvent

const cellProps = (s: PinInputState, i: number): Record<string, unknown> => s.getCellProps(i)
const val = (v: unknown): unknown => (typeof v === 'function' ? (v as () => unknown)() : v)

describe('length falls back rather than producing a broken field', () => {
  it('uses the default for a length of 0', () => {
    // A field with no cells renders nothing and cannot be typed into —
    // worse than ignoring the prop, because there is no error either.
    expect(mountPin({ length: 0 }).cells().length).toBeGreaterThan(0)
  })

  it('uses the default for a negative or fractional length', () => {
    // A fractional length comes from a computed prop and would make
    // `cells()` a non-integer length.
    expect(mountPin({ length: -3 }).cells().length).toBeGreaterThan(0)
    expect(Number.isInteger(mountPin({ length: 4.5 }).cells().length)).toBe(true)
  })

  it('respects a VALID length — the fallback is not unconditional', () => {
    // The control.
    expect(mountPin({ length: 8 }).cells()).toHaveLength(8)
  })
})

describe('paste distributes across cells, and survives an empty clipboard', () => {
  it('spreads a pasted code over the cells from the paste target', () => {
    // The primary way an OTP field gets filled.
    const s = mountPin({ length: 6 })
    ;(cellProps(s, 0).onPaste as (e: ClipboardEvent) => void)(pasteEvent('123456'))

    expect(s.value()).toBe('123456')
    expect(s.cells()).toEqual(['1', '2', '3', '4', '5', '6'])
  })

  it('starts at the pasted-into cell, not always at zero', () => {
    const s = mountPin({ length: 6 })
    ;(cellProps(s, 2).onPaste as (e: ClipboardEvent) => void)(pasteEvent('99'))

    expect(s.cells()[2]).toBe('9')
    expect(s.cells()[3]).toBe('9')
    expect(s.cells()[0], 'earlier cells untouched').toBe('')
  })

  it('a clipboard with NO data is a no-op, not a throw', () => {
    // A dragged image or a synthetic event. `clipboardData` can be null,
    // and an unguarded `.getData` takes the page down on a stray paste.
    const s = mountPin({ length: 4 })
    expect(() => {
      ;(cellProps(s, 0).onPaste as (e: ClipboardEvent) => void)(pasteEvent(null))
    }).not.toThrow()
    expect(s.value()).toBe('')
  })

  it('a disabled field ignores paste entirely', () => {
    const s = mountPin({ length: 4, disabled: true })
    ;(cellProps(s, 0).onPaste as (e: ClipboardEvent) => void)(pasteEvent('1234'))
    expect(s.value()).toBe('')
  })

  it('drops characters past the end rather than overflowing', () => {
    const s = mountPin({ length: 4 })
    ;(cellProps(s, 0).onPaste as (e: ClipboardEvent) => void)(pasteEvent('123456789'))
    expect(s.cells()).toHaveLength(4)
    expect(s.value()).toBe('1234')
  })
})

describe('Home and End reach the ends of the field', () => {
  it('End focuses the LAST cell, derived from the same length fallback', () => {
    // Deriving the last index independently would send focus to -1 for a
    // bogus length — a field that cannot be navigated with one keypress.
    const s = mountPin({ length: 6 })
    ;(cellProps(s, 0).onKeyDown as (e: KeyboardEvent) => void)(keyEvent('End'))
    expect(s.focusedIndex()).toBe(5)
  })

  it('Home focuses the first cell', () => {
    const s = mountPin({ length: 6 })
    ;(cellProps(s, 3).onKeyDown as (e: KeyboardEvent) => void)(keyEvent('Home'))
    expect(s.focusedIndex()).toBe(0)
  })

  it('End respects a fallen-back length', () => {
    const s = mountPin({ length: 0 })
    ;(cellProps(s, 0).onKeyDown as (e: KeyboardEvent) => void)(keyEvent('End'))
    expect(s.focusedIndex(), 'never -1').toBe(s.cells().length - 1)
  })
})

describe('cell props stay within bounds', () => {
  it('an out-of-range index yields an empty value rather than undefined', () => {
    // Render callbacks can outlive a `length` change by a tick, and
    // `value: undefined` on an input is a React-style controlled/uncontrolled
    // switch — here it would blank a cell the user had typed into.
    const s = mountPin({ length: 4 })
    expect(val(cellProps(s, 99).value)).toBe('')
  })

  it('every cell reports its own value', () => {
    const s = mountPin({ length: 4 })
    ;(cellProps(s, 0).onPaste as (e: ClipboardEvent) => void)(pasteEvent('12'))
    expect(val(cellProps(s, 0).value)).toBe('1')
    expect(val(cellProps(s, 1).value)).toBe('2')
    expect(val(cellProps(s, 2).value)).toBe('')
  })

  it('clear() empties every cell without moving focus', () => {
    // Documented: "deliberately does NOT move focus — a state API should
    // not steal it". A clear that focused cell 0 would yank focus out of
    // whatever the user was doing.
    const s = mountPin({ length: 4 })
    ;(cellProps(s, 0).onPaste as (e: ClipboardEvent) => void)(pasteEvent('1234'))
    ;(cellProps(s, 2).onKeyDown as (e: KeyboardEvent) => void)(keyEvent('Home'))
    const before = s.focusedIndex()

    s.clear()
    expect(s.value()).toBe('')
    expect(s.focusedIndex(), 'focus must not move').toBe(before)
  })
})
