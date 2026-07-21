/**
 * State-machine coverage for `ComboboxBase` — the headless combobox primitive.
 *
 * ComboboxBase exposes a `ComboboxState` object (select / remove / clear /
 * filtering / open-close / keyboard nav / props helpers) to its render-function
 * child. The existing specs cover inputProps live-ARIA, Home/End, and
 * typeahead; this suite exercises the rest of the machine DIRECTLY through the
 * state object — pure signal logic that runs identically in happy-dom, so it
 * lifts the gated (node) coverage where the previous 54% left off.
 */
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { ComboboxBase, type ComboboxOption, type ComboboxState } from './index'

const OPTS: ComboboxOption[] = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana' },
  { value: 'c', label: 'Cherry', disabled: true },
]

/** Mount ComboboxBase and capture the state object handed to its render child. */
const mountCombo = (props: Record<string, unknown> = {}): ComboboxState => {
  let captured: ComboboxState | undefined
  mountInBrowser(
    h(ComboboxBase as never, {
      options: OPTS,
      ...props,
      children: (s: ComboboxState) => {
        captured = s
        return h('div')
      },
    }),
  )
  if (!captured) throw new Error('render child did not run')
  return captured
}

const kd = (key: string, extra: KeyboardEventInit = {}) =>
  new KeyboardEvent('keydown', { key, cancelable: true, ...extra })

describe('ComboboxBase — filtering', () => {
  it('empty query returns all options; a query filters case-insensitively by label', () => {
    const s = mountCombo()
    expect(s.filtered().map((o) => o.value)).toEqual(['a', 'b', 'c'])
    s.setQuery('ban')
    expect(s.filtered().map((o) => o.value)).toEqual(['b'])
    s.setQuery('E') // matches Apple + Cherry (case-insensitive substring)
    expect(s.filtered().map((o) => o.value)).toEqual(['a', 'c'])
  })

  it('setQuery opens the dropdown and resets the highlight to 0', () => {
    const s = mountCombo()
    expect(s.isOpen()).toBe(false)
    s.onKeyDown(kd('End')) // move highlight off 0 first
    expect(s.highlightedIndex()).toBe(2)
    s.setQuery('a')
    expect(s.isOpen()).toBe(true)
    expect(s.highlightedIndex()).toBe(0)
  })
})

describe('ComboboxBase — single select', () => {
  it('select sets the value, closes, and sets the query to the option label; onChange fires', () => {
    const calls: (string | string[])[] = []
    const s = mountCombo({ onChange: (v: string | string[]) => calls.push(v) })
    s.open()
    s.select('b')
    expect(s.selected()).toBe('b')
    expect(s.isOpen()).toBe(false)
    expect(s.query()).toBe('Banana')
    expect(calls).toEqual(['b'])
  })

  it('selecting a disabled option is a no-op', () => {
    const calls: (string | string[])[] = []
    const s = mountCombo({ onChange: (v: string | string[]) => calls.push(v) })
    s.select('c') // Cherry is disabled
    expect(s.selected()).toBe('')
    expect(calls).toEqual([])
  })

  it('a disabled combobox never selects', () => {
    const calls: (string | string[])[] = []
    const s = mountCombo({ disabled: true, onChange: (v: string | string[]) => calls.push(v) })
    s.select('a')
    expect(s.selected()).toBe('')
    expect(calls).toEqual([])
  })

  it('isSelected + getLabel reflect the current selection', () => {
    const s = mountCombo({ defaultValue: 'a' })
    expect(s.isSelected('a')).toBe(true)
    expect(s.isSelected('b')).toBe(false)
    expect(s.getLabel('b')).toBe('Banana')
    expect(s.getLabel('unknown')).toBe('unknown') // falls back to the raw value
  })

  it('clear resets selection + query', () => {
    const s = mountCombo({ defaultValue: 'a' })
    s.setQuery('App')
    s.clear()
    expect(s.selected()).toBe('')
    expect(s.query()).toBe('')
  })
})

describe('ComboboxBase — multiple select', () => {
  it('select toggles membership; remove drops one; clear empties', () => {
    const s = mountCombo({ multiple: true })
    expect(s.selected()).toEqual([])
    s.select('a')
    s.select('b')
    expect(s.selected()).toEqual(['a', 'b'])
    expect(s.isSelected('a')).toBe(true)
    s.select('a') // toggle off
    expect(s.selected()).toEqual(['b'])
    s.remove('b')
    expect(s.selected()).toEqual([])
    s.select('a')
    s.clear()
    expect(s.selected()).toEqual([])
  })

  it('remove is a no-op in single-select mode', () => {
    const s = mountCombo({ defaultValue: 'a' })
    s.remove('a')
    expect(s.selected()).toBe('a')
  })

  it('multi-select stays open on select (no close/query-set)', () => {
    const s = mountCombo({ multiple: true })
    s.open()
    s.select('a')
    expect(s.isOpen()).toBe(true)
    expect(s.query()).toBe('')
  })
})

describe('ComboboxBase — open/close/toggle', () => {
  it('open, close (clears query), toggle', () => {
    const s = mountCombo()
    s.open()
    expect(s.isOpen()).toBe(true)
    s.setQuery('x')
    s.close()
    expect(s.isOpen()).toBe(false)
    expect(s.query()).toBe('')
    s.toggle()
    expect(s.isOpen()).toBe(true)
    s.toggle()
    expect(s.isOpen()).toBe(false)
  })
})

describe('ComboboxBase — keyboard (Arrow/Enter/Escape/Tab)', () => {
  it('ArrowDown opens a closed listbox, then moves + clamps the highlight', () => {
    const s = mountCombo()
    s.onKeyDown(kd('ArrowDown'))
    expect(s.isOpen()).toBe(true)
    expect(s.highlightedIndex()).toBe(0)
    s.onKeyDown(kd('ArrowDown'))
    expect(s.highlightedIndex()).toBe(1)
    s.onKeyDown(kd('ArrowDown'))
    s.onKeyDown(kd('ArrowDown')) // clamp at last (2)
    expect(s.highlightedIndex()).toBe(2)
  })

  it('ArrowUp opens a closed listbox with the LAST option active, then moves + clamps', () => {
    const s = mountCombo()
    s.onKeyDown(kd('ArrowUp'))
    expect(s.isOpen()).toBe(true)
    expect(s.highlightedIndex()).toBe(2)
    s.onKeyDown(kd('ArrowUp'))
    expect(s.highlightedIndex()).toBe(1)
    s.onKeyDown(kd('ArrowUp'))
    s.onKeyDown(kd('ArrowUp')) // clamp at 0
    expect(s.highlightedIndex()).toBe(0)
  })

  it('Enter selects the highlighted option when open, else opens', () => {
    const calls: (string | string[])[] = []
    const s = mountCombo({ onChange: (v: string | string[]) => calls.push(v) })
    s.onKeyDown(kd('Enter')) // closed → opens
    expect(s.isOpen()).toBe(true)
    s.onKeyDown(kd('ArrowDown')) // highlight → 1 (Banana)
    s.onKeyDown(kd('Enter'))
    expect(calls).toEqual(['b'])
  })

  it('Escape closes and clears the query; Tab closes', () => {
    const s = mountCombo()
    s.open()
    s.setQuery('x')
    s.onKeyDown(kd('Escape'))
    expect(s.isOpen()).toBe(false)
    expect(s.query()).toBe('')
    s.open()
    s.onKeyDown(kd('Tab'))
    expect(s.isOpen()).toBe(false)
  })
})

describe('ComboboxBase — ARIA props helpers', () => {
  it('inputProps: combobox role, live aria-expanded, aria-controls, aria-activedescendant', () => {
    const s = mountCombo()
    const p = s.inputProps()
    expect(p.role).toBe('combobox')
    expect(p['aria-autocomplete']).toBe('list')
    // aria-expanded is a live getter
    expect(p['aria-expanded']).toBe('false')
    expect(p['aria-activedescendant']).toBeUndefined()
    expect(String(p['aria-controls'])).toMatch(/-listbox$/)
    s.onKeyDown(kd('ArrowDown')) // opens a closed listbox with the first option active (index 0)
    expect(p['aria-expanded']).toBe('true')
    expect(p['aria-activedescendant']).toMatch(/-option-0$/)
  })

  it('listboxProps: role=listbox + aria-multiselectable only when multiple', () => {
    expect(mountCombo().listboxProps()['aria-multiselectable']).toBeUndefined()
    const multi = mountCombo({ multiple: true }).listboxProps()
    expect(multi.role).toBe('listbox')
    expect(multi['aria-multiselectable']).toBe('true')
  })

  it('getOptionProps: role=option, aria-selected string, aria-disabled for disabled options', () => {
    const s = mountCombo({ defaultValue: 'a' })
    const pa = s.getOptionProps('a', 0)
    expect(pa.role).toBe('option')
    expect(pa['aria-selected']).toBe('true')
    expect(pa['aria-disabled']).toBeUndefined()
    expect(s.getOptionProps('b', 1)['aria-selected']).toBe('false')
    expect(s.getOptionProps('c', 2)['aria-disabled']).toBe('true')
  })
})

describe('ComboboxBase — degenerate children', () => {
  it('renders null (no throw) when children is not a render function', () => {
    // No `children` prop at all → the `typeof children === "function"` guard
    // falls through to `return null`.
    expect(() =>
      mountInBrowser(h(ComboboxBase as never, { options: OPTS })),
    ).not.toThrow()
  })
})
