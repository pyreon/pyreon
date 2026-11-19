/**
 * Real Chromium: a keyed `.map()` list that first rendered EMPTY keeps each
 * row's DOM state through reorders once data arrives — focus and a typed input
 * value, which a re-created row loses and happy-dom does not model faithfully.
 * Unit twin: `keyed-map-undecided-first.test.tsx`.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'

describe('keyed .map() first rendered empty — row state survives updates', () => {
  it('a focused input with a typed value stays focused and keeps its value across a reorder', async () => {
    const rows = signal<number[]>([])
    const { container, unmount } = mountInBrowser(
      h('ul', null, () => rows().map((id) => h('li', { key: id }, h('input', { 'data-id': String(id) })))),
    )
    rows.set([1, 2, 3])
    await flush()
    const input = container.querySelector<HTMLInputElement>('input[data-id="2"]')!
    input.focus()
    input.value = 'typed'
    rows.set([3, 2, 1])
    await flush()
    const after = container.querySelector<HTMLInputElement>('input[data-id="2"]')!
    expect(after).toBe(input)
    expect(after.value).toBe('typed')
    expect(document.activeElement).toBe(input)
    rows.set([2])
    await flush()
    expect(container.querySelector('input')).toBe(input)
    expect(input.value).toBe('typed')
    unmount()
  })
})
