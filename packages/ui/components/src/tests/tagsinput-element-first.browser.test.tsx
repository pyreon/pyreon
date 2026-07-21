/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium locks for the TagsInput Element-first conversion (second
 * batteries-included component after the Rating pilot): out-of-the-box chips
 * row + input, live chip list, layout from Element content-axis props (zero
 * hand-written display CSS), render-prop escape hatch.
 */
import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import type { TagsInputState } from '@pyreon/ui-primitives'
import { describe, expect, it } from 'vitest'

declare const __vitest_browser__: boolean | undefined
const isBrowser = typeof __vitest_browser__ !== 'undefined' && __vitest_browser__
import TagsInput from '../components/TagsInput'

const type = (input: HTMLInputElement, text: string) => {
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const key = (el: Element, k: string) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))

describe('TagsInput — Element-first batteries-included (real Chromium)', () => {
  it('renders chips + labeled input OUT OF THE BOX; typing commits a chip LIVE', async () => {
    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme }, h(TagsInput as never, { defaultValue: ['red', 'green'] })),
    )
    await flush()
    expect(container.querySelectorAll('[data-tag]').length, 'initial chips render').toBe(2)
    const input = container.querySelector('input[aria-label="Add tag"]') as HTMLInputElement
    expect(input, 'built-in input renders with the base aria-label').not.toBeNull()

    type(input, 'blue')
    key(input, 'Enter')
    await flush()
    expect(container.querySelectorAll('[data-tag]').length, 'commit adds a chip').toBe(3)
    expect(container.querySelector('[data-tag="blue"]')).not.toBeNull()
    expect(input.value, 'draft clears').toBe('')
    unmount()
  })

  it('the chip remove button removes exactly its tag', async () => {
    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme }, h(TagsInput as never, { defaultValue: ['a', 'b', 'c'] })),
    )
    await flush()
    const rm = container.querySelector('[data-tag="b"] button') as HTMLButtonElement
    expect(rm.getAttribute('aria-label')).toBe('Remove b')
    rm.click()
    await flush()
    const tags = Array.from(container.querySelectorAll('[data-tag]')).map((c) =>
      c.getAttribute('data-tag'),
    )
    expect(tags).toEqual(['a', 'c'])
    unmount()
  })

  it.skipIf(!isBrowser)('layout comes from Element content-axis props (flex row, centered)', async () => {
    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme }, h(TagsInput as never, { defaultValue: ['x'] })),
    )
    await flush()
    const root = container.querySelector('[data-rocketstyle="TagsInput"]') as HTMLElement
    expect(getComputedStyle(root).display).toContain('flex')
    expect(getComputedStyle(root).alignItems).toBe('center')
    expect(getComputedStyle(root).flexWrap).toBe('wrap')
    unmount()
  })

  it('render-prop escape hatch overrides the built-in markup', async () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(TagsInput as never, {
          defaultValue: ['a'],
          children: (s: TagsInputState) =>
            h('div', { 'data-testid': 'custom-tags' }, `${s.tags().length} tags`),
        }),
      ),
    )
    await flush()
    expect(container.querySelector('[data-testid="custom-tags"]')).not.toBeNull()
    expect(container.querySelector('[data-tag]'), 'built-in chips replaced').toBeNull()
    unmount()
  })
})
