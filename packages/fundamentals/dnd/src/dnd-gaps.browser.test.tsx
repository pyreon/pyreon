import { effect, signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { useDraggable } from './use-draggable'
import { useDroppable } from './use-droppable'
import { useSortable } from './use-sortable'

// Real-Chromium coverage for the audit-gap pdnd pass-throughs — driving
// REAL pragmatic-drag-and-drop with synthetic DragEvent sequences (the
// e2e/app-showcase-dnd.spec.ts dispatch pattern works in vitest-browser
// too: pdnd's element adapter consumes standard bubbling drag events with
// a shared DataTransfer). The unit suite mocks pdnd; these specs prove
// the option shapes survive the REAL adapter (onGenerateDragPreview
// timing, hitbox geometry from real getBoundingClientRect, the
// elementFromPoint-based dragHandle containment check).

const microtasks = () => new Promise<void>((r) => setTimeout(r, 0))

function fire(
  target: Element,
  type: string,
  dataTransfer: DataTransfer,
  at?: { x: number; y: number },
) {
  const rect = (target as HTMLElement).getBoundingClientRect()
  target.dispatchEvent(
    new DragEvent(type, {
      bubbles: true,
      cancelable: true,
      dataTransfer,
      clientX: at?.x ?? rect.left + rect.width / 2,
      clientY: at?.y ?? rect.top + rect.height / 2,
    }),
  )
}

describe('useDraggable — custom native drag preview (real pdnd)', () => {
  it('invokes preview.render with a live container on drag start', async () => {
    const card = document.createElement('div')
    card.textContent = 'Card'
    card.style.cssText = 'width:120px;height:40px'
    document.body.appendChild(card)

    const rendered: HTMLElement[] = []
    const cleanedUp: boolean[] = []
    useDraggable({
      element: () => card,
      data: { id: 'card-1' },
      preview: {
        render: (container) => {
          rendered.push(container)
          const ghost = document.createElement('div')
          ghost.textContent = 'Ghost'
          container.appendChild(ghost)
          return () => cleanedUp.push(true)
        },
        offset: 'pointer-outside',
      },
    })
    await microtasks()

    const dataTransfer = new DataTransfer()
    fire(card, 'dragstart', dataTransfer)

    // pdnd invokes onGenerateDragPreview synchronously off dragstart; the
    // render callback receives a container appended to document.body.
    await expect.poll(() => rendered.length, { timeout: 2000 }).toBe(1)
    expect(rendered[0]).toBeInstanceOf(HTMLElement)
    expect(rendered[0]!.textContent).toBe('Ghost')

    fire(card, 'dragend', dataTransfer)
    // The returned cleanup runs after the preview is no longer needed.
    await expect.poll(() => cleanedUp.length, { timeout: 2000 }).toBe(1)

    card.remove()
  })
})

describe('useDroppable — closest-edge detection (real pdnd hitbox)', () => {
  it('overEdge flips with real pointer geometry and clears on drop', async () => {
    const card = document.createElement('div')
    card.textContent = 'Drag me'
    card.style.cssText = 'width:100px;height:30px'
    document.body.appendChild(card)

    const zone = document.createElement('div')
    zone.style.cssText = 'width:200px;height:100px;margin-top:20px'
    document.body.appendChild(zone)

    useDraggable({ element: () => card, data: { id: 'card-1' } })
    const dropped: unknown[] = []
    const { isOver, overEdge } = useDroppable({
      element: () => zone,
      edges: ['top', 'bottom'],
      onDrop: (data) => dropped.push(data),
    })
    await microtasks()

    const dataTransfer = new DataTransfer()
    fire(card, 'dragstart', dataTransfer)
    await microtasks()

    const r = zone.getBoundingClientRect()
    // Enter near the BOTTOM edge.
    fire(zone, 'dragenter', dataTransfer, { x: r.left + r.width / 2, y: r.bottom - 2 })
    fire(zone, 'dragover', dataTransfer, { x: r.left + r.width / 2, y: r.bottom - 2 })
    await expect.poll(() => overEdge(), { timeout: 2000 }).toBe('bottom')
    expect(isOver()).toBe(true)

    // Move to the TOP edge — live tracking via onDrag.
    fire(zone, 'dragover', dataTransfer, { x: r.left + r.width / 2, y: r.top + 2 })
    await expect.poll(() => overEdge(), { timeout: 2000 }).toBe('top')

    // Drop clears both signals.
    fire(zone, 'drop', dataTransfer, { x: r.left + r.width / 2, y: r.top + 2 })
    fire(card, 'dragend', dataTransfer)
    await expect.poll(() => dropped.length, { timeout: 2000 }).toBe(1)
    expect(isOver()).toBe(false)
    expect(overEdge()).toBeNull()

    card.remove()
    zone.remove()
  })
})

describe('useSortable — itemHandleRef scopes drag initiation (real pdnd)', () => {
  it('a dragstart outside the handle is rejected; on the handle it starts the drag', async () => {
    const items = signal([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ])
    const { containerRef, itemRef, itemHandleRef, activeId } = useSortable({
      items,
      by: (i) => i.id,
      onReorder: (next) => items.set(next),
    })

    const ul = document.createElement('ul')
    ul.style.cssText = 'list-style:none;padding:0;margin:0'
    document.body.appendChild(ul)
    containerRef(ul)

    // Item 1: 200×40 row with a 40×40 grip on the left — the handle
    // containment check runs document.elementFromPoint(clientX, clientY),
    // so the geometry must be real.
    const li = document.createElement('li')
    li.style.cssText = 'position:relative;display:block;width:200px;height:40px'
    const grip = document.createElement('span')
    grip.style.cssText = 'position:absolute;left:0;top:0;width:40px;height:40px;display:block'
    li.appendChild(grip)
    ul.appendChild(li)
    // Parent ref first, then the handle's (real mount order: child refs
    // fire after the parent element exists).
    itemRef('1')(li)
    itemHandleRef('1')(grip)
    await microtasks()

    const liRect = li.getBoundingClientRect()

    // (a) dragstart with the pointer OUTSIDE the handle (right half of the
    // row) → pdnd cancels the drag; activeId stays null.
    const dt1 = new DataTransfer()
    fire(li, 'dragstart', dt1, { x: liRect.right - 10, y: liRect.top + 20 })
    await microtasks()
    await microtasks()
    expect(activeId()).toBeNull()

    // (b) dragstart with the pointer ON the grip → drag starts. Dispatch on
    // the registered draggable (the li) — pdnd resolves the draggable from
    // event.target, then checks handle containment via elementFromPoint.
    const gripRect = grip.getBoundingClientRect()
    const dt2 = new DataTransfer()
    fire(li, 'dragstart', dt2, { x: gripRect.left + 10, y: gripRect.top + 10 })
    await expect.poll(() => activeId(), { timeout: 2000 }).toBe('1')

    fire(li, 'dragend', dt2)
    await expect.poll(() => activeId(), { timeout: 2000 }).toBeNull()

    ul.remove()
  })
})

describe('useSortable — isActive selector is O(2), not O(N) (real pdnd)', () => {
  it('a drag start re-runs ONLY the affected row probe, not every row', async () => {
    const keys = ['1', '2', '3', '4', '5']
    const items = signal(keys.map((id) => ({ id, name: `Item ${id}` })))
    const { containerRef, itemRef, isActive, activeId } = useSortable({
      items,
      by: (i) => i.id,
      onReorder: (next) => items.set(next),
    })

    const ul = document.createElement('ul')
    document.body.appendChild(ul)
    containerRef(ul)
    const els = new Map<string, HTMLElement>()
    for (const k of keys) {
      const li = document.createElement('li')
      li.style.cssText = 'display:block;width:200px;height:24px'
      els.set(k, li)
      ul.appendChild(li)
      itemRef(k)(li)
    }
    await microtasks()

    // One probe effect per row reading isActive(key) — the documented row
    // idiom. With the naive `activeId() === key` read every probe would
    // re-run on ANY activeId change (O(N)); the selector notifies only
    // the affected key's bucket (O(2): old + new, and `null` has no bucket).
    const runs: Record<string, number> = {}
    const disposers = keys.map((k) =>
      effect(() => {
        isActive(k)
        runs[k] = (runs[k] ?? 0) + 1
      }),
    )
    expect(runs).toEqual({ '1': 1, '2': 1, '3': 1, '4': 1, '5': 1 })

    const dataTransfer = new DataTransfer()
    fire(els.get('2')!, 'dragstart', dataTransfer)
    await expect.poll(() => activeId(), { timeout: 2000 }).toBe('2')

    // O(2) assertion: ONLY key '2''s probe re-ran.
    expect(runs).toEqual({ '1': 1, '2': 2, '3': 1, '4': 1, '5': 1 })

    fire(els.get('2')!, 'dragend', dataTransfer)
    await expect.poll(() => activeId(), { timeout: 2000 }).toBeNull()
    // …and releasing the drag re-runs only '2' again.
    expect(runs).toEqual({ '1': 1, '2': 3, '3': 1, '4': 1, '5': 1 })

    for (const d of disposers) d.dispose()
    ul.remove()
  })
})
