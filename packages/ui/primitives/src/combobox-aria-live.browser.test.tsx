import { h } from '@pyreon/core'
import { afterEach, describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { ComboboxBase } from './index'
import type { ComboboxState } from './index'

/**
 * `inputProps()` rides a ONE-TIME spread: the render-fn child runs once, so it
 * is called once. An eager `isOpen() ? 'true' : 'false'` therefore FROZE
 * `aria-expanded` at "false" — the combobox told every screen reader it was
 * permanently collapsed, even while open — and `aria-activedescendant` never
 * tracked the highlighted option. Getters keep the compiled spread reactive
 * (applyProps reads descriptors), exactly as FileUploadBase's dropZoneProps
 * already did.
 *
 * The pre-existing primitive tests only ever asserted the CLOSED state, which
 * is why this shipped. These assert the STATE TRANSITION.
 */
describe('ComboboxBase inputProps — runtime ARIA stays live across open/close', () => {
  let cleanup: (() => void) | undefined
  afterEach(() => {
    cleanup?.()
    cleanup = undefined
  })

  const OPTIONS = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
  ]

  function render() {
    const { container, unmount } = mountInBrowser(
      h(ComboboxBase as never, {
        options: OPTIONS,
        children: (s: ComboboxState) =>
          h(
            'div',
            null,
            // Pass the props OBJECT directly — do NOT `{...spread}` it here. A
            // plain JS spread fires the getters and freezes them, which would
            // defeat the very thing under test. This mirrors the COMPILED path:
            // `<input {...inputProps()} />` lowers to `_applyProps(el, obj)`,
            // which reads descriptors and keeps them live.
            h('input', s.inputProps()),
            h('button', { id: 'open', onClick: () => s.open() }, 'open'),
            h('button', { id: 'close', onClick: () => s.close() }, 'close'),
          ),
      }),
    )
    cleanup = unmount
    return container
  }

  it('aria-expanded flips to "true" when opened (was FROZEN at "false")', () => {
    const container = render()
    const input = container.querySelector('[role="combobox"]') as HTMLElement
    expect(input.getAttribute('aria-expanded')).toBe('false')
    ;(container.querySelector('#open') as HTMLElement).click()
    expect(input.getAttribute('aria-expanded')).toBe('true')
  })

  it('aria-expanded returns to "false" when closed', () => {
    const container = render()
    const input = container.querySelector('[role="combobox"]') as HTMLElement
    ;(container.querySelector('#open') as HTMLElement).click()
    expect(input.getAttribute('aria-expanded')).toBe('true')
    ;(container.querySelector('#close') as HTMLElement).click()
    expect(input.getAttribute('aria-expanded')).toBe('false')
  })

  it('keeps the static ARIA that never changes', () => {
    const container = render()
    const input = container.querySelector('[role="combobox"]') as HTMLElement
    expect(input.getAttribute('role')).toBe('combobox')
    expect(input.getAttribute('aria-autocomplete')).toBe('list')
    // aria-controls must reference the listbox id the primitive owns
    expect(input.getAttribute('aria-controls')).toBeTruthy()
  })
})
