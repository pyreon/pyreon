import { For, Show } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'
import type { DropLocation } from './types'
import { useDraggable } from './use-draggable'
import { useDroppable } from './use-droppable'
import { useSortable } from './use-sortable'

// Real-Chromium locks for the 2026-09 dnd hardening, driven through REAL
// pragmatic-drag-and-drop with synthetic DragEvent sequences (the pattern the
// other *.browser.test.tsx suites use):
//
//  - a drop zone that mounts LATER (behind <Show>) is registered through the
//    returned `ref` — the old one-shot getter never saw it;
//  - `onDrop` receives the closest edge + the target's data;
//  - a <For>-rendered sortable list keeps ONLY its rows in the <ul> (the
//    instructions node lives outside), so the list's bulk clear works.

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

describe('useDroppable ref — a later-mounted zone (real pdnd)', () => {
  it('registers the zone that mounts behind <Show> and reports the drop edge + data', async () => {
    const open = signal(false)
    const drops: Array<{ data: unknown; location: DropLocation }> = []
    let hooks!: { card: ReturnType<typeof useDraggable>; zone: ReturnType<typeof useDroppable> }

    function App() {
      const card = useDraggable({ data: { id: 'card-1' } })
      const zone = useDroppable({
        data: { zone: 'inbox' },
        edges: ['top', 'bottom'],
        onDrop: (data, location) => drops.push({ data, location }),
      })
      hooks = { card, zone }
      return (
        <div>
          <div ref={card.ref} data-testid="card" style="width:100px;height:30px">
            Drag me
          </div>
          <Show when={() => open()}>
            <div ref={zone.ref} data-testid="zone" style="width:200px;height:100px;margin-top:20px">
              Drop here
            </div>
          </Show>
        </div>
      )
    }

    const { container, unmount } = mountInBrowser(<App />)
    await microtasks()
    open.set(true)
    await microtasks()

    const card = container.querySelector('[data-testid="card"]')!
    const zone = container.querySelector('[data-testid="zone"]')!
    expect(zone).toBeTruthy()

    const dataTransfer = new DataTransfer()
    fire(card, 'dragstart', dataTransfer)
    await microtasks()
    const r = zone.getBoundingClientRect()
    const bottom = { x: r.left + r.width / 2, y: r.bottom - 2 }
    fire(zone, 'dragenter', dataTransfer, bottom)
    fire(zone, 'dragover', dataTransfer, bottom)
    await expect.poll(() => hooks.zone.isOver(), { timeout: 2000 }).toBe(true)
    fire(zone, 'drop', dataTransfer, bottom)
    fire(card, 'dragend', dataTransfer)

    await expect.poll(() => drops.length, { timeout: 2000 }).toBe(1)
    expect(drops[0]!.data).toMatchObject({ id: 'card-1' })
    expect(drops[0]!.location.edge).toBe('bottom')
    expect(drops[0]!.location.data).toEqual({ zone: 'inbox' })
    expect(hooks.zone.overEdge()).toBeNull()
    unmount()
  })
})

describe('useSortable + <For> (real runtime)', () => {
  it('the <ul> holds only its rows, and clearing the list empties it', async () => {
    type Row = { id: string }
    const items = signal<Row[]>([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    let hook!: ReturnType<typeof useSortable<Row>>
    function List() {
      hook = useSortable<Row>({ items, by: (r) => r.id, onReorder: (next) => items.set(next) })
      return (
        <ul ref={hook.containerRef} data-testid="list">
          <For each={items} by={(r: Row) => r.id}>
            {(r: Row) => <li ref={hook.itemRef(r.id)}>{r.id}</li>}
          </For>
        </ul>
      )
    }
    const { container, unmount } = mountInBrowser(<List />)
    await microtasks()
    const ul = container.querySelector('[data-testid="list"]')!
    // Only <li> element children — no instructions <div> inside the list.
    expect([...ul.children].map((c) => c.tagName)).toEqual(['LI', 'LI', 'LI'])
    expect(ul.querySelector('[data-pyreon-sortable-instructions]')).toBeNull()

    items.set([])
    await microtasks()
    expect(ul.children).toHaveLength(0)
    unmount()
  })
})
