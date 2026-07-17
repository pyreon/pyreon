import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { afterEach, describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { SegmentedControl, SegmentedControlItem } from './index'

/**
 * SegmentedControl was a styled `<div>` whose items were plain `<button>`s —
 * no `role`, no `aria-checked`, no keyboard. Assistive tech had no idea it was
 * a single-select group and arrow keys did nothing. A segmented control IS the
 * WAI-ARIA radiogroup pattern, so it now delegates to RadioGroupBase/RadioBase
 * rather than growing a bespoke primitive.
 */
describe('SegmentedControl delegates to RadioGroupBase/RadioBase', () => {
  let cleanup: (() => void) | undefined
  afterEach(() => {
    cleanup?.()
    cleanup = undefined
  })

  const render = (value = 'list', onChange?: (v: string) => void) =>
    mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(
          SegmentedControl as never,
          { value, onChange },
          h(SegmentedControlItem as never, { value: 'list' }, 'List'),
          h(SegmentedControlItem as never, { value: 'grid' }, 'Grid'),
        ),
      ),
    )

  it('renders radiogroup semantics (role=radiogroup + role=radio)', () => {
    const { container, unmount } = render()
    cleanup = unmount
    expect(container.querySelector('[role="radiogroup"]')).toBeTruthy()
    expect(container.querySelectorAll('[role="radio"]').length).toBe(2)
  })

  it('exposes aria-checked as a STRING reflecting the selected segment', () => {
    const { container, unmount } = render('grid')
    cleanup = unmount
    const radios = [...container.querySelectorAll('[role="radio"]')] as HTMLElement[]
    expect(radios[0]!.getAttribute('aria-checked')).toBe('false')
    expect(radios[1]!.getAttribute('aria-checked')).toBe('true')
  })

  it('selects a segment on click, reporting through onChange', () => {
    const picked = signal('')
    const { container, unmount } = render('list', (v) => picked.set(v))
    cleanup = unmount
    const radios = [...container.querySelectorAll('[role="radio"]')] as HTMLElement[]
    radios[1]!.click()
    expect(picked()).toBe('grid')
  })

  it('applies its rocketstyle class to the radiogroup + each radio ("delegates" != "works")', () => {
    const { container, unmount } = render()
    cleanup = unmount
    const group = container.querySelector('[role="radiogroup"]') as HTMLElement
    expect(group.getAttribute('data-rocketstyle')).toBe('SegmentedControl')
    expect(group.className).toBeTruthy()
    const radio = container.querySelector('[role="radio"]') as HTMLElement
    expect(radio.getAttribute('data-rocketstyle')).toBe('SegmentedControlItem')
    expect(radio.className).toBeTruthy()
  })
})
