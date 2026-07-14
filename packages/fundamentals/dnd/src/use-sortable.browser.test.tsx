import { signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { useSortable } from './use-sortable'

// Real-Chromium smoke for `useSortable`. The happy-dom unit suite covers the
// signal surface + keyboard reordering with synthetic KeyboardEvents; this runs
// the same paths in a REAL browser so a regression in the container/item ref
// wiring (auto-scroll + reorder drop-target registration, the keydown handler,
// ARIA attributes) surfaces at the package level before any consumer e2e.
//
// It also exercises the container-registration disposal fix (the F3 sibling):
// a `containerRef(null)` on unmount and a re-register with a new element must
// not throw and must re-establish a working keyboard handler — the collapsible-
// board (`<Show>`-toggled container) shape that previously leaked.

describe('useSortable — real-Chromium smoke', () => {
  it('wires ARIA + keyboard reorder on a real DOM tree', () => {
    const items = signal([{ id: '1' }, { id: '2' }, { id: '3' }])
    const reordered: string[][] = []

    const { containerRef, itemRef, activeId, overId, overEdge } = useSortable({
      items,
      by: (i) => i.id,
      onReorder: (next) => reordered.push(next.map((i) => i.id)),
    })

    expect(activeId()).toBeNull()
    expect(overId()).toBeNull()
    expect(overEdge()).toBeNull()

    const ul = document.createElement('ul')
    document.body.appendChild(ul)
    containerRef(ul)

    const lis = items().map((it) => {
      const li = document.createElement('li')
      itemRef(it.id)(li)
      ul.appendChild(li)
      return li
    })

    // ARIA wiring landed in a real browser.
    for (const li of lis) {
      expect(li.getAttribute('role')).toBe('listitem')
      expect(li.getAttribute('aria-roledescription')).toBe('sortable item')
      expect(li.getAttribute('tabindex')).toBe('0')
    }

    // Alt+ArrowDown on the focused first item reorders via the real keydown path.
    lis[0]!.focus()
    ul.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }),
    )
    expect(reordered).toHaveLength(1)
    expect(reordered[0]).toEqual(['2', '1', '3'])

    ul.remove()
  })

  it('container re-register (Show-toggle shape) is safe and re-wires the keyboard handler', () => {
    const items = signal([{ id: 'a' }, { id: 'b' }])
    const reordered: string[][] = []

    const { containerRef, itemRef } = useSortable({
      items,
      by: (i) => i.id,
      onReorder: (next) => reordered.push(next.map((i) => i.id)),
    })

    // First mount.
    const ul1 = document.createElement('ul')
    document.body.appendChild(ul1)
    expect(() => containerRef(ul1)).not.toThrow()

    // Collapse: containerRef(null) must dispose without throwing (pre-fix this
    // was a silent no-op that leaked the prior registration).
    expect(() => containerRef(null)).not.toThrow()
    ul1.remove()

    // Re-expand with a brand-new element: the keyboard handler must work on the
    // NEW container (the prior one's listener was disposed, not left dangling).
    const ul2 = document.createElement('ul')
    document.body.appendChild(ul2)
    expect(() => containerRef(ul2)).not.toThrow()

    const la = document.createElement('li')
    const lb = document.createElement('li')
    itemRef('a')(la)
    itemRef('b')(lb)
    ul2.appendChild(la)
    ul2.appendChild(lb)

    la.focus()
    ul2.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }),
    )
    expect(reordered).toHaveLength(1)
    expect(reordered[0]).toEqual(['b', 'a'])

    ul2.remove()
  })
})
