import { useDraggable, useDroppable } from '@pyreon/dnd'
import { computed, signal } from '@pyreon/reactivity'
import { toast } from '@pyreon/toast'
import { useBoardModel, type Card, type Column } from '../lib/board'

interface CardItemProps {
  cardId: string
  columnId: string
}

/**
 * Individual kanban card. Looks up its own data from the global board
 * store (W22 pattern — see BoardColumn). Two DND roles via the
 * lower-level primitives (W18 — useSortable is single-list).
 */
export default function CardItem(props: CardItemProps) {
  const board = useBoardModel()
  let cardEl: HTMLElement | null = null
  const overEdge = signal<'before' | 'after' | null>(null)

  // Reactive card data — re-derives from board state.
  const card = computed<Card | undefined>(() => {
    for (const col of board.columns() as Column[]) {
      const found = col.cards.find((c) => c.id === props.cardId)
      if (found) return found
    }
    return undefined
  })

  const { isDragging } = useDraggable({
    element: () => cardEl,
    data: {
      kind: 'kanban-card',
      cardId: props.cardId,
      fromColumnId: props.columnId,
    } as never,
  })

  useDroppable({
    element: () => cardEl,
    data: {
      kind: 'kanban-drop-card',
      cardId: props.cardId,
      columnId: props.columnId,
    } as never,
    canDrop: (data) =>
      (data as { kind?: string }).kind === 'kanban-card' &&
      (data as { cardId?: string }).cardId !== props.cardId,
    onDragEnter: () => overEdge.set('before'),
    onDragLeave: () => overEdge.set(null),
    onDrop: (data) => {
      overEdge.set(null)
      const { cardId } = data as { cardId: string }
      const cols = board.columns()
      const targetCol = cols.find((c) => c.id === props.columnId)
      if (!targetCol) return
      const targetIndex = targetCol.cards.findIndex(
        (c) => c.id === props.cardId,
      )
      if (targetIndex === -1) return
      board.moveCard(cardId, props.columnId, targetIndex)
    },
  })

  const handleDelete = () => {
    const c = card()
    if (!c) return
    board.removeCard(props.cardId)
    toast.info(`Removed "${c.title}"`)
  }

  return (
    <div
      class="card"
      data-card-id={props.cardId}
      data-testid={`card-${props.cardId}`}
      data-active={() => (isDragging() ? 'true' : 'false')}
      data-over-edge={() => overEdge() ?? ''}
      ref={(el) => {
        cardEl = el
      }}
    >
      <p class="card-title">{() => card()?.title ?? ''}</p>
      <div class="card-meta">
        <span
          class={() => `card-priority priority-${card()?.priority ?? 'medium'}`}
          data-testid={`card-${props.cardId}-priority`}
        >
          {() => card()?.priority ?? ''}
        </span>
      </div>
      <div class="card-actions">
        <button
          type="button"
          onClick={handleDelete}
          data-testid={`card-${props.cardId}-delete`}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
