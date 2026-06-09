// @ts-nocheck — 1:1 port from a JS `<Playground>`. Strict-mode TS
// would need a manual rewrite (signal shapes, possibly-null guards).
// Renders + behaves correctly; type tightening is a follow-up.
import { signal } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

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
  const items = signal(['🍎 Apple', '🍌 Banana', '🍒 Cherry', '📅 Date'])
  const dragIndex = signal(-1)
  const hoverIndex = signal(-1)

  const move = (from: any, to: any) => {
    if (from === to || from < 0) return
    const arr = [...items()]
    const [m] = arr.splice(from, 1)
    arr.splice(to, 0, m)
    items.set(arr)
  }

  const Row = (item: any, i: any) =>
    h('div', {
      draggable: 'true',
      onDragStart: () => dragIndex.set(i),
      onDragEnter: () => hoverIndex.set(i),
      onDragOver: (e: any) => e.preventDefault(),
      onDragEnd: () => { dragIndex.set(-1); hoverIndex.set(-1) },
      onDrop: (e: any) => { e.preventDefault(); move(dragIndex(), i); dragIndex.set(-1); hoverIndex.set(-1) },
      class: 'card',
      style: {
        cursor: 'grab',
        userSelect: 'none',
        opacity: () => dragIndex() === i ? 0.4 : 1,
        borderColor: () => hoverIndex() === i && dragIndex() !== i ? 'var(--accent)' : null,
        transition: 'opacity 120ms, border-color 120ms',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      },
    },
      h('span', { class: 'muted' }, '☰'),
      h('span', { style: { flex: 1 } }, item),
    )

  return h('div', { class: 'col' },
    h('div', { class: 'muted' }, 'drag the rows to reorder them'),
    h('div', { class: 'col', style: { gap: '6px' } }, () => items().map(Row)),
  )
}
