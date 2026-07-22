import { For } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'
import { useSortable } from './use-sortable'
import type { UseSortableResult } from './types'

// Real-Chromium cross-list (`groupId`) coverage. The unit suite
// (`tests/use-sortable-cross-list.test.ts`) replays MOCKED pdnd configs —
// it proves the handler logic but not that REAL pragmatic-drag-and-drop
// accepts a cross-sortable drag, routes it to the item-level drop target,
// and that a `<For>`-rendered board re-renders into the right DOM order.
// This spec drives the full stack: real pdnd + synthetic DragEvent
// sequence (the e2e/app-showcase-dnd.spec.ts dispatch pattern) across TWO
// mounted lists, asserting the callbacks AND the resulting DOM order.

type Card = { id: string; name: string }

function Board(props: { hook: UseSortableResult; items: () => Card[]; testid: string }) {
  return (
    <ul
      ref={props.hook.containerRef}
      data-testid={props.testid}
      style="list-style:none;padding:0;margin:0;width:220px;min-height:120px"
    >
      <For each={props.items} by={(c: Card) => c.id}>
        {(c: Card) => (
          <li
            ref={props.hook.itemRef(c.id)}
            data-key={c.id}
            style="display:block;width:200px;height:32px"
          >
            {c.name}
          </li>
        )}
      </For>
    </ul>
  )
}

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

const domOrder = (container: HTMLElement, testid: string) =>
  Array.from(
    container.querySelectorAll(`[data-testid="${testid}"] li[data-key]`),
    (li) => (li as HTMLElement).dataset.key,
  )

describe('useSortable — cross-list drag between two real <For>-rendered boards', () => {
  it('moves an item from board A to board B: callbacks fire + DOM order updates', async () => {
    const itemsA = signal<Card[]>([
      { id: 'a1', name: 'Alpha' },
      { id: 'a2', name: 'Beta' },
    ])
    const itemsB = signal<Card[]>([{ id: 'b1', name: 'Gamma' }])

    const crossDrops: Card[] = []
    const crossReceives: Array<{ item: Card; index: number }> = []

    const hookA = useSortable<Card>({
      items: itemsA,
      by: (c) => c.id,
      onReorder: (next) => itemsA.set(next),
      groupId: 'board',
      onCrossListDrop: (item) => {
        crossDrops.push(item)
        itemsA.set(itemsA().filter((c) => c.id !== item.id))
      },
    })
    const hookB = useSortable<Card>({
      items: itemsB,
      by: (c) => c.id,
      onReorder: (next) => itemsB.set(next),
      groupId: 'board',
      onCrossListReceive: (item, index) => {
        crossReceives.push({ item, index })
        const next = [...itemsB()]
        next.splice(index, 0, item)
        itemsB.set(next)
      },
    })

    const { container, unmount } = mountInBrowser(
      <div style="display:flex;gap:24px">
        <Board hook={hookA} items={itemsA} testid="board-a" />
        <Board hook={hookB} items={itemsB} testid="board-b" />
      </div>,
    )
    await microtasks()

    expect(domOrder(container, 'board-a')).toEqual(['a1', 'a2'])
    expect(domOrder(container, 'board-b')).toEqual(['b1'])

    // Drag a1 (board A) onto b1's TOP edge (board B) → insert before b1.
    const a1 = container.querySelector('[data-key="a1"]') as HTMLElement
    const b1 = container.querySelector('[data-key="b1"]') as HTMLElement
    const dataTransfer = new DataTransfer()

    fire(a1, 'dragstart', dataTransfer)
    await microtasks()
    const rb1 = b1.getBoundingClientRect()
    const topOfB1 = { x: rb1.left + rb1.width / 2, y: rb1.top + 2 }
    fire(b1, 'dragenter', dataTransfer, topOfB1)
    fire(b1, 'dragover', dataTransfer, topOfB1)
    fire(b1, 'drop', dataTransfer, topOfB1)
    fire(a1, 'dragend', dataTransfer)

    // pdnd processes drops asynchronously — poll for the committed state.
    await expect.poll(() => crossReceives.length, { timeout: 2000 }).toBe(1)
    expect(crossReceives[0]!.item).toEqual({ id: 'a1', name: 'Alpha' })
    expect(crossReceives[0]!.index).toBe(0) // top edge → before b1
    expect(crossDrops).toEqual([{ id: 'a1', name: 'Alpha' }])

    // Signals committed…
    expect(itemsA().map((c) => c.id)).toEqual(['a2'])
    expect(itemsB().map((c) => c.id)).toEqual(['a1', 'b1'])
    // …and the REAL DOM re-rendered in the right order on both boards.
    await expect.poll(() => domOrder(container, 'board-a'), { timeout: 2000 }).toEqual(['a2'])
    await expect
      .poll(() => domOrder(container, 'board-b'), { timeout: 2000 })
      .toEqual(['a1', 'b1'])

    unmount()
  })

  it('a drop on board B\'s CONTAINER (below the items) appends at the end', async () => {
    const itemsA = signal<Card[]>([{ id: 'a1', name: 'Alpha' }])
    const itemsB = signal<Card[]>([
      { id: 'b1', name: 'Gamma' },
      { id: 'b2', name: 'Delta' },
    ])
    const crossReceives: Array<{ item: Card; index: number }> = []

    const hookA = useSortable<Card>({
      items: itemsA,
      by: (c) => c.id,
      onReorder: (next) => itemsA.set(next),
      groupId: 'board2',
      onCrossListDrop: (item) => itemsA.set(itemsA().filter((c) => c.id !== item.id)),
    })
    const hookB = useSortable<Card>({
      items: itemsB,
      by: (c) => c.id,
      onReorder: (next) => itemsB.set(next),
      groupId: 'board2',
      onCrossListReceive: (item, index) => {
        crossReceives.push({ item, index })
        const next = [...itemsB()]
        next.splice(index, 0, item)
        itemsB.set(next)
      },
    })

    const { container, unmount } = mountInBrowser(
      <div style="display:flex;gap:24px">
        <Board hook={hookA} items={itemsA} testid="board-a" />
        <Board hook={hookB} items={itemsB} testid="board-b" />
      </div>,
    )
    await microtasks()

    const a1 = container.querySelector('[data-key="a1"]') as HTMLElement
    const boardB = container.querySelector('[data-testid="board-b"]') as HTMLElement
    const dataTransfer = new DataTransfer()

    fire(a1, 'dragstart', dataTransfer)
    await microtasks()
    // Empty area below the two items (min-height 120, items end at 64).
    const rb = boardB.getBoundingClientRect()
    const emptyArea = { x: rb.left + rb.width / 2, y: rb.bottom - 8 }
    fire(boardB, 'dragenter', dataTransfer, emptyArea)
    fire(boardB, 'dragover', dataTransfer, emptyArea)
    fire(boardB, 'drop', dataTransfer, emptyArea)
    fire(a1, 'dragend', dataTransfer)

    await expect.poll(() => crossReceives.length, { timeout: 2000 }).toBe(1)
    // Container-level receive appends at the END of board B.
    expect(crossReceives[0]!.index).toBe(2)
    await expect
      .poll(() => domOrder(container, 'board-b'), { timeout: 2000 })
      .toEqual(['b1', 'b2', 'a1'])

    unmount()
  })
})
