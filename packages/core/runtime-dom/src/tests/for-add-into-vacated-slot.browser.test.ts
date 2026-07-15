import { For, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'

// Real-Chromium coverage for the <For> "add a new key into a slot vacated by a
// removal" fix. happy-dom faithfully models node ordering, but the reconciler
// touches insertBefore/removeChild ordering under real layout — this proves the
// new row lands at its LOGICAL position in a real browser, not the physical tail.
// See for-add-into-vacated-slot.test.tsx for the full behavioral matrix + the
// root-cause explanation.

const ids = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLLIElement>('#list li')).map((li) => li.dataset.id)

describe('runtime-dom <For> — add into a vacated slot (real Chromium)', () => {
  it('[1,2,3,4] → [1,5,3] places the new row in the middle, not the tail', async () => {
    const rows = signal<number[]>([1, 2, 3, 4])
    const { container, unmount } = mountInBrowser(
      h(
        'ul',
        { id: 'list' },
        For({
          each: rows,
          by: (x: number) => x,
          children: (x: number) => h('li', { 'data-id': String(x) }, String(x)),
        }),
      ),
    )
    await flush()
    expect(ids(container)).toEqual(['1', '2', '3', '4'])

    rows.set([1, 5, 3]) // remove 2 & 4, add 5 between 1 and 3
    await flush()
    expect(ids(container)).toEqual(['1', '5', '3'])

    // Also exercise a head insert with pos-shifted survivors + a combined
    // add/remove/reorder to lock the general LIS path in a real browser.
    rows.set([7, 5]) // remove 1 & 3, add 7 at head, 5 survives
    await flush()
    expect(ids(container)).toEqual(['7', '5'])

    rows.set([5, 8, 7]) // reorder survivors + add 8 in the middle
    await flush()
    expect(ids(container)).toEqual(['5', '8', '7'])

    unmount()
  })
})
