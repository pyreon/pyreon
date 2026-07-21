/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium locks for the Combobox Element-first conversion (EF-6): out
 * of the box `<Combobox options />` renders a full WAI-ARIA combobox — a
 * role=combobox input with LIVE aria-expanded/aria-activedescendant getters,
 * a conditional role=listbox dropdown, arrow-key navigation + Enter select +
 * Escape close, query filtering — with layout from Element content-axis props
 * and the render-prop escape hatch (+ Autocomplete's `.config()` chain)
 * intact.
 */
import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import type { ComboboxState } from '@pyreon/ui-primitives'
import { describe, expect, it } from 'vitest'

declare const __vitest_browser__: boolean | undefined
const isBrowser = typeof __vitest_browser__ !== 'undefined' && __vitest_browser__
import Autocomplete from '../components/Autocomplete'
import Combobox from '../components/Combobox'

const options = [
  { value: 'react', label: 'React' },
  { value: 'pyreon', label: 'Pyreon' },
  { value: 'vue', label: 'Vue' },
  { value: 'svelte', label: 'Svelte', disabled: true },
]

const key = (el: Element, k: string) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
const type = (input: HTMLInputElement, text: string) => {
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('Combobox — Element-first batteries-included (real Chromium)', () => {
  it('renders a labeled role=combobox input OUT OF THE BOX; ArrowDown opens the listbox with LIVE aria', async () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(Combobox as never, {
          options,
          'aria-label': 'Vyber framework',
          placeholder: 'Search…',
        }),
      ),
    )
    await flush()
    const input = container.querySelector('input[role="combobox"]') as HTMLInputElement
    expect(input, 'built-in input renders').not.toBeNull()
    expect(input.getAttribute('aria-label'), 'localizable label passthrough').toBe(
      'Vyber framework',
    )
    expect(input.getAttribute('placeholder')).toBe('Search…')
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('[role="listbox"]'), 'closed by default').toBeNull()

    key(input, 'ArrowDown')
    await flush()
    const listbox = container.querySelector('[role="listbox"]')!
    expect(listbox, 'ArrowDown opens').not.toBeNull()
    expect(input.getAttribute('aria-expanded'), 'aria-expanded is LIVE (getter)').toBe('true')
    expect(input.getAttribute('aria-controls')).toBe(listbox.id)
    const opts = container.querySelectorAll('[role="option"]')
    expect(opts.length).toBe(4)
    expect(opts[3]!.getAttribute('aria-disabled'), 'disabled option announced').toBe('true')
    // The active option is announced via aria-activedescendant (no roving focus).
    expect(input.getAttribute('aria-activedescendant')).toBe(opts[0]!.id)
    unmount()
  })

  it('arrow keys move the LIVE highlight without re-rendering the list; Enter selects; Escape closes', async () => {
    let selectedValue: string | string[] = ''
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(Combobox as never, {
          options,
          onChange: (v: string | string[]) => {
            selectedValue = v
          },
        }),
      ),
    )
    await flush()
    const input = container.querySelector('input[role="combobox"]') as HTMLInputElement
    key(input, 'ArrowDown') // open (first active)
    await flush()
    const firstOption = container.querySelector('[role="option"]') as HTMLElement
    expect(firstOption.getAttribute('data-highlighted')).toBe('true')

    key(input, 'ArrowDown') // move to Pyreon
    await flush()
    const opts = container.querySelectorAll<HTMLElement>('[role="option"]')
    expect(opts[0], 'list did NOT re-render — same element').toBe(firstOption)
    expect(opts[0]!.getAttribute('data-highlighted'), 'highlight left row 0').toBeNull()
    expect(opts[1]!.getAttribute('data-highlighted'), 'highlight moved to row 1').toBe('true')
    expect(input.getAttribute('aria-activedescendant'), 'activedescendant follows').toBe(
      opts[1]!.id,
    )

    key(input, 'Enter')
    await flush()
    expect(selectedValue, 'Enter selects the highlighted option').toBe('pyreon')
    expect(container.querySelector('[role="listbox"]'), 'single-select closes on select').toBeNull()
    expect(input.getAttribute('aria-expanded')).toBe('false')

    key(input, 'ArrowDown')
    await flush()
    key(input, 'Escape')
    await flush()
    expect(container.querySelector('[role="listbox"]'), 'Escape closes').toBeNull()
    unmount()
  })

  it('typing filters the options; click selects', async () => {
    let selectedValue: string | string[] = ''
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(Combobox as never, {
          options,
          onChange: (v: string | string[]) => {
            selectedValue = v
          },
        }),
      ),
    )
    await flush()
    const input = container.querySelector('input[role="combobox"]') as HTMLInputElement
    type(input, 'v')
    await flush()
    const opts = container.querySelectorAll<HTMLElement>('[role="option"]')
    // "v" matches Vue and Svelte (label includes).
    expect(opts.length).toBe(2)
    opts[0]!.click()
    await flush()
    expect(selectedValue).toBe('vue')
    unmount()
  })

  it.skipIf(!isBrowser)('layout comes from Element props + themes (styled padded input, positioned dropdown)', async () => {
    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme }, h(Combobox as never, { options })),
    )
    await flush()
    const input = container.querySelector('input[role="combobox"]') as HTMLElement
    expect(input.getAttribute('data-rocketstyle'), 'built-in input carries the theme').toBe(
      'Combobox',
    )
    expect(
      Number.parseFloat(getComputedStyle(input).paddingLeft),
      'size default applies padding out of the box',
    ).toBeGreaterThan(0)
    key(input, 'ArrowDown')
    await flush()
    const listbox = container.querySelector('[role="listbox"]') as HTMLElement
    const lcs = getComputedStyle(listbox)
    expect(lcs.position, 'dropdown is anchored').toBe('absolute')
    expect(lcs.flexDirection, 'options stack as a column (content-axis props)').toBe('column')
    const ir = input.getBoundingClientRect()
    const lr = listbox.getBoundingClientRect()
    expect(lr.top, 'dropdown sits BELOW the input').toBeGreaterThan(ir.bottom - 1)
    unmount()
  })

  it('render-prop escape hatch is the pre-conversion styled chain; Autocomplete config chain intact', async () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(Combobox as never, {
          options,
          children: (s: ComboboxState) =>
            h('div', null, h('input', { ...s.inputProps(), 'data-testid': 'custom-cb' })),
        }),
      ),
    )
    await flush()
    const custom = container.querySelector('[data-testid="custom-cb"]') as HTMLInputElement
    expect(custom, 'consumer markup renders').not.toBeNull()
    expect(custom.getAttribute('data-rocketstyle'), 'escape hatch keeps the theme class').toBe(
      'Combobox',
    )

    const auto = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(Autocomplete as never, {
          options,
          children: (s: ComboboxState) => h('input', s.inputProps()),
        }),
      ),
    )
    await flush()
    expect(
      auto.container.querySelector('input')!.getAttribute('data-rocketstyle'),
      'Autocomplete re-configures the styled chain',
    ).toBe('Autocomplete')
    unmount()
    auto.unmount()
  })
})
