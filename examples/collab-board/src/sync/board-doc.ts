// ─────────────────────────────────────────────────────────────────────────────
// The sync layer — the ONE place @pyreon/sync is wired. Everything else in the
// app treats a board's data as ordinary signals.
//
// A board is one CRDT document (one room). Its data:
//   • title       → syncedStore({ title }, { doc })   (a scalar field)
//   • each column → syncedList<Card>(doc, 'col:<id>')  (positional-merge list)
//   • a card's    → syncedText(doc, 'desc:<cardId>')   (character-merge text,
//     description     created on demand — see CardPanel)
//
// Transports + persistence are wired per board and torn down on `dispose()`
// (the board route owns the lifecycle — see routes/board.tsx). This is NOT a
// module-level cache: caching docs across navigation would leak the WebSocket /
// BroadcastChannel / IndexedDB connections.
// ─────────────────────────────────────────────────────────────────────────────
import { signal, type Signal } from '@pyreon/reactivity'
import { type SyncedStore, syncedStore } from '@pyreon/sync'
import {
  connectViaBroadcastChannel,
  connectViaWebSocket,
  createYjsDoc,
  persistViaIndexedDB,
  type SyncedAwareness,
  type SyncedList,
  type SyncedText,
  syncedAwareness,
  syncedList,
  syncedText,
} from '@pyreon/sync/yjs'

export type ColumnId = 'todo' | 'doing' | 'done'
export const COLUMN_IDS: readonly ColumnId[] = ['todo', 'doing', 'done']
export const COLUMN_LABELS: Record<ColumnId, string> = {
  todo: 'To Do',
  doing: 'Doing',
  done: 'Done',
}

export const CARD_LABELS = ['none', 'red', 'green', 'blue', 'purple', 'orange'] as const
export type CardLabel = (typeof CARD_LABELS)[number]

export interface Card {
  id: string
  title: string
  label: CardLabel
}

export interface CardLocation {
  colId: ColumnId
  index: number
  card: Card
}

/**
 * One client's live presence — name + color + an optional live cursor. This is
 * EPHEMERAL: it rides Yjs's awareness protocol (`syncedAwareness`), is never
 * persisted, and is purged the instant a client disconnects (no last-seen
 * filtering, no ghost entries). The cursor updates on every mousemove.
 */
export interface PresenceState {
  name: string
  color: string
  cursor?: { x: number; y: number }
}

/**
 * Connection state, surfaced for the toolbar + toast.
 * - `local`      — no relay configured; cross-TAB sync only (BroadcastChannel).
 * - `connecting` — a relay is configured and we're opening the socket.
 * - `online`     — the relay socket is open (cross-DEVICE sync live).
 * - `offline`    — the relay socket dropped (offline edits replay on reconnect).
 */
export type ConnectionState = 'local' | 'connecting' | 'online' | 'offline'

export interface BoardDoc {
  readonly roomId: string
  readonly columns: Record<ColumnId, SyncedList<Card>>
  /** Live collaborators — ephemeral presence + cursors over Yjs awareness. */
  readonly presence: SyncedAwareness<PresenceState>
  /** A large synced list (the backlog) — rendered virtualized to show
   *  fine-grained sync at scale. */
  readonly backlog: SyncedList<Card>
  /** The board title — reactive read; valid once `ready()` is true. */
  title(): string
  setTitle(value: string): void
  /** Create a collaborative notes editor for a card. Caller disposes it. */
  openNotes(cardId: string): SyncedText
  /** Find a card across all columns (reactive — reads the synced lists). */
  findCard(cardId: string): CardLocation | null
  /** Patch a card's scalar fields (title / label) in place. */
  updateCard(cardId: string, patch: Partial<Omit<Card, 'id'>>): void
  /** Remove a card from whatever column holds it. */
  deleteCard(cardId: string): void
  readonly connection: Signal<ConnectionState>
  /** Flips true once persisted IndexedDB state has loaded (see below). */
  readonly ready: Signal<boolean>
  dispose(): void
}

/** Collision-resistant card id (NOT Date.now()+Math.random()). */
export function newCardId(): string {
  return crypto.randomUUID()
}

/**
 * Build the sync layer for one board (room). `relayUrl` enables cross-device
 * sync; when null, only same-origin cross-tab sync (BroadcastChannel) is active.
 */
export function createBoardDoc(roomId: string, relayUrl: string | null): BoardDoc {
  const doc = createYjsDoc()
  const persist = persistViaIndexedDB(doc, `collab-board:${roomId}`)

  // Columns seed nothing → safe to create before `whenSynced`; the list
  // observer populates them when IndexedDB (or a peer) loads.
  const columns: Record<ColumnId, SyncedList<Card>> = {
    todo: syncedList<Card>(doc, 'col:todo'),
    doing: syncedList<Card>(doc, 'col:doing'),
    done: syncedList<Card>(doc, 'col:done'),
  }
  // Ephemeral presence — created BEFORE the transports connect so they wire the
  // doc's awareness at connect time (the `syncedAwareness` ordering contract).
  const presence = syncedAwareness<PresenceState>(doc)
  const backlog = syncedList<Card>(doc, 'backlog')

  // The title DOES seed an initial value, so it must wait for persisted state
  // to load first — otherwise the create-if-missing seed could race the async
  // IndexedDB load and clobber a previously-saved title. This is the documented
  // `whenSynced` contract, and the reason the board shows a brief loading gate.
  const ready = signal(false)
  let titleStore: SyncedStore<{ title: string }> | null = null
  void persist.whenSynced.then(() => {
    titleStore = syncedStore({ title: '' }, { doc })
    ready.set(true)
  })

  const connection = signal<ConnectionState>(relayUrl ? 'connecting' : 'local')
  const bc = connectViaBroadcastChannel(doc, roomId)
  const ws = relayUrl
    ? connectViaWebSocket(doc, `${relayUrl}/${roomId}`, {
        onConnect: () => connection.set('online'),
        onDisconnect: () => connection.set('offline'),
      })
    : null

  let disposed = false

  function findCard(cardId: string): CardLocation | null {
    for (const colId of COLUMN_IDS) {
      const arr = columns[colId]()
      const index = arr.findIndex((c) => c.id === cardId)
      if (index >= 0) return { colId, index, card: arr[index]! }
    }
    return null
  }

  return {
    roomId,
    columns,
    presence,
    backlog,
    title: () => titleStore?.title() ?? '',
    setTitle: (value) => titleStore?.title.set(value),
    openNotes: (cardId) => syncedText(doc, `notes:${cardId}`),
    findCard,
    // Title/label are scalar fields on the list item → patch = replace the item
    // (a coarse whole-list `.set`, fine for low-frequency edits like rename).
    updateCard(cardId, patch) {
      const found = findCard(cardId)
      if (!found) return
      const list = columns[found.colId]
      list.set(list().map((c) => (c.id === cardId ? { ...c, ...patch } : c)))
    },
    deleteCard(cardId) {
      const found = findCard(cardId)
      if (found) columns[found.colId].delete(found.index, 1)
    },
    connection,
    ready,
    dispose() {
      if (disposed) return
      disposed = true
      ws?.disconnect()
      bc.disconnect()
      for (const col of Object.values(columns)) col.dispose()
      presence.dispose()
      backlog.dispose()
      titleStore?.dispose()
      void persist.destroy()
    },
  }
}
