/**
 * `ComboboxBase` when there is nothing to navigate.
 *
 * A combobox filtered to zero matches is not an edge case — it is what the
 * user sees for a moment on the way to almost every search. Every keyboard
 * branch therefore has to answer "no options" without opening an empty
 * listbox or pointing `aria-activedescendant` at an option that does not
 * exist.
 *
 * The second is the one that actually breaks assistive tech: an
 * `aria-activedescendant` naming a missing id leaves a screen reader with
 * nothing to announce, so arrow keys become silent. The user hears the
 * combobox stop responding, with the listbox visibly still there.
 *
 * Opening an empty listbox is the visible half — a bordered, empty popup
 * under the input that no key can dismiss except Escape.
 */
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { ComboboxBase, type ComboboxState } from './index'

const OPTIONS = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana' },
]

const mountCombobox = (props: Record<string, unknown> = {}): ComboboxState => {
  let captured: ComboboxState | undefined
  mountInBrowser(
    h(ComboboxBase as never, {
      options: OPTIONS,
      ...props,
      children: (s: ComboboxState) => {
        captured = s
        return h('div', null)
      },
    }),
  )
  if (!captured) throw new Error('render child did not run')
  return captured
}

const key = (k: string): KeyboardEvent =>
  ({ key: k, preventDefault: () => {} }) as unknown as KeyboardEvent

/**
 * `onKeyDown` sits on the STATE, not on `inputProps()` — the consumer wires
 * it onto the input themselves. Checked against the interface rather than
 * assumed by analogy with the other primitives' props helpers.
 */
const press = (s: ComboboxState, k: string): void => {
  s.onKeyDown(key(k))
}

const val = (v: unknown): unknown => (typeof v === 'function' ? (v as () => unknown)() : v)

describe('keys that must LAND on an option refuse when there is none', () => {
  // The asymmetry below is principled rather than an oversight, and worth
  // stating because it looks like an inconsistency at first glance.
  //
  // `ArrowUp` / `Home` / `End` each promise to make a SPECIFIC option
  // active — the last, the first, the last. With no options there is
  // nothing to make active, and the index they would compute is `-1`, so
  // they decline outright rather than opening a listbox whose
  // `aria-activedescendant` points nowhere.
  //
  // `ArrowDown` promises only "show me the list". Opening an empty listbox
  // is the correct answer there: it is how the consumer's "No results"
  // state gets rendered, and APG treats ArrowDown-opens as the canonical
  // gesture. It notably does NOT set a highlight when it opens.
  for (const k of ['ArrowUp', 'Home', 'End']) {
    it(`${k} is a no-op with no options`, () => {
      const s = mountCombobox({ options: [] })
      press(s, k)
      expect(s.isOpen(), `${k} cannot make an option active, so it declines`).toBe(false)
    })
  }

  it('ArrowDown DOES open an empty listbox, so the empty state can render', () => {
    const s = mountCombobox({ options: [] })
    press(s, 'ArrowDown')
    expect(s.isOpen(), 'the "show me the list" gesture still works').toBe(true)
    expect(
      val(s.inputProps()['aria-activedescendant']),
      'but nothing is announced as active',
    ).toBeUndefined()
  })

  it('the same keys DO open a populated one', () => {
    // The control. Without it, every spec above passes against a combobox
    // that never opens at all.
    for (const k of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
      const s = mountCombobox()
      press(s, k)
      expect(s.isOpen(), `${k} should open`).toBe(true)
    }
  })

  it('Home and End reach the ends when open', () => {
    const s = mountCombobox()
    press(s, 'End')
    expect(s.highlightedIndex()).toBe(OPTIONS.length - 1)
    press(s, 'Home')
    expect(s.highlightedIndex()).toBe(0)
  })
})

describe('aria-activedescendant never names a missing option', () => {
  it('is absent while closed', () => {
    // Pointing at an option in a listbox that is not rendered leaves the
    // screen reader with nothing to announce.
    expect(val(mountCombobox().inputProps()['aria-activedescendant'])).toBeUndefined()
  })

  it('is absent when open with no options', () => {
    const s = mountCombobox({ options: [] })
    press(s, 'ArrowDown')
    expect(val(s.inputProps()['aria-activedescendant'])).toBeUndefined()
  })

  it('names the highlighted option when there IS one', () => {
    // The control.
    const s = mountCombobox()
    press(s, 'ArrowDown')
    expect(val(s.inputProps()['aria-activedescendant'])).toBeTruthy()
  })

  it('is absent when the filter empties the list', () => {
    // The path a user actually takes: open, then type until nothing
    // matches. The highlighted index survives the filter, so this is where
    // a stale id would surface.
    const s = mountCombobox()
    press(s, 'ArrowDown')
    expect(val(s.inputProps()['aria-activedescendant'])).toBeTruthy()

    s.setQuery('zzzzz')
    expect(val(s.inputProps()['aria-activedescendant']), 'no match, no target').toBeUndefined()
  })
})

describe('multi-select seeds its array on the FIRST selection', () => {
  it('selects from the uncontrolled initial state', () => {
    // `Array.isArray(selected()) ? … : []` — the default is not an array
    // yet, so the first selection is the arm that has to seed one. Get it
    // wrong and the first click on a multi-combobox does nothing.
    const s = mountCombobox({ multiple: true })
    s.select('a')
    expect(s.selected()).toEqual(['a'])
  })

  it('adds a second, and removes on re-select', () => {
    const s = mountCombobox({ multiple: true })
    s.select('a')
    s.select('b')
    expect(s.selected()).toEqual(['a', 'b'])

    s.select('a')
    expect(s.selected(), 're-selecting toggles off').toEqual(['b'])
  })
})

describe('Tab and Escape close without selecting', () => {
  it('Tab closes an open listbox', () => {
    // Tab moves on; leaving the listbox open would float it over whatever
    // the user tabbed to.
    const s = mountCombobox()
    press(s, 'ArrowDown')
    press(s, 'Tab')
    expect(s.isOpen()).toBe(false)
  })

  it('Tab on a CLOSED combobox is a no-op, not a re-open', () => {
    const s = mountCombobox()
    press(s, 'Tab')
    expect(s.isOpen()).toBe(false)
  })

  it('Escape closes and clears the query', () => {
    // Leaving the query behind means re-opening shows a filtered list the
    // user did not ask for.
    const s = mountCombobox()
    press(s, 'ArrowDown')
    s.setQuery('app')
    press(s, 'Escape')

    expect(s.isOpen()).toBe(false)
    expect(s.query()).toBe('')
  })
})
