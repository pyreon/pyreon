import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — dnd snapshot', () => {
  it('renders to llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(`"- @pyreon/dnd — Signal-driven drag and drop over @atlaskit/pragmatic-drag-and-drop — draggable, droppable, sortable, file drop, monitor. The element-bound hooks (\`useDraggable\` / \`useDroppable\` / \`useFileDrop\`) defer pdnd registration to the next microtask so \`ref\` callbacks are populated first — call the hook in the component body and let the ref land. \`useDragMonitor\` registers immediately (it has no element to wait for)."`)
  })

  it('renders to llms-full.txt section', () => {
    expect(renderLlmsFullSection(manifest)).toMatchInlineSnapshot(`
      "## @pyreon/dnd — Drag & Drop

      Signal-driven drag and drop for Pyreon. A thin wrapper over Atlassian's \`pragmatic-drag-and-drop\` (the engine behind Trello / Jira): pdnd owns the native-event lifecycle, hit-testing, and edge detection; \`@pyreon/dnd\` adapts every state field into a Pyreon signal accessor (\`isDragging\` / \`isOver\` / \`activeId\` / \`overId\` / \`overEdge\` / \`dragData\`) and wires every pdnd teardown into \`onCleanup\`. Five hooks cover the common surfaces — single draggable, single drop target, sortable list with edge detection + auto-scroll + keyboard reordering + opt-in cross-list boards, native-file drop with MIME / count filtering, and a page-global drag monitor.

      \`\`\`typescript
      import { signal } from '@pyreon/reactivity'
      import { For } from '@pyreon/core'
      import { useDraggable, useDroppable, useSortable } from '@pyreon/dnd'

      // Single draggable — element is a GETTER, state is a signal accessor:
      function Card(props: { card: { id: string; title: string } }) {
        let el: HTMLElement | null = null
        const { isDragging } = useDraggable({
          element: () => el,
          data: { id: props.card.id, type: 'card' },
        })
        return (
          <div ref={(node) => (el = node)} class={() => (isDragging() ? 'opacity-50' : '')}>
            {props.card.title}
          </div>
        )
      }

      // Drop target — canDrop filters, sourceData is DragData (narrow it yourself):
      function DropZone() {
        let el: HTMLElement | null = null
        const { isOver } = useDroppable({
          element: () => el,
          canDrop: (data) => data.type === 'card',
          onDrop: (data) => acceptCard(data.id as string),
        })
        return <div ref={(node) => (el = node)} class={() => (isOver() ? 'bg-blue-50' : '')}>Drop here</div>
      }

      // Sortable list — keyed like <For by>, hook computes the reorder, YOU commit it:
      const cols = signal<Column[]>([])
      const { containerRef, itemRef, activeId, overId, overEdge } = useSortable({
        items: () => cols(),
        by: (c) => c.id,
        onReorder: (next) => cols.set(next),
        axis: 'vertical',
      })

      ;<ul ref={containerRef}>
        <For each={cols()} by={(c) => c.id}>
          {(col) => (
            <li
              ref={itemRef(col.id)}
              class={activeId() === col.id ? 'dragging' : ''}
              style={() => (overId() === col.id && overEdge() === 'top' ? 'border-top: 2px solid blue' : '')}
            >
              {col.name}
            </li>
          )}
        </For>
      </ul>
      \`\`\`

      > **Deferred registration**: The element-bound hooks (\`useDraggable\` / \`useDroppable\` / \`useFileDrop\`) defer pdnd registration to the next microtask so \`ref\` callbacks are populated first — call the hook in the component body and let the ref land. \`useDragMonitor\` registers immediately (it has no element to wait for).
      >
      > **SSR-safe**: Every hook short-circuits when \`document\` is undefined and returns inert zero-state accessors (\`isDragging: () => false\`, no-op refs). Real registration happens client-side only — nothing to guard manually.
      >
      > **pdnd not bundled**: The three \`@atlaskit/pragmatic-drag-and-drop*\` packages are regular dependencies (installed automatically, never imported directly by consumers) and tree-shake per hook — \`useDraggable\` pulls only the element adapter (~6KB min), \`useFileDrop\` only the external/file adapter, \`useSortable\` adds auto-scroll + hitbox.
      >
      > **No dispose()**: Cleanup is wired into Pyreon's \`onCleanup\` — teardown fires when the owning component unmounts. There is no public teardown method; unmount the component (e.g. behind \`<Show>\`) to stop a drag interaction.
      "
    `)
  })

  it('renders to MCP api-reference entries', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).length).toBe(5)
    expect(record['dnd/useSortable']!.notes).toContain('reorderable')
    expect(record['dnd/useSortable']!.mistakes?.split('\n').length).toBe(6)
  })
})
