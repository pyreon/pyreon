/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium lock for ComboboxBase's WAI-ARIA listbox keyboard model. The
 * primitive shipped ArrowUp/Down + Enter/Escape/Tab; this suite locks the
 * NEW interactions added to complete the pattern:
 *   - Home  → active option jumps to the first option (opens if closed)
 *   - End   → active option jumps to the last option
 *   - typeahead → printable chars jump the active option to the next label
 *     starting with the buffer; a repeated letter cycles; a longer buffer
 *     refines. Buffer resets after ~500ms idle (covered by the pure unit test).
 *
 * ComboboxBase is a render-function primitive: `onKeyDown` mutates the
 * `highlightedIndex` signal (which drives `aria-activedescendant` + the option
 * highlight). This package's browser JSX transform is non-reactive, so the
 * observable outcome is the signal value read off the captured `state` after a
 * REAL `keydown` is dispatched through the wired `onKeyDown` handler.
 *
 * Bisect (Home/End): remove the Home/End branches from onKeyDown → the Home/End
 * specs fail (highlightedIndex stays put). Bisect (typeahead): remove the
 * printable-char typeahead branch → the typeahead specs fail (index unmoved).
 */
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { ComboboxBase, type ComboboxOption, type ComboboxState } from './ComboboxBase'

const OPTIONS: ComboboxOption[] = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Apricot' },
  { value: 'c', label: 'Banana' },
  { value: 'd', label: 'Cherry' },
]

function mountCombobox(): {
  container: HTMLElement
  unmount: () => void
  state: ComboboxState
  input: HTMLInputElement
} {
  let captured: ComboboxState | undefined
  const { container, unmount } = mountInBrowser(
    h(ComboboxBase as never, {
      options: OPTIONS,
      children: (state: ComboboxState) => {
        captured = state
        return h(
          'div',
          null,
          h('input', { ...state.inputProps(), id: 'cbx', onKeyDown: state.onKeyDown }),
          h(
            'ul',
            state.listboxProps(),
            ...OPTIONS.map((o, i) => h('li', state.getOptionProps(o.value, i), o.label)),
          ),
        )
      },
    }),
  )
  const input = container.querySelector('#cbx') as HTMLInputElement
  return { container, unmount, state: captured!, input }
}

function press(el: HTMLElement, key: string): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

describe('ComboboxBase — Home/End (WAI-ARIA listbox)', () => {
  it('End jumps the active option to the last (and opens a closed listbox)', async () => {
    const { state, input, unmount } = mountCombobox()
    await flush()
    expect(state.isOpen()).toBe(false)
    press(input, 'End')
    expect(state.isOpen()).toBe(true)
    expect(state.highlightedIndex()).toBe(OPTIONS.length - 1)
    unmount()
  })

  it('Home jumps the active option back to the first', async () => {
    const { state, input, unmount } = mountCombobox()
    await flush()
    press(input, 'End')
    expect(state.highlightedIndex()).toBe(OPTIONS.length - 1)
    press(input, 'Home')
    expect(state.highlightedIndex()).toBe(0)
    unmount()
  })
})

describe('ComboboxBase — typeahead (WAI-ARIA listbox)', () => {
  it('typing a letter moves the active option to the first matching label', async () => {
    const { state, input, unmount } = mountCombobox()
    await flush()
    press(input, 'b') // Banana (index 2)
    expect(state.isOpen()).toBe(true)
    expect(state.highlightedIndex()).toBe(2)
    unmount()
  })

  it('a repeated same letter cycles through matches', async () => {
    const { state, input, unmount } = mountCombobox()
    await flush()
    press(input, 'a') // Apple (0)
    expect(state.highlightedIndex()).toBe(0)
    press(input, 'a') // Apricot (1) — cycle
    expect(state.highlightedIndex()).toBe(1)
    press(input, 'a') // wraps back to Apple (0)
    expect(state.highlightedIndex()).toBe(0)
    unmount()
  })

  it('a longer buffer refines to the label with that prefix', async () => {
    const { state, input, unmount } = mountCombobox()
    await flush()
    press(input, 'a') // Apple (0)
    press(input, 'p') // "ap" still Apple/Apricot — stays on Apple (0)
    expect(state.highlightedIndex()).toBe(0)
    press(input, 'r') // "apr" → Apricot (1)
    expect(state.highlightedIndex()).toBe(1)
    unmount()
  })

  it('a non-matching letter does not move the active option', async () => {
    const { state, input, unmount } = mountCombobox()
    await flush()
    press(input, 'b') // Banana (2)
    expect(state.highlightedIndex()).toBe(2)
    press(input, 'z') // no label starts with "bz" → no move
    expect(state.highlightedIndex()).toBe(2)
    unmount()
  })
})
