import { For } from '@pyreon/core'
import { useSortable } from '@pyreon/dnd'
import type { SyncedList } from '@pyreon/sync/yjs'
import { type Card, type ColumnId, COLUMN_LABELS, newCardId } from '../sync/board-doc'

interface ColumnProps {
  colId: ColumnId
  /** This column's synced cards. A SyncedList<Card> IS a Signal<Card[]>. */
  cards: SyncedList<Card>
  canEdit: () => boolean
  /** True for the last column ('done') — hides the "move next" button. */
  isLast: boolean
  onOpen: (cardId: string) => void
  onMoveNext: (cardId: string) => void
}

/**
 * One kanban column. The dnd↔sync integration lives here:
 *
 * - `items` feeds on the syncedList directly (it's a reactive `Signal<Card[]>`).
 *   A REMOTE list change updates `cards()` → the keyed `<For>` reconciles
 *   O(changed) → unchanged cards keep their DOM node + drag binding; new cards
 *   get an `itemRef`.
 * - **Within-column reorder** → `cards.set(next)` (coarse whole-list replace;
 *   concurrent within-column reorders resolve by that op, not a positional
 *   merge — an acceptable showcase trade-off).
 * - **Cross-column move** (shared `groupId: 'board'`) → POSITIONAL ops on both
 *   lists: the destination column's `onCrossListReceive` inserts, the source
 *   column's `onCrossListDrop` deletes. Positional ops merge correctly across
 *   concurrent clients — a real CRDT move other clients see live.
 */
export function Column(props: ColumnProps) {
  const cards = props.cards

  const sortable = useSortable<Card>({
    items: () => cards(),
    by: (c) => c.id,
    onReorder: (next) => cards.set(next),
    groupId: 'board',
    onCrossListDrop: (item) => {
      const idx = cards().findIndex((c) => c.id === item.id)
      if (idx >= 0) cards.delete(idx, 1)
    },
    onCrossListReceive: (item, insertAt) => cards.insert(insertAt, [item]),
  })

  // DEV-only test hook: drive a deterministic reorder (first card → last) on
  // this column's syncedList — the SAME `cards.set` path useSortable.onReorder
  // takes. The e2e uses this instead of a synthetic HTML5 drag because pdnd's
  // drag gesture is a silent no-op on headless Linux CI even with its listeners
  // attached (the gesture is @pyreon/dnd's concern, covered by app-showcase-dnd
  // + dnd's own browser tests); collab-board's point is CRDT SYNC. Stripped from
  // production builds — mirrors CardPanel's __cardEditor hook.
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const w = window as unknown as { __reorderColumns?: Record<string, () => void> }
    w.__reorderColumns ??= {}
    w.__reorderColumns[props.colId] = () => {
      const arr = cards()
      if (arr.length > 1) cards.set([...arr.slice(1), arr[0]!])
    }
  }

  function addCard(): void {
    cards.push({ id: newCardId(), title: `Card ${cards().length + 1}`, label: 'none' })
  }

  return (
    <div class="column">
      <h2>{COLUMN_LABELS[props.colId]}</h2>
      <ul class="cards" ref={sortable.containerRef} data-testid={`col-${props.colId}`}>
        <For each={() => cards()} by={(c) => c.id}>
          {(card) => (
            <li
              class="card"
              ref={sortable.itemRef(card.id)}
              data-card-id={card.id}
              data-active={() => (sortable.activeId() === card.id ? 'true' : 'false')}
              data-over-edge={() =>
                sortable.overId() === card.id ? (sortable.overEdge() ?? '') : ''
              }
            >
              <span class="card-label" data-label={card.label} />
              <span class="card-title" onClick={() => props.onOpen(card.id)}>
                {card.title}
              </span>
              {() =>
                props.isLast ? null : (
                  <button
                    class="card-move"
                    title="Move to next column"
                    data-testid={`move-${card.id}`}
                    disabled={() => !props.canEdit()}
                    onClick={(e) => {
                      e.stopPropagation()
                      props.onMoveNext(card.id)
                    }}
                  >
                    →
                  </button>
                )
              }
            </li>
          )}
        </For>
      </ul>
      <button
        class="add-card"
        data-testid={`add-${props.colId}`}
        onClick={addCard}
        disabled={() => !props.canEdit()}
      >
        + Add a card
      </button>
    </div>
  )
}
