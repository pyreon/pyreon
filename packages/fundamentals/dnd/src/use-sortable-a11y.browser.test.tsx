import { clearAnnouncements } from '@pyreon/a11y'
import { signal } from '@pyreon/reactivity'
import { afterEach, describe, expect, it } from 'vitest'
import { useSortable } from './use-sortable'

// Real-Chromium a11y coverage for `useSortable`'s screen-reader wiring:
// the `@pyreon/a11y` live region actually receives the announcement text
// (VALUE-asserted — `hasAttribute`/existence checks can't catch a broken
// message), and the aria-describedby keyboard-instructions node exists
// with the right text. The unit suite (`tests/audit-gaps.test.ts`) mocks
// `announce()`; this locks the real `aria-live` region end-to-end,
// including the rAF-deferred write inside `announce()`.

const liveRegion = () =>
  document.querySelector('[data-pyreon-announcer="polite"]') as HTMLElement | null

/** Wait until the polite live region carries `expected` (announce writes on rAF). */
async function waitForAnnouncement(expected: string) {
  await expect
    .poll(() => liveRegion()?.textContent ?? '', { timeout: 2000 })
    .toBe(expected)
}

afterEach(() => {
  clearAnnouncements()
})

describe('useSortable — screen-reader announcements (real live region)', () => {
  it('keyboard reorder announces "Moved <label> to position X of N" into the aria-live region', async () => {
    const items = signal([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
      { id: '3', name: 'Charlie' },
    ])
    const { containerRef, itemRef } = useSortable({
      items,
      by: (i) => i.id,
      label: (i) => i.name,
      onReorder: (next) => items.set(next),
    })

    const ul = document.createElement('ul')
    document.body.appendChild(ul)
    containerRef(ul)
    const lis = items().map((it) => {
      const li = document.createElement('li')
      itemRef(it.id)(li)
      ul.appendChild(li)
      return li
    })

    lis[0]!.focus()
    ul.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }),
    )
    expect(items().map((i) => i.id)).toEqual(['2', '1', '3'])

    // VALUE assertion on the live region — the load-bearing check.
    await waitForAnnouncement('Moved Alice to position 2 of 3')

    ul.remove()
  })

  it('drag start announces "Picked up <label>" via the real pdnd dragstart path', async () => {
    const items = signal([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ])
    const { containerRef, itemRef } = useSortable({
      items,
      by: (i) => i.id,
      label: (i) => i.name,
      onReorder: (next) => items.set(next),
    })

    const ul = document.createElement('ul')
    document.body.appendChild(ul)
    containerRef(ul)
    const lis = items().map((it) => {
      const li = document.createElement('li')
      li.textContent = it.name
      li.style.cssText = 'display:block;width:200px;height:30px'
      itemRef(it.id)(li)
      ul.appendChild(li)
      return li
    })

    const dataTransfer = new DataTransfer()
    lis[0]!.dispatchEvent(
      new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }),
    )

    await waitForAnnouncement('Picked up Alice')

    // Finish the drag so global pdnd state doesn't leak into other specs.
    lis[0]!.dispatchEvent(
      new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }),
    )
    ul.remove()
  })

  it('creates the keyboard-instructions node and links items via aria-describedby', () => {
    const items = signal([{ id: '1', name: 'Alice' }])
    const { containerRef, itemRef } = useSortable({
      items,
      by: (i) => i.id,
      onReorder: (next) => items.set(next),
    })

    const ul = document.createElement('ul')
    document.body.appendChild(ul)
    containerRef(ul)

    const instructions = ul.querySelector(
      '[data-pyreon-sortable-instructions]',
    ) as HTMLElement | null
    expect(instructions).not.toBeNull()
    // VALUE assertions — text + linkage, not mere existence.
    expect(instructions!.textContent).toBe('Press Alt plus arrow keys to reorder')

    const li = document.createElement('li')
    itemRef('1')(li)
    ul.appendChild(li)
    expect(li.getAttribute('aria-describedby')).toBe(instructions!.id)

    // Visually hidden, but exposed to AT (no display:none / aria-hidden).
    const style = getComputedStyle(instructions!)
    expect(style.position).toBe('absolute')
    expect(style.width).toBe('1px')
    expect(instructions!.getAttribute('aria-hidden')).toBeNull()

    ul.remove()
  })
})
