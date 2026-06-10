import { onUnmount } from '@pyreon/core'
import { effect, signal } from '@pyreon/reactivity'
import { useRoute } from '@pyreon/router'
import { toast } from '@pyreon/toast'
import { Backlog } from '../components/Backlog'
import { CardPanel } from '../components/CardPanel'
import { Column } from '../components/Column'
import { Toolbar } from '../components/Toolbar'
import { canEdit } from '../state/permissions'
import {
  type BoardDoc,
  COLUMN_IDS,
  type ColumnId,
  type ConnectionState,
  createBoardDoc,
} from '../sync/board-doc'

// Relay URL from `?ws=` (the e2e points isolated browser contexts at the test
// relay this way) or null → cross-tab-only sync. Read once at module load.
const RELAY_URL = new URLSearchParams(location.search).get('ws')

export function BoardRoute() {
  // `useRoute()` is a reactive accessor — the router keeps THIS component
  // mounted across param-only navigations (same route record), so we REACT to
  // the room id rather than relying on a remount: dispose the old board doc and
  // build a new one when the id changes. `onUnmount` disposes the last one.
  // (Disposing tears down the WebSocket + BroadcastChannel + IndexedDB + every
  // CRDT observer — the reason board-doc isn't a leaky module-level cache.)
  const route = useRoute()
  const board = signal<BoardDoc | null>(null)
  const openCardId = signal<string | null>(null)

  let current: BoardDoc | null = null
  let currentId: string | null = null
  effect(() => {
    const id = route().params.id
    if (!id || id === currentId) return
    currentId = id
    current?.dispose()
    openCardId.set(null)
    current = createBoardDoc(id, RELAY_URL)
    board.set(current)
  })
  onUnmount(() => current?.dispose())

  // Surface relay connection transitions as toasts (@pyreon/toast driven by the
  // @pyreon/sync transport callbacks). Reset the baseline when the board itself
  // changes so switching boards doesn't fire a spurious toast.
  let lastConn: ConnectionState | null = null
  let watched: BoardDoc | null = null
  effect(() => {
    const b = board()
    if (b !== watched) {
      watched = b
      lastConn = null
    }
    if (!b) return
    const conn = b.connection()
    if (lastConn !== null && conn !== lastConn) {
      if (conn === 'offline') toast.error('Connection lost — editing offline; changes replay on reconnect')
      else if (conn === 'online') toast.success('Connected — syncing live')
    }
    lastConn = conn
  })

  return () => {
    const b = board()
    // Loading gate: we await persisted IndexedDB state before seeding the title
    // (the whenSynced contract) — see sync/board-doc.
    if (!b || !b.ready()) return <div class="loading">Loading board…</div>
    // Move a card to the next column — the keyboard/click-accessible counterpart
    // to dragging it there. Uses the SAME positional CRDT ops the cross-column
    // drag uses (delete from source, push to destination), so it merges + syncs
    // identically. The board route owns this because it spans all columns.
    const moveToNext = (fromCol: ColumnId, cardId: string): void => {
      const i = COLUMN_IDS.indexOf(fromCol)
      if (i < 0 || i >= COLUMN_IDS.length - 1) return
      const toCol = COLUMN_IDS[i + 1]!
      const src = b.columns[fromCol]
      const idx = src().findIndex((c) => c.id === cardId)
      if (idx < 0) return
      const card = src()[idx]!
      src.delete(idx, 1)
      b.columns[toCol].push(card)
    }

    return (
      <div>
        <Toolbar board={b} />
        <div class="columns">
          {COLUMN_IDS.map((colId) => (
            <Column
              colId={colId}
              cards={b.columns[colId]}
              canEdit={canEdit}
              isLast={colId === COLUMN_IDS[COLUMN_IDS.length - 1]}
              onOpen={(id) => openCardId.set(id)}
              onMoveNext={(id) => moveToNext(colId, id)}
            />
          ))}
        </div>
        <Backlog board={b} />
        {/* Accessor child (not <Show>) so opening a DIFFERENT card re-emits a
            fresh CardPanel — which disposes the previous card's Y.Text and opens
            the new one. */}
        {() => {
          const id = openCardId()
          if (id === null) return null
          return <CardPanel board={b} cardId={id} onClose={() => openCardId.set(null)} />
        }}
      </div>
    )
  }
}
