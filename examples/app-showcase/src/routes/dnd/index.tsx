import { useDraggable, useDroppable, useFileDrop, useSortable } from '@pyreon/dnd'
import { signal } from '@pyreon/reactivity'

/**
 * Drag & drop showcase — three scenarios, each visibly distinct in the
 * DOM so the e2e suite can target them by `data-testid`:
 *
 *   1. **Sortable list** (`data-testid="sortable"`) — uses `useSortable`
 *      with a keyed `<For>`-style render. Pointer drag reorders items;
 *      `data-active` on the dragging row, `data-over-edge` on the
 *      hovered drop target.
 *
 *   2. **Draggable card → drop zone** (`data-testid="card-drop"`) — uses
 *      `useDraggable` + `useDroppable`. Card has `data-dragging` while
 *      pressed; drop zone has `data-over` while hovered. After successful
 *      drop, `data-dropped="true"` and the dropped payload is visible
 *      in the zone's text.
 *
 *   3. **File drop zone** (`data-testid="file-drop"`) — uses `useFileDrop`
 *      with an `image/*` accept filter. `data-over` while files are
 *      dragged in; `data-files="<count>"` after a successful drop. The
 *      e2e spec dispatches a synthetic DataTransfer with a fake File.
 */
export default function DndRoute() {
  // ─── Sortable list ────────────────────────────────────────────────────
  const items = signal([
    { id: '1', label: 'Alice' },
    { id: '2', label: 'Bob' },
    { id: '3', label: 'Charlie' },
    { id: '4', label: 'Dana' },
  ])

  const sortable = useSortable({
    items,
    by: (it) => it.id,
    onReorder: (next) => items.set(next),
  })
  // @pyreon/dnd's exported `containerRef` / `itemRef` types are
  // `(el: HTMLElement) => void` (non-null), but Pyreon's `RefProp` widens
  // the callback to accept `T | null` (called with null on unmount).
  // Adapt at the call site so the demo type-checks under strict mode.
  const containerRefAdapter = (el: HTMLElement | null) => {
    if (el) sortable.containerRef(el)
  }
  const itemRefAdapter = (id: string) => (el: HTMLElement | null) => {
    if (el) sortable.itemRef(id)(el)
  }

  // ─── Draggable card → drop zone ───────────────────────────────────────
  let cardEl: HTMLElement | null = null
  let zoneEl: HTMLElement | null = null
  const droppedPayload = signal<string | null>(null)

  const { isDragging } = useDraggable<{ kind: 'card'; id: string; label: string }>({
    element: () => cardEl,
    data: { kind: 'card', id: 'card-1', label: 'Move me' },
  })

  const { isOver: isCardOver } = useDroppable<{ kind: 'card'; id: string; label: string }>({
    element: () => zoneEl,
    canDrop: (data) => data.kind === 'card',
    onDrop: (data) => droppedPayload.set(`${data.label} (${data.id})`),
  })

  // ─── File drop ────────────────────────────────────────────────────────
  let fileZoneEl: HTMLElement | null = null
  const droppedFiles = signal<File[]>([])

  const { isOver: isFileOver, isDraggingFiles } = useFileDrop({
    element: () => fileZoneEl,
    accept: ['image/*'],
    onDrop: (files) => droppedFiles.set(files),
  })

  return (
    <div style="padding: 24px; max-width: 880px; margin: 0 auto; display: flex; flex-direction: column; gap: 32px">
      <header>
        <h1 style="margin: 0 0 8px; font-size: 28px">Drag & Drop</h1>
        <p style="margin: 0; color: #64748b; font-size: 14px; line-height: 1.6">
          Three @pyreon/dnd scenarios in one page. Each section is independently
          tested in <code>e2e/app-showcase-dnd.spec.ts</code>.
        </p>
      </header>

      {/* ─── Sortable list ──────────────────────────────────────────── */}
      <section data-testid="sortable" style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; background: white">
        <h2 style="margin: 0 0 12px; font-size: 18px">1. Sortable list</h2>
        <p style="margin: 0 0 16px; color: #64748b; font-size: 13px">
          Drag rows to reorder. Order shown below; `useSortable` writes the new
          order back to the signal via <code>onReorder</code>.
        </p>
        <ul
          ref={containerRefAdapter}
          style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px"
          data-testid="sortable-list"
        >
          {() =>
            items().map((item) => (
              <li
                ref={itemRefAdapter(item.id)}
                key={item.id}
                data-itemid={item.id}
                data-active={sortable.activeId() === item.id ? 'true' : 'false'}
                data-over-edge={
                  sortable.overId() === item.id ? (sortable.overEdge() ?? '') : ''
                }
                style="padding: 12px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; cursor: grab; user-select: none; font-size: 14px"
              >
                {item.label}
              </li>
            ))
          }
        </ul>
        <p
          data-testid="sortable-order"
          style="margin: 12px 0 0; font-family: monospace; font-size: 12px; color: #475569"
        >
          {() => `order: ${items().map((i) => i.id).join(', ')}`}
        </p>
      </section>

      {/* ─── Draggable card → drop zone ─────────────────────────────── */}
      <section data-testid="card-drop" style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; background: white">
        <h2 style="margin: 0 0 12px; font-size: 18px">2. Draggable → drop zone</h2>
        <p style="margin: 0 0 16px; color: #64748b; font-size: 13px">
          Drag the card into the drop zone. The drop handler reads the payload
          from <code>useDraggable</code>'s data and writes it back to a signal.
        </p>
        <div style="display: flex; gap: 24px; align-items: stretch">
          <div
            ref={(el) => {
              cardEl = el
            }}
            data-testid="card"
            data-dragging={isDragging() ? 'true' : 'false'}
            style="flex: 0 0 160px; padding: 16px; background: #6366f1; color: white; border-radius: 10px; cursor: grab; user-select: none; display: flex; align-items: center; justify-content: center; font-weight: 500"
          >
            Move me
          </div>
          <div
            ref={(el) => {
              zoneEl = el
            }}
            data-testid="zone"
            data-over={isCardOver() ? 'true' : 'false'}
            data-dropped={droppedPayload() != null ? 'true' : 'false'}
            style="flex: 1; min-height: 80px; border: 2px dashed #cbd5e1; border-radius: 10px; padding: 16px; display: flex; align-items: center; justify-content: center; color: #475569; background: #f8fafc"
          >
            {() => droppedPayload() ?? 'Drop here'}
          </div>
        </div>
      </section>

      {/* ─── File drop ──────────────────────────────────────────────── */}
      <section data-testid="file-drop" style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; background: white">
        <h2 style="margin: 0 0 12px; font-size: 18px">3. File drop</h2>
        <p style="margin: 0 0 16px; color: #64748b; font-size: 13px">
          Drop files anywhere on this card. Filtered to <code>image/*</code> via
          <code>accept</code>; non-matching files are ignored.
        </p>
        <div
          ref={(el) => {
            fileZoneEl = el
          }}
          data-testid="file-zone"
          data-over={isFileOver() ? 'true' : 'false'}
          data-dragging={isDraggingFiles() ? 'true' : 'false'}
          data-files={String(droppedFiles().length)}
          style="min-height: 100px; border: 2px dashed #cbd5e1; border-radius: 10px; padding: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: #475569; background: #f8fafc"
        >
          {() => {
            const f = droppedFiles()
            if (f.length === 0) return 'Drop image files here'
            return `${f.length} file(s): ${f.map((x) => x.name).join(', ')}`
          }}
        </div>
      </section>
    </div>
  )
}

export const meta = {
  title: 'Drag & Drop — Pyreon App Showcase',
}
