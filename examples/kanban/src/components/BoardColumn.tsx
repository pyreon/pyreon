import { For } from '@pyreon/core'
import { useDroppable } from '@pyreon/dnd'
import { computed, signal } from '@pyreon/reactivity'
import { toast } from '@pyreon/toast'
import { useBoardModel, type Column, type Priority } from '../lib/board'
import { useFilterTerm } from '../lib/filter-context'
import CardItem from './CardItem'

interface BoardColumnProps {
  columnId: string
}

/**
 * Single kanban column. Looks up its own state from the global board
 * store via `columnId` — this is the canonical Pyreon pattern for
 * keyed-list children. Passing the full `column` object as a prop
 * doesn't work because `<For>`'s keyed reuse doesn't propagate prop
 * updates to existing children (W22 from kanban audit). Read from
 * the live signal instead.
 *
 * Uses `useDroppable` (not `useSortable`) because `useSortable` is
 * single-list-only — its `canDrop` rejects drops from other sortables
 * via per-instance `SORT_ID` (W18 from kanban audit). Cross-column
 * drag is built directly on `useDraggable` + `useDroppable`.
 */
export default function BoardColumn(props: BoardColumnProps) {
  const board = useBoardModel()
  const getTerm = useFilterTerm()
  let columnEl: HTMLElement | null = null

  // Reactive column data — re-derives when the board state-tree updates.
  const column = computed<Column | undefined>(() =>
    (board.columns() as Column[]).find((c) => c.id === props.columnId),
  )

  // Column itself is a drop target — drops at column-level append.
  useDroppable<{ kind: 'kanban-card'; cardId: string; fromColumnId: string }>({
    element: () => columnEl,
    data: { kind: 'kanban-drop-column', columnId: props.columnId } as never,
    canDrop: (data) => (data as { kind?: string }).kind === 'kanban-card',
    onDrop: (data) => {
      const { cardId, fromColumnId } = data as {
        cardId: string
        fromColumnId: string
      }
      if (fromColumnId === props.columnId) return // same-column → card-edge drop handles it
      board.moveCard(cardId, props.columnId)
    },
  })

  const addOpen = signal(false)
  const newTitle = signal('')
  const newPriority = signal<Priority>('medium')

  const handleAddCard = () => {
    const title = newTitle().trim()
    if (!title) return
    board.addCard(props.columnId, { title, priority: newPriority() })
    newTitle.set('')
    newPriority.set('medium')
    addOpen.set(false)
    toast.success(`Added "${title}"`)
  }

  return (
    <div
      class="column"
      data-column-id={props.columnId}
      data-testid={`column-${props.columnId}`}
      ref={(el) => {
        columnEl = el
      }}
    >
      <div class="column-header">
        <span>{() => column()?.title ?? ''}</span>
        <span
          class="column-count"
          data-testid={`column-${props.columnId}-count`}
        >
          {() => column()?.cards.length ?? 0}
        </span>
      </div>

      <div class="column-cards">
        {/*
         * W21 from kanban audit — Inner <For each> with an indirect read
         * through the column-level `computed()` (i.e. `column()?.cards`)
         * DOES NOT propagate board updates to keyed children. Reading the
         * state-tree directly inside the For accessor works.
         */}
        <For
          each={() => {
            const cards =
              (board.columns() as Column[]).find(
                (c) => c.id === props.columnId,
              )?.cards ?? []
            const term = getTerm().trim().toLowerCase()
            if (!term) return cards
            return cards.filter((c) =>
              c.title.toLowerCase().includes(term),
            )
          }}
          by={(c) => c.id}
        >
          {(card) => <CardItem cardId={card.id} columnId={props.columnId} />}
        </For>
      </div>

      {() =>
        addOpen() ? (
          <div class="add-card-form">
            <textarea
              placeholder="Enter card title…"
              value={() => newTitle()}
              onInput={(e) =>
                newTitle.set((e.currentTarget as HTMLTextAreaElement).value)
              }
              autoFocus
              data-testid={`new-card-input-${props.columnId}`}
            />
            <div class="actions">
              <select
                value={() => newPriority()}
                onChange={(e) =>
                  newPriority.set(
                    (e.currentTarget as HTMLSelectElement).value as Priority,
                  )
                }
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <button
                type="button"
                class="btn-primary"
                onClick={handleAddCard}
                data-testid={`new-card-add-${props.columnId}`}
              >
                Add
              </button>
              <button
                type="button"
                class="btn-secondary"
                onClick={() => {
                  addOpen.set(false)
                  newTitle.set('')
                }}
              >
                ✕
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            class="add-card-btn"
            onClick={() => addOpen.set(true)}
            data-testid={`add-card-btn-${props.columnId}`}
          >
            + Add a card
          </button>
        )
      }
    </div>
  )
}
