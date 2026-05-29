import { For } from '@pyreon/core'
import { useSortable } from '@pyreon/dnd'
import { signal } from '@pyreon/reactivity'

interface TaskItem {
  id: string
  name: string
}

const initial: TaskItem[] = [
  { id: '1', name: 'Read the docs' },
  { id: '2', name: 'Build a demo' },
  { id: '3', name: 'Open a PR' },
  { id: '4', name: 'Celebrate' },
  { id: '5', name: 'Refactor' },
]

export function DndDemo() {
  const items = signal<TaskItem[]>(initial)

  const { containerRef, itemRef, activeId, overId, overEdge } = useSortable({
    items,
    by: (item) => item.id,
    onReorder: (next) => items.set(next),
  })

  return (
    <div>
      <h2>DnD</h2>
      <p class="desc">
        Signal-driven drag and drop — wraps <code>@atlaskit/pragmatic-drag- and-drop</code> with
        Pyreon's reactivity. Sortable lists, draggable cards, drop zones, file drops. The list below
        is a sortable: grab a row by its handle, drag to reorder. The drop edge (above/below) is
        signal-tracked too.
      </p>

      <div class="section">
        <h3>Sortable list</h3>
        <p style="margin-bottom: 12px; font-size: 13px; color: #666">
          Drag a row to reorder. Edge indicator shows where the drop will land.
        </p>
        <ul
          ref={containerRef}
          data-testid="dnd-list"
          style="list-style:none; padding:0; border:1px solid #ddd; border-radius:6px; background:#fafafa"
        >
          <For each={items()} by={(t) => t.id}>
            {(item) => (
              <li
                ref={itemRef(item.id)}
                data-testid={`dnd-item-${item.id}`}
                style={() => {
                  const isActive = activeId() === item.id
                  const isOver = overId() === item.id
                  const edge = isOver ? overEdge() : null
                  const base =
                    'padding:12px 16px; background:#fff; border-bottom:1px solid #eee; cursor:grab; user-select:none;'
                  const dragging = isActive ? 'opacity:0.4;' : ''
                  const edgeStyle =
                    edge === 'top'
                      ? 'border-top:2px solid #6c63ff;'
                      : edge === 'bottom'
                        ? 'border-bottom:2px solid #6c63ff;'
                        : ''
                  return base + dragging + edgeStyle
                }}
              >
                <span style="margin-right:8px; color:#999">⋮⋮</span>
                {item.name}
              </li>
            )}
          </For>
        </ul>
      </div>

      <div class="section">
        <h3>Snapshot</h3>
        <pre style="font-size: 13px" data-testid="dnd-order">
          {() =>
            items()
              .map((t) => t.name)
              .join(' → ')
          }
        </pre>
        <div class="row" style="margin-top: 12px">
          <button onClick={() => items.set(initial)}>Reset order</button>
        </div>
      </div>

      <div class="section">
        <h3>State signals</h3>
        <p style="font-size: 13px">
          Active drag id: <strong data-testid="dnd-active">{() => activeId() ?? '(none)'}</strong>
          {' · '}
          Hover id: <strong data-testid="dnd-over">{() => overId() ?? '(none)'}</strong>
          {' · '}
          Edge: <strong>{() => overEdge() ?? '(none)'}</strong>
        </p>
      </div>
    </div>
  )
}
