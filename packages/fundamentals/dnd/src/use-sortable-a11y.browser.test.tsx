import { queryOptional } from '@pyreon/test-utils'
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
  queryOptional<HTMLElement>(document, '[data-pyreon-announcer="polite"]')

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

  it('creates the keyboard-instructions node OUTSIDE the list and links items via aria-describedby', () => {
    const items = signal([{ id: '1', name: 'Alice' }])
    const { containerRef, itemRef } = useSortable({
      items,
      by: (i) => i.id,
      onReorder: (next) => items.set(next),
    })

    const ul = document.createElement('ul')
    document.body.appendChild(ul)
    containerRef(ul)

    // Not a child of the <ul> — a <div> there is invalid list content and
    // breaks <For>'s owns-parent bulk clear.
    expect(queryOptional<HTMLElement>(ul, '[data-pyreon-sortable-instructions]')).toBeNull()

    const li = document.createElement('li')
    itemRef('1')(li)
    ul.appendChild(li)
    const instructions = document.getElementById(li.getAttribute('aria-describedby')!)
    expect(instructions).not.toBeNull()
    // VALUE assertions — text + linkage, not mere existence.
    expect(instructions!.hasAttribute('data-pyreon-sortable-instructions')).toBe(true)
    expect(instructions!.textContent).toMatch(/^To reorder, press Space or Enter to pick up/)

    // Visually hidden (the shared host clips it), but exposed to AT (no
    // display:none / aria-hidden anywhere up the chain).
    const host = instructions!.parentElement!
    const style = getComputedStyle(host)
    expect(style.position).toBe('absolute')
    expect(style.width).toBe('1px')
    expect(style.display).not.toBe('none')
    expect(host.getAttribute('aria-hidden')).toBeNull()
    expect(instructions!.getAttribute('aria-hidden')).toBeNull()

    containerRef(null)
    expect(document.getElementById(instructions!.id)).toBeNull()
    ul.remove()
  })

  it('keyboard pickup mode announces pick-up, move, and drop into the live region', async () => {
    const items = signal([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
      { id: '3', name: 'Charlie' },
    ])
    const { containerRef, itemRef, activeId } = useSortable({
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
      itemRef(it.id)(li)
      ul.appendChild(li)
      return li
    })
    const press = (key: string) =>
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))

    lis[0]!.focus()
    press(' ')
    expect(activeId()).toBe('1')
    await waitForAnnouncement(
      'Picked up Alice. Current position 1 of 3. Use the arrow keys to move, Space or Enter to drop, Escape to cancel.',
    )
    press('ArrowDown')
    expect(items().map((i) => i.id)).toEqual(['2', '1', '3'])
    await waitForAnnouncement('Moved Alice to position 2 of 3')
    press('Enter')
    expect(activeId()).toBeNull()
    await waitForAnnouncement('Dropped Alice at position 2 of 3')

    containerRef(null)
    ul.remove()
  })
})
