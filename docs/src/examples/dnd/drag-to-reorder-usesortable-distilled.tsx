import { signal } from '@pyreon/reactivity'
import { For, h } from '@pyreon/core'

/**
 * Migrated from `<Playground>` — Drag-to-reorder — useSortable distilled.
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 */
export default function DragToReorderUseSortableDistilled() {
  // useSortable() wraps this same pattern with pointer-events,
  // keyboard accessibility, and pragmatic-drag-and-drop's smoother
  // motion. Here we use the raw HTML5 dnd API for clarity.
  //
  // The rows are mounted with a keyed <For> (by the item's own text — the
  // list has no numeric id) so a drop moves the EXISTING DOM node instead
  // of tearing down and remounting every row. <For>'s children callback
  // only receives the item, not its index, so `index()` re-derives the
  // row's CURRENT position from the live array on every event — it must
  // never be captured once, since a drop upstream shifts every index below it.
  const items = signal(['🍎 Apple', '🍌 Banana', '🍒 Cherry', '📅 Date'])
  const dragIndex = signal(-1)
  const hoverIndex = signal(-1)

  const move = (from: number, to: number) => {
    if (from === to || from < 0) return
    const arr = [...items()]
    const [m] = arr.splice(from, 1)
    arr.splice(to, 0, m as string)
    items.set(arr)
  }

  const Row = (item: string) => {
    const index = () => items().indexOf(item)
    return h('div', {
      draggable: 'true',
      onDragStart: () => dragIndex.set(index()),
      onDragEnter: () => hoverIndex.set(index()),
      onDragOver: (e: DragEvent) => e.preventDefault(),
      onDragEnd: () => { dragIndex.set(-1); hoverIndex.set(-1) },
      onDrop: (e: DragEvent) => { e.preventDefault(); move(dragIndex(), index()); dragIndex.set(-1); hoverIndex.set(-1) },
      class: 'card',
      style: () => ({
        cursor: 'grab',
        userSelect: 'none',
        opacity: dragIndex() === index() ? 0.4 : 1,
        borderColor: hoverIndex() === index() && dragIndex() !== index() ? 'var(--accent)' : null,
        transition: 'opacity 120ms, border-color 120ms',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }),
    },
      h('span', { class: 'muted' }, '☰'),
      h('span', { style: { flex: 1 } }, item),
    )
  }

  return h('div', { class: 'col' },
    h('div', { class: 'muted' }, 'drag the rows to reorder them'),
    h('div', { class: 'col', style: { gap: '6px' } },
      h(For, { each: () => items(), by: (item: string) => item, children: Row }),
    ),
  )
}
